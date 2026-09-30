/** POST /api/admin/stagioni/:id/apri   409 se un'altra stagione e' gia' aperta. */
import { conVincoli } from '../../../../lib/admin';
import { ErroreApi, idDa, json, perMetodo } from '../../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, params }) => {
    const id = idDa(params.id);
    const r = await conVincoli(
      env.DB.prepare('UPDATE stagioni SET aperta = 1, data_fine = NULL WHERE id = ?').bind(id).run(),
      'c\'è già un\'altra stagione aperta: chiudila prima',
    );
    if (r.meta.changes === 0) throw new ErroreApi(404, 'stagione non trovata');
    return json({ id, aperta: true });
  },
});
