import express from "express";
import {
  getMatchesByTournament,
  createRound,
  updateMatchResult,
} from "../controllers/matchController.js";

const router = express.Router();

router.get("/tournament/:tournamentId", getMatchesByTournament);
router.post("/tournament/:tournamentId/round", createRound);
router.put("/:matchId/result", updateMatchResult);

export default router;
