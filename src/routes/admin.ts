import { Router } from 'express';
import { requireAdmin } from '../middleware/roles';
import {
  createCoach,
  getStats,
  getCoaches,
} from '../controllers/adminController';
import { createCoachSchema } from '../schemas/coachSchema';
import { validate } from '../middleware/validate';

const router = Router();

router.use(requireAdmin);

router.get('/stats', getStats);
router.get('/coaches', getCoaches);
router.post('/create-coach', validate(createCoachSchema), createCoach);

export default router;
