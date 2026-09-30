/**
 * GET  /api/partite/:id/mvp   stato della votazione (mai i conteggi finche' e' aperta)
 * POST /api/partite/:id/mvp   { "giocatore_id": n }  un voto per dispositivo
 */
import { LIMITE_VOTI_PER_IP } from '../../../lib/costanti';
import { cookieDispositivo, hashDelDispositivo, hashRete, hashToken, leggiToken, nuovoToken } from '../../../lib/dispositivo';
import { bloccoMvp, sincronizza, votazioneAperta } from '../../../lib/mvp';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../lib/risposta';
import { intero } from '../../../lib/valida';

export const onRequest = perMetodo({
  GET: async ({ env, request, params }) => {
    const adesso = Date.now();
    const p = await sincronizza(env.DB, idDa(params.id), adesso);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    return json(await bloccoMvp(env.DB, p, await hashDelDispositivo(request), adesso));
  },

  POST: async ({ env, request, params }) => {
    const adesso = Date.now();
    const corpo = await leggiOggetto(request);
    const giocatoreId = intero(corpo.giocatore_id, 'giocatore_id', 1, Number.MAX_SAFE_INTEGER);
    const p = await sincronizza(env.DB, idDa(params.id), adesso);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    if (p.stato !== 'giocata') throw new ErroreApi(409, 'la partita non è ancora stata giocata');
    if (!votazioneAperta(p, adesso)) throw new ErroreApi(409, 'votazione chiusa');
    // Si vota chiunque sia nel listone (anche se stessi, anche chi non ha giocato).
    const nelListone = await env.DB.prepare('SELECT 1 AS x FROM giocatori WHERE id = ? AND attivo = 1').bind(giocatoreId).first();
    if (!nelListone) throw new ErroreApi(400, 'giocatore_id: non è nel listone');

    const esistente = leggiToken(request);
    const token = esistente ?? nuovoToken();
    const hash = await hashToken(token);
    // Un solo statement: il conteggio dei voti della rete e l'inserimento sono atomici (niente corsa
    // fra due richieste parallele). Senza rete nota (sviluppo locale) il limite non si applica.
    const rete = await hashRete(request, p.id);
    const r = await env.DB
      .prepare(
        `INSERT INTO voti_mvp (partita_id, hash_token, giocatore_id, creato_il, hash_ip)
         SELECT ?1, ?2, ?3, ?4, ?5
          WHERE ?5 IS NULL OR (SELECT COUNT(*) FROM voti_mvp WHERE partita_id = ?1 AND hash_ip = ?5) < ?6
         ON CONFLICT (partita_id, hash_token) DO NOTHING`,
      )
      .bind(p.id, hash, giocatoreId, new Date(adesso).toISOString(), rete, LIMITE_VOTI_PER_IP)
      .run();
    if (r.meta.changes === 0) {
      const giaVotato = await env.DB.prepare('SELECT 1 AS x FROM voti_mvp WHERE partita_id = ? AND hash_token = ?').bind(p.id, hash).first();
      if (giaVotato) throw new ErroreApi(409, 'hai già votato per questa partita');
      throw new ErroreApi(429, 'troppi voti da questa rete per questa partita: riprova più tardi o da un\'altra rete');
    }
    return json({ ok: true, mvp: await bloccoMvp(env.DB, p, hash, adesso) }, 201, esistente ? {} : { 'Set-Cookie': cookieDispositivo(token) });
  },
});
