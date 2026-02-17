import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    totalPoints: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 }, // total time spent in matches (minutes)
    byes: { type: Number, default: 0 },
    opponents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }], // Track who they've played

    status: {
      type: String,
      enum: ["active", "eliminated", "withdrawn"],
      default: "active",
    },
    eliminationRound: { type: Number, default: null },
    eliminationReason: { type: String, default: null }, // 'losses', 'withdrawal', 'disqualified'
  },
  { timestamps: true },
);

// Compound index to prevent duplicate enrollments
enrollmentSchema.index({ tournament: 1, player: 1 }, { unique: true });

export default mongoose.model("Enrollment", enrollmentSchema);
