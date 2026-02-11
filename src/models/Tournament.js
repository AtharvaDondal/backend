import mongoose from "mongoose";

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed"],
      default: "upcoming",
    },
    maxRounds: { type: Number, default: 7 },
    currentRound: { type: Number, default: 0 },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
    format: {
      type: String,
      enum: ["swiss", "round-robin", "knockout"],
      default: "swiss",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Tournament", tournamentSchema);
