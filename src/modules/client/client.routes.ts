import { Router } from 'express';
import { requireClient } from '../../shared/middleware/roles';
import { validate } from '../../shared/middleware/validate';
import {
  completeSessionSchema,
  updateCompletedSessionSchema,
} from './client.schema';
import * as clientController from './client.controller';

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
