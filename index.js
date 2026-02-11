import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./src/config/db.js";
import tournamentRoutes from "./src/routes/tournamentRoutes.js";
import playerRoutes from "./src/routes/playerRoutes.js";
import matchRoutes from "./src/routes/matchRoutes.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: ["http://localhost:5173", "https://frontend-lac-six-99.vercel.app"],

  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/matches", matchRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
