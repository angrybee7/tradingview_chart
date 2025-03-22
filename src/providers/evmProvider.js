const ethers = require("ethers");

const providers = {
  ethereum: null,
  bsc: null,
  fantom: null,
  arbitrum: null,
  optimism: null,
  base: null,
};

const factoryAddresses = {
  ethereum: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  bsc: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  fantom: "0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3",
  arbitrum: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  optimism: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  base: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
};

const WETH = {
  ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  bsc: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  fantom: "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83",
  arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  optimism: "0x4200000000000000000000000000000000000006",
  base: "0x4200000000000000000000000000000000000006",
};

async function connectEvmProvider(chain) {
  const url = process.env[`${chain.toUpperCase()}_WS_URL`];
  console.log(`Loading ${chain.toUpperCase()}_WS_URL: ${url}`);
  if (!url) {
    console.error(`${chain.toUpperCase()}_WS_URL is not defined in .env`);
    return null;
  }

  if (providers[chain] && providers[chain]._wsReady) {
    console.log(`Provider for ${chain} already connected and ready`);
    return providers[chain];
  }

  let provider;
  try {
    console.log(`Attempting to connect to ${chain} at ${url}`);
    provider = new ethers.providers.WebSocketProvider(url);

    provider._websocket.on("open", () => {
      console.log(`WebSocket opened for ${chain}`);
      providers[chain] = provider;
    });

    provider._websocket.on("error", (err) => {
      console.error(`WebSocket Error for ${chain}:`, err.message);
      if (providers[chain] === provider) {
        providers[chain] = null;
        setTimeout(() => connectEvmProvider(chain), 5000);
      }
    });

    provider._websocket.on("close", (code, reason) => {
      console.log(`WebSocket closed for ${chain} (code: ${code}, reason: ${reason})`);
      if (providers[chain] === provider) {
        providers[chain] = null;
        setTimeout(() => connectEvmProvider(chain), 5000);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!provider._wsReady) {
      console.error(`WebSocket for ${chain} not ready after 1s`);
      return null;
    }

    console.log(`Provider initialized for ${chain}`);
    return provider;
  } catch (error) {
    console.error(`Failed to initialize WebSocket provider for ${chain}:`, error.message);
    return null;
  }
}

function getEvmProvider(chain) {
  if (!providers[chain]) {
    console.log(`Provider for ${chain} not found, initializing`);
    const provider = connectEvmProvider(chain);
    if (provider) {
      providers[chain] = provider;
    }
  } else if (!providers[chain]._wsReady) {
    console.log(`Provider for ${chain} exists but not ready, reinitializing`);
    providers[chain] = null;
    const provider = connectEvmProvider(chain);
    if (provider) {
      providers[chain] = provider;
    }
  } else {
    console.log(`Returning existing provider for ${chain}`);
  }
  return providers[chain];
}

module.exports = { getEvmProvider, factoryAddresses, WETH };