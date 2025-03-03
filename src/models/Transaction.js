const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  chain: { type: String, required: true, index: true },
  pairAddress: { type: String, required: true, index: true },
  txHash: { type: String, required: true, unique: true },
  sender: { type: String, required: true },
  to: { type: String, required: true },
  amount: { type: String, required: true },
  timestamp: { type: Number, required: true },
});

module.exports = mongoose.model("Transaction", TransactionSchema);