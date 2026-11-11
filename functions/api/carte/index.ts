/** GET /api/carte: { carte: { "<giocatore_id>": <versione> } }, solo per chi ha la carta. Mai altro. */
import { json, perMetodo } from '../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const righe = await env.DB.prepare('SELECT giocatore_id, versione FROM carte').all<{ giocatore_id: number; versione: number }>();
    return json({ carte: Object.fromEntries(righe.results.map((r) => [r.giocatore_id, r.versione])) });
  },
});
