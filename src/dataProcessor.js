const { ethers } = require("ethers");
const Ohlcv = require("./models/Ohlcv");
const Transaction = require("./models/Transaction");
const MarketMaker = require("./models/MarketMaker");

async function processSwapEvent(event, chain, provider, blockCache = {}, ohlcvBulk = [], txBulk = []) {
  try {
    let timestamp, price, volume, sender, to, txHash;
    if (chain === "solana") {
      const data = event.data;
      timestamp = Math.floor(Date.now() / 1000);
      price = 1;
      volume = "1";
      sender = "solana_sender";
      to = "solana_to";
      txHash = event.signature || "unknown";
    } else {
      const { args, transactionHash, blockNumber } = event;
      const { sender: evmSender, amount0In, amount1In, amount0Out, amount1Out, to: evmTo } = args;
      let block = blockCache[blockNumber];
      if (!block) {
        block = await provider.getBlock(blockNumber);
        blockCache[blockNumber] = block;
      }
      timestamp = block.timestamp;
      price = amount0In > 0n ? Number(amount0In) / Number(amount1Out) : Number(amount1In) / Number(amount0Out);
      volume = amount1Out > 0n ? amount0Out : amount1In;
      sender = evmSender;
      to = evmTo;
      txHash = transactionHash;
    }

    const timeframe = Math.floor(timestamp / 60) * 60;
    const pairAddress = event.address;
    const volumeIncrement = parseFloat(ethers.utils.formatEther(volume));

    ohlcvBulk.push({
      updateOne: {
        filter: { chain, pairAddress, time: timeframe },
        update: {
          $set: { open: price, close: price },
          $max: { high: price },
          $min: { low: price },
          $inc: { volume: volumeIncrement },
        },
        upsert: true,
      },
    });

    txBulk.push({
      updateOne: {
        filter: { txHash },
        update: {
          $set: {
            chain,
            pairAddress,
            txHash,
            sender,
            to,
            amount: ethers.utils.formatEther(volume),
            timestamp,
          },
        },
        upsert: true,
      },
    });

    return { ohlcvBulk, txBulk };
  } catch (error) {
    console.error(`Failed to process swap event: ${error.message}`);
    return { ohlcvBulk, txBulk };
  }
}

async function updateMarketMakerPL(provider, pairAddress, chain) {
  try {
    const pairABI = [
      "event Sync(uint112 reserve0, uint112 reserve1)",
      "event Transfer(address indexed from, address indexed to, uint value)",
      "function totalSupply() view returns (uint)",
    ];
    const pairContract = new ethers.Contract(pairAddress, pairABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - Math.floor(24 * 60 * 60 / 13));

    const transferFilter = pairContract.filters.Transfer();
    const transferLogs = await provider.getLogs({ fromBlock, toBlock: "latest", address: pairAddress });
    for (const log of transferLogs) {
      const event = pairContract.interface.parseLog(log);
      const { from, to, value } = event.args;
      if (from === ethers.constants.AddressZero) {
        await MarketMaker.findOneAndUpdate(
          { chain, pairAddress, address: to },
          { chain, pairAddress, address: to, liquidity: value.toString(), fees: "0", profitLoss: "0" },
          { upsert: true }
        );
      }
    }

    const syncFilter = pairContract.filters.Sync();
    const syncLogs = await provider.getLogs({ fromBlock, toBlock: "latest", address: pairAddress });
    let prevReserves = { reserve0: 0n, reserve1: 0n };

    for (const log of syncLogs) {
      const event = pairContract.interface.parseLog(log);
      const { reserve0, reserve1 } = event.args;
      if (prevReserves.reserve0 > 0n) {
        const tradeVolume0 = reserve0 > prevReserves.reserve0 ? reserve0 - prevReserves.reserve0 : prevReserves.reserve0 - reserve0;
        const fees = ethers.utils.formatEther((tradeVolume0 * 3n) / 1000n);
        const totalSupply = await pairContract.totalSupply();
        const marketMakers = await MarketMaker.find({ chain, pairAddress });
        for (const maker of marketMakers) {
          const share = Number(maker.liquidity) / Number(totalSupply);
          maker.fees = (parseFloat(maker.fees) + parseFloat(fees) * share).toString();
          maker.profitLoss = maker.fees;
          await maker.save();
        }
      }
      prevReserves = { reserve0, reserve1 };
    }
  } catch (error) {
    console.error(`Failed to update market maker P/L: ${error.message}`);
  }
}

async function initializeDataForPair(provider, pairAddress, chain) {
  const blockCache = {};
  let ohlcvBulk = [];
  let txBulk = [];
  try {
    const pairABI = [
      "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
    ];
    const pairContract = new ethers.Contract(pairAddress, pairABI, provider);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - Math.floor(24 * 60 * 60 / 13);

    const swapTopic = pairContract.interface.getEventTopic("Swap");
    const filter = {
      address: pairAddress,
      fromBlock,
      toBlock: "latest",
      topics: [swapTopic],
    };
    const logs = await provider.getLogs(filter);
    console.log(`Initialized ${logs.length} Swap logs for ${pairAddress}`);

    for (const log of logs) {
      const event = pairContract.interface.parseLog(log);
      if (event.name === "Swap") {
        const { ohlcvBulk: oBulk, txBulk: tBulk } = await processSwapEvent(
          { ...log, args: event.args, address: pairAddress },
          chain,
          provider,
          blockCache,
          ohlcvBulk,
          txBulk
        );
        ohlcvBulk = oBulk;
        txBulk = tBulk;
      }
    }

    if (ohlcvBulk.length > 0) {
      await Ohlcv.bulkWrite(ohlcvBulk);
      console.log(`Processed ${ohlcvBulk.length} OHLCV updates`);
    }
    if (txBulk.length > 0) {
      await Transaction.bulkWrite(txBulk);
      console.log(`Processed ${txBulk.length} transaction updates`);
    }

    await updateMarketMakerPL(provider, pairAddress, chain);
  } catch (error) {
    console.error(`Failed to initialize data for pair ${pairAddress}: ${error.message}`);
  }
}

module.exports = { processSwapEvent, initializeDataForPair };