import { Router } from 'express';
import { z } from 'zod';
import { requireCoach } from '../middleware/roles';
import * as coachController from '../controllers/coachController';
import { validate } from '../middleware/validate';
import { invitationLimiter } from '../middleware/rateLimits';
import { idParamSchema, withClientIdParam } from '../schemas/paramsSchema';
import {
  createExerciseSchema,
  updateExerciseSchema,
} from '../schemas/exerciseSchema';
import {
  copySessionSchema,
  updateProgramSessionsSchema,
} from '../schemas/programSchema';

const router = Router();

// Middleware Global Coach pour tout ce fichier
router.use(requireCoach);

// INVITATIONS
router.get('/invitation', coachController.getActiveInvitation);
// Minting a token that grants access to a roster: worth its own ceiling.
router.post(
  '/generate-invitation',
  invitationLimiter,
  coachController.generateInvitation
);

// CLIENTS
router.get('/clients', coachController.getClients);
router.get(
  '/clients/:id',
  validate(idParamSchema),
  coachController.getClientDetails
);
router.get(
  '/clients/:id/history',
  validate(idParamSchema),
  coachController.getClientHistory
);
router.patch(
  '/clients/:id/history/mark-viewed',
  validate(idParamSchema),
  coachController.markHistoryAsViewed
);

// PROGRAMMES & SESSIONS
router.put(
  '/clients/:clientId/program/sessions',
  validate(withClientIdParam(updateProgramSessionsSchema.shape.body)),
  coachController.updateProgramSessions
);
// Le client de l'URL est la destination : on copie VERS lui.
router.post(
  '/clients/:clientId/program/sessions/copy',
  validate(withClientIdParam(copySessionSchema.shape.body)),
  coachController.copySessionToClient
);

// EXERCICES
router.get('/exercises', coachController.getExercises);
router.post(
  '/exercises',
  validate(createExerciseSchema),
  coachController.createExercise
);
router.get(
  '/exercises/:id',
  validate(idParamSchema),
  coachController.getExerciseDetails
);
router.put(
  '/exercises/:id',
  validate(
    z.object({
      params: idParamSchema.shape.params,
      body: updateExerciseSchema.shape.body,
    })
  ),
  coachController.updateExercise
);
router.delete(
  '/exercises/:id',
  validate(idParamSchema),
  coachController.deleteExercise
);

export default router;
