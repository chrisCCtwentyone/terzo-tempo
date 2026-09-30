/**
 * PATCH /api/admin/stagioni/:id   { nome }   rinomina la stagione (409 se il nome e' gia' usato)
 * Apertura e chiusura hanno le loro rotte: .../apri e .../chiudi.
 */
import { aggiorna, conVincoli } from '../../../lib/admin';
import { idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { testo } from '../../../lib/valida';

export const onRequest = perMetodo({
  PATCH: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const campi: [string, unknown][] = [];
    if ('nome' in c) campi.push(['nome', testo(c.nome, 'nome', 60)]);
    await conVincoli(aggiorna(env.DB, 'stagioni', id, campi, 'stagione non trovata'), 'esiste già una stagione con questo nome');
    const s = await env.DB.prepare('SELECT id, nome, aperta, data_inizio, data_fine FROM stagioni WHERE id = ?').bind(id).first<{ aperta: number }>();
    return json({ ...s!, aperta: s!.aperta === 1 });
  },
});
