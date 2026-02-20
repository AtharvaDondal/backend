import Enrollment from "../models/Enrollment.js";
import Tournament from "../models/Tournament.js";
// In pairingAlgorithm.js - REPLACE generatePairings function

export const generatePairings = async (tournamentId, round) => {
  const tournament = await Tournament.findById(tournamentId);
  const isKnockout = tournament.format === "knockout";

  // CRITICAL FIX: Fresh query with strict active filter
  // Use lean() for performance but ensure we get fresh data
  const enrollments = await Enrollment.find({
    tournament: tournamentId,
    status: "active", // Strict filter
  })
    .populate("player")
    .lean();

  console.log(
    `[PAIRING] Round ${round}: Found ${enrollments.length} active players`,
  );
  console.log(
    `[PAIRING] Active:`,
    enrollments.map((e) => e.player?.name).join(", "),
  );

  // Get eliminated players for debugging
  const eliminated = await Enrollment.find({
    tournament: tournamentId,
    status: "eliminated",
  })
    .populate("player")
    .lean();

  console.log(
    `[PAIRING] Eliminated:`,
    eliminated.map((e) => e.player?.name).join(", "),
  );

  if (enrollments.length === 0) {
    console.log(`[PAIRING] No active players!`);
    return { pairings: [], byePlayer: null };
  }

  if (enrollments.length === 1) {
    console.log(`[PAIRING] Only 1 player left - tournament should end`);
    return { pairings: [], byePlayer: null };
  }

  // Sort for pairing
  const sortedEnrollments = enrollments.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
    if (b.totalTime !== a.totalTime) return b.totalTime - a.totalTime;
    return a.byes - b.byes;
  });

  const players = sortedEnrollments.map((e) => ({
    enrollmentId: e._id,
    playerId: e.player._id,
    name: e.player.name,
    points: e.totalPoints,
    time: e.totalTime,
    byes: e.byes,
    opponents: e.opponents.map((o) => o.toString()),
    lastByeRound: e.lastByeRound || 0,
    losses: e.losses || 0,
  }));

  let byePlayer = null;
  let activePlayers = [...players];

  // Handle bye player
  if (players.length % 2 !== 0) {
    let byeCandidates;

    if (isKnockout) {
      byeCandidates = [...players].sort((a, b) => {
        if (a.losses !== b.losses) return a.losses - b.losses;
        if (b.points !== a.points) return b.points - a.points;
        if (a.byes !== b.byes) return a.byes - b.byes;
        return a.lastByeRound - b.lastByeRound;
      });
    } else {
      byeCandidates = [...players].sort((a, b) => {
        if (a.byes !== b.byes) return a.byes - b.byes;
        if (a.lastByeRound !== b.lastByeRound)
          return a.lastByeRound - b.lastByeRound;
        return b.points - a.points;
      });
    }

    byePlayer = byeCandidates[0];
    activePlayers = players.filter(
      (p) => p.playerId.toString() !== byePlayer.playerId.toString(),
    );

    await Enrollment.findByIdAndUpdate(byePlayer.enrollmentId, {
      $inc: { byes: 1, totalPoints: 1 },
      $set: { lastByeRound: round },
    });

    console.log(`[PAIRING] Bye: ${byePlayer.name}`);
  }

  // Generate pairings
  const pairings = [];
  const used = new Set();

  for (let i = 0; i < activePlayers.length; i++) {
    if (used.has(activePlayers[i].playerId.toString())) continue;

    const player1 = activePlayers[i];
    let bestOpponent = null;
    let bestScore = -Infinity;

    for (let j = i + 1; j < activePlayers.length; j++) {
      const player2 = activePlayers[j];
      if (used.has(player2.playerId.toString())) continue;

      const alreadyPlayed = player1.opponents.includes(
        player2.playerId.toString(),
      );
      let score = 0;
      if (!alreadyPlayed) score += 1000;

      if (isKnockout) {
        const pointDiff = Math.abs(player1.points - player2.points);
        score -= pointDiff * 5;
      } else {
        const pointDiff = Math.abs(player1.points - player2.points);
        score -= pointDiff * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestOpponent = player2;
      }
    }

    if (!bestOpponent) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        if (!used.has(activePlayers[j].playerId.toString())) {
          bestOpponent = activePlayers[j];
          break;
        }
      }
    }

    if (bestOpponent) {
      pairings.push({
        player1: player1.playerId,
        player2: bestOpponent.playerId,
        round: round,
        tournament: tournamentId,
      });
      used.add(player1.playerId.toString());
      used.add(bestOpponent.playerId.toString());
      console.log(`[PAIRING] ${player1.name} vs ${bestOpponent.name}`);
    }
  }

  console.log(`[PAIRING] Total matches: ${pairings.length}`);
  return { pairings, byePlayer };
};
