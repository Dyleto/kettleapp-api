import { Router } from 'express';
import { requireAdmin } from '../../shared/middleware/roles';
import { createCoach, getStats, getCoaches } from './admin.controller';
import { createCoachSchema } from './admin.schema';
import { validate } from '../../shared/middleware/validate';

const router = Router();

router.use(requireAdmin);

router.get('/stats', getStats);
router.get('/coaches', getCoaches);
router.post('/create-coach', validate(createCoachSchema), createCoach);

export default router;
