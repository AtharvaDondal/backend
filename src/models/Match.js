import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    round: { type: Number, required: true },
    player1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    player2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    result: {
      type: String,
      enum: ["pending", "player1-win", "player2-win", "draw", "bye"],
      default: "pending",
    },
    player1Score: { type: Number, default: 0 },
    player2Score: { type: Number, default: 0 },
    duration: { type: Number, default: 0 }, // in minutes
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model("Match", matchSchema);
