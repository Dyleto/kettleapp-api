import { Request, Response } from "express";
import crypto from "crypto";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import Coach, { ICoach } from "../models/Coach";
import InvitationToken from "../models/InvitationToken";
import Client from "../models/Client";
import Exercise from "../models/Exercise";
import { IUser } from "../models/User";
import Program, { IProgram } from "../models/Program";
import Session, { ISession } from "../models/Session";

// --------------------------------------------------------------------------
// INVITATIONS
// --------------------------------------------------------------------------

export const generateInvitation = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
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

      // On génère le token nous-mêmes si le modèle ne le fait pas auto (via crypto)
      // Note: Votre modèle InvitationToken le génère peut-être via un pre-hook.
      // Sinon voici comment faire :
      const token = crypto.randomBytes(32).toString("hex");

      invitationToken = await InvitationToken.create({
        token,
        coachId: coach._id,
        expiresAt: expiresAt,
      });
    }

    res.status(200).json({
      status: "success",
      message: "Lien d'invitation généré avec succès",
      token: invitationToken.token,
      expiresAt: invitationToken.expiresAt,
      // (Bonus) l'URL directe c'est pratique :
      // inviteUrl: `${process.env.FRONTEND_URL}/join?token=${invitationToken.token}`
    });
  },
);

// --------------------------------------------------------------------------
// CLIENTS
// --------------------------------------------------------------------------

export const getClients = catchAsync(async (req: Request, res: Response) => {
  const coach = res.locals.coach as ICoach;

  const clients = await Client.find({
    "coaches.coachId": coach._id,
  }).populate<{ userId: IUser }>("userId");

  const formattedClients = clients.map((client) => ({
    _id: client._id,
    firstName: client.userId.firstName,
    lastName: client.userId.lastName,
    picture: client.userId.picture,
  }));

  res.status(200).json(formattedClients);
});

export const getClientDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id: clientId } = req.params;

    const client = await Client.findOne({
      _id: clientId,
      "coaches.coachId": coach._id,
    }).populate<{ userId: IUser }>("userId");

    if (!client) throw new AppError("Client non trouvé", 404);

    // --- Logique complexe pour remonter le Program et les Sessions ---
    const activeProgram: IProgram | null = await Program.findOne({
      clientId: client._id,
      coachId: coach._id,
    }).sort({ createdAt: -1 });

    let sessions: ISession[] = [];

    if (activeProgram) {
      sessions = await Session.find({
        programId: activeProgram._id,
      })
        .sort({ order: 1 })
        .populate("warmup.exercises.exerciseId")
        .populate("workout.exercises.exerciseId");
    }

    res.status(200).json({
      _id: client._id,
      firstName: client.userId.firstName,
      lastName: client.userId.lastName,
      email: client.userId.email,
      picture: client.userId.picture,
      program: activeProgram,
      sessions: sessions,
    });
  },
);

// --------------------------------------------------------------------------
// EXERCISES
// --------------------------------------------------------------------------

export const getExercisesStats = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;

    // On peut faire les 2 requêtes en parallèle pour aller plus vite
    const [warmupCount, exerciseCount] = await Promise.all([
      Exercise.countDocuments({ createdBy: coach._id, type: "warmup" }),
      Exercise.countDocuments({ createdBy: coach._id, type: "exercise" }),
    ]);

    res.status(200).json({ warmupCount, exerciseCount });
  },
);

export const getExercises = catchAsync(async (req: Request, res: Response) => {
  const coach = res.locals.coach as ICoach;

  const exercises = await Exercise.find({ createdBy: coach._id }).sort({
    type: 1,
    name: 1,
  });

  res.status(200).json(exercises);
});

export const getExerciseDetails = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError("Exercice non trouvé", 404);

    res.status(200).json(exercise);
  },
);

export const createExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { name, description, videoUrl, type } = req.body;

    // Validation manuelle rapide (idéalement à déplacer dans Zod)
    if (!name || !type) throw new AppError("Nom et type sont requis", 400);
    if (!["warmup", "exercise"].includes(type)) {
      throw new AppError("Type invalide (warmup/exercise)", 400);
    }

    const exercise = await Exercise.create({
      name,
      description: description || "",
      videoUrl: videoUrl || "",
      type,
      createdBy: coach._id,
    });

    res.status(201).json(exercise);
  },
);

export const updateExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;
    const { name, description, videoUrl, type } = req.body;

    if (type && !["warmup", "exercise"].includes(type)) {
      throw new AppError("Type invalide", 400);
    }

    const exercise = await Exercise.findOne({ _id: id, createdBy: coach._id });
    if (!exercise) throw new AppError("Exercice non trouvé", 404);

    // Mise à jour des champs
    if (name) exercise.name = name;
    if (description !== undefined) exercise.description = description;
    if (videoUrl !== undefined) exercise.videoUrl = videoUrl;
    if (type) exercise.type = type;

    await exercise.save(); // Déclenche les validateurs Mongoose et hooks

    res.status(200).json(exercise);
  },
);

// Bonus (pas vu dans votre fichier mais utile)
export const deleteExercise = catchAsync(
  async (req: Request, res: Response) => {
    const coach = res.locals.coach as ICoach;
    const { id } = req.params;

    const result = await Exercise.deleteOne({ _id: id, createdBy: coach._id });

    if (result.deletedCount === 0)
      throw new AppError("Exercice non trouvé", 404);

    res.status(204).send(); // 204 No Content
  },
);
