/** GET /api/partite?stagione=<id>|sempre: elenco (riepilogo), dalla piu' recente. */
import { mappaCampi } from '../../lib/campi';
import { leggiStagione, riepilogo } from '../../lib/partite';
import type { PartitaDb } from '../../lib/mvp';
import { json, perMetodo } from '../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env, request }) => {
    const stagione = await leggiStagione(env.DB, new URL(request.url).searchParams.get('stagione'));
    const r = await env.DB
      .prepare(
        `SELECT id, stagione_id, data_ora, stato, gol_a, gol_b, cronaca, mvp_stato, mvp_chiuso_il, campo_id, diretta_iniziata_il, diretta_finita_il
           FROM partite WHERE (?1 IS NULL OR stagione_id = ?1) ORDER BY data_ora DESC, id DESC`,
      )
      .bind(stagione?.id ?? null)
      .all<PartitaDb>();
    const campi = await mappaCampi(env.DB);
    return json({ stagione, partite: r.results.map((p) => riepilogo(p, p.campo_id === null ? null : campi.get(p.campo_id))) });
  },
});
