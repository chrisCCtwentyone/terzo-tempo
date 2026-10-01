/**
 * POST /api/admin/partite/:id/diretta/eventi   { id_client, tipo: "gol" | "autogol", giocatore_id }
 * La squadra si deduce dal giocatore, che deve essere assegnato a una squadra in QUESTA partita. Un gol vale per la squadra del
 * marcatore, un autogol per quella avversaria. 201 con l'evento nuovo; con un id_client gia' visto 200 con l'evento che c'e' (nessun
 * doppione). 400 giocatore non in campo / campi non validi, 409 partita non in diretta o limite di gol raggiunto.
 * Risposta: { evento, diretta }.
 */
import { idClient, partitaODa404, registraEvento, tipoEvento, vistaDiretta } from '../../../../../../lib/diretta';
import { idDa, json, leggiOggetto, perMetodo } from '../../../../../../lib/risposta';
import { intero } from '../../../../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const adesso = Date.now();
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    const idCl = idClient(c.id_client);
    const tipo = tipoEvento(c.tipo);
    const giocatore = intero(c.giocatore_id, 'giocatore_id', 1, Number.MAX_SAFE_INTEGER);
    const p = await partitaODa404(env.DB, id);
    const { evento, nuovo } = await registraEvento(env.DB, p, adesso, idCl, tipo, giocatore);
    return json({ evento: { id: evento.id, id_client: evento.id_client, tipo: evento.tipo, squadra: evento.squadra, giocatore_id: evento.giocatore_id, nome: evento.nome, annullato: evento.annullato === 1 }, diretta: await vistaDiretta(env.DB, p, adesso, true) }, nuovo ? 201 : 200);
  },
});
