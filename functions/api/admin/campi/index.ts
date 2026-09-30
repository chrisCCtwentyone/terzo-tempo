/**
 * GET  /api/admin/campi
 * POST /api/admin/campi   { nome, link?, lat?, lng? }   (nome obbligatorio; lat e lng in coppia)
 */
import { conVincoli } from '../../../lib/admin';
import { MAX_NOME_CAMPO } from '../../../lib/costanti';
import { SELECT_CAMPO, coordinateCampo, linkCampo, perAdminCampo, type CampoDb } from '../../../lib/campi';
import { indicazioni } from '../../../lib/maps';
import { json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { testo } from '../../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env }) => {
    const r = await env.DB.prepare(`${SELECT_CAMPO} `).all<CampoDb>();
    // attivi prima, poi archiviati; per nome (l'ordinamento e' qui: nessuna interpolazione vicino a un ORDER BY)
    const campi = r.results.sort((a, b) => a.archiviato - b.archiviato || a.nome.localeCompare(b.nome, 'it'));
    return json({ campi: campi.map(perAdminCampo) });
  },

  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const nome = testo(c.nome, 'nome', MAX_NOME_CAMPO);
    const link = linkCampo(c.link);
    const { lat, lng } = coordinateCampo(c);
    const nuovo = await conVincoli(
      env.DB
        .prepare('INSERT INTO campi (nome, link_originale, lat, lng, url_indicazioni) VALUES (?, ?, ?, ?, ?) RETURNING id')
        .bind(nome, link, lat, lng, indicazioni({ nome, lat, lng }))
        .first<{ id: number }>(),
      'esiste già un campo con questo nome',
    );
    const campo = await env.DB.prepare(`${SELECT_CAMPO} WHERE c.id = ?`).bind(nuovo!.id).first<CampoDb>();
    return json(perAdminCampo(campo!), 201);
  },
});
