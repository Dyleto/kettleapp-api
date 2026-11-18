import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/utils/AppError';
import { coachOf } from '../../shared/middleware/roles';
import Exercise from '../../models/Exercise';
import Session from '../../models/Session';
import { Types } from 'mongoose';
import { respond } from '../../shared/utils/respond';
import { exercisePayload } from '../../contract';
import { z } from 'zod';
import { exerciseUsage } from './exercise.service';

/**
 * La bibliothèque du coach, chaque exercice avec son usage : combien de
 * séances, chez combien de clients.
 *
 * Les deux requêtes partent ensemble : le compteur ne dépend pas de la liste,
 * et les enchaîner doublerait l'attente pour rien.
 */
export const getExercises = catchAsync(async (req: Request, res: Response) => {
  const coach = coachOf(res);

  const [exercises, usage] = await Promise.all([
    Exercise.find({ createdBy: coach._id }).sort({ name: 1 }).lean(),
    exerciseUsage(coach._id as Types.ObjectId),
  ]);

  respond(
    res,
    200,
    z.array(exercisePayload),
    exercises.map((exercise) => {
      const used = usage.get(String(exercise._id));
      return {
        ...exercise,
        usageCount: used?.sessions ?? 0,
        clientCount: used?.clients ?? 0,
      };
    })
  );
});

/**
 * Un exercice, à condition qu'il appartienne à ce coach.
 *
 * Le `createdBy` fait partie du filtre et non d'un contrôle après coup : un
 * exercice qui n'est pas le sien doit être introuvable, pas refusé — répondre
 * 403 confirmerait son existence.
 */
export const getExerciseDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { id } = req.params;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError('Exercice non trouvé', 404);

    respond(res, 200, exercisePayload, exercise);
  }
);

/**
 * Créer un exercice dans la bibliothèque du coach.
 *
 * `|| ''` plutôt que de laisser le champ absent : la fiche affiche une
 * description et une vidéo, et le front distingue mal « jamais renseigné » de
 * « effacé ». La chaîne vide dit les deux de la même façon, ce qui est ici la
 * bonne réponse.
 */
export const createExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { name, description, videoUrl } = req.body;

    const exercise = await Exercise.create({
      name,
      description: description || '',
      videoUrl: videoUrl || '',
      createdBy: coach._id,
    });

    respond(res, 201, exercisePayload, exercise);
  }
);

/**
 * Modifier un exercice de sa propre bibliothèque.
 *
 * Le nom se teste par `if (name)` — une chaîne vide ne vaut pas effacement,
 * un exercice sans nom n'existe pas — alors que description et vidéo se
 * testent par `!== undefined`, parce que les vider est une intention
 * légitime. La différence est voulue.
 */
export const updateExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { id } = req.params;
    const { name, description, videoUrl } = req.body;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError('Exercice non trouvé', 404);

    if (name) exercise.name = name;
    if (description !== undefined) exercise.description = description;
    if (videoUrl !== undefined) exercise.videoUrl = videoUrl;

    await exercise.save();

    respond(res, 200, exercisePayload, exercise);
  }
);

/**
 * Supprimer un exercice, sauf s'il sert encore.
 *
 * Le supprimer alors qu'une séance le contient laisserait cette séance
 * pointer vers rien : le client ouvrirait son programme sur un bloc dont un
 * mouvement a disparu, sans que personne ait touché à son programme. On
 * refuse, plutôt que de nettoyer les séances derrière — ce serait modifier le
 * travail du coach sans le lui demander.
 */
export const deleteExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = coachOf(res);
    const { id } = req.params;

    const usedInSession = await Session.findOne({
      'blocks.exercises.exerciseId': id,
    });

    if (usedInSession) {
      throw new AppError(
        'Cet exercice est utilisé dans une séance, impossible de le supprimer',
        400
      );
    }

    const result = await Exercise.deleteOne({ _id: id, createdBy: coach._id });

    if (result.deletedCount === 0)
      throw new AppError('Exercice non trouvé', 404);

    res.status(204).send(); // 204 No Content
  }
);
