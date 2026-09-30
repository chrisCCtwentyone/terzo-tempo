/** Codice condiviso fra backend e frontend (shared/): nomi "Cognome I." e moduli con le loro caselle. */
import { describe, expect, it } from 'vitest';
import { MODULI, casellaPiuVicina, casellaSu, caselle, deduciModulo, moduliPer, moduloValido } from '../shared/moduli';
import { componiNome, dividiNome, normalizzaCognome, normalizzaIniziali, normalizzaInizialiOpz } from '../shared/nomi';

describe('nomi', () => {
  it('iniziali: forme tolleranti, sempre "X." attaccate; niente di diverso da 1-3 lettere', () => {
    for (const [dentro, fuori] of [['m', 'M.'], ['M.', 'M.'], ['s c', 'S.C.'], ['S. C.', 'S.C.'], ['sc', 'S.C.'], ['a.g.', 'A.G.'], [' à ', 'À.']] as const) {
      expect(normalizzaIniziali(dentro), dentro).toBe(fuori);
    }
    for (const no of ['', '  ', 'Mario', 'M1', 'M-C', 'a b c d', 42, null, undefined]) expect(normalizzaIniziali(no), String(no)).toBeNull();
  });

  it('cognome: maiuscole a posto, spazi puliti, ma niente numeri o punti', () => {
    for (const [dentro, fuori] of [['rossi', 'Rossi'], ['ROSSI', 'Rossi'], ['  de   luca ', 'De Luca'], ["d'angelo", "D'Angelo"], ['rossi-bianchi', 'Rossi-Bianchi'], ['De Luca', 'De Luca'], ['Éla', 'Éla']] as const) {
      expect(normalizzaCognome(dentro), dentro).toBe(fuori);
    }
    for (const no of ['', ' ', 'R0ssi', 'Rossi.', '1', 'a'.repeat(41), 42, null]) expect(normalizzaCognome(no), String(no)).toBeNull();
  });

  it('compone e divide il nome "Cognome I."', () => {
    expect(componiNome('Rossi', 'S.C.')).toBe('Rossi S.C.');
    expect(dividiNome('Rossi S.C.')).toEqual({ cognome: 'Rossi', iniziali: 'S.C.' });
    expect(dividiNome('De Luca V.')).toEqual({ cognome: 'De Luca', iniziali: 'V.' });
    expect(dividiNome('Dall\'Ora M.')).toEqual({ cognome: 'Dall\'Ora', iniziali: 'M.' });
    expect(dividiNome('Rossi')).toEqual({ cognome: 'Rossi', iniziali: '' });
  });

  it('iniziali facoltative: senza, si mostra il solo nome scritto e la divisione e\' reversibile', () => {
    for (const vuoto of ['', '  ', null, undefined]) expect(normalizzaInizialiOpz(vuoto), String(vuoto)).toBe('');
    expect(normalizzaInizialiOpz('s c')).toBe('S.C.');
    for (const no of ['Mario', 'M1', 'a b c d', 42]) expect(normalizzaInizialiOpz(no), String(no)).toBeNull();
    expect(componiNome('Gianni', '')).toBe('Gianni');
    expect(componiNome('Amico Gianni', '')).toBe('Amico Gianni');
    expect(dividiNome('Gianni')).toEqual({ cognome: 'Gianni', iniziali: '' });
    expect(dividiNome('Amico Gianni')).toEqual({ cognome: 'Amico Gianni', iniziali: '' });
    for (const n of ['Gianni', 'Amico Gianni', 'Rossi M.', 'De Luca V.Z.']) {
      const d = dividiNome(n);
      expect(componiNome(d.cognome, d.iniziali), n).toBe(n);
    }
  });
});

describe('moduli', () => {
  it('i moduli ammessi per numero di giocatori (decisione dell\'utente)', () => {
    expect(MODULI).toEqual({ 5: ['1-2-1', '2-2'], 6: ['2-1-2', '3-2'], 7: ['3-2-1', '2-3-1', '3-1-2'], 8: ['3-3-1', '3-2-2'] });
    for (const n of [0, 1, 4, 9, 10]) expect(moduliPer(n), `a ${n} nessun modulo`).toEqual([]);
    expect(moduloValido('2-2', 5)).toBe(true);
    expect(moduloValido('2-2', 6)).toBe(false);
  });

  it('ogni modulo ha tante caselle quanti giocatori (portiere compreso), nella meta\' giusta e dentro i margini del campo pubblico', () => {
    for (const [n, elenco] of Object.entries(MODULI)) {
      for (const m of elenco) {
        for (const alta of [true, false]) {
          const c = caselle(m, alta)!;
          expect(c, `${m} ${alta}`).toHaveLength(Number(n));
          expect(c[0].ruolo).toBe('portiere');
          expect(new Set(c.map((k) => `${k.x},${k.y}`)).size, `caselle distinte in ${m}`).toBe(c.length);
          for (const k of c) {
            expect(k.x).toBeGreaterThanOrEqual(8);
            expect(k.x).toBeLessThanOrEqual(92);
            // stessi limiti con cui la pagina pubblica tiene le pedine (y 6-94) e mezzo campo per squadra
            expect(alta ? k.y : 100 - k.y).toBeGreaterThanOrEqual(6);
            expect(alta ? k.y : 100 - k.y).toBeLessThanOrEqual(48);
          }
          // il portiere e' la casella piu' vicina alla propria porta
          const ys = c.map((k) => k.y);
          expect(c[0].y).toBe(alta ? Math.min(...ys) : Math.max(...ys));
        }
      }
    }
  });

  it('la squadra bassa e\' lo specchio di quella alta; 2-2 a 5 giocatori = portiere + 2 + 2', () => {
    expect(caselle('2-2', true)).toEqual([
      { x: 50, y: 9, ruolo: 'portiere' }, { x: 33.3, y: 27, ruolo: 'difesa' }, { x: 66.7, y: 27, ruolo: 'difesa' },
      { x: 33.3, y: 45, ruolo: 'attacco' }, { x: 66.7, y: 45, ruolo: 'attacco' },
    ]);
    expect(caselle('2-2', false)!.map((k) => k.y)).toEqual([91, 73, 73, 55, 55]);
    expect(caselle('9-9', true)).toBeNull();
    expect(caselle('3-2', true)).toHaveLength(6);
  });

  it('casella piu\' vicina, e modulo dedotto dalle posizioni', () => {
    const c = caselle('3-2-1', true)!;
    expect(casellaPiuVicina(50, 12, c)).toBe(0);
    expect(casellaPiuVicina(20, 22, c)).toBe(1);
    expect(casellaSu(c[3].x, c[3].y, c)).toBe(3);
    expect(casellaSu(1, 1, c)).toBe(-1);
    expect(deduciModulo(c, true)).toBe('3-2-1');
    expect(deduciModulo([...c].reverse(), true), 'l\'ordine non conta').toBe('3-2-1');
    expect(deduciModulo(caselle('2-2', false)!, false)).toBe('2-2');
    expect(deduciModulo(caselle('2-2', false)!, true), 'sulla meta\' sbagliata non e\' un modulo').toBeNull();
    expect(deduciModulo(c.map((k) => ({ ...k, x: k.x + 1 })), true)).toBeNull();
    expect(deduciModulo([{ x: 50, y: 50 }], true)).toBeNull();
  });
});
