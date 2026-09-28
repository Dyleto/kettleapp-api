const REQUIRED = [
  'MONGO_URI',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(', ')}`
    );
  }

  if (process.env.SESSION_SECRET === 'your_secret_key') {
    throw new Error(
      'SESSION_SECRET doit être changé (valeur par défaut détectée)'
    );
  }
}
