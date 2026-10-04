// Doit rester le premier import : il peuple `process.env` pour tous les
// suivants. Voir `shared/config/loadEnv.ts`.
import './shared/config/loadEnv';

import express from 'express';
import cors from 'cors';
import connectDB from './shared/config/db';
import routes from './routes';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import authRoutes from './modules/auth/auth.routes';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { globalLimiter } from './shared/middleware/rateLimits';
import { globalErrorHandler } from './shared/middleware/errorHandler';
import { httpLogger } from './shared/middleware/httpLogger';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import logger from './shared/utils/logger';
import { getErrorMessage } from './shared/utils/unknownError';

import { validateEnv } from './shared/config/env';
import { AppError } from './shared/utils/AppError';

// Avant tout le reste : un environnement invalide doit arrêter le démarrage,
// pas se découvrir sur une route au hasard.
const config = validateEnv();

const app = express();

app.set('trust proxy', 1);

// CORS en premier — doit précéder tout middleware qui peut rejeter des requêtes,
// sinon les réponses d'erreur (429, 5xx…) n'ont pas les headers CORS et le
// navigateur affiche une "CORS error" masquant le vrai problème.
app.use(
  cors({
    origin: [
      config.FRONTEND_URL,
      'https://kettleapp.fr',
      'https://www.kettleapp.fr',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(helmet());

// Nettoyage des opérateurs MongoDB dans les entrées.
app.use(mongoSanitize());

app.use(httpLogger);

app.use(cookieParser());

/**
 * Quelle taille un corps de requête peut atteindre.
 *
 * `express.json()` applique déjà un défaut de 100 Ko : la limite existait, elle
 * était seulement implicite — et trop basse pour la seule requête qui peut
 * légitimement grossir, l'atelier envoyant le programme entier à chaque
 * enregistrement. Mesuré, cinq séances de neuf blocs et dix-huit exercices
 * pèsent 5,4 Ko ; un programme vingt fois plus chargé atteint donc 107 Ko et
 * l'enregistrement échouerait sur un plafond que personne n'a choisi. 256 Ko
 * laisse une quarantaine de fois le programme d'essai et refuse toujours un
 * corps arbitraire.
 */
app.use(express.json({ limit: '256kb' }));

// Avant les autres routes, et sans authentification : c'est l'adresse que
// la plateforme interroge pour savoir si le service répond.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// La session, dans un cookie signé et stocké chez Mongo.
app.use(
  session({
    name: 'connect.sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: MongoStore.create({
      mongoUrl: config.MONGO_URI,
      // Ne réécrit la session en base qu'une fois par jour : sans cela,
      // chaque requête d'un client en séance produit une écriture.
      touchAfter: 24 * 3600,
      collectionName: 'auth_sessions',
    }),
    cookie: {
      secure: config.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: config.NODE_ENV === 'production' ? '.kettleapp.fr' : undefined,
    },
  })
);

// Après la session, pour pouvoir compter par utilisateur plutôt que par
// adresse — voir `shared/middleware/rateLimits.ts` pour le pourquoi. Le
// commentaire vivait quarante lignes plus haut, sur `cookieParser`.
app.use(globalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api', routes);

app.use('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} non trouvée`, 404));
});

app.use(globalErrorHandler);

const PORT = config.PORT;

/**
 * Démarrer, et s'arrêter.
 *
 * `connectDB().then(...)` ne portait pas de `.catch()` : une base qui refusait
 * la connexion produisait une rejection non gérée et un process bien vivant,
 * sans serveur à l'écoute — debout, sain pour tout ce qui surveille le
 * process, et ne répondant à rien. Un échec au démarrage doit être un échec au
 * démarrage.
 *
 * Et un arrêt doit finir ce qu'il a commencé. Sans ça, le SIGTERM d'un
 * déploiement tuait le process en pleine requête : le client voyait une socket
 * se fermer sans statut, et une écriture déjà partie chez Mongo ne savait pas
 * si sa réponse était arrivée. On cesse d'accepter, on laisse finir ce qui est
 * en vol, puis seulement on ferme la connexion.
 */
const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    logger.error('La connexion à la base a échoué, le serveur ne démarre pas', {
      error: getErrorMessage(err),
    });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Serveur démarré sur le port ${PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} reçu, arrêt en cours`);
    server.close(() => {
      void mongoose.connection.close(false).then(() => process.exit(0));
    });
    // Une requête qui ne finit jamais ne doit pas prendre le déploiement en
    // otage.
    setTimeout(() => {
      logger.error("Arrêt forcé : une requête n'a pas rendu la main à temps");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

void start();
