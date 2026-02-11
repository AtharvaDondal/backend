import Enrollment from "../models/Enrollment.js";
import Match from "../models/Match.js";
import Tournament from "../models/Tournament.js";
import { generatePairings } from "../utils/pairingAlgorithm.js";

export const getMatchesByTournament = async (req, res) => {
  try {
    const matches = await Match.find({ tournament: req.params.tournamentId })
      .populate("player1", "name")
      .populate("player2", "name")
      .sort({ round: 1, createdAt: 1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createRound = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ message: "Tournament not found" });

    const nextRound = tournament.currentRound + 1;

    // Generate pairings
    const { pairings, byePlayer } = await generatePairings(
      tournamentId,
      nextRound,
    );

    // Create matches
    const matches = await Match.insertMany(
      pairings.map((p) => ({
        ...p,
        round: nextRound,
        startedAt: new Date(),
      })),
    );

    // Update tournament round
    await Tournament.findByIdAndUpdate(tournamentId, {
      currentRound: nextRound,
      status: nextRound === 1 ? "ongoing" : tournament.status,
    });

    res.status(201).json({
      round: nextRound,
      matches,
      byePlayer,
      message: byePlayer
        ? `${byePlayer.name} gets a bye this round`
        : "All players paired",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMatchResult = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { result, duration } = req.body;

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Calculate scores
    let player1Score = 0;
    let player2Score = 0;

    if (result === "player1-win") player1Score = 1;
    else if (result === "player2-win") player2Score = 1;
    else if (result === "draw") {
      player1Score = 0.5;
      player2Score = 0.5;
    }

    // Update match
    const updatedMatch = await Match.findByIdAndUpdate(
      matchId,
      {
        result,
        player1Score,
        player2Score,
        duration,
        completedAt: new Date(),
      },
      { new: true },
    );

    // Update enrollments
    await updateEnrollmentStats(
      match.player1,
      match.tournament,
      player1Score,
      duration,
    );
    await updateEnrollmentStats(
      match.player2,
      match.tournament,
      player2Score,
      duration,
    );

    // Track opponents
    await Enrollment.findOneAndUpdate(
      { player: match.player1, tournament: match.tournament },
      { $addToSet: { opponents: match.player2 } },
    );
    await Enrollment.findOneAndUpdate(
      { player: match.player2, tournament: match.tournament },
      { $addToSet: { opponents: match.player1 } },
    );

    res.json(updatedMatch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

async function updateEnrollmentStats(playerId, tournamentId, points, duration) {
  await Enrollment.findOneAndUpdate(
    { player: playerId, tournament: tournamentId },
    {
      $inc: {
        totalPoints: points,
        matchesPlayed: 1,
        wins: points === 1 ? 1 : 0,
        draws: points === 0.5 ? 1 : 0,
        losses: points === 0 ? 1 : 0,
        totalTime: duration || 0,
      },
    },
  );
}
