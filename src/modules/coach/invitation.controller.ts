import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import InvitationToken from '../../models/InvitationToken';

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

    res.status(200).json(
      invitationToken
        ? {
            token: invitationToken.token,
            expiresAt: invitationToken.expiresAt,
          }
        : null
    );
  }
);

export const generateInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const expiresIn = req.body.expiresIn || 7; // jours
    const minimumDaysLeft = 5;

    // Si on a déjà un token valide pour encore 5 jours, on le recycle
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

    res.status(200).json({
      status: 'success',
      message: "Lien d'invitation généré avec succès",
      token: invitationToken.token,
      expiresAt: invitationToken.expiresAt,
      // (Bonus) l'URL directe c'est pratique :
      // inviteUrl: `${process.env.FRONTEND_URL}/join?token=${invitationToken.token}`
    });
  }
);
