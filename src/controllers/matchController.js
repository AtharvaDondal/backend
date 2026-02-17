import Enrollment from "../models/Enrollment.js";
import Match from "../models/Match.js";
import Tournament from "../models/Tournament.js";
import { generatePairings } from "../utils/pairingAlgorithm.js";
import { checkEliminations } from "./tournamentController.js";

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

    // CHECK 1: Tournament already completed
    if (tournament.status === "completed") {
      return res
        .status(400)
        .json({ message: "Tournament is already completed" });
    }

    const nextRound = tournament.currentRound + 1;

    // CHECK 2: Max rounds reached
    if (nextRound > tournament.maxRounds) {
      // Auto-complete tournament
      await Tournament.findByIdAndUpdate(tournamentId, {
        status: "completed",
      });
      return res.status(400).json({
        message: `Maximum rounds (${tournament.maxRounds}) reached. Tournament completed!`,
      });
    }

    // CHECK 3: Previous round matches not completed
    if (tournament.currentRound > 0) {
      const pendingMatches = await Match.countDocuments({
        tournament: tournamentId,
        round: tournament.currentRound,
        result: "pending",
      });

      if (pendingMatches > 0) {
        return res.status(400).json({
          message: `Complete all matches in Round ${tournament.currentRound} first!`,
        });
      }
    }

    // Generate pairings (only active players)
    const { pairings, byePlayer } = await generatePairings(
      tournamentId,
      nextRound,
    );

    // CHECK 4: No active players left (all eliminated)
    if (pairings.length === 0 && !byePlayer) {
      await Tournament.findByIdAndUpdate(tournamentId, {
        status: "completed",
      });
      return res.status(400).json({
        message: "No active players remaining. Tournament completed!",
      });
    }

    // Create matches
    const matches = await Match.insertMany(
      pairings.map((p) => ({
        ...p,
        round: nextRound,
        startedAt: new Date(),
      })),
    );

    // Update tournament
    await Tournament.findByIdAndUpdate(tournamentId, {
      currentRound: nextRound,
      status: nextRound === tournament.maxRounds ? "completed" : "ongoing",
    });

    // Check eliminations every 2 rounds
    if (nextRound % 2 === 0) {
      await checkEliminations(tournamentId, nextRound);
    }

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
    const { result, duration, auto } = req.body; // auto = true for random

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    let finalResult = result;
    let finalDuration = duration;

    // RANDOM GENERATION
    if (auto) {
      // Random winner (50-50 or weighted by rating)
      const random = Math.random();
      finalResult = random < 0.5 ? "player1-win" : "player2-win";

      // Random duration between 10-120 minutes (weighted toward 30-60)
      finalDuration = Math.floor(Math.random() * 110) + 10;

      // Optional: Weight by player rating
      // const p1Rating = match.player1.rating || 1200;
      // const p2Rating = match.player2.rating || 1200;
      // finalResult = Math.random() < (p1Rating / (p1Rating + p2Rating)) ? 'player1-win' : 'player2-win';
    }

    // Calculate scores
    let player1Score = 0,
      player2Score = 0;
    if (finalResult === "player1-win") player1Score = 1;
    else if (finalResult === "player2-win") player2Score = 1;
    else {
      player1Score = 0.5;
      player2Score = 0.5;
    }

    // Update match
    await Match.findByIdAndUpdate(matchId, {
      result: finalResult,
      player1Score,
      player2Score,
      duration: finalDuration,
      completedAt: new Date(),
    });

    // Update enrollments
    await updateEnrollmentStats(
      match.player1,
      match.tournament,
      player1Score,
      finalDuration,
    );
    await updateEnrollmentStats(
      match.player2,
      match.tournament,
      player2Score,
      finalDuration,
    );

    res.json({
      result: finalResult,
      duration: finalDuration,
      message: auto ? "Auto-generated result" : "Manual result recorded",
    });
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
