import express from "express";
import {
  getAllTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
  enrollPlayer,
  getTournamentStandings,
  resetTournament,
  enrollMultiplePlayers,
} from "../controllers/tournamentController.js";

const router = express.Router();

router.get("/", getAllTournaments);
router.post("/", createTournament);
router.put("/:id", updateTournament);
router.delete("/:id", deleteTournament);
router.delete('/:id/reset', resetTournament);
router.post('/enroll-multiple', enrollMultiplePlayers);
router.post("/enroll", enrollPlayer);
router.get("/:id/standings", getTournamentStandings);

export default router;
