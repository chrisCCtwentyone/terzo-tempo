/**
 * GET /api/diretta   la partita in diretta adesso (o, in mancanza, quella "da confermare" piu' recente): { diretta: null | {
 *   partita_id, stato: "in_diretta" | "da_confermare", data_ora, squadre: [{ codice, nome, gol }] } }.
 * Leggerissima (nessun nome, nessuna lista): la usa la scorciatoia LIVE dell'area admin. La home ha lo stesso oggetto in `diretta`.
 */
import { direttaCorrente } from '../lib/diretta';
import { json, perMetodo } from '../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env }) => json({ diretta: await direttaCorrente(env.DB, Date.now()) }),
});
