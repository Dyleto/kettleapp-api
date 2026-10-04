import { Router } from 'express';
import { z } from 'zod';
import { requireCoach } from '../../shared/middleware/roles';
import { validate } from '../../shared/middleware/validate';
import { invitationLimiter } from '../../shared/middleware/rateLimits';
import {
  idParamSchema,
  withClientIdParam,
} from '../../shared/schemas/params.schema';
import * as invitation from './invitation.controller';
import { generateInvitationSchema } from './invitation.schema';
import * as roster from './roster.controller';
import * as exercise from '../exercise/exercise.controller';
import * as program from '../program/program.controller';
import {
  createExerciseSchema,
  updateExerciseSchema,
} from '../exercise/exercise.schema';
import {
  copySessionSchema,
  updateProgramSessionsSchema,
} from '../program/program.schema';

const router = Router();

// Tout ce fichier est réservé à l'espace coach : le garde se pose une fois
// ici plutôt que sur chaque route, où il finirait par manquer sur l'une
// d'elles sans que rien ne le signale.
router.use(requireCoach);

// ── Invitations ───────────────────────────────────────────────────────────
router.get('/invitation', invitation.getActiveInvitation);
// Frapper un jeton qui donne accès à la liste d'un coach mérite son propre
// plafond : trente par heure, là où le reste de l'API en autorise six cents.
router.post(
  '/generate-invitation',
  invitationLimiter,
  validate(generateInvitationSchema),
  invitation.generateInvitation
);

// ── Les clients du coach ──────────────────────────────────────────────────
router.get('/clients', roster.getClients);
router.get('/clients/:id', validate(idParamSchema), roster.getClientDetails);
router.get(
  '/clients/:id/history',
  validate(idParamSchema),
  roster.getClientHistory
);
router.patch(
  '/clients/:id/history/mark-viewed',
  validate(idParamSchema),
  roster.markHistoryAsViewed
);

// ── Programmes et séances ─────────────────────────────────────────────────
router.put(
  '/clients/:clientId/program/sessions',
  validate(withClientIdParam(updateProgramSessionsSchema.shape.body)),
  program.updateProgramSessions
);
// Le client de l'URL est la destination : on copie VERS lui.
router.post(
  '/clients/:clientId/program/sessions/copy',
  validate(withClientIdParam(copySessionSchema.shape.body)),
  program.copySessionToClient
);

// ── Bibliothèque d'exercices ──────────────────────────────────────────────
router.get('/exercises', exercise.getExercises);
router.post(
  '/exercises',
  validate(createExerciseSchema),
  exercise.createExercise
);
router.get(
  '/exercises/:id',
  validate(idParamSchema),
  exercise.getExerciseDetails
);
router.put(
  '/exercises/:id',
  // Un identifiant ET un corps : les deux moitiés du schéma se déclarent
  // ensemble, Zod ne sachant pas les fusionner de lui-même.
  validate(
    z.object({
      params: idParamSchema.shape.params,
      body: updateExerciseSchema.shape.body,
    })
  ),
  exercise.updateExercise
);
router.delete(
  '/exercises/:id',
  validate(idParamSchema),
  exercise.deleteExercise
);

export default router;
