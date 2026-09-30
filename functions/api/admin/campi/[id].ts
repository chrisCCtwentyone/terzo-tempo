/**
 * PATCH /api/admin/campi/:id   { nome?, link? (null = toglie), lat?, lng? (in coppia; null, null = toglie), archiviato? }
 * Un campo non si cancella: si archivia (resta sulle partite passate, non si sceglie piu' per le nuove).
 */
import { aggiorna, conVincoli } from '../../../lib/admin';
import { MAX_NOME_CAMPO } from '../../../lib/costanti';
import { SELECT_CAMPO, coordinateCampo, linkCampo, perAdminCampo, type CampoDb } from '../../../lib/campi';
import { indicazioni } from '../../../lib/maps';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { booleano, testo } from '../../../lib/valida';

export const onRequest = perMetodo({
  PATCH: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const attuale = await env.DB.prepare(`${SELECT_CAMPO} WHERE c.id = ?`).bind(id).first<CampoDb>();
    if (!attuale) throw new ErroreApi(404, 'campo non trovato');

    const campi: [string, unknown][] = [];
    const nome = 'nome' in c ? testo(c.nome, 'nome', MAX_NOME_CAMPO) : attuale.nome;
    const posizione = 'lat' in c || 'lng' in c ? coordinateCampo(c) : { lat: attuale.lat, lng: attuale.lng };
    if ('nome' in c) campi.push(['nome', nome]);
    if ('link' in c) campi.push(['link_originale', linkCampo(c.link)]);
    if ('lat' in c || 'lng' in c) campi.push(['lat', posizione.lat], ['lng', posizione.lng]);
    if ('nome' in c || 'lat' in c || 'lng' in c) campi.push(['url_indicazioni', indicazioni({ nome, ...posizione })]);
    if ('archiviato' in c) campi.push(['archiviato', booleano(c.archiviato, 'archiviato') ? 1 : 0]);

    await conVincoli(aggiorna(env.DB, 'campi', id, campi, 'campo non trovato'), 'esiste già un campo con questo nome');
    const campo = await env.DB.prepare(`${SELECT_CAMPO} WHERE c.id = ?`).bind(id).first<CampoDb>();
    return json(perAdminCampo(campo!));
  },
});
