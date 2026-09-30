/**
 * POST /api/admin/partite/:id/giocata   { gol_a, gol_b }
 * Segna la partita "giocata" con il risultato. Serve che ogni convocato abbia
 * una squadra e che le due squadre non siano vuote. Risposta: dettaglio + `avvisi`
 * (i gol dei giocatori non tornano col risultato: avviso, non errore).
 * La votazione MVP e' aperta fino a data_ora + 24 ore (anche se si segna in ritardo).
 */
import { avvisiCoerenza, controllaGiocabile, type Convocato } from '../../../../lib/admin';
import { caricaPartita } from '../../../../lib/mvp';
import { convocati, dettaglio } from '../../../../lib/partite';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../lib/risposta';
import { intero } from '../../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const golA = intero(c.gol_a, 'gol_a', 0, 99);
    const golB = intero(c.gol_b, 'gol_b', 0, 99);
    const p = await caricaPartita(env.DB, id);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    if (p.stato === 'giocata') throw new ErroreApi(409, 'partita già giocata: per correggere il risultato usa PATCH');
    const righe = (await convocati(env.DB, id)) as unknown as Convocato[];
    controllaGiocabile(righe);
    await env.DB.prepare("UPDATE partite SET stato = 'giocata', gol_a = ?, gol_b = ? WHERE id = ?").bind(golA, golB, id).run();
    return json({ ...(await dettaglio(env.DB, id, null, Date.now())), avvisi: avvisiCoerenza(golA, golB, righe) });
  },
});
