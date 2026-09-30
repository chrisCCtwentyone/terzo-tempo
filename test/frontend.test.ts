import { describe, expect, it } from 'vitest';
import { marcatori, pedine, righe } from '../app/src/lib/campo';
import { brevi, cognome, conto, iniziali, media, voto } from '../app/src/lib/formato';
import type { GiocatoreInPartita } from '../app/src/lib/tipi';

const g = (id: number, nome: string, squadra: 'A' | 'B' | null, extra: Partial<GiocatoreInPartita> = {}): GiocatoreInPartita => ({
  giocatore_id: id, nome, squadra, pos_x: null, pos_y: null, gol: 0, autogol: 0, voto_pagella: null, ...extra,
});

describe('formato', () => {
  it('cognome e iniziali (anche con due iniziali e cognomi composti)', () => {
    expect(cognome('A. G. Verdi')).toBe('Verdi');
    expect(cognome('V. De Luca')).toBe('De Luca');
    expect(iniziali('A. G. Verdi')).toBe('AV');
    expect(iniziali('V. De Luca')).toBe('VD');
  });
  it('un cognome doppio nel gruppo si scrive per intero', () => {
    expect(brevi(['M. Rossi', 'G. Rossi', 'L. Bianchi'])).toEqual(['M. Rossi', 'G. Rossi', 'Bianchi']);
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
    const p = pedine([g(1, 'M. Rossi', 'A', { pos_x: 30, pos_y: 20 }), g(2, 'L. Bianchi', 'A', { pos_x: 60, pos_y: 25 })], 'A');
    expect(p.map((x) => [x.x, x.y])).toEqual([[30, 20], [60, 25]]);
  });
  it('se ne manca anche una, disposizione automatica per tutta la squadra: A in alto, B in basso', () => {
    const gg = [g(1, 'M. Rossi', 'A', { pos_x: 30, pos_y: 20 }), g(2, 'L. Bianchi', 'A'), g(3, 'P. Neri', 'B'), g(4, 'C. Gialli', 'B')];
    expect(pedine(gg, 'A').every((x) => x.y < 50)).toBe(true);
    expect(pedine(gg, 'B').every((x) => x.y > 50)).toBe(true);
    expect(pedine(gg, 'A')[0].x).not.toBe(30);
  });
  it('marcatori: gli autogol avversari contano per la squadra, distinti; il gol senza marcatore si dice', () => {
    const gg = [g(1, 'M. Rossi', 'A', { gol: 2 }), g(2, 'L. Bianchi', 'B', { autogol: 1 }), g(3, 'P. Neri', 'B')];
    expect(marcatori(gg, 'A', 4)).toEqual({
      voci: [{ nome: 'M. Rossi', n: 2, autogol: false }, { nome: 'L. Bianchi', n: 1, autogol: true }],
      senza: 1,
    });
    expect(marcatori(gg, 'B', null).senza).toBe(0);
  });
});
