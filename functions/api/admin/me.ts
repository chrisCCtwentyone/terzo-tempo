/** GET /api/admin/me: chi e' l'admin autenticato (per il frontend: "sono admin?"). */
import { json, perMetodo } from '../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ data }) => json({ email: (data as { utente?: string }).utente ?? null }),
});
