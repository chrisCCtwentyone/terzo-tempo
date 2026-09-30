/**
 * POST /api/admin/partite   { data_ora, giocatori: [id, ...], stagione_id? }
 * Crea una partita in "convocazione". `data_ora`: con Z/scostamento e' un istante,
 * senza (es. "2026-10-01T21:00") e' ora di Roma. Senza stagione_id: la stagione aperta.
 */
import { ErroreApi, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { dataOraUtc, intero } from '../../../lib/valida';
import { stagioneAperta } from '../../../lib/partite';

export const onRequest = perMetodo({
  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const dataOra = dataOraUtc(c.data_ora);
    if (!Array.isArray(c.giocatori)) throw new ErroreApi(400, 'giocatori: elenco di id');
    const ids = c.giocatori.map((g) => intero(g, 'giocatori', 1, Number.MAX_SAFE_INTEGER));
    if (new Set(ids).size !== ids.length) throw new ErroreApi(400, 'giocatori: id ripetuti');

    const stagioneId = c.stagione_id === undefined ? (await stagioneAperta(env.DB))?.id : intero(c.stagione_id, 'stagione_id', 1, Number.MAX_SAFE_INTEGER);
    if (!stagioneId) throw new ErroreApi(409, 'nessuna stagione aperta: apri una stagione o indica stagione_id');
    if (!(await env.DB.prepare('SELECT 1 AS x FROM stagioni WHERE id = ?').bind(stagioneId).first())) throw new ErroreApi(404, 'stagione non trovata');
    if (ids.length) {
      const trovati = await env.DB
        .prepare(`SELECT COUNT(*) AS n FROM giocatori WHERE id IN (${ids.map(() => '?').join(',')})`)
        .bind(...ids)
        .first<{ n: number }>();
      if (trovati!.n !== ids.length) throw new ErroreApi(400, 'giocatori: un id non esiste');
    }

    const p = await env.DB
      .prepare('INSERT INTO partite (stagione_id, data_ora) VALUES (?, ?) RETURNING id')
      .bind(stagioneId, dataOra)
      .first<{ id: number }>();
    try {
      await env.DB.batch(ids.map((g) => env.DB.prepare('INSERT INTO partecipazioni (partita_id, giocatore_id) VALUES (?, ?)').bind(p!.id, g)));
    } catch (e) {
      await env.DB.prepare('DELETE FROM partite WHERE id = ?').bind(p!.id).run(); // niente partita a meta'
      throw e;
    }
    return json({ id: p!.id, stagione_id: stagioneId, data_ora: dataOra, stato: 'convocazione' }, 201);
  },
});
