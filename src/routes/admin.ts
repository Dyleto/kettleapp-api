import { Router } from "express";
import { requireAdmin } from "../middleware/roles";
import { createCoach } from "../controllers/adminController";
import { createCoachSchema } from "../schemas/coachSchema";
import { validate } from "../middleware/validate";

const router = Router();

router.use(requireAdmin);

router.post("/create-coach", validate(createCoachSchema), createCoach);

export default router;
