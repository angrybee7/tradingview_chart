require("dotenv").config({ path: "C:\\Users\\c plug computers\\Desktop\\Blockchain\\.env" });
console.log("ETHEREUM_WS_URL:", process.env.ETHEREUM_WS_URL);
console.log("BSC_WS_URL:", process.env.BSC_WS_URL);
const express = require("express");
const mongoose = require("mongoose");
const ethers = require("ethers");
const { getEvmProvider, factoryAddresses, WETH } = require("./providers/evmProvider");
const { solanaProvider } = require("./providers/solanaProvider");
const { processSwapEvent, initializeDataForPair } = require("./dataProcessor");

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

app.use(express.json());

// Cache for tracked pairs
const trackedPairs = new Map();

async function initializePairs() {
  const chains = ["ethereum", "bsc", "fantom", "arbitrum", "optimism", "base"];
  const tokens = {
    ethereum: "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
    bsc: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", // CAKE
    fantom: "0x049d68029688eabf473097a2fc38ef61633a3c7a", // fUSDT
    arbitrum: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
    optimism: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
    base: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  };

  for (const chain of chains) {
    const provider = getEvmProvider(chain);
    if (!provider) {
      console.error(`Skipping initialization for ${chain}: Provider not available`);
      continue;
    }
    const tokenAddress = tokens[chain];
    const factoryContract = new ethers.Contract(factoryAddresses[chain], [
      "function getPair(address tokenA, address tokenB) view returns (address pair)",
    ], provider);
    try {
      const pairAddress = await factoryContract.getPair(tokenAddress, WETH[chain]);
      if (pairAddress !== ethers.constants.AddressZero) { // v5.x syntax
        console.log(`Initializing ${chain} pair: ${pairAddress}`);
        trackedPairs.set(`${chain}:${tokenAddress}`, pairAddress);
        initializeDataForPair(provider, pairAddress, chain); // Async, no await

        const pairABI = [
          "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
          "event Transfer(address indexed from, address indexed to, uint value)",
        ];
        const pairContract = new ethers.Contract(pairAddress, pairABI, provider);
        pairContract.on("Swap", (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
          processSwapEvent(event, chain, provider).catch(console.error);
        });
        pairContract.on("Transfer", async (from, to, value) => {
          if (from === ethers.constants.AddressZero) { // v5.x syntax
            await MarketMaker.findOneAndUpdate(
              { chain, pairAddress, address: to },
              { chain, pairAddress, address: to, liquidity: value.toString(), fees: "0", profitLoss: "0" },
              { upsert: true }
            );
          }
        });
      }
    } catch (error) {
      console.error(`Failed to initialize pair for ${chain}/${tokenAddress}: ${error.message}`);
    }
  }
}

initializePairs().catch(console.error);

app.get("/token/:chain/:address", async (req, res) => {
  const startTime = Date.now();
  const { chain, address: tokenAddress } = req.params;

  try {
    if (!ethers.utils.isAddress(tokenAddress) && chain !== "solana") { // v5.x syntax
      return res.status(400).json({ error: "Invalid token address" });
    }

    const supportedChains = ["ethereum", "bsc", "fantom", "arbitrum", "optimism", "base", "solana"];
    if (!supportedChains.includes(chain)) {
      return res.status(400).json({ error: "Unsupported chain" });
    }

    let pairAddress;
    if (chain === "solana") {
      pairAddress = tokenAddress; // Placeholder
    } else {
      pairAddress = trackedPairs.get(`${chain}:${tokenAddress}`);
      if (!pairAddress) {
        const provider = getEvmProvider(chain);
        if (!provider) {
          return res.status(503).json({ error: `Provider not initialized for ${chain}` });
        }
        const factoryContract = new ethers.Contract(factoryAddresses[chain], [
          "function getPair(address tokenA, address tokenB) view returns (address pair)",
        ], provider);
        pairAddress = await factoryContract.getPair(tokenAddress, WETH[chain]);
        if (pairAddress === ethers.constants.AddressZero) { // v5.x syntax
          return res.status(404).json({ error: "No trading pair found" });
        }
        trackedPairs.set(`${chain}:${tokenAddress}`, pairAddress);
        initializeDataForPair(provider, pairAddress, chain); // Async, no await
      }
    }

    const Ohlcv = require("./models/Ohlcv");
    const Transaction = require("./models/Transaction");
    const MarketMaker = require("./models/MarketMaker");

    const fetchStart = Date.now();
    const ohlcv = await Ohlcv.find({ chain, pairAddress }).sort({ time: 1 });
    const transactions = await Transaction.find({ chain, pairAddress }).sort({ timestamp: -1 }).limit(50);
    const marketMakers = await MarketMaker.find({ chain, pairAddress });
    console.log(`DB fetch took ${Date.now() - fetchStart}ms`);

    res.json({
      ohlcv,
      transactions,
      marketMakers: marketMakers.map((m) => ({ address: m.address, profitLoss: m.profitLoss })),
    });
    console.log(`Total request time: ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  Object.values(getEvmProvider).forEach((p) => p?._websocket.close());
  process.exit(0);
});