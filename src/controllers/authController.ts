import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import User, { IUser } from "../models/User";
import Client from "../models/Client";
import Coach, { ICoach } from "../models/Coach";
import InvitationToken from "../models/InvitationToken";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- FONCTION HELPER (Privée) ---
async function buildUser(user: IUser) {
  const isCoach = await Coach.findOne({ userId: user._id });
  const isClient = await Client.findOne({ userId: user._id });

  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    picture: user.picture,
    isAdmin: user.isAdmin,
    isCoach: !!isCoach,
    isClient: !!isClient,
  };
}

// --- CONTROLLERS ---

export const googleAuthCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { code, redirectUri, invitationToken } = req.body;

    // 1. Google Auth
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      },
    );

    const ticket = await googleClient.verifyIdToken({
      idToken: tokenResponse.data.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email)
      throw new AppError("Token Google invalide", 401);

    const { email, name, given_name, family_name, picture } = payload;

    // 2. Gestion de l'invitation (Cas 1)
    if (invitationToken) {
      const invToken = await InvitationToken.findOne({
        token: invitationToken,
      });
      if (!invToken) throw new AppError("Token d'invitation invalide", 400);
      if (new Date() > invToken.expiresAt)
        throw new AppError("Token d'invitation expiré", 400);

      let user = await User.findOne({ email });
      if (!user) {
        user = await User.create({
          email,
          firstName: given_name || name?.split(" ")[0] || "",
          lastName: family_name || name?.split(" ")[1] || "",
          picture,
        });
      } else if (picture && picture !== user.picture) {
        user.picture = picture;
        await user.save();
      }

      let client = await Client.findOne({ userId: user._id });
      if (!client) client = await Client.create({ userId: user._id });

      const alreadyLinked = client.coaches?.some(
        (c) => c.coachId.toString() === invToken.coachId.toString(),
      );

      if (!alreadyLinked) {
        client.coaches.push({
          coachId: invToken.coachId,
          linkedAt: new Date(),
        });
        await client.save();
      }
    }

    // 3. Vérification Utilisateur (Cas 2 - Sans invitation)
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError("Utilisateur inconnu. Contactez votre coach.", 401);
    }

    // Mise à jour de la photo
    if (picture && picture !== user.picture) {
      user.picture = picture;
      await user.save();
    }

    // 4. Session
    req.session.userId = (user._id as string).toString();
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const builtUser = await buildUser(user);
    res.status(200).json({ status: "success", user: builtUser });
  },
);

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) throw new AppError("Non authentifié", 401);

  const user = await User.findById(userId);
  if (!user) throw new AppError("Utilisateur introuvable", 404);

  const builtUser = await buildUser(user);
  res.status(200).json({ status: "success", user: builtUser });
});

export const verifyInviteToken = catchAsync(
  async (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) throw new AppError("Token manquant", 400);

    const invitationToken = await InvitationToken.findOne({ token });
    if (!invitationToken) throw new AppError("Token invalide", 404);
    if (new Date() > invitationToken.expiresAt)
      throw new AppError("Token expiré", 410);

    const coach = await Coach.findById(invitationToken.coachId).populate<{
      userId: IUser;
    }>("userId", "firstName lastName picture");

    if (!coach || !coach.userId) throw new AppError("Coach introuvable", 500);

    res.status(200).json({
      valid: true,
      coach: {
        id: coach._id,
        firstName: coach.userId.firstName,
        lastName: coach.userId.lastName,
        picture: coach.userId.picture,
      },
    });
  },
);

export const logout = catchAsync(async (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) throw new AppError("Erreur de déconnexion", 500);
    res.clearCookie("connect.sid");
    res.status(200).json({ message: "Déconnexion réussie" });
  });
});
