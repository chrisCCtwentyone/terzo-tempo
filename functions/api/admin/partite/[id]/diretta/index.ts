/**
 * GET /api/admin/partite/:id/diretta   lo stato della diretta COME LO VEDE L'ADMIN: come la rotta pubblica, ma con l'id_client
 * di ogni gol (il telefono lo usa per riconoscere i propri gol gia' arrivati). Vedi functions/lib/diretta.ts.
 */
import { partitaODa404, vistaDiretta } from '../../../../../lib/diretta';
import { idDa, json, perMetodo } from '../../../../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env, params }) => {
    const p = await partitaODa404(env.DB, idDa(params.id));
    return json(await vistaDiretta(env.DB, p, Date.now(), true));
  },
});
