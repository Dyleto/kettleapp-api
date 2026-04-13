import { Router } from "express";
import { requireClient } from "../middleware/roles";
import { validate } from "../middleware/validate";
import { completeSessionSchema } from "../schemas/clientSchema";
import * as clientController from "../controllers/clientController";

const router = Router();

router.use(requireClient);

// PROGRAMME
router.get("/program", clientController.getProgram);

// SÉANCES
router.post(
  "/sessions/:sessionId/complete",
  validate(completeSessionSchema),
  clientController.completeSession,
);

// HISTORIQUE
router.get("/history", clientController.getHistory);

export default router;
