/**
 * GET  /api/admin/giocatori   tutti (anche archiviati), CON livello_segreto
 * POST /api/admin/giocatori   { nome, livello_segreto?, attivo? }
 */
import { conVincoli, perAdmin, SELECT_ADMIN } from '../../../lib/admin';
import { json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { booleano, interoOpz, nomeGiocatore, perNome } from '../../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const r = await env.DB.prepare(`${SELECT_ADMIN} `).all<{ nome: string; attivo: number; badge_ids: string | null }>();
    return json({ giocatori: r.results.sort((a, b) => perNome(a.nome, b.nome)).map(perAdmin) });
  },

  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const nome = nomeGiocatore(c.nome);
    const livello = interoOpz(c.livello_segreto, 'livello_segreto', 1, 5);
    const attivo = c.attivo === undefined ? true : booleano(c.attivo, 'attivo');
    const r = await conVincoli(
      env.DB.prepare('INSERT INTO giocatori (nome, attivo, livello_segreto) VALUES (?, ?, ?) RETURNING id').bind(nome, attivo ? 1 : 0, livello).first<{ id: number }>(),
      'esiste gia\' un giocatore con questo nome',
    );
    const g = await env.DB.prepare(`${SELECT_ADMIN} WHERE g.id = ?`).bind(r!.id).first<{ attivo: number; badge_ids: string | null }>();
    return json(perAdmin(g!), 201);
  },
});
