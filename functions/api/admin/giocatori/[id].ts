/**
 * GET    /api/admin/giocatori/:id
 * PATCH  /api/admin/giocatori/:id   { nome?, attivo?, livello_segreto? (null = toglie) }
 * DELETE /api/admin/giocatori/:id   solo se non ha partite ne' voti (altrimenti: archivialo)
 */
import { aggiorna, conVincoli, perAdmin, SELECT_ADMIN } from '../../../lib/admin';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { booleano, interoOpz, nomeGiocatore } from '../../../lib/valida';

type Riga = { attivo: number; badge_ids: string | null };
const carica = (db: D1Database, id: number) => db.prepare(`${SELECT_ADMIN} WHERE g.id = ?`).bind(id).first<Riga>();

export const onRequest = perMetodo({
  GET: async ({ env, params }) => {
    const g = await carica(env.DB, idDa(params.id));
    if (!g) throw new ErroreApi(404, 'giocatore non trovato');
    return json(perAdmin(g));
  },

  PATCH: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const campi: [string, unknown][] = [];
    if ('nome' in c) campi.push(['nome', nomeGiocatore(c.nome)]);
    if ('attivo' in c) campi.push(['attivo', booleano(c.attivo, 'attivo') ? 1 : 0]);
    if ('livello_segreto' in c) campi.push(['livello_segreto', interoOpz(c.livello_segreto, 'livello_segreto', 1, 5)]);
    await conVincoli(aggiorna(env.DB, 'giocatori', id, campi, 'giocatore non trovato'), 'esiste gia\' un giocatore con questo nome');
    return json(perAdmin((await carica(env.DB, id))!));
  },

  DELETE: async ({ env, params }) => {
    const id = idDa(params.id);
    const r = await conVincoli(
      env.DB.prepare('DELETE FROM giocatori WHERE id = ?').bind(id).run(),
      'conflitto',
      'ha partite o voti: archivialo (attivo: false) invece di cancellarlo',
    );
    if (r.meta.changes === 0) throw new ErroreApi(404, 'giocatore non trovato');
    return json({ ok: true });
  },
});
