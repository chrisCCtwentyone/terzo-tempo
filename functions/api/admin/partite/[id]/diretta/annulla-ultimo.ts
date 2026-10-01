/**
 * POST /api/admin/partite/:id/diretta/annulla-ultimo   { id_client }
 * Annulla l'ultimo gol non annullato. `id_client` e' l'identificativo dell'AZIONE (un UUID del telefono): con lo stesso id_client
 * una ripetizione restituisce lo stesso gol annullato, senza annullarne un altro. 409 se non c'e' niente da annullare o la partita
 * non e' in diretta. Risposta: { evento, diretta }.
 */
import { annullaUltimo, idClient, partitaODa404, vistaDiretta } from '../../../../../lib/diretta';
import { idDa, json, leggiOggetto, perMetodo } from '../../../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const adesso = Date.now();
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const idAzione = idClient(c.id_client);
    const p = await partitaODa404(env.DB, id);
    const e = await annullaUltimo(env.DB, p, adesso, idAzione);
    return json({
      evento: { id: e.id, id_client: e.id_client, tipo: e.tipo, squadra: e.squadra, giocatore_id: e.giocatore_id, nome: e.nome, annullato: true },
      diretta: await vistaDiretta(env.DB, p, adesso, true),
    });
  },
});
