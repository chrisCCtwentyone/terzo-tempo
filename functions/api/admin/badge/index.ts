/**
 * GET  /api/admin/badge
 * POST /api/admin/badge   { nome, descrizione?, tipo: "positivo"|"negativo" }
 */
import { conVincoli } from '../../../lib/admin';
import { ErroreApi, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { testo, testoOpz } from '../../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const r = await env.DB.prepare('SELECT id, nome, descrizione, tipo FROM badge ORDER BY tipo DESC, nome').all();
    return json({ badge: r.results });
  },

  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const tipo = c.tipo;
    if (tipo !== 'positivo' && tipo !== 'negativo') throw new ErroreApi(400, 'tipo: "positivo" o "negativo"');
    const b = await conVincoli(
      env.DB
        .prepare('INSERT INTO badge (nome, descrizione, tipo) VALUES (?, ?, ?) RETURNING id, nome, descrizione, tipo')
        .bind(testo(c.nome, 'nome', 40), testoOpz(c.descrizione, 'descrizione', 120), tipo)
        .first(),
      'esiste gia\' un badge con questo nome',
    );
    return json(b, 201);
  },
});
