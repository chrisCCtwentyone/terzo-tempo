/** GET /api/partite/:id: squadre, posizioni, gol, pagelle, cronaca, stato MVP. */
import { hashDelDispositivo } from '../../lib/dispositivo';
import { dettaglio } from '../../lib/partite';
import { ErroreApi, idDa, json, perMetodo } from '../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env, request, params }) => {
    const d = await dettaglio(env.DB, idDa(params.id), await hashDelDispositivo(request), Date.now());
    if (!d) throw new ErroreApi(404, 'partita non trovata');
    return json(d);
  },
});
