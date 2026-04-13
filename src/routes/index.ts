import express from "express";
import userRoutes from "./users";
import coachRoutes from "./coach";
import adminRoutes from "./admin";
import clientRoutes from "./client";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Toutes les routes doivent être identifiées
router.use(authMiddleware);

router.use("/admin", adminRoutes);
router.use("/coach", coachRoutes);
router.use("/users", userRoutes);
router.use("/client", clientRoutes);

export default router;
