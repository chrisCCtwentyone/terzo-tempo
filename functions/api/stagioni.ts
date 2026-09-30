/** GET /api/stagioni: elenco delle stagioni, dalla piu' recente. */
import { json, perMetodo } from '../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const r = await env.DB
      .prepare(
        `SELECT s.id, s.nome, s.aperta, s.data_inizio, s.data_fine,
                (SELECT COUNT(*) FROM partite p WHERE p.stagione_id = s.id AND p.stato = 'giocata') AS partite_giocate
           FROM stagioni s ORDER BY s.data_inizio DESC, s.id DESC`,
      )
      .all<{ aperta: number }>();
    return json({ stagioni: r.results.map((s) => ({ ...s, aperta: s.aperta === 1 })) });
  },
});
