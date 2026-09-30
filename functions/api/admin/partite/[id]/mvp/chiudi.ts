/** POST /api/admin/partite/:id/mvp/chiudi   chiude la votazione adesso e calcola vincitore o parita'. */
import { bloccoMvp, chiudiVotazione, sincronizza } from '../../../../../lib/mvp';
import { ErroreApi, idDa, json, perMetodo } from '../../../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, params }) => {
    const adesso = Date.now();
    const p = await sincronizza(env.DB, idDa(params.id), adesso);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    if (p.stato !== 'giocata') throw new ErroreApi(409, 'la partita non e\' ancora stata giocata');
    if (p.mvp_stato !== 'aperto') throw new ErroreApi(409, 'votazione gia\' chiusa');
    await chiudiVotazione(env.DB, p.id, new Date(adesso).toISOString().slice(0, 19) + 'Z');
    return json(await bloccoMvp(env.DB, (await sincronizza(env.DB, p.id, adesso))!, null, adesso));
  },
});
