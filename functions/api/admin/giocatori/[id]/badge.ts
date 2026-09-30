/** PUT /api/admin/giocatori/:id/badge   { badge_ids: [n, ...] }  sostituisce l'elenco dei badge del giocatore. */
import { conVincoli } from '../../../../lib/admin';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../lib/risposta';
import { intero } from '../../../../lib/valida';

export const onRequest = perMetodo({
  PUT: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    if (!Array.isArray(c.badge_ids)) throw new ErroreApi(400, 'badge_ids: elenco di id');
    const ids = [...new Set(c.badge_ids.map((b) => intero(b, 'badge_ids', 1, Number.MAX_SAFE_INTEGER)))];
    if (!(await env.DB.prepare('SELECT 1 AS x FROM giocatori WHERE id = ?').bind(id).first())) throw new ErroreApi(404, 'giocatore non trovato');
    await conVincoli(
      env.DB.batch([
        env.DB.prepare('DELETE FROM giocatore_badge WHERE giocatore_id = ?').bind(id),
        ...ids.map((b) => env.DB.prepare('INSERT INTO giocatore_badge (giocatore_id, badge_id) VALUES (?, ?)').bind(id, b)),
      ]),
      'badge duplicato',
      'badge_ids: un badge non esiste',
    );
    return json({ giocatore_id: id, badge_ids: ids });
  },
});
