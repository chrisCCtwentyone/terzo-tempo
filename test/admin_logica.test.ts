/** Logica pura dell'area admin: punteggio, squadre, moduli e caselle, aggancio e scambio, tastiera, salvataggio. */
import { describe, expect, it } from 'vitest';
import { caselle } from '../shared/moduli';
import {
  agganciaA, applicaProposta, assegna, casellaVerso, corpoConvocati, dentroMeta, impostaModulo, impronta, isoARomaLocale, mancaPerGiocare,
  moduloDi, muoviInCasella, nuovaRiga, occupanti, punteggio, togli, VOTI, type Riga,
} from '../app/src/admin/logica';
import { LATO_ALTO } from '../app/src/lib/campo';

const r = (id: number, squadra: 'A' | 'B' | null, extra: Partial<Riga> = {}): Riga => ({ ...nuovaRiga(id, `Cognome${id} X.`), squadra, ...extra });
const squadra5 = (da: number, c: 'A' | 'B') => Array.from({ length: 5 }, (_, i) => r(da + i, c));

describe('punteggio', () => {
  it('gol dei suoi + autogol degli avversari; i non assegnati non contano', () => {
    const righe = [r(1, 'A', { gol: 2 }), r(2, 'A', { autogol: 1 }), r(3, 'B', { gol: 1, autogol: 2 }), r(4, null, { gol: 5, autogol: 5 })];
    expect(punteggio(righe)).toEqual({ A: 2 + 2, B: 1 + 1 });
  });
  it('che cosa manca per segnare "giocata"', () => {
    const nomi = { A: 'Casaccati', B: 'Smollicati' };
    expect(mancaPerGiocare([r(1, 'A'), r(2, 'B')], nomi)).toEqual([]);
    expect(mancaPerGiocare([r(1, 'A'), r(2, null)], nomi)).toHaveLength(2);
    expect(mancaPerGiocare([r(1, 'A'), r(2, 'A')], nomi)[0]).toContain('Smollicati');
  });
});

describe('squadre', () => {
  it('spostare un giocatore azzera le posizioni delle due squadre coinvolte, non i gol', () => {
    let righe = [...squadra5(1, 'A'), ...squadra5(11, 'B')].map((x) => ({ ...x, gol: 1 }));
    righe = impostaModulo(impostaModulo(righe, 'A', '2-2'), 'B', '1-2-1');
    expect(righe.every((x) => x.pos_x !== null)).toBe(true);
    const dopo = assegna(righe, 1, 'B');
    expect(dopo.filter((x) => x.pos_x !== null)).toHaveLength(0);
    expect(dopo.find((x) => x.giocatore_id === 1)).toMatchObject({ squadra: 'B', gol: 1 });
    expect(assegna(righe, 1, 'A')).toBe(righe);
  });
  it('togliere un convocato lo cancella e azzera la sua squadra; la proposta del generatore azzera tutto', () => {
    const base = impostaModulo(squadra5(1, 'A'), 'A', '2-2');
    const senza = togli(base, 3);
    expect(senza).toHaveLength(4);
    expect(senza.every((x) => x.pos_x === null)).toBe(true);
    const p = applicaProposta(base, [{ codice: 'B', giocatori: [{ giocatore_id: 1 }, { giocatore_id: 2 }] }, { codice: 'A', giocatori: [{ giocatore_id: 3 }] }]);
    expect(p.map((x) => x.squadra)).toEqual(['B', 'B', 'A', null, null]);
    expect(p.every((x) => x.pos_x === null)).toBe(true);
  });
});

describe('moduli sul campo', () => {
  it('scegliere il modulo mette i giocatori sulle caselle (il primo e\' il portiere), nella meta\' della squadra', () => {
    for (const c of ['A', 'B'] as const) {
      const righe = impostaModulo([...squadra5(1, c)], c, '2-2');
      expect(moduloDi(righe, c)).toBe('2-2');
      const alta = c === LATO_ALTO;
      expect(righe.every((x) => (alta ? x.pos_y! <= 50 : x.pos_y! >= 50))).toBe(true);
      expect(righe[0]).toMatchObject({ pos_x: 50, pos_y: alta ? 9 : 91 });
    }
  });
  it('un modulo che non c\'e\' per quel numero di giocatori non si applica; null = automatico', () => {
    const righe = squadra5(1, 'A');
    expect(impostaModulo(righe, 'A', '3-2-1')).toBe(righe);
    expect(impostaModulo(righe, 'A', 'boh')).toBe(righe);
    expect(moduloDi(impostaModulo(impostaModulo(righe, 'A', '2-2'), 'A', null), 'A')).toBeNull();
    expect(moduloDi(squadra5(1, 'A'), 'A')).toBeNull();
    expect(moduloDi(squadra5(1, 'A').slice(0, 4), 'A'), 'a 4 giocatori nessun modulo').toBeNull();
  });
  it('un giocatore trascinato su una casella occupata SCAMBIA con chi c\'e\'; su se stessa non cambia niente', () => {
    const righe = impostaModulo(squadra5(1, 'A'), 'A', '2-2');
    const [g0, g1, g2] = [righe[0], righe[1], righe[2]];
    const dopo = muoviInCasella(righe, 'A', 2, 0); // il giocatore 2 va sul portiere e il portiere prende il suo posto
    expect(dopo.find((x) => x.giocatore_id === 2)).toMatchObject({ pos_x: g0.pos_x, pos_y: g0.pos_y });
    expect(dopo.find((x) => x.giocatore_id === 1)).toMatchObject({ pos_x: g1.pos_x, pos_y: g1.pos_y });
    expect(dopo.find((x) => x.giocatore_id === 3)).toMatchObject({ pos_x: g2.pos_x, pos_y: g2.pos_y });
    expect(moduloDi(dopo, 'A'), 'le caselle restano tutte occupate: stesso modulo').toBe('2-2');
    expect(muoviInCasella(righe, 'A', 2, 1)).toBe(righe);
    expect(muoviInCasella(righe, 'A', 1, 99)).toBe(righe);
    expect(occupanti(dopo, 'A')!.chi.map((x) => x!.giocatore_id)).toEqual([2, 1, 3, 4, 5]);
  });
  it('aggancio alla casella piu\' vicina, e ogni squadra resta nella sua meta\'', () => {
    const cas = caselle('3-2-1', true)!;
    expect(agganciaA(cas, 52, 11)).toBe(0);
    expect(agganciaA(cas, 55, 44)).toBe(6);
    expect(agganciaA(cas, 70, 34)).toBe(5);
    expect(dentroMeta('A', 120, 80)).toEqual({ x: 96, y: 50 });
    expect(dentroMeta('B', -5, 10)).toEqual({ x: 4, y: 50 });
  });
  it('frecce da tastiera: la casella piu\' vicina nella direzione; null al bordo', () => {
    const cas = caselle('2-2', true)!; // 0 portiere, 1-2 difesa, 3-4 attacco
    expect(casellaVerso(cas, 0, 'ArrowDown')).toBeLessThanOrEqual(2);
    expect([1, 2]).toContain(casellaVerso(cas, 0, 'ArrowDown'));
    expect(casellaVerso(cas, 1, 'ArrowRight')).toBe(2);
    expect(casellaVerso(cas, 2, 'ArrowLeft')).toBe(1);
    expect(casellaVerso(cas, 1, 'ArrowDown')).toBe(3);
    expect(casellaVerso(cas, 3, 'ArrowUp')).toBe(1);
    expect(casellaVerso(cas, 0, 'ArrowUp')).toBeNull();
    expect(casellaVerso(cas, 1, 'ArrowLeft')).toBeNull();
  });
});

describe('salvataggio', () => {
  it('il corpo del PUT ha tutto e solo i campi attesi (e mai il nome)', () => {
    const c = corpoConvocati([r(1, 'A', { gol: 2, voto_pagella: 7.5, pos_x: 50, pos_y: 9 })]);
    expect(c).toEqual({ convocati: [{ giocatore_id: 1, squadra: 'A', pos_x: 50, pos_y: 9, gol: 2, autogol: 0, voto_pagella: 7.5 }] });
  });
  it('l\'impronta ignora l\'ordine ma vede ogni modifica (anche di un decimale) e la cronaca', () => {
    const a = [r(1, 'A'), r(2, 'B')];
    expect(impronta(a, '')).toBe(impronta([...a].reverse(), ''));
    expect(impronta(a, '')).not.toBe(impronta([r(1, 'A', { pos_x: 50, pos_y: 9.1 }), r(2, 'B')], ''));
    expect(impronta(a, '')).not.toBe(impronta([r(1, 'A', { voto_pagella: 6.5 }), r(2, 'B')], ''));
    expect(impronta(a, 'x')).not.toBe(impronta(a, ''));
    expect(impronta(a, ' ')).toBe(impronta(a, ''));
  });
  it('voti in pagella: da 1 a 10 a mezzi punti', () => {
    expect(VOTI).toHaveLength(19);
    expect(VOTI[0]).toBe(1);
    expect(VOTI.at(-1)).toBe(10);
    expect(VOTI.every((v) => v * 2 === Math.floor(v * 2))).toBe(true);
  });
  it('l\'orario per <input datetime-local> e\' quello di Roma, anche col cambio d\'ora', () => {
    expect(isoARomaLocale('2026-10-01T19:00:00Z')).toBe('2026-10-01T21:00');
    expect(isoARomaLocale('2026-12-01T19:00:00Z')).toBe('2026-12-01T20:00');
  });
});
