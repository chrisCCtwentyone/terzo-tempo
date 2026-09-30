/**
 * PATCH  /api/admin/partite/:id   { data_ora?, stagione_id?, cronaca? (null = toglie), gol_a?, gol_b? }
 *        (i gol solo se la partita e' gia' "giocata": prima si usa POST .../giocata)
 * DELETE /api/admin/partite/:id   solo in "convocazione"
 */
import { aggiorna, conVincoli } from '../../../lib/admin';
import { caricaPartita } from '../../../lib/mvp';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { dataOraUtc, intero, testoOpz } from '../../../lib/valida';

export const onRequest = perMetodo({
  PATCH: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const p = await caricaPartita(env.DB, id);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    const campi: [string, unknown][] = [];
    if ('data_ora' in c) campi.push(['data_ora', dataOraUtc(c.data_ora)]);
    if ('stagione_id' in c) campi.push(['stagione_id', intero(c.stagione_id, 'stagione_id', 1, Number.MAX_SAFE_INTEGER)]);
    if ('cronaca' in c) campi.push(['cronaca', testoOpz(c.cronaca, 'cronaca', 5000)]);
    for (const g of ['gol_a', 'gol_b'] as const) {
      if (g in c) {
        if (p.stato !== 'giocata') throw new ErroreApi(409, `${g}: il risultato si inserisce segnando la partita "giocata"`);
        campi.push([g, intero(c[g], g, 0, 99)]);
      }
    }
    await conVincoli(aggiorna(env.DB, 'partite', id, campi, 'partita non trovata'), 'conflitto', 'stagione_id: la stagione non esiste');
    return json(await caricaPartita(env.DB, id));
  },

  DELETE: async ({ env, params }) => {
    const id = idDa(params.id);
    const p = await caricaPartita(env.DB, id);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    if (p.stato !== 'convocazione') throw new ErroreApi(409, 'una partita giocata non si cancella');
    await env.DB.prepare('DELETE FROM partite WHERE id = ?').bind(id).run();
    return json({ ok: true });
  },
});
