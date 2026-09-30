/**
 * POST /api/admin/partite/:id/genera-squadre   { seed? }
 * Propone due squadre dai convocati della partita. NON salva niente: l'admin
 * ritocca a mano e poi salva con PUT .../convocati. Stesso seed = stessa proposta;
 * senza seed ne sceglie uno a caso e lo restituisce ("rigenera" = un altro seed).
 */
import { generaSquadre, type Candidato } from '../../../../lib/generatore';
import { MIN_PARTITE_CLASSIFICA, SQUADRE } from '../../../../lib/costanti';
import { badgePerGiocatore } from '../../../../lib/partite';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../lib/risposta';
import { totaliStagione } from '../../../../lib/statistiche';
import { intero } from '../../../../lib/valida';

export const onRequest = perMetodo({
  POST: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = request.headers.get('Content-Type') ? await leggiOggetto(request) : {};
    const seed = c.seed === undefined ? Math.floor(Math.random() * 2 ** 32) : intero(c.seed, 'seed', 0, 2 ** 32 - 1);
    if (!(await env.DB.prepare('SELECT 1 AS x FROM partite WHERE id = ?').bind(id).first())) throw new ErroreApi(404, 'partita non trovata');

    const conv = await env.DB
      .prepare('SELECT g.id, g.nome, g.livello_segreto FROM partecipazioni pa JOIN giocatori g ON g.id = pa.giocatore_id WHERE pa.partita_id = ? ORDER BY g.id')
      .bind(id)
      .all<{ id: number; nome: string; livello_segreto: number | null }>();
    const badge = await badgePerGiocatore(env.DB, null);
    const totali = new Map((await totaliStagione(env.DB, null)).map((t) => [t.giocatore_id, t]));

    // Le statistiche contano solo con abbastanza partite (MIN_PARTITE_CLASSIFICA).
    const candidati: Candidato[] = conv.results.map((g) => {
      const t = totali.get(g.id);
      const abbastanza = !!t && t.presenze >= MIN_PARTITE_CLASSIFICA;
      return {
        id: g.id,
        livello: g.livello_segreto,
        media_voto: t && t.partite_con_voto >= MIN_PARTITE_CLASSIFICA ? t.media_voto : null,
        pct_vittorie: abbastanza ? t.pct_vittorie : null,
        gol_a_partita: abbastanza ? t.gol_a_partita : null,
        badge: (badge.get(g.id) ?? []).map((b) => b.id),
      };
    });

    let s;
    try {
      s = generaSquadre(candidati, seed);
    } catch (e) {
      if (e instanceof RangeError) throw new ErroreApi(400, e.message);
      throw e;
    }
    const nomi = new Map(conv.results.map((g) => [g.id, g.nome]));
    const squadra = (codice: 'A' | 'B') => ({
      codice,
      nome: SQUADRE[codice],
      media: Math.round(s[`media_${codice}`] * 1000) / 1000,
      giocatori: s[codice].map((g) => ({ giocatore_id: g, nome: nomi.get(g)! })),
    });
    return json({ seed, squadre: [squadra('A'), squadra('B')] });
  },
});
