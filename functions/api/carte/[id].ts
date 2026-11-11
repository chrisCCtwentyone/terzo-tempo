/** GET /api/carte/:id[?v=<versione>]: i byte della carta (la versione serve solo a cambiare l'URL, il server la ignora). */
import { ErroreApi, idDa, perMetodo } from '../../lib/risposta';

export const onRequest = perMetodo({
  GET: async ({ env, params }) => {
    const c = await env.DB.prepare('SELECT immagine, tipo FROM carte WHERE giocatore_id = ?').bind(idDa(params.id)).first<{ immagine: ArrayBuffer | number[]; tipo: string }>();
    if (!c) throw new ErroreApi(404, 'carta non trovata');
    return new Response(new Uint8Array(c.immagine), {
      headers: { 'Content-Type': c.tipo, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
    });
  },
});
