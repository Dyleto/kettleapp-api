import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import InvitationToken from '../../models/InvitationToken';
import { respond } from '../../shared/utils/respond';
import {
  activeInvitationPayload,
  generatedInvitationPayload,
} from '../../contract';

/**
 * Le lien d'invitation actif, s'il y en a un — sans en créer.
 *
 * `generateInvitation` recycle un même lien par coach tant qu'il reste valide,
 * mais ne le renvoyait qu'au moment de le créer : une fois le message de
 * confirmation disparu, le coach n'avait plus aucun moyen de le retrouver et
 * devait relancer l'opération pour recopier un lien qu'il possédait déjà.
 */
export const getActiveInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);

    const invitationToken = await InvitationToken.findOne({
      coachId: coach._id,
      expiresAt: { $gt: new Date() },
    }).sort({ expiresAt: -1 });

    respond(
      res,
      200,
      activeInvitationPayload,
      invitationToken
        ? {
            token: invitationToken.token,
            expiresAt: invitationToken.expiresAt,
          }
        : null
    );
  }
);

/**
 * Obtenir un lien d'invitation, en recyclant celui qui est encore bon.
 *
 * Un coach n'a pas besoin d'un lien par client : le même sert à tous, et en
 * créer un à chaque clic laisserait derrière lui une traînée de jetons valides
 * dont aucun ne serait révoqué. Tant qu'il reste cinq jours de validité, on
 * rend le même.
 *
 * Cinq jours et non zéro : un lien qui expire demain est techniquement valide
 * et pratiquement inutile — le client à qui on l'envoie l'ouvrira peut-être
 * après le week-end.
 */
export const generateInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const expiresIn = req.body.expiresIn || 7; // en jours
    const minimumDaysLeft = 5;

    // Un jeton encore valide au moins cinq jours est réutilisé tel quel.
    const minimumValidUntil = new Date();
    minimumValidUntil.setDate(minimumValidUntil.getDate() + minimumDaysLeft);

    let invitationToken = await InvitationToken.findOne({
      coachId: coach._id,
      expiresAt: { $gte: minimumValidUntil },
    }).sort({ expiresAt: -1 });

    if (!invitationToken) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);

      invitationToken = await InvitationToken.create({
        coachId: coach._id,
        expiresAt,
      });
    }

    respond(res, 200, generatedInvitationPayload, {
      status: 'success',
      message: "Lien d'invitation généré avec succès",
      token: invitationToken.token,
      expiresAt: invitationToken.expiresAt,
      // L'URL complète est fabriquée par le front, qui connaît son propre
      // domaine : la construire ici obligerait à tenir FRONTEND_URL à jour
      // dans deux endroits.
    });
  }
);
