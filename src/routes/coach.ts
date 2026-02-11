import { Router } from "express";
import { requireCoach } from "../middleware/roles";
import * as coachController from "../controllers/coachController";

const router = Router();

// Middleware Global Coach pour tout ce fichier
router.use(requireCoach);

// INVITATIONS
router.post("/generate-invitation", coachController.generateInvitation);

// CLIENTS
router.get("/clients", coachController.getClients);
router.get("/clients/:id", coachController.getClientDetails);

// EXERCICES (Stats en premier avant /:id sinon conflit de route)
router.get("/exercises/stats", coachController.getExercisesStats);
router.get("/exercises", coachController.getExercises);
router.post("/exercises", coachController.createExercise);
router.get("/exercises/:id", coachController.getExerciseDetails);
router.put("/exercises/:id", coachController.updateExercise);
router.delete("/exercises/:id", coachController.deleteExercise);

export default router;
