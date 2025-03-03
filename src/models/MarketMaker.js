const mongoose = require("mongoose");

const MarketMakerSchema = new mongoose.Schema({
  chain: { type: String, required: true, index: true },
  pairAddress: { type: String, required: true, index: true },
  address: { type: String, required: true, unique: true },
  liquidity: { type: String, required: true },
  profitLoss: { type: String, default: "0" },
  fees: { type: String, default: "0" },
});

module.exports = mongoose.model("MarketMaker", MarketMakerSchema);