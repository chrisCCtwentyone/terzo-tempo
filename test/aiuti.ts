/** Costruttori di scenari di prova. Nomi inventati. */

import type { D1Finto } from './d1_finto';

export const NOMI = { R: 'Rossi M.', B: 'Bianchi L.', V: 'Verdi A.G.', N: 'Neri P.' } as const;

export function giocatore(db: D1Finto, nome: string, livello: number | null = null, attivo = 1): number {
  db.esegui('INSERT INTO giocatori (nome, attivo, livello_segreto) VALUES (?, ?, ?)', nome, attivo, livello);
  return db.tutti<{ id: number }>('SELECT id FROM giocatori WHERE nome = ?', nome)[0].id;
}

export function stagione(db: D1Finto, nome: string, aperta: boolean, inizio = '2026-01-01'): number {
  db.esegui('INSERT INTO stagioni (nome, aperta, data_inizio) VALUES (?, ?, ?)', nome, aperta ? 1 : 0, inizio);
  return db.tutti<{ id: number }>('SELECT id FROM stagioni WHERE nome = ?', nome)[0].id;
}

export type Riga = { g: number; sq: 'A' | 'B' | null; gol?: number; autogol?: number; voto?: number | null };

/** Inserisce una partita (giocata se ci sono i gol) con i suoi convocati. Restituisce l'id. */
export function partita(
  db: D1Finto,
  o: { stagione: number; data_ora: string; gol?: [number, number]; righe: Riga[]; mvp_stato?: string; mvp_chiuso_il?: string | null },
): number {
  const giocata = o.gol !== undefined;
  db.esegui(
    'INSERT INTO partite (stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato, mvp_chiuso_il) VALUES (?, ?, ?, ?, ?, ?, ?)',
    o.stagione, o.data_ora, giocata ? 'giocata' : 'convocazione', o.gol?.[0] ?? null, o.gol?.[1] ?? null, o.mvp_stato ?? 'aperto', o.mvp_chiuso_il ?? null,
  );
  const id = db.tutti<{ id: number }>('SELECT MAX(id) AS id FROM partite')[0].id;
  for (const r of o.righe) {
    db.esegui(
      'INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, gol, autogol, voto_pagella) VALUES (?, ?, ?, ?, ?, ?)',
      id, r.g, r.sq, r.gol ?? 0, r.autogol ?? 0, r.voto ?? null,
    );
  }
  return id;
}

/**
 * Scenario delle statistiche (calcolato a mano, vedi test/statistiche.test.ts).
 * Stagione 1 (chiusa): 1 partita. Stagione 2 (aperta): 3 partite. Quattro giocatori.
 */
export function scenarioStatistiche(db: D1Finto) {
  const R = giocatore(db, NOMI.R, 5), B = giocatore(db, NOMI.B, 3), V = giocatore(db, NOMI.V, 2), N = giocatore(db, NOMI.N);
  const s1 = stagione(db, 'Stagione uno', false, '2026-01-01');
  const s2 = stagione(db, 'Stagione due', true, '2026-06-01');
  const chiusa = { mvp_chiuso_il: '2026-01-01T00:00:00Z' };
  // m0: A (R, V) - B (B, N) 1-0, R segna
  const m0 = partita(db, { stagione: s1, data_ora: '2026-05-07T19:00:00Z', gol: [1, 0], mvp_stato: 'assegnato', ...chiusa,
    righe: [{ g: R, sq: 'A', gol: 1, voto: 6 }, { g: V, sq: 'A', voto: 6 }, { g: B, sq: 'B', voto: 7 }, { g: N, sq: 'B', voto: 5 }] });
  // m1: A (R, B) 3 - 1 B (V, N)
  const m1 = partita(db, { stagione: s2, data_ora: '2026-07-02T19:00:00Z', gol: [3, 1], mvp_stato: 'assegnato', ...chiusa,
    righe: [{ g: R, sq: 'A', gol: 2, voto: 8 }, { g: B, sq: 'A', gol: 1, voto: 7 }, { g: V, sq: 'B', gol: 1, voto: 6 }, { g: N, sq: 'B', voto: 5 }] });
  // m2: A (R, V) 1 - 1 B (B, N)
  const m2 = partita(db, { stagione: s2, data_ora: '2026-07-09T19:00:00Z', gol: [1, 1], mvp_stato: 'assegnato', ...chiusa,
    righe: [{ g: R, sq: 'A', gol: 1, voto: 7 }, { g: V, sq: 'A', voto: 6.5 }, { g: B, sq: 'B', gol: 1, voto: 7 }, { g: N, sq: 'B', voto: 5.5 }] });
  // m3: A (R, N) 2 - 2 B (B, V): R gol + autogol di B (il giocatore); V gol + autogol di N
  const m3 = partita(db, { stagione: s2, data_ora: '2026-07-16T19:00:00Z', gol: [2, 2], mvp_stato: 'parita_da_decidere', ...chiusa,
    righe: [{ g: R, sq: 'A', gol: 1, voto: 9 }, { g: N, sq: 'A', autogol: 1, voto: 5 }, { g: B, sq: 'B', autogol: 1, voto: 6 }, { g: V, sq: 'B', gol: 1, voto: 7 }] });
  db.esegui('INSERT INTO mvp_vincitori (partita_id, giocatore_id) VALUES (?, ?), (?, ?), (?, ?)', m0, R, m1, R, m2, B);
  return { R, B, V, N, s1, s2, m0, m1, m2, m3 };
}
