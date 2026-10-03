import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import User, { IUser } from '../../models/User';
import Coach from '../../models/Coach';
import Client from '../../models/Client';
import Program from '../../models/Program';
import Session from '../../models/Session';
import CompletedSession from '../../models/CompletedSession';
import Exercise from '../../models/Exercise';
import InvitationToken from '../../models/InvitationToken';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import logger from '../../shared/utils/logger';
import { getErrorMessage } from '../../shared/utils/errors';
import { CARRIES_HEALTH_DATA } from '../client/client.controller';
import { respond } from '../../shared/utils/respond';
import { accountSummaryPayload, messagePayload } from '../../contract';

// GET /api/account
//
// De quoi remplir l'écran « Mon compte » : qui est rattaché à qui, depuis
// quand, et combien de choses disparaîtraient à la suppression. Les nombres
// sont réels — la confirmation de suppression les énumère plutôt que de
// demander « êtes-vous sûr ».
export const getAccount = catchAsync(async (req: Request, res: Response) => {
  const user = await User.findById(req.session.userId);
  if (!user) throw new AppError('Utilisateur introuvable', 404);

  const [coach, client] = await Promise.all([
    Coach.findOne({ userId: user._id }),
    Client.findOne({ userId: user._id }),
  ]);

  const asClient = client
    ? await (async () => {
        const [coaches, completedCount, healthDataCount] = await Promise.all([
          Promise.all(
            client.coaches.map(async (link) => {
              const c = await Coach.findById(link.coachId).populate<{
                userId: IUser;
              }>('userId');
              if (!c?.userId) return null;
              return {
                firstName: c.userId.firstName ?? '',
                lastName: c.userId.lastName ?? '',
                picture: c.userId.picture,
                linkedAt: link.linkedAt,
              };
            })
          ),
          CompletedSession.countDocuments({ clientId: client._id }),
          // Combien de bilans un refus effacerait. Sert à n'avertir que
          // lorsqu'il y a réellement quelque chose à perdre : prévenir un
          // compte tout neuf qu'on va effacer ses données serait faux.
          CompletedSession.countDocuments({
            clientId: client._id,
            ...CARRIES_HEALTH_DATA,
          }),
        ]);

        return {
          coaches: coaches.filter((c) => c !== null),
          completedCount,
          healthDataCount,
          healthConsent: client.healthConsent ?? null,
          since: client.createdAt,
        };
      })()
    : null;

  const asCoach = coach
    ? {
        clientCount: await Client.countDocuments({
          'coaches.coachId': coach._id,
        }),
        since: coach.createdAt,
      }
    : null;

  respond(res, 200, accountSummaryPayload, { asClient, asCoach });
});

// DELETE /api/account
//
// Le droit à l'effacement, exercé depuis l'application plutôt que par mail.
// Tout part dans une transaction : un compte à moitié supprimé serait pire
// que pas de suppression du tout.
export const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const userId = req.session.userId as unknown as Types.ObjectId;
  const rid = req.requestId ?? '?';

  logger.info(`[${rid}] deleteAccount: start`, { userId });

  const dbSession = await mongoose.startSession();

  try {
    await dbSession.withTransaction(async () => {
      const [coach, client] = await Promise.all([
        Coach.findOne({ userId }).session(dbSession),
        Client.findOne({ userId }).session(dbSession),
      ]);

      if (client) {
        const programs = await Program.find({ clientId: client._id })
          .select('_id')
          .session(dbSession);
        const programIds = programs.map((p) => p._id);

        await Session.deleteMany(
          { programId: { $in: programIds } },
          { session: dbSession }
        );
        await Program.deleteMany(
          { clientId: client._id },
          { session: dbSession }
        );
        await CompletedSession.deleteMany(
          { clientId: client._id },
          { session: dbSession }
        );
        await Client.deleteOne({ _id: client._id }, { session: dbSession });
      }

      if (coach) {
        // Les séances déjà réalisées par ses clients leur appartiennent :
        // elles restent. Ce qui part, c'est ce que le coach a écrit — sa
        // bibliothèque, ses invitations, et les programmes des clients qui
        // n'ont plus personne pour les tenir.
        const clients = await Client.find({
          'coaches.coachId': coach._id,
        }).session(dbSession);

        const orphans = clients
          .filter(
            (c) =>
              c.coaches.filter(
                (l) => l.coachId.toString() !== coach._id.toString()
              ).length === 0
          )
          .map((c) => c._id);

        if (orphans.length > 0) {
          const programs = await Program.find({
            clientId: { $in: orphans },
          })
            .select('_id')
            .session(dbSession);

          await Session.deleteMany(
            { programId: { $in: programs.map((p) => p._id) } },
            { session: dbSession }
          );
          await Program.deleteMany(
            { clientId: { $in: orphans } },
            { session: dbSession }
          );
        }

        await Client.updateMany(
          { 'coaches.coachId': coach._id },
          { $pull: { coaches: { coachId: coach._id } } },
          { session: dbSession }
        );
        await Exercise.deleteMany(
          { createdBy: coach._id },
          { session: dbSession }
        );
        await InvitationToken.deleteMany(
          { coachId: coach._id },
          { session: dbSession }
        );
        await Coach.deleteOne({ _id: coach._id }, { session: dbSession });
      }

      await User.deleteOne({ _id: userId }, { session: dbSession });
    });
  } catch (error) {
    logger.error(`[${rid}] deleteAccount: transaction failed`, {
      userId,
      error: getErrorMessage(error),
    });
    throw new AppError('La suppression a échoué', 500);
  } finally {
    dbSession.endSession();
  }

  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie('connect.sid');

  logger.info(`[${rid}] deleteAccount: success`, { userId });
  respond(res, 200, messagePayload, { message: 'Compte supprimé' });
});
