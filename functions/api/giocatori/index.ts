/** GET /api/giocatori[?tutti=1]: il listone, con badge e totali (sempre). Di default solo gli attivi. */
import { badgePerGiocatore } from '../../lib/partite';
import { json, perMetodo } from '../../lib/risposta';
import { totaliStagione } from '../../lib/statistiche';
import { perNome } from '../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env, request }) => {
    const tutti = new URL(request.url).searchParams.get('tutti') === '1';
    const giocatori = await env.DB
      .prepare('SELECT id, nome, attivo FROM giocatori WHERE (?1 = 1 OR attivo = 1) ')
      .bind(tutti ? 1 : 0)
      .all<{ id: number; nome: string; attivo: number }>();
    const badge = await badgePerGiocatore(env.DB, null);
    const totali = new Map((await totaliStagione(env.DB, null)).map((t) => [t.giocatore_id, t]));
    return json({
      giocatori: giocatori.results.sort((a, b) => perNome(a.nome, b.nome)).map((g) => {
        const t = totali.get(g.id);
        return {
          id: g.id,
          nome: g.nome,
          attivo: g.attivo === 1,
          badge: badge.get(g.id) ?? [],
          totali: { presenze: t?.presenze ?? 0, gol: t?.gol ?? 0, media_voto: t?.media_voto ?? null, mvp: t?.mvp ?? 0 },
        };
      }),
    });
  },
});
