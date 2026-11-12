import { describe, expect, it } from 'vitest';
import { CAMPO_ASPETTO_BASE, CAMPO_ASPETTO_MAX, CARTA_FRAZ_MAX, PEDINA_H, PEDINA_L, larghezzaCarta, marcatori, misuraCampo, pedine, righe } from '../app/src/lib/campo';
import { caselle } from '../shared/moduli';
import { cognome, conto, media, voto } from '../app/src/lib/formato';
import type { GiocatoreInPartita } from '../app/src/lib/tipi';

const g = (id: number, nome: string, squadra: 'A' | 'B' | null, extra: Partial<GiocatoreInPartita> = {}): GiocatoreInPartita => ({
  giocatore_id: id, nome, squadra, pos_x: null, pos_y: null, gol: 0, autogol: 0, voto_pagella: null, ...extra,
});

describe('formato', () => {
  it('cognome (anche con due iniziali e cognomi composti)', () => {
    expect(cognome('Verdi A.G.')).toBe('Verdi');
    expect(cognome('De Luca V.')).toBe('De Luca');
  });
  it('senza iniziali del nome: solo il nome scritto', () => {
    expect(cognome('Gianni')).toBe('Gianni');
    expect(cognome('Amico Gianni')).toBe('Amico Gianni');
  });
  it('voto mancante = n.d., mai un valore di ripiego', () => {
    expect(voto(null)).toBe('n.d.');
    expect(voto(7)).toBe('7,0');
    expect(media(null)).toBe('n.d.');
    expect(media(8.333)).toBe('8,33');
  });
  it('conto alla rovescia', () => {
    expect(conto(3_723_000)).toBe('01:02:03');
    expect(conto(-5)).toBe('00:00:00');
  });
});

describe('campo', () => {
  it('righe da 4 al massimo, ripartite in modo uniforme', () => {
    expect(righe(6)).toEqual([3, 3]);
    expect(righe(7)).toEqual([4, 3]);
    expect(righe(9)).toEqual([3, 3, 3]);
    expect(righe(0)).toEqual([0]);
  });
  it('usa le posizioni salvate se ci sono per tutta la squadra', () => {
    const p = pedine([g(1, 'Rossi M.', 'A', { pos_x: 30, pos_y: 20 }), g(2, 'Bianchi L.', 'A', { pos_x: 60, pos_y: 25 })], 'A');
    expect(p.map((x) => [x.x, x.y])).toEqual([[30, 20], [60, 25]]);
  });
  it('se ne manca anche una, disposizione automatica per tutta la squadra: A in alto, B in basso', () => {
    const gg = [g(1, 'Rossi M.', 'A', { pos_x: 30, pos_y: 20 }), g(2, 'Bianchi L.', 'A'), g(3, 'Neri P.', 'B'), g(4, 'Gialli C.', 'B')];
    expect(pedine(gg, 'A').every((x) => x.y < 50)).toBe(true);
    expect(pedine(gg, 'B').every((x) => x.y > 50)).toBe(true);
    expect(pedine(gg, 'A')[0].x).not.toBe(30);
  });
  it('marcatori: gli autogol avversari contano per la squadra, distinti; il gol senza marcatore si dice', () => {
    const gg = [g(1, 'Rossi M.', 'A', { gol: 2 }), g(2, 'Bianchi L.', 'B', { autogol: 1 }), g(3, 'Neri P.', 'B')];
    expect(marcatori(gg, 'A', 4)).toEqual({
      voci: [{ nome: 'Rossi M.', n: 2, autogol: false }, { nome: 'Bianchi L.', n: 1, autogol: true }],
      senza: 1,
    });
    expect(marcatori(gg, 'B', null).senza).toBe(0);
  });
});

describe('misura del campo su misura', () => {
  const sq = (m: string, alta: boolean) => caselle(m, alta)!.map(({ x, y }) => ({ x, y }));
  const due = (a: string, b = a) => [...sq(a, true), ...sq(b, false)];
  /** nessuna coppia di pedine intere (1,5 x 1,58 carte) si tocca */
  const senzaSovrapposizioni = (punti: { x: number; y: number }[], { cw, r }: { cw: number; r: number }) =>
    punti.every((p, i) => punti.slice(i + 1).every((q) => Math.abs(p.x - q.x) / 100 >= PEDINA_L * cw - 1e-3 || (Math.abs(p.y - q.y) / 100) * r >= PEDINA_H * cw - 1e-3));

  it.each([
    ['5 contro 5, 2-2', due('2-2')],
    ['5 contro 5, 1-2-1', due('1-2-1')],
    ['6 contro 6, 2-1-2', due('2-1-2')],
    ['6 contro 6, 3-2', due('3-2')],
    ['7 contro 7, 3-2-1', due('3-2-1')],
    ['8 contro 8, 3-3-1', due('3-3-1')],
    ['8 contro 8, 3-2-2 contro 3-3-1', due('3-2-2', '3-3-1')],
  ])('%s: carte grandi (>= 55 px a 390), campo entro il massimo, nessuna sovrapposizione', (_n, punti) => {
    const m = misuraCampo(punti);
    expect(m.cw * 390).toBeGreaterThanOrEqual(55);
    expect(m.cw).toBeLessThanOrEqual(CARTA_FRAZ_MAX);
    expect(m.r).toBeGreaterThanOrEqual(CAMPO_ASPETTO_BASE);
    expect(m.r).toBeLessThanOrEqual(CAMPO_ASPETTO_MAX);
    expect(senzaSovrapposizioni(punti, m)).toBe(true);
  });
  it('il campo si allunga solo se serve: allungarlo oltre non ingrandirebbe la carta, accorciarlo si', () => {
    for (const punti of [due('2-2'), due('3-3-1'), sq('3-3-1', true)]) {
      const m = misuraCampo(punti);
      expect(larghezzaCarta(punti, CAMPO_ASPETTO_MAX)).toBeCloseTo(m.cw, 3);
      if (m.r > CAMPO_ASPETTO_BASE + 0.02) expect(larghezzaCarta(punti, m.r - 0.02)).toBeLessThan(m.cw);
    }
  });
  it('una squadra sola: carta al massimo e campo 16:9', () => {
    expect(misuraCampo(sq('2-2', true))).toEqual({ cw: CARTA_FRAZ_MAX, r: CAMPO_ASPETTO_BASE });
    expect(misuraCampo([])).toEqual({ cw: CARTA_FRAZ_MAX, r: CAMPO_ASPETTO_BASE });
  });
  it('posizioni libere / ripiego automatico: senza sovrapposizioni', () => {
    const gg = Array.from({ length: 12 }, (_, i) => g(i + 1, `G${i}`, i < 6 ? 'A' : 'B'));
    const punti = [...pedine(gg, 'A'), ...pedine(gg, 'B')];
    expect(senzaSovrapposizioni(punti, misuraCampo(punti))).toBe(true);
    const libere = [{ x: 20, y: 15 }, { x: 55, y: 22 }, { x: 80, y: 30 }, { x: 40, y: 80 }, { x: 70, y: 70 }];
    expect(senzaSovrapposizioni(libere, misuraCampo(libere))).toBe(true);
  });
  it('dati quasi sovrapposti: la carta non sparisce (minimo)', () => {
    expect(misuraCampo([{ x: 50, y: 50 }, { x: 50, y: 50 }]).cw).toBeGreaterThan(0);
  });
});
