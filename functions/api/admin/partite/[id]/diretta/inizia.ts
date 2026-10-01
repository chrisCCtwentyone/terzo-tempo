/**
 * POST /api/admin/partite/:id/diretta/inizia   "Inizia diretta". Corpo facoltativo (ignorato). Idempotente.
 * 409 se non ci sono le squadre (serve almeno un giocatore per squadra), o se la diretta e' finita / la partita e' giocata.
 * Senza premerlo la diretta parte da sola all'orario della partita (se ci sono le squadre). Risposta: { diretta }.
 */
import { iniziaDiretta, partitaODa404, vistaDiretta } from '../../../../../lib/diretta';
import { idDa, json, perMetodo } from '../../../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, params }) => {
    const adesso = Date.now();
    const p = await partitaODa404(env.DB, idDa(params.id));
    await iniziaDiretta(env.DB, p, adesso);
    return json({ diretta: await vistaDiretta(env.DB, (await partitaODa404(env.DB, p.id)), adesso, true) });
  },
});
