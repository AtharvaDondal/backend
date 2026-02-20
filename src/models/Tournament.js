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
      enum: ["knockout", "swiss"],
      default: "swiss",
    },

    // Elimination threshold (1 for knockout, 3 for swiss)
    maxLosses: {
      type: Number,
      default: 1, // Default 3 for backward compatibility
    },
  },
  { timestamps: true },
);

export default mongoose.model("Tournament", tournamentSchema);
