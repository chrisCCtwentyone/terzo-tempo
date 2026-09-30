/**
 * PATCH  /api/admin/badge/:id   { nome?, descrizione? (null = toglie), tipo? }
 * DELETE /api/admin/badge/:id   lo toglie anche a chi lo ha
 */
import { aggiorna, conVincoli } from '../../../lib/admin';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { testo, testoOpz } from '../../../lib/valida';

export const onRequest = perMetodo({
  PATCH: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const campi: [string, unknown][] = [];
    if ('nome' in c) campi.push(['nome', testo(c.nome, 'nome', 40)]);
    if ('descrizione' in c) campi.push(['descrizione', testoOpz(c.descrizione, 'descrizione', 120)]);
    if ('tipo' in c) {
      if (c.tipo !== 'positivo' && c.tipo !== 'negativo') throw new ErroreApi(400, 'tipo: "positivo" o "negativo"');
      campi.push(['tipo', c.tipo]);
    }
    await conVincoli(aggiorna(env.DB, 'badge', id, campi, 'badge non trovato'), 'esiste gia\' un badge con questo nome');
    return json(await env.DB.prepare('SELECT id, nome, descrizione, tipo FROM badge WHERE id = ?').bind(id).first());
  },

  DELETE: async ({ env, params }) => {
    const r = await env.DB.prepare('DELETE FROM badge WHERE id = ?').bind(idDa(params.id)).run();
    if (r.meta.changes === 0) throw new ErroreApi(404, 'badge non trovato');
    return json({ ok: true });
  },
});
