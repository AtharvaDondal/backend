import Enrollment from "../models/Enrollment.js";
import Tournament from "../models/Tournament.js";

export const getAllTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find()
      .populate("players", "name rating")
      .sort({ createdAt: -1 });
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTournament = async (req, res) => {
  try {
    const tournament = new Tournament(req.body);
    const savedTournament = await tournament.save();
    res.status(201).json(savedTournament);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    if (!tournament)
      return res.status(404).json({ message: "Tournament not found" });
    res.json(tournament);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndDelete(req.params.id);
    if (!tournament)
      return res.status(404).json({ message: "Tournament not found" });
    res.json({ message: "Tournament deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const enrollPlayer = async (req, res) => {
  try {
    const { tournamentId, playerId } = req.body;

    // Check if already enrolled
    const existing = await Enrollment.findOne({
      tournament: tournamentId,
      player: playerId,
    });

    if (existing) {
      return res.status(409).json({ message: "Player already enrolled" });
    }

    const enrollment = new Enrollment({
      tournament: tournamentId,
      player: playerId,
    });

    await enrollment.save();

    // Add player to tournament
    await Tournament.findByIdAndUpdate(tournamentId, {
      $addToSet: { players: playerId },
    });

    res.status(201).json(enrollment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getTournamentStandings = async (req, res) => {
  try {
    const { id } = req.params;

    const standings = await Enrollment.find({ tournament: id })
      .populate("player", "name rating")
      .sort({ totalPoints: -1, totalTime: 1, byes: 1 });

    res.json(standings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetTournament = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete all matches for this tournament
    await Match.deleteMany({ tournament: id });
    
    // Delete all enrollments for this tournament
    await Enrollment.deleteMany({ tournament: id });
    
    // Reset tournament state
    await Tournament.findByIdAndUpdate(id, {
      currentRound: 0,
      status: 'upcoming',
      $set: { players: [] }
    });
    
    res.json({ message: 'Tournament reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
