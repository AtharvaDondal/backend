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

// In matchController.js - REPLACE createRound function
export const createRound = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ message: "Tournament not found" });

    if (tournament.status === "completed") {
      return res
        .status(400)
        .json({ message: "Tournament is already completed" });
    }

    const nextRound = tournament.currentRound + 1;

    // CRITICAL FIX: Calculate maxRounds dynamically for knockout
    let effectiveMaxRounds = tournament.maxRounds;

    if (tournament.format === "knockout") {
      const initialPlayerCount = tournament.players.length;
      effectiveMaxRounds = Math.ceil(Math.log2(initialPlayerCount));
      console.log(
        `[CREATE ROUND] Knockout: ${initialPlayerCount} players, max ${effectiveMaxRounds} rounds`,
      );
    }

    // Check previous round completion
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

    // CRITICAL FIX: Run elimination check BEFORE generating pairings for knockout
    if (tournament.format === "knockout" && tournament.currentRound > 0) {
      console.log(`[CREATE ROUND] Running pre-round elimination check`);
      await checkEliminations(tournamentId, tournament.currentRound);

      // CRITICAL: Check active player count AFTER elimination
      const activeCount = await Enrollment.countDocuments({
        tournament: tournamentId,
        status: "active",
      });

      console.log(
        `[CREATE ROUND] Active players after elimination: ${activeCount}`,
      );

      // If not enough players left, complete tournament
      if (activeCount < 2) {
        console.log(
          `[CREATE ROUND] Tournament complete - only ${activeCount} players left`,
        );
        await Tournament.findByIdAndUpdate(tournamentId, {
          status: "completed",
          currentRound: tournament.currentRound,
        });
        return res.status(400).json({
          message:
            activeCount === 1
              ? "Tournament completed! Champion crowned!"
              : "No active players remaining. Tournament completed!",
        });
      }
    }

    const { pairings, byePlayer } = await generatePairings(
      tournamentId,
      nextRound,
    );

    if (pairings.length === 0 && !byePlayer) {
      await Tournament.findByIdAndUpdate(tournamentId, { status: "completed" });
      return res.status(400).json({
        message: "No active players remaining. Tournament completed!",
      });
    }

    const matches = await Match.insertMany(
      pairings.map((p) => ({ ...p, round: nextRound, startedAt: new Date() })),
    );

    // CRITICAL FIX: Check if this is the final round (only 2 players left in knockout)
    const remainingActive = await Enrollment.countDocuments({
      tournament: tournamentId,
      status: "active",
    });

    const isFinalRound =
      tournament.format === "knockout"
        ? remainingActive <= 2 || nextRound === effectiveMaxRounds
        : nextRound === effectiveMaxRounds;

    await Tournament.findByIdAndUpdate(tournamentId, {
      currentRound: nextRound,
      status: isFinalRound ? "completed" : "ongoing",
    });

    // Backup elimination check
    if (tournament.format === "knockout") {
      await checkEliminations(tournamentId, nextRound);
    } else if (nextRound % 2 === 0) {
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
    console.error("[CREATE ROUND] Error:", error);
    res.status(500).json({ message: error.message });
  }
};
export const updateMatchResult = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { result, duration, auto } = req.body;

    console.log(`\n========== MATCH UPDATE ==========`);
    console.log(`Match ID: ${matchId}`);
    console.log(`Result: ${result}, Auto: ${auto}`);

    const match = await Match.findById(matchId).populate("player1 player2");
    if (!match) {
      console.log("Match not found!");
      return res.status(404).json({ message: "Match not found" });
    }

    const tournament = await Tournament.findById(match.tournament);
    console.log(`Tournament: ${tournament.name} (ID: ${tournament._id})`);
    console.log(`Format: "${tournament.format}"`);
    console.log(`Match Round: ${match.round}`);

    let finalResult = result;
    let finalDuration = duration;

    if (auto) {
      finalResult = Math.random() < 0.5 ? "player1-win" : "player2-win";
      finalDuration = Math.floor(Math.random() * 110) + 10;
      console.log(`Auto-generated: ${finalResult}, Duration: ${finalDuration}`);
    }

    let player1Score = 0,
      player2Score = 0;
    let player1Loss = false,
      player2Loss = false;

    if (finalResult === "player1-win") {
      player1Score = 1;
      player2Loss = true;
      console.log(
        `Winner: P1 (${match.player1.name}), Loser: P2 (${match.player2.name})`,
      );
    } else if (finalResult === "player2-win") {
      player2Score = 1;
      player1Loss = true;
      console.log(
        `Winner: P2 (${match.player2.name}), Loser: P1 (${match.player1.name})`,
      );
    } else {
      player1Score = 0.5;
      player2Score = 0.5;
      console.log(`Result: Draw`);
    }

    // Update match
    await Match.findByIdAndUpdate(matchId, {
      result: finalResult,
      player1Score,
      player2Score,
      duration: finalDuration,
      completedAt: new Date(),
    });

    console.log(`\n----- Updating Player Stats -----`);

    // Update Player 1
    const p1Update = await Enrollment.findOneAndUpdate(
      { player: match.player1._id, tournament: match.tournament },
      {
        $inc: {
          totalPoints: player1Score,
          matchesPlayed: 1,
          wins: player1Score === 1 ? 1 : 0,
          draws: player1Score === 0.5 ? 1 : 0,
          losses: player1Loss ? 1 : 0,
          totalTime: finalDuration || 0,
        },
        $addToSet: { opponents: match.player2._id },
      },
      { new: true, upsert: true },
    );
    console.log(
      `P1 (${match.player1.name}): losses=${p1Update.losses}, status=${p1Update.status}`,
    );

    // Update Player 2
    const p2Update = await Enrollment.findOneAndUpdate(
      { player: match.player2._id, tournament: match.tournament },
      {
        $inc: {
          totalPoints: player2Score,
          matchesPlayed: 1,
          wins: player2Score === 1 ? 1 : 0,
          draws: player2Score === 0.5 ? 1 : 0,
          losses: player2Loss ? 1 : 0,
          totalTime: finalDuration || 0,
        },
        $addToSet: { opponents: match.player1._id },
      },
      { new: true, upsert: true },
    );
    console.log(
      `P2 (${match.player2.name}): losses=${p2Update.losses}, status=${p2Update.status}`,
    );

    // ELIMINATION - IMMEDIATE FOR KNOCKOUT
    console.log(`\n----- Elimination Check -----`);
    const eliminations = [];

    if (tournament.format === "knockout") {
      console.log(`Knockout format - immediate elimination for losers`);

      // Player 1 lost - eliminate immediately
      if (player1Loss) {
        console.log(`Eliminating P1: ${match.player1.name}`);
        const p1Elim = await Enrollment.findByIdAndUpdate(
          p1Update._id,
          {
            status: "eliminated",
            eliminationRound: match.round,
            eliminationReason: "knockout_loss",
          },
          { new: true },
        );
        console.log(`P1 eliminated: ${p1Elim.status}`);
        eliminations.push(match.player1.name);
      }

      // Player 2 lost - eliminate immediately
      if (player2Loss) {
        console.log(`Eliminating P2: ${match.player2.name}`);
        const p2Elim = await Enrollment.findByIdAndUpdate(
          p2Update._id,
          {
            status: "eliminated",
            eliminationRound: match.round,
            eliminationReason: "knockout_loss",
          },
          { new: true },
        );
        console.log(`P2 eliminated: ${p2Elim.status}`);
        eliminations.push(match.player2.name);
      }
    } else {
      // Swiss - use maxLosses
      const maxLosses = tournament.maxLosses || 3;
      console.log(`Swiss format - maxLosses: ${maxLosses}`);

      if (player1Loss && p1Update.losses >= maxLosses) {
        await Enrollment.findByIdAndUpdate(p1Update._id, {
          status: "eliminated",
          eliminationRound: match.round,
          eliminationReason: "max_losses",
        });
        eliminations.push(match.player1.name);
      }
      if (player2Loss && p2Update.losses >= maxLosses) {
        await Enrollment.findByIdAndUpdate(p2Update._id, {
          status: "eliminated",
          eliminationRound: match.round,
          eliminationReason: "max_losses",
        });
        eliminations.push(match.player2.name);
      }
    }

    console.log(`\n----- Verification -----`);
    // Verify in database
    if (player1Loss) {
      const verifyP1 = await Enrollment.findById(p1Update._id);
      console.log(
        `P1 in DB: status=${verifyP1.status}, losses=${verifyP1.losses}`,
      );
    }
    if (player2Loss) {
      const verifyP2 = await Enrollment.findById(p2Update._id);
      console.log(
        `P2 in DB: status=${verifyP2.status}, losses=${verifyP2.losses}`,
      );
    }

    console.log(`Total eliminations: ${eliminations.length}`);
    console.log(`========== END MATCH UPDATE ==========\n`);

    let message = auto ? "Auto-generated result" : "Manual result recorded";
    if (eliminations.length > 0) {
      message += `. ${eliminations.join(", ")} eliminated!`;
    }

    res.json({
      result: finalResult,
      duration: finalDuration,
      message,
      eliminations: eliminations.length > 0 ? eliminations : null,
    });
  } catch (error) {
    console.error("CRITICAL ERROR in updateMatchResult:", error);
    res.status(500).json({ message: error.message });
  }
};
