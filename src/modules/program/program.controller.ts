import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import { getAuthorizedClient } from '../coach/coach.service';
import type { SessionInput } from './program.schema';
import { copySession, replaceProgramSessions } from './program.service';
import logger from '../../shared/utils/logger';
import {
  PopulatedSession,
  formatSession,
} from '../../shared/utils/sessionFormatter';

/**
 * Enregistrer le programme d'un client, tel que l'atelier l'a écrit.
 *
 * L'atelier envoie l'état complet du programme à chaque changement, pas une
 * liste de modifications : ce qui n'y figure plus a été supprimé. Toute la
 * réconciliation vit dans `replaceProgramSessions` — ce contrôleur lit la
 * requête, vérifie que le client appartient bien à ce coach, et rend ce qui a
 * été écrit.
 */
export const updateProgramSessions = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const clientId = req.params.clientId as string;
    const sessions = req.body.sessions as SessionInput[];
    const rid = req.requestId ?? '?';

    const client = await getAuthorizedClient(coach._id, clientId);
    const saved = await replaceProgramSessions(client._id, sessions, rid);

    logger.info(`[${rid}] updateProgramSessions: succès`, {
      coachId: coach._id,
      clientId,
      savedCount: saved.length,
    });

    res
      .status(200)
      .json((saved as unknown as PopulatedSession[]).map(formatSession));
  }
);

/**
 * Copier une séance chez un autre client.
 *
 * Retour du terrain : « dommage de ne pas pouvoir copier la séance et la
 * coller chez un autre client. Ce serait plus utile que le dupliquer. » Un
 * coach écrit rarement deux fois le même travail, mais il l'adapte souvent
 * d'une personne à l'autre.
 *
 * Deux autorisations, pas une, et c'est le point à ne pas perdre de vue :
 * vérifier le client de destination ne suffit pas. Sans le contrôle sur la
 * source, connaître un identifiant de séance suffirait à la recopier — donc à
 * lire — depuis le programme d'un client qui n'est pas le sien.
 *
 * Rien du contenu ne transite par la requête : seulement de quoi désigner la
 * séance source, que le serveur relit lui-même en base.
 */
export const copySessionToClient = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const targetClientId = req.params.clientId as string;
    const { sourceClientId, sourceSessionId } = req.body as {
      sourceClientId: string;
      sourceSessionId: string;
    };
    const rid = req.requestId ?? '?';

    const source = await getAuthorizedClient(coach._id, sourceClientId);
    const target = await getAuthorizedClient(coach._id, targetClientId);

    const copy = await copySession(source._id, sourceSessionId, target._id);

    logger.info(`[${rid}] copySessionToClient: succès`, {
      coachId: coach._id,
      targetClientId,
      newSessionId: copy._id,
    });

    res.status(201).json(formatSession(copy as unknown as PopulatedSession));
  }
);
