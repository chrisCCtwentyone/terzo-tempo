/** POST /api/admin/stagioni/:id/chiudi   { data_fine? } (default: oggi, a Roma) */
import { FUSO_ORARIO } from '../../../../lib/costanti';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../lib/risposta';
import { dataYmd } from '../../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const id = idDa(params.id);
    // il corpo e' facoltativo
    const c = request.headers.get('Content-Length') === '0' || !request.headers.get('Content-Type') ? {} : await leggiOggetto(request);
    const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO_ORARIO }).format(new Date());
    const fine = c.data_fine === undefined ? oggi : dataYmd(c.data_fine, 'data_fine');
    const r = await env.DB.prepare('UPDATE stagioni SET aperta = 0, data_fine = ? WHERE id = ?').bind(fine, id).run();
    if (r.meta.changes === 0) throw new ErroreApi(404, 'stagione non trovata');
    return json({ id, aperta: false, data_fine: fine });
  },
});
