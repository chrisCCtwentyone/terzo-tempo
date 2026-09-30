/**
 * Statistiche dei giocatori. `aggrega` e `classifiche` sono funzioni pure
 * (testate senza DB); `caricaRighe` e' l'unica che legge D1.
 *
 * Definizioni:
 *  - presenza = partecipazione con squadra assegnata a una partita GIOCATA;
 *  - esito V/P/S = gol della propria squadra contro quelli dell'altra;
 *  - media voto = media delle pagelle presenti (chi non ha pagella non pesa);
 *  - % vittorie = vittorie / presenze * 100;
 *  - gol a partita = gol segnati / presenze (gli autogol non contano).
 * Un valore non calcolabile e' null, mai un ripiego.
 */

import { MIN_PARTITE_CLASSIFICA } from './costanti';
import { perNome } from './valida';

export type RigaPresenza = {
  giocatore_id: number;
  nome: string;
  attivo: number;
  partita_id: number;
  stagione_id: number;
  data_ora: string;
  squadra: 'A' | 'B';
  gol: number;
  autogol: number;
  voto: number | null;
  gol_a: number;
  gol_b: number;
};

export type Esito = 'V' | 'P' | 'S';

export type Statistiche = {
  presenze: number;
  gol: number;
  autogol: number;
  gol_a_partita: number | null;
  partite_con_voto: number;
  media_voto: number | null;
  vittorie: number;
  pareggi: number;
  sconfitte: number;
  pct_vittorie: number | null;
  mvp: number;
};
export type Totali = Statistiche & { giocatore_id: number; nome: string; attivo: boolean };

export function esito(r: Pick<RigaPresenza, 'squadra' | 'gol_a' | 'gol_b'>): Esito {
  const mio = r.squadra === 'A' ? r.gol_a : r.gol_b;
  const altro = r.squadra === 'A' ? r.gol_b : r.gol_a;
  return mio > altro ? 'V' : mio < altro ? 'S' : 'P';
}

const tondo = (n: number, cifre: number) => Math.round(n * 10 ** cifre) / 10 ** cifre;

/** Le statistiche di un giocatore: `righe` sono tutte sue (anche nessuna). */
export function statistiche(righe: RigaPresenza[], mvp: number): Statistiche {
  const t = { presenze: righe.length, gol: 0, autogol: 0, V: 0, P: 0, S: 0, somma: 0, conVoto: 0 };
  for (const r of righe) {
    t.gol += r.gol;
    t.autogol += r.autogol;
    t[esito(r)]++;
    if (r.voto !== null) {
      t.somma += r.voto;
      t.conVoto++;
    }
  }
  return {
    presenze: t.presenze,
    gol: t.gol,
    autogol: t.autogol,
    gol_a_partita: t.presenze ? tondo(t.gol / t.presenze, 3) : null,
    partite_con_voto: t.conVoto,
    media_voto: t.conVoto ? tondo(t.somma / t.conVoto, 2) : null,
    vittorie: t.V,
    pareggi: t.P,
    sconfitte: t.S,
    pct_vittorie: t.presenze ? tondo((t.V / t.presenze) * 100, 1) : null,
    mvp,
  };
}

/** Totali di tutti i giocatori che hanno almeno una presenza. */
export function aggrega(righe: RigaPresenza[], vincitori: { partita_id: number; giocatore_id: number }[]): Totali[] {
  const perGiocatore = new Map<number, RigaPresenza[]>();
  for (const r of righe) perGiocatore.set(r.giocatore_id, [...(perGiocatore.get(r.giocatore_id) ?? []), r]);
  const mvp = new Map<number, number>();
  for (const v of vincitori) mvp.set(v.giocatore_id, (mvp.get(v.giocatore_id) ?? 0) + 1);
  return [...perGiocatore.values()].map((rr) => ({
    giocatore_id: rr[0].giocatore_id,
    nome: rr[0].nome,
    attivo: rr[0].attivo === 1,
    ...statistiche(rr, mvp.get(rr[0].giocatore_id) ?? 0),
  }));
}

export type VoceClassifica = { posizione: number; giocatore_id: number; nome: string; attivo: boolean; valore: number; presenze: number };

/** Ordina per valore decrescente, poi per nome; a pari valore stessa posizione (1, 1, 3). */
export function classifica(totali: Totali[], valore: (t: Totali) => number | null): VoceClassifica[] {
  const righe = totali
    .map((t) => ({ t, v: valore(t) }))
    .filter((x): x is { t: Totali; v: number } => x.v !== null)
    .sort((a, b) => b.v - a.v || perNome(a.t.nome, b.t.nome));
  const out: VoceClassifica[] = [];
  righe.forEach((x, i) => {
    const posizione = i > 0 && righe[i - 1].v === x.v ? out[i - 1].posizione : i + 1;
    out.push({ posizione, giocatore_id: x.t.giocatore_id, nome: x.t.nome, attivo: x.t.attivo, valore: x.v, presenze: x.t.presenze });
  });
  return out;
}

export function classifiche(totali: Totali[]) {
  const min = MIN_PARTITE_CLASSIFICA;
  return {
    minimo_partite: min,
    gol: classifica(totali, (t) => (t.gol > 0 ? t.gol : null)),
    presenze: classifica(totali, (t) => t.presenze),
    media_voto: classifica(totali, (t) => (t.partite_con_voto >= min ? t.media_voto : null)),
    mvp: classifica(totali, (t) => (t.mvp > 0 ? t.mvp : null)),
    pct_vittorie: classifica(totali, (t) => (t.presenze >= min ? t.pct_vittorie : null)),
  };
}

/** Presenze, dalla piu' recente. `stagioneId` null = sempre. */
export async function caricaRighe(db: D1Database, stagioneId: number | null): Promise<RigaPresenza[]> {
  const r = await db
    .prepare(
      `SELECT g.id AS giocatore_id, g.nome, g.attivo, p.id AS partita_id, p.stagione_id, p.data_ora,
              pa.squadra, pa.gol, pa.autogol, pa.voto_pagella AS voto, p.gol_a, p.gol_b
         FROM partecipazioni pa
         JOIN partite p ON p.id = pa.partita_id
         JOIN giocatori g ON g.id = pa.giocatore_id
        WHERE p.stato = 'giocata' AND pa.squadra IS NOT NULL AND (?1 IS NULL OR p.stagione_id = ?1)
        ORDER BY p.data_ora DESC, p.id DESC`,
    )
    .bind(stagioneId)
    .all<RigaPresenza>();
  return r.results;
}

export async function caricaVincitori(db: D1Database, stagioneId: number | null) {
  const r = await db
    .prepare(
      `SELECT v.partita_id, v.giocatore_id FROM mvp_vincitori v JOIN partite p ON p.id = v.partita_id
        WHERE ?1 IS NULL OR p.stagione_id = ?1`,
    )
    .bind(stagioneId)
    .all<{ partita_id: number; giocatore_id: number }>();
  return r.results;
}

export async function totaliStagione(db: D1Database, stagioneId: number | null): Promise<Totali[]> {
  return aggrega(await caricaRighe(db, stagioneId), await caricaVincitori(db, stagioneId));
}
