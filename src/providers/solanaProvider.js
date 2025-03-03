const { Connection } = require("@solana/web3.js");

let solanaProvider;

function connectSolana() {
  const solanaUrl = process.env.SOLANA_WS_URL;
  if (!solanaUrl) {
    console.error("SOLANA_WS_URL is not defined in .env");
    setTimeout(connectSolana, 1000);
    return;
  }

  try {
    solanaProvider = new Connection(solanaUrl, {
      commitment: "confirmed",
      wsEndpoint: solanaUrl.replace("https", "wss"),
    });
    console.log("Solana provider initialized");
  } catch (error) {
    console.error("Failed to initialize Solana provider:", error.message);
    setTimeout(connectSolana, 1000);
  }
}

connectSolana();

module.exports = { get solanaProvider() { return solanaProvider; } };