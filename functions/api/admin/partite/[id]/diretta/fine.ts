/**
 * POST /api/admin/partite/:id/diretta/fine   "Fine partita". Corpo facoltativo (ignorato). Idempotente.
 * Calcola dagli eventi i gol e gli autogol per giocatore e li scrive negli stessi campi della schermata Risultato
 * (partecipazioni.gol / .autogol); la partita resta "in convocazione": l'admin mette i voti e preme "Segna come giocata".
 * Una seconda pressione non ricalcola niente. 409 se la diretta non e' iniziata o la partita e' gia' giocata.
 * Risposta: { diretta, risultato: { A, B } }.
 */
import { fineDiretta, partitaODa404, punteggioDa, vistaDiretta } from '../../../../../lib/diretta';
import { idDa, json, perMetodo } from '../../../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, params }) => {
    const adesso = Date.now();
    const p = await partitaODa404(env.DB, idDa(params.id));
    await fineDiretta(env.DB, p, adesso);
    const v = await vistaDiretta(env.DB, await partitaODa404(env.DB, p.id), adesso, true);
    return json({ diretta: v, risultato: punteggioDa(v.eventi) });
  },
});
