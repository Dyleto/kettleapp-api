import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import routes from './routes/index';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import authRoutes from './routes/auth';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimits';
import { globalErrorHandler } from './middleware/errorHandler';
import { httpLogger } from './middleware/httpLogger';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import logger from './utils/logger';
import { errorMessage } from './utils/unknownError';

dotenv.config();

import { validateEnv } from './config/env';
import { AppError } from './utils/AppError';
validateEnv();

const app = express();

app.set('trust proxy', 1);

// CORS en premier — doit précéder tout middleware qui peut rejeter des requêtes,
// sinon les réponses d'erreur (429, 5xx…) n'ont pas les headers CORS et le
// navigateur affiche une "CORS error" masquant le vrai problème.
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://kettleapp.fr',
      'https://www.kettleapp.fr',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(helmet());

// Sécurité Injection NoSQL
app.use(mongoSanitize());

app.use(httpLogger);

// The quota comes after the session so it can count per user rather than per
// address — see `middleware/rateLimits.ts` for why that matters.
app.use(cookieParser());

/**
 * How large a body may be.
 *
 * `express.json()` already defaults to 100 kb, so the limit existed — it was
 * just implicit, and too low for the one request that can legitimately grow:
 * the editor sends the whole programme on every save. Measured, five sessions
 * of nine blocks and eighteen exercises weigh 5.4 kb, so a programme twenty
 * times that size reaches 107 kb and the save would fail on a ceiling nobody
 * chose. 256 kb leaves some forty times the test programme and still refuses
 * an arbitrary body.
 */
app.use(express.json({ limit: '256kb' }));

// Health check endpoint (avant les autres routes)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session middleware
app.use(
  session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600, // Lazy session update (1 day)
      collectionName: 'auth_sessions',
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 day
      domain:
        process.env.NODE_ENV === 'production' ? '.kettleapp.fr' : undefined,
    },
  })
);

app.use(globalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', routes);

app.use('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} non trouvée`, 404));
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;

/**
 * Starting, and stopping.
 *
 * `connectDB().then(...)` carried no `.catch()`: a database that refused the
 * connection produced an unhandled rejection and a process that stayed alive
 * with no server listening — up, healthy to anything watching the process,
 * and answering nothing. A failure to start has to be a failure to start.
 *
 * And a stop has to finish what it began. Without this, a deploy's SIGTERM
 * killed the process mid-request: the client saw a socket close with no
 * status, and a write already sent to Mongo had no idea whether its answer
 * ever arrived. We stop accepting, we let what is in flight finish, and only
 * then we close the connection.
 */
const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    logger.error('La connexion à la base a échoué, le serveur ne démarre pas', {
      error: errorMessage(err),
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
    // A request that never finishes must not hold the deploy hostage.
    setTimeout(() => {
      logger.error("Arrêt forcé : une requête n'a pas rendu la main à temps");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

void start();
