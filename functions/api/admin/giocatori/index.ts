/**
 * GET  /api/admin/giocatori   tutti (anche archiviati), CON livello_segreto
 * POST /api/admin/giocatori   { cognome, iniziali?, livello_segreto?, attivo? }  (il nome e' "Cognome I.", lo compone il server;
 *                               senza iniziali e' il solo cognome/nome scritto, es. "Gianni")
 */
import { conVincoli, perAdmin, SELECT_ADMIN } from '../../../lib/admin';
import { json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { componiNome } from '../../../../shared/nomi';
import { booleano, cognomeGiocatore, inizialiGiocatore, interoOpz, perNome } from '../../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const r = await env.DB.prepare(`${SELECT_ADMIN} `).all<{ nome: string; attivo: number; badge_ids: string | null }>();
    return json({ giocatori: r.results.sort((a, b) => perNome(a.nome, b.nome)).map(perAdmin) });
  },

  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const nome = componiNome(cognomeGiocatore(c.cognome), inizialiGiocatore(c.iniziali));
    const livello = interoOpz(c.livello_segreto, 'livello_segreto', 1, 5);
    const attivo = c.attivo === undefined ? true : booleano(c.attivo, 'attivo');
    const r = await conVincoli(
      env.DB.prepare('INSERT INTO giocatori (nome, attivo, livello_segreto) VALUES (?, ?, ?) RETURNING id').bind(nome, attivo ? 1 : 0, livello).first<{ id: number }>(),
      'esiste già un giocatore con questo nome',
    );
    const g = await env.DB.prepare(`${SELECT_ADMIN} WHERE g.id = ?`).bind(r!.id).first<{ nome: string; attivo: number; badge_ids: string | null }>();
    return json(perAdmin(g!), 201);
  },
});
