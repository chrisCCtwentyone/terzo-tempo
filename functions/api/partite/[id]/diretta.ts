/**
 * GET /api/partite/:id/diretta   lo stato della diretta, per la pagina pubblica (che lo rilegge ogni ~10 secondi).
 *   { partita_id, stato: "non_iniziata" | "in_diretta" | "da_confermare" | "finita", inizio, scade_il,
 *     squadre: [{ codice, nome, gol }], eventi: [{ id, tipo, autogol, squadra, giocatore_id, nome }], max_eventi }
 * `squadra` di un evento e' la squadra che INCASSA il punto (per un autogol, quella avversaria). Niente id_client, niente livello.
 * A partita giocata (finita) il punteggio e' quello ufficiale e `eventi` e' vuoto: la fonte e' il dettaglio della partita.
 */
import { partitaODa404, vistaDiretta } from '../../../lib/diretta';
import { idDa, json, perMetodo } from '../../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env, params }) => {
    const p = await partitaODa404(env.DB, idDa(params.id));
    return json(await vistaDiretta(env.DB, p, Date.now(), false));
  },
});
