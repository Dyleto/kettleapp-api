import { Router } from 'express';
import { requireClient } from '../../shared/middleware/roles';
import { validate } from '../../shared/middleware/validate';
import {
  completeSessionSchema,
  setHealthConsentSchema,
  updateCompletedSessionSchema,
} from './client.schema';
import * as clientController from './client.controller';
import * as reply from '../reply/reply.controller';
import { idParamSchema } from '../../shared/schemas/params.schema';

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
// Lire la réponse de son coach éteint la pastille « Nouveau », et dit au
// coach « lue par Sarah ».
router.patch(
  '/sessions/completed/:id/replies/read',
  validate(idParamSchema),
  reply.readCoachReplies
);

// DONNÉES DE SANTÉ
router.put(
  '/health-consent',
  validate(setHealthConsentSchema),
  clientController.setHealthConsent
);

export default router;
