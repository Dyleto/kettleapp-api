import { Router } from 'express';
import { requireClient } from '../middleware/roles';
import { validate } from '../middleware/validate';
import {
  completeSessionSchema,
  updateCompletedSessionSchema,
} from '../schemas/clientSchema';
import * as clientController from '../controllers/clientController';

const router = Router();

router.use(requireClient);

// PROGRAMME
router.get('/program', clientController.getProgram);

// SÉANCES
router.post(
  '/sessions/:sessionId/complete',
  validate(completeSessionSchema),
  clientController.completeSession
);

router.patch(
  '/sessions/completed/:id',
  validate(updateCompletedSessionSchema),
  clientController.updateCompletedSession
);

// HISTORIQUE
router.get('/history', clientController.getHistory);

// DONNÉES DE SANTÉ
router.put('/health-consent', clientController.setHealthConsent);

export default router;
