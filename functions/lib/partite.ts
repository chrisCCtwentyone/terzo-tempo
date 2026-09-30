/** Forma pubblica delle partite (riepilogo e dettaglio). Mai il livello segreto. */

import { CODICI_SQUADRA, SQUADRE } from './costanti';
import { bloccoMvp, sincronizza, type PartitaDb } from './mvp';
import { ErroreApi, idDa } from './risposta';
import { perNome } from './valida';

export function squadre(p: Pick<PartitaDb, 'gol_a' | 'gol_b'>) {
  return CODICI_SQUADRA.map((codice) => ({
    codice,
    nome: SQUADRE[codice],
    gol: codice === 'A' ? p.gol_a : p.gol_b,
  }));
}

export function riepilogo(p: PartitaDb) {
  return { id: p.id, stagione_id: p.stagione_id, data_ora: p.data_ora, stato: p.stato, squadre: squadre(p) };
}

export async function convocati(db: D1Database, partitaId: number) {
  const r = await db
    .prepare(
      `SELECT pa.giocatore_id, g.nome, pa.squadra, pa.pos_x, pa.pos_y, pa.gol, pa.autogol, pa.voto_pagella
         FROM partecipazioni pa JOIN giocatori g ON g.id = pa.giocatore_id
        WHERE pa.partita_id = ?`,
    )
    .bind(partitaId)
    .all<{ nome: string; squadra: string | null }>();
  // squadra A, squadra B, poi chi non e' assegnato; per cognome
  const ordine = (s: string | null) => (s === null ? 'Z' : s);
  return r.results.sort((a, b) => ordine(a.squadra).localeCompare(ordine(b.squadra)) || perNome(a.nome, b.nome));
}

/** Dettaglio completo; applica la chiusura MVP lazy. null = partita inesistente. */
export async function dettaglio(db: D1Database, id: number, hashDispositivo: string | null, adesso: number) {
  const p = await sincronizza(db, id, adesso);
  if (!p) return null;
  return {
    ...riepilogo(p),
    cronaca: p.cronaca,
    giocatori: await convocati(db, id),
    mvp: await bloccoMvp(db, p, hashDispositivo, adesso),
  };
}

export async function stagioneAperta(db: D1Database) {
  return db.prepare('SELECT id, nome, data_inizio, data_fine FROM stagioni WHERE aperta = 1').first<{
    id: number; nome: string; data_inizio: string; data_fine: string | null;
  }>();
}

/** `?stagione=`: "sempre" (o assente) -> null; un id -> la stagione; altro -> 404. */
export async function leggiStagione(db: D1Database, valore: string | null) {
  if (valore === null || valore === 'sempre') return null;
  const id = idDa(valore);
  const s = await db.prepare('SELECT id, nome, aperta FROM stagioni WHERE id = ?').bind(id).first<{ id: number; nome: string; aperta: number }>();
  if (!s) throw new ErroreApi(404, 'stagione non trovata');
  return { id: s.id, nome: s.nome, aperta: s.aperta === 1 };
}

export type BadgePubblico = { id: number; nome: string; descrizione: string | null; tipo: 'positivo' | 'negativo' };

/** Badge di tutti i giocatori (o di uno), per giocatore. */
export async function badgePerGiocatore(db: D1Database, giocatoreId: number | null): Promise<Map<number, BadgePubblico[]>> {
  const r = await db
    .prepare(
      `SELECT gb.giocatore_id, b.id, b.nome, b.descrizione, b.tipo
         FROM giocatore_badge gb JOIN badge b ON b.id = gb.badge_id
        WHERE ?1 IS NULL OR gb.giocatore_id = ?1 ORDER BY b.tipo DESC, b.nome`,
    )
    .bind(giocatoreId)
    .all<BadgePubblico & { giocatore_id: number }>();
  const m = new Map<number, BadgePubblico[]>();
  for (const { giocatore_id, ...b } of r.results) m.set(giocatore_id, [...(m.get(giocatore_id) ?? []), b]);
  return m;
}
