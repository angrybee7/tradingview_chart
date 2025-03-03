const mongoose = require("mongoose");

const OhlcvSchema = new mongoose.Schema({
  chain: { type: String, required: true },
  pairAddress: { type: String, required: true },
  time: { type: Number, required: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true, default: 0 },
});

// Compound index for fast queries
OhlcvSchema.index({ chain: 1, pairAddress: 1, time: 1 });

module.exports = mongoose.model("Ohlcv", OhlcvSchema);