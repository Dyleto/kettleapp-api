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
import { clientsQuerySchema } from './roster.schema';
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
import * as template from '../template/template.controller';
import * as reply from '../reply/reply.controller';
import * as inbox from '../inbox/inbox.controller';
import * as tag from '../tag/tag.controller';
import {
  createTagSchema,
  renameTagSchema,
  setClientTagsSchema,
} from '../tag/tag.schema';
import { inboxQuerySchema, markViewedSchema } from '../inbox/inbox.schema';
import { writeReplySchema } from '../reply/reply.schema';
import {
  createTemplateSchema,
  importTemplateSchema,
  renameTemplateSchema,
  updateTemplateSessionsSchema,
} from '../template/template.schema';

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
router.get('/clients', validate(clientsQuerySchema), roster.getClients);
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

// ── Étiquettes ────────────────────────────────────────────────────────────
router.get('/tags', tag.getTags);
router.post('/tags', validate(createTagSchema), tag.postTag);
router.patch('/tags/:id', validate(renameTagSchema), tag.patchTag);
router.delete('/tags/:id', validate(idParamSchema), tag.removeTag);
router.put(
  '/clients/:clientId/tags',
  validate(setClientTagsSchema),
  tag.putClientTags
);

// ── À lire ────────────────────────────────────────────────────────────────
// Le fil mêle les clients : il se lit et se marque par séance, pas par
// fiche.
router.get('/inbox', validate(inboxQuerySchema), inbox.getInbox);
router.patch(
  '/sessions/completed/viewed',
  validate(markViewedSchema),
  inbox.setViewed
);

// ── Répondre à une séance faite ───────────────────────────────────────────
// Par la séance et non par le client : le fil « À lire » mêle les clients,
// et une réponse s'y écrit sans ouvrir la fiche de personne.
router.patch(
  '/sessions/completed/:id/reply',
  validate(writeReplySchema),
  reply.writeCoachReply
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

// Le client de l'URL est la destination, comme pour la copie : on importe
// CHEZ lui, et son programme est remplacé.
router.post(
  '/clients/:clientId/program/import',
  validate(importTemplateSchema),
  template.importIntoClient
);

// ── Modèles de programme ──────────────────────────────────────────────────
//
// Un modèle n'appartient qu'à son coach, et le garde est dans le service :
// `getOwnTemplate` cherche par `_id` ET par `coachId`, donc un modèle d'un
// autre coach est introuvable plutôt qu'interdit. Dire « il existe mais pas
// pour vous » apprendrait que l'identifiant est bon.
router.get('/templates', template.listTemplates);
router.post(
  '/templates',
  validate(createTemplateSchema),
  template.createTemplate
);
router.get('/templates/:id', validate(idParamSchema), template.getTemplate);
router.patch(
  '/templates/:id',
  validate(renameTemplateSchema),
  template.renameTemplate
);
router.put(
  '/templates/:id/sessions',
  validate(updateTemplateSessionsSchema),
  template.updateTemplateSessions
);
router.delete(
  '/templates/:id',
  validate(idParamSchema),
  template.deleteTemplate
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
