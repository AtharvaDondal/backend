import Enrollment from "../models/Enrollment.js";

export const generatePairings = async (tournamentId, round) => {
  const enrollments = await Enrollment.find({ tournament: tournamentId })
    .populate("player")
    .lean();

  // Sort for pairing: Weakest first (must play)
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
    lastByeRound: e.lastByeRound || 0, // Track when they last got bye
  }));

  let byePlayer = null;
  let activePlayers = [...players];

  if (players.length % 2 !== 0) {
    // FIX: Select player with FEWEST byes first, then most recent bye
    // Sort: Fewest byes -> Longest ago bye -> Lowest points
    const byeCandidates = [...players].sort((a, b) => {
      // 1. Fewest byes first
      if (a.byes !== b.byes) return a.byes - b.byes;
      // 2. Longest ago bye (or never)
      if (a.lastByeRound !== b.lastByeRound)
        return a.lastByeRound - b.lastByeRound;
      // 3. Lowest points (weakest gets rest? No, strongest gets rest)
      return b.points - a.points; // Higher points = more deserving of rest
    });

    // Pick the one with fewest byes who hasn't had bye recently
    byePlayer = byeCandidates[0];

    // If everyone has same byes, pick the one who had bye longest ago
    // But ensure we don't pick same person twice in a row

    activePlayers = players.filter(
      (p) => p.playerId.toString() !== byePlayer.playerId.toString(),
    );

    // Update bye player record
    await Enrollment.findByIdAndUpdate(byePlayer.enrollmentId, {
      $inc: { byes: 1, totalPoints: 1 },
      $set: { lastByeRound: round },
    });
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

      const pointDiff = Math.abs(player1.points - player2.points);
      score -= pointDiff * 10;

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
    }
  }

  return { pairings, byePlayer };
};
