/** GET /api/giocatori/:id[?stagione=<id>|sempre]: scheda (totali, ultimi 5 V/P/S, pagelle per partita). */
import { badgePerGiocatore, leggiStagione } from '../../lib/partite';
import { ErroreApi, idDa, json, perMetodo } from '../../lib/risposta';
import { caricaRighe, caricaVincitori, esito, statistiche } from '../../lib/statistiche';

export const onRequest = perMetodo({
  GET: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const g = await env.DB.prepare('SELECT id, nome, attivo FROM giocatori WHERE id = ?').bind(id).first<{ id: number; nome: string; attivo: number }>();
    if (!g) throw new ErroreApi(404, 'giocatore non trovato');
    const stagione = await leggiStagione(env.DB, new URL(request.url).searchParams.get('stagione'));

    // dalla piu' recente
    const righe = (await caricaRighe(env.DB, stagione?.id ?? null)).filter((r) => r.giocatore_id === id);
    const mvp = (await caricaVincitori(env.DB, stagione?.id ?? null)).filter((v) => v.giocatore_id === id).length;
    return json({
      giocatore: { id, nome: g.nome, attivo: g.attivo === 1, badge: (await badgePerGiocatore(env.DB, id)).get(id) ?? [] },
      stagione,
      totali: statistiche(righe, mvp),
      ultime_5: righe.slice(0, 5).map((r) => ({ partita_id: r.partita_id, data_ora: r.data_ora, esito: esito(r) })),
      voti_per_partita: righe
        .filter((r) => r.voto !== null)
        .reverse()
        .map((r) => ({ partita_id: r.partita_id, data_ora: r.data_ora, voto: r.voto, gol: r.gol, autogol: r.autogol })),
    });
  },
});
