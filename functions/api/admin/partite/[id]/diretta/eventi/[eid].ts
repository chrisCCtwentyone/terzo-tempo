/**
 * PATCH  /api/admin/partite/:id/diretta/eventi/:eid   { tipo?, giocatore_id? }   cambia il marcatore o il tipo (gol <-> autogol)
 * DELETE /api/admin/partite/:id/diretta/eventi/:eid                              elimina (annulla) il gol
 * `:eid` e' l'id del server OPPURE l'id_client del gol: il telefono, offline, conosce solo il secondo.
 * Entrambe sono idempotenti (stessi valori / gia' annullato = 200). 404 gol inesistente, 409 partita non in diretta o gol annullato
 * (PATCH). Risposta: { evento, diretta }.
 */
import { cambiaEvento, eliminaEvento, partitaODa404, tipoEvento, vistaDiretta, type EventoDb } from '../../../../../../lib/diretta';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../../../lib/risposta';
import { intero } from '../../../../../../lib/valida';

const forma = (e: EventoDb) => ({ id: e.id, id_client: e.id_client, tipo: e.tipo, squadra: e.squadra, giocatore_id: e.giocatore_id, nome: e.nome, annullato: e.annullato === 1 });

export const onRequest = perMetodo({
  PATCH: async ({ env, request, params }) => {
    const adesso = Date.now();
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    if (!('tipo' in c) && !('giocatore_id' in c)) throw new ErroreApi(400, 'nessun campo da cambiare (tipo, giocatore_id)');
    const tipo = 'tipo' in c ? tipoEvento(c.tipo) : undefined;
    const giocatore = 'giocatore_id' in c ? intero(c.giocatore_id, 'giocatore_id', 1, Number.MAX_SAFE_INTEGER) : undefined;
    const p = await partitaODa404(env.DB, id);
    const evento = await cambiaEvento(env.DB, p, adesso, params.eid, tipo, giocatore);
    return json({ evento: forma(evento), diretta: await vistaDiretta(env.DB, p, adesso, true) });
  },

  DELETE: async ({ env, params }) => {
    const adesso = Date.now();
    const p = await partitaODa404(env.DB, idDa(params.id));
    const evento = await eliminaEvento(env.DB, p, adesso, params.eid);
    return json({ evento: forma(evento), diretta: await vistaDiretta(env.DB, p, adesso, true) });
  },
});
