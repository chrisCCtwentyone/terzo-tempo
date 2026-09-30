/** POST /api/admin/partite/:id/mvp/decidi   { giocatore_id }  sceglie fra i pari merito (stato "parita_da_decidere"). */
import { bloccoMvp, decidiParita, sincronizza } from '../../../../../lib/mvp';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../../lib/risposta';
import { intero } from '../../../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const adesso = Date.now();
    const giocatoreId = intero((await leggiOggetto(request)).giocatore_id, 'giocatore_id', 1, Number.MAX_SAFE_INTEGER);
    const p = await sincronizza(env.DB, idDa(params.id), adesso);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    await decidiParita(env.DB, p, giocatoreId);
    return json(await bloccoMvp(env.DB, (await sincronizza(env.DB, p.id, adesso))!, null, adesso));
  },
});
