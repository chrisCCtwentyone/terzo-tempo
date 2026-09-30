/**
 * POST /api/admin/stagioni   { nome, data_inizio, data_fine?, aperta? (default true) }
 * (l'elenco e' pubblico: GET /api/stagioni)
 * Una sola stagione alla volta puo' essere aperta: 409 se un'altra lo e' gia'.
 */
import { conVincoli } from '../../../lib/admin';
import { json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { booleano, dataYmd, testo } from '../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    const aperta = c.aperta === undefined ? true : booleano(c.aperta, 'aperta');
    const fine = c.data_fine === undefined || c.data_fine === null ? null : dataYmd(c.data_fine, 'data_fine');
    const s = await conVincoli(
      env.DB
        .prepare('INSERT INTO stagioni (nome, aperta, data_inizio, data_fine) VALUES (?, ?, ?, ?) RETURNING id, nome, aperta, data_inizio, data_fine')
        .bind(testo(c.nome, 'nome', 60), aperta ? 1 : 0, dataYmd(c.data_inizio, 'data_inizio'), fine)
        .first<{ aperta: number }>(),
      'nome gia\' usato, oppure c\'e\' gia\' una stagione aperta: chiudila prima',
    );
    return json({ ...s!, aperta: s!.aperta === 1 }, 201);
  },
});
