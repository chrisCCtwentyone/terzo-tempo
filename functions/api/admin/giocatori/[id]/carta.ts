/**
 * PUT    /api/admin/giocatori/:id/carta   corpo = i byte dell'immagine (Content-Type image/jpeg|webp|png, max 400 KB) -> { versione }
 * DELETE /api/admin/giocatori/:id/carta   toglie la carta (anche se non c'era) -> { ok: true }
 */
import { MAX_CARTA_BYTE } from '../../../../lib/costanti';
import { tipoImmagine } from '../../../../lib/carte';
import { ErroreApi, idDa, json, leggiByteLimitati, perMetodo } from '../../../../lib/risposta';

const TIPI = ['image/jpeg', 'image/webp', 'image/png'];

async function esiste(db: D1Database, id: number) {
  if (!(await db.prepare('SELECT 1 AS x FROM giocatori WHERE id = ?').bind(id).first())) throw new ErroreApi(404, 'giocatore non trovato');
}

export const onRequest = perMetodo({
  PUT: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const dichiarato = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TIPI.includes(dichiarato)) throw new ErroreApi(415, 'serve Content-Type: image/jpeg, image/webp o image/png');
    const byte = await leggiByteLimitati(request, MAX_CARTA_BYTE);
    if (tipoImmagine(byte) !== dichiarato) throw new ErroreApi(400, 'il file non e\' un\'immagine del tipo dichiarato');
    await esiste(env.DB, id);
    const versione = Date.now();
    await env.DB
      .prepare('INSERT INTO carte (giocatore_id, immagine, tipo, versione) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (giocatore_id) DO UPDATE SET immagine = ?2, tipo = ?3, versione = ?4')
      .bind(id, byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.byteLength), dichiarato, versione)
      .run();
    return json({ versione });
  },

  DELETE: async ({ env, params }) => {
    const id = idDa(params.id);
    await esiste(env.DB, id);
    await env.DB.prepare('DELETE FROM carte WHERE giocatore_id = ?').bind(id).run();
    return json({ ok: true });
  },
});
