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

function connectEvmProvider(chain) {
  const url = process.env[`${chain.toUpperCase()}_WS_URL`];
  console.log(`Loading ${chain.toUpperCase()}_WS_URL: ${url}`);
  if (!url) {
    console.error(`${chain.toUpperCase()}_WS_URL is not defined in .env`);
    return null;
  }

  let provider;
  try {
    console.log(`Attempting to create WebSocketProvider for ${chain} with URL: ${url}`);
    provider = new ethers.providers.WebSocketProvider(url);

    // Set up WebSocket event handlers immediately
    provider._websocket.on("error", (err) => {
      console.error(`WebSocket Error for ${chain} during initialization:`, err.message);
      providers[chain] = null;
      setTimeout(() => connectEvmProvider(chain), 1000);
    });

    provider._websocket.on("open", () => {
      console.log(`WebSocket opened for ${chain}`);
    });

    provider._websocket.on("close", (code, reason) => {
      console.log(`WebSocket closed for ${chain} (code: ${code}, reason: ${reason}), reconnecting...`);
      providers[chain] = null;
      setTimeout(() => connectEvmProvider(chain), 1000);
    });

    console.log(`Provider created for ${chain}`);
  } catch (error) {
    console.error(`Failed to initialize WebSocket provider for ${chain}:`, error.message);
    return null;
  }

  if (!provider) {
    console.error(`Provider is null or undefined for ${chain}`);
    return null;
  }

  // Additional runtime error handling
  provider.on("error", (err) => {
    console.error(`WebSocket Runtime Error for ${chain}:`, err.message);
    providers[chain] = null;
    setTimeout(() => connectEvmProvider(chain), 1000);
  });

  provider.on("debug", (info) => {
    console.log(`Debug info for ${chain}:`, info);
  });

  return provider;
}

function getEvmProvider(chain) {
  if (!providers[chain]) {
    providers[chain] = connectEvmProvider(chain);
  }
  return providers[chain];
}

module.exports = { getEvmProvider, factoryAddresses, WETH };