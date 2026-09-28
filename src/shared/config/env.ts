/**
 * Ce sans quoi le serveur ne peut pas fonctionner.
 *
 * Volontairement lu au démarrage et non à l'usage : une variable manquante
 * ne se découvre sinon qu'au premier appel qui en a besoin — donc en
 * production, sur une route au hasard, sous la forme d'une erreur qui ne dit
 * pas son nom.
 */
const REQUIRED = [
  'MONGO_URI',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

/**
 * Vérifier l'environnement avant de démarrer.
 *
 * Le secret de session mérite son contrôle à part : laissé à sa valeur
 * d'exemple, il signe les cookies de tout le monde avec une clé publique, ce
 * qui revient à ne pas les signer. L'oubli est d'autant plus facile que
 * l'application démarre parfaitement sans qu'on s'en aperçoive.
 */
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
