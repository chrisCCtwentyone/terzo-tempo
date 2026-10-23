/**
 * Votazione MVP.
 *
 * Aperta solo se la partita e' 'giocata', l'admin non l'ha chiusa e adesso e'
 * prima di data_ora + 24 ore (FINESTRA_VOTO_MVP_MS). La chiusura automatica e'
 * LAZY: la applica `sincronizza`, chiamata a ogni lettura e a ogni voto,
 * senza cron. In chiusura automatica `mvp_chiuso_il` e' la scadenza, non
 * l'istante della lettura.
 *
 * Finche' e' aperta si espone SOLO quanti hanno votato e se questo dispositivo
 * ha votato: mai i conteggi per giocatore.
 */

import { FINESTRA_VOTO_MVP_MS } from './costanti';
import { ErroreApi } from './risposta';

export type PartitaDb = {
  id: number;
  stagione_id: number;
  data_ora: string;
  stato: 'convocazione' | 'giocata';
  gol_a: number | null;
  gol_b: number | null;
  cronaca: string | null;
  mvp_stato: 'aperto' | 'parita_da_decidere' | 'assegnato' | 'nessun_voto';
  mvp_chiuso_il: string | null;
  /** il campo da gioco (campi.id), se l'admin l'ha scelto */
  campo_id: number | null;
  /** "Inizia diretta" premuto (ISO UTC), o null (functions/lib/diretta.ts) */
  diretta_iniziata_il: string | null;
  /** "Fine partita" premuto (ISO UTC), o null */
  diretta_finita_il: string | null;
};

type Conteggio = { giocatore_id: number; nome: string; voti: number };

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';

export const scadenzaVoto = (dataOra: string): string => iso(Date.parse(dataOra) + FINESTRA_VOTO_MVP_MS);

export function votazioneAperta(p: PartitaDb, adesso: number): boolean {
  return (
    p.stato === 'giocata' && p.mvp_stato === 'aperto' && p.mvp_chiuso_il === null &&
    adesso < Date.parse(p.data_ora) + FINESTRA_VOTO_MVP_MS
  );
}

/** Vincitore, parita' (l'admin decide) o nessun voto. `conteggi` ha solo chi ha almeno un voto. */
export function esitoVoti(conteggi: { giocatore_id: number; voti: number }[]) {
  const max = Math.max(0, ...conteggi.map((c) => c.voti));
  const candidati = conteggi.filter((c) => c.voti === max && max > 0).map((c) => c.giocatore_id);
  const stato = candidati.length === 0 ? 'nessun_voto' : candidati.length === 1 ? 'assegnato' : 'parita_da_decidere';
  return { stato, candidati, vincitore: stato === 'assegnato' ? candidati[0] : null } as const;
}

export async function caricaPartita(db: D1Database, id: number): Promise<PartitaDb | null> {
  return db
    .prepare('SELECT id, stagione_id, data_ora, stato, gol_a, gol_b, cronaca, mvp_stato, mvp_chiuso_il, campo_id, diretta_iniziata_il, diretta_finita_il FROM partite WHERE id = ?')
    .bind(id)
    .first<PartitaDb>();
}

async function conteggi(db: D1Database, partitaId: number): Promise<Conteggio[]> {
  const r = await db
    .prepare(
      `SELECT v.giocatore_id, g.nome, COUNT(*) AS voti
         FROM voti_mvp v JOIN giocatori g ON g.id = v.giocatore_id
        WHERE v.partita_id = ? GROUP BY v.giocatore_id ORDER BY voti DESC, g.nome`,
    )
    .bind(partitaId)
    .all<Conteggio>();
  return r.results;
}

/** Chiude la votazione (idempotente: non tocca una gia' chiusa) e calcola l'esito. */
export async function chiudiVotazione(db: D1Database, partitaId: number, chiusoIl: string): Promise<void> {
  const e = esitoVoti(await conteggi(db, partitaId));
  await db.batch([
    db
      .prepare("UPDATE partite SET mvp_stato = ?, mvp_chiuso_il = ? WHERE id = ? AND mvp_stato = 'aperto'")
      .bind(e.stato, chiusoIl, partitaId),
    db
      .prepare(
        `INSERT OR IGNORE INTO mvp_vincitori (partita_id, giocatore_id)
         SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM partite WHERE id = ?1 AND mvp_stato = 'assegnato')`,
      )
      .bind(partitaId, e.vincitore),
  ]);
}

/** Carica la partita applicando la chiusura automatica se e' scaduta. null = non esiste. */
export async function sincronizza(db: D1Database, id: number, adesso: number): Promise<PartitaDb | null> {
  const p = await caricaPartita(db, id);
  if (p && p.stato === 'giocata' && p.mvp_stato === 'aperto' && !votazioneAperta(p, adesso)) {
    await chiudiVotazione(db, id, scadenzaVoto(p.data_ora));
    return caricaPartita(db, id);
  }
  return p;
}

/** Blocco `mvp` delle risposte. */
export async function bloccoMvp(db: D1Database, p: PartitaDb, hashDispositivo: string | null, adesso: number) {
  const votato = hashDispositivo
    ? (await db.prepare('SELECT 1 AS x FROM voti_mvp WHERE partita_id = ? AND hash_token = ?').bind(p.id, hashDispositivo).first()) !== null
    : false;
  const tot = (await db.prepare('SELECT COUNT(*) AS n FROM voti_mvp WHERE partita_id = ?').bind(p.id).first<{ n: number }>())!.n;
  const base = { voti_totali: tot, ha_votato: votato };

  if (p.stato !== 'giocata') return { stato: 'non_aperto' as const, ...base, chiude_il: null };
  if (votazioneAperta(p, adesso)) return { stato: 'aperto' as const, ...base, chiude_il: scadenzaVoto(p.data_ora) };

  const risultati = await conteggi(db, p.id);
  const nomi = new Map(risultati.map((r) => [r.giocatore_id, r.nome]));
  const chi = (id: number) => ({ giocatore_id: id, nome: nomi.get(id)! });
  const vincitore = await db
    .prepare('SELECT v.giocatore_id, g.nome FROM mvp_vincitori v JOIN giocatori g ON g.id = v.giocatore_id WHERE v.partita_id = ?')
    .bind(p.id)
    .first<{ giocatore_id: number; nome: string }>();
  return {
    stato: p.mvp_stato,
    ...base,
    chiude_il: null,
    chiuso_il: p.mvp_chiuso_il,
    risultati,
    vincitore,
    candidati: p.mvp_stato === 'parita_da_decidere' ? esitoVoti(risultati).candidati.map(chi) : [],
  };
}

/**
 * Chi l'admin puo' scegliere quando la votazione e' chiusa SENZA voti: i giocatori della partita
 * (quelli con una squadra). Scelta provvisoria, da confermare (docs/DOMANDE_APERTE.md): per
 * "tutti gli attivi" basta cambiare questa query.
 */
const CANDIDATI_SENZA_VOTI =
  'SELECT giocatore_id FROM partecipazioni WHERE partita_id = ? AND squadra IS NOT NULL';

/** Ha giocato la partita = convocato con una squadra. Solo lui si puo' votare come MVP (decisione dell'utente, 23/10/2026). */
export async function haGiocato(db: D1Database, partitaId: number, giocatoreId: number): Promise<boolean> {
  return (await db.prepare(`${CANDIDATI_SENZA_VOTI} AND giocatore_id = ?`).bind(partitaId, giocatoreId).first()) !== null;
}

/** L'admin sceglie l'MVP: fra i pari merito, oppure (solo se nessuno ha votato) fra i giocatori della partita. */
export async function decidiParita(db: D1Database, p: PartitaDb, giocatoreId: number): Promise<void> {
  if (p.mvp_stato !== 'parita_da_decidere' && p.mvp_stato !== 'nessun_voto') {
    throw new ErroreApi(409, 'non c\'è nessuna parità né votazione senza voti da decidere');
  }
  const senzaVoti = p.mvp_stato === 'nessun_voto';
  const candidati = senzaVoti
    ? (await db.prepare(CANDIDATI_SENZA_VOTI).bind(p.id).all<{ giocatore_id: number }>()).results.map((r) => r.giocatore_id)
    : esitoVoti(await conteggi(db, p.id)).candidati;
  if (!candidati.includes(giocatoreId)) {
    throw new ErroreApi(400, senzaVoti ? 'giocatore_id: non ha giocato questa partita' : 'giocatore_id: non è fra i pari merito');
  }
  await db.batch([
    db.prepare("UPDATE partite SET mvp_stato = 'assegnato' WHERE id = ? AND mvp_stato = ?").bind(p.id, p.mvp_stato),
    db.prepare('INSERT OR IGNORE INTO mvp_vincitori (partita_id, giocatore_id) VALUES (?, ?)').bind(p.id, giocatoreId),
  ]);
}
