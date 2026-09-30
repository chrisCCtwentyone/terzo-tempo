import { describe, expect, it } from 'vitest';
import { MAX_CONVOCATI_GENERATORE, PUNTEGGIO_NEUTRO } from '../functions/lib/costanti';
import { generaSquadre, punteggio, type Candidato } from '../functions/lib/generatore';

const cand = (id: number, livello: number | null, extra: Partial<Candidato> = {}): Candidato => ({
  id, livello, media_voto: null, pct_vittorie: null, gol_a_partita: null, badge: [], ...extra,
});

/** PRNG di prova, indipendente da quello del generatore. */
function casuali(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('punteggio', () => {
  it('senza statistiche usa il solo livello (1 -> 0, 5 -> 1)', () => {
    expect(punteggio(cand(1, 1))).toBe(0);
    expect(punteggio(cand(1, 3))).toBe(0.5);
    expect(punteggio(cand(1, 5))).toBe(1);
  });

  it('livello segreto: 5 = il piu\' forte (decisione dell\'utente, 30/09/2026)', () => {
    for (const livello of [1, 2, 3, 4]) expect(punteggio(cand(1, livello + 1))).toBeGreaterThan(punteggio(cand(1, livello)));
    // a parita' di tutto il resto, il 5 batte l'1 anche fra le statistiche
    const stat = { media_voto: 7, pct_vittorie: 50, gol_a_partita: 0.5 };
    expect(punteggio(cand(1, 5, stat))).toBeGreaterThan(punteggio(cand(1, 1, stat)));
  });

  it('senza statistiche e senza livello: il valore neutro dichiarato', () => {
    expect(punteggio(cand(1, null))).toBe(PUNTEGGIO_NEUTRO);
  });

  it('con statistiche le mescola al livello; senza livello usa solo le statistiche', () => {
    const forte = cand(1, 1, { media_voto: 10, pct_vittorie: 100, gol_a_partita: 5 });
    expect(punteggio(forte)).toBeGreaterThan(0.6); // tre componenti al massimo, livello al minimo
    expect(punteggio({ ...forte, livello: null })).toBe(1);
    expect(punteggio(cand(1, null, { media_voto: 1 }))).toBe(0);
  });
});

describe('generaSquadre', () => {
  it('due squadre, tutti presenti una volta sola, dimensioni uguali o differenza 1', () => {
    for (const n of [2, 3, 7, 10, 11, 14]) {
      const cs = Array.from({ length: n }, (_, i) => cand(i + 1, (i % 5) + 1));
      const s = generaSquadre(cs, 42);
      expect(Math.abs(s.A.length - s.B.length)).toBeLessThanOrEqual(1);
      expect([...s.A, ...s.B].sort((x, y) => x - y)).toEqual(cs.map((c) => c.id));
    }
  });

  it('e\' deterministico dato il seed', () => {
    const cs = Array.from({ length: 12 }, (_, i) => cand(i + 1, (i % 5) + 1, { badge: i % 3 === 0 ? [1] : [] }));
    expect(generaSquadre(cs, 7)).toEqual(generaSquadre(cs, 7));
  });

  it('seed diversi danno divisioni diverse quando ce ne sono di equivalenti', () => {
    const cs = Array.from({ length: 10 }, (_, i) => cand(i + 1, 3)); // tutti uguali
    const viste = new Set(Array.from({ length: 12 }, (_, s) => JSON.stringify(generaSquadre(cs, s).A)));
    expect(viste.size).toBeGreaterThan(1);
  });

  it('bilancia: 5,4,2,1 diventa {5,1} contro {4,2}', () => {
    const s = generaSquadre([cand(1, 5), cand(2, 4), cand(3, 2), cand(4, 1)], 1);
    const squadra1 = s.A.includes(1) ? s.A : s.B;
    expect(squadra1.sort()).toEqual([1, 4]);
    expect(s.media_A).toBeCloseTo(s.media_B, 10);
  });

  it('con 11 giocatori bilancia le MEDIE, non le somme', () => {
    const cs = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 3].map((l, i) => cand(i + 1, l));
    const s = generaSquadre(cs, 3);
    expect(s.A.length + s.B.length).toBe(11);
    expect(Math.abs(s.media_A - s.media_B)).toBeLessThan(0.02);
  });

  it('e\' meglio di una divisione a caso (20 giocatori)', () => {
    const r = casuali(99);
    const cs = Array.from({ length: 20 }, (_, i) => cand(i + 1, Math.floor(r() * 5) + 1, { media_voto: 4 + r() * 5, pct_vittorie: r() * 100 }));
    const s = generaSquadre(cs, 5);
    const media = (ids: number[]) => ids.reduce((t, id) => t + punteggio(cs[id - 1]), 0) / ids.length;
    const migliore = Math.abs(media(s.A) - media(s.B));
    let sommaCasuale = 0;
    for (let k = 0; k < 50; k++) {
      const mescolati = cs.map((c) => c.id).sort(() => r() - 0.5);
      sommaCasuale += Math.abs(media(mescolati.slice(0, 10)) - media(mescolati.slice(10)));
    }
    expect(migliore).toBeLessThan(sommaCasuale / 50 / 5);
    expect(migliore).toBeLessThan(0.005);
  });

  it('distribuisce i badge: lo stesso badge non finisce tutto da una parte', () => {
    // 8 giocatori identici per punteggio: 2 Cecchini (badge 1), 3 Turisti (badge 2), 3 senza
    const cs = Array.from({ length: 8 }, (_, i) => cand(i + 1, 3, { badge: i < 2 ? [1] : i < 5 ? [2] : [] }));
    for (let seed = 0; seed < 20; seed++) {
      const s = generaSquadre(cs, seed);
      const conta = (ids: number[], b: number) => ids.filter((id) => cs[id - 1].badge.includes(b)).length;
      expect(conta(s.A, 1)).toBe(1);
      expect([1, 2]).toContain(conta(s.A, 2)); // 3 Turisti: 1+2 o 2+1, mai 3+0
      expect([1, 2]).toContain(conta(s.B, 2));
    }
  });

  it('il punteggio pesa piu\' dei badge: non rinuncia all\'equilibrio per spargere un badge', () => {
    // due fortissimi con lo stesso badge e due scarsi: {forte, scarso} contro {forte, scarso} tiene i badge insieme
    const cs = [cand(1, 5, { badge: [1] }), cand(2, 5, { badge: [1] }), cand(3, 1), cand(4, 1)];
    const s = generaSquadre(cs, 1);
    expect(s.media_A).toBeCloseTo(s.media_B, 10);
    expect(s.A.filter((id) => id <= 2)).toHaveLength(1); // i due forti sono divisi (e cosi' anche il badge)
  });

  it('veloce con 20 giocatori', () => {
    const r = casuali(1);
    const cs = Array.from({ length: 20 }, (_, i) => cand(i + 1, Math.floor(r() * 5) + 1, { badge: [1 + Math.floor(r() * 12), 1 + Math.floor(r() * 12)] }));
    const t0 = performance.now();
    generaSquadre(cs, 1);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('rifiuta meno di 2 o troppi convocati', () => {
    expect(() => generaSquadre([cand(1, 3)], 1)).toThrow(RangeError);
    expect(() => generaSquadre(Array.from({ length: MAX_CONVOCATI_GENERATORE + 1 }, (_, i) => cand(i, 3)), 1)).toThrow(RangeError);
  });
});
