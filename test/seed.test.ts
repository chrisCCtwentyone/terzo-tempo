/** Coerenza dei dati di prova (scripts/seed_prova.sql). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dividiNome } from '../shared/nomi';
import { D1Finto } from './d1_finto';
import { chiama } from './rotte';

const db = new D1Finto(true);
const q = <T = Record<string, any>>(sql: string, ...v: unknown[]) => db.tutti<T>(sql, ...v);
const giocate = q<{ id: number; gol_a: number; gol_b: number; mvp_stato: string }>("SELECT * FROM partite WHERE stato = 'giocata' ORDER BY id");

describe('seed di prova', () => {
  it('16 giocatori inventati, nel formato "Cognome I.", presi dall\'anteprima approvata', () => {
    const nomi = q<{ nome: string }>('SELECT nome FROM giocatori').map((g) => g.nome);
    expect(nomi).toHaveLength(16);
    const anteprima = readFileSync(join(import.meta.dirname, '..', 'docs', 'anteprima-figurine.html'), 'utf8');
    for (const n of nomi) {
      expect(n).toMatch(/^\p{Lu}[\p{L}' ]+ (\p{Lu}\.)+$/u);
      // l'anteprima approvata (prototipo) scrive ancora "A. G. Verdi": si confronta con quella forma
      const { cognome, iniziali } = dividiNome(n);
      const vecchia = `${iniziali.replace(/\./g, '. ')}${cognome}`;
      expect(anteprima, `${n} non e' fra i nomi inventati dell'anteprima`).toContain(`'${vecchia}'`);
    }
  });

  it('livelli 1-5 per alcuni, mancanti per altri; badge assegnati', () => {
    const livelli = q<{ livello_segreto: number | null }>('SELECT livello_segreto FROM giocatori').map((g) => g.livello_segreto);
    expect(livelli.filter((l) => l !== null).length).toBeGreaterThanOrEqual(10);
    expect(livelli.filter((l) => l === null).length).toBeGreaterThanOrEqual(1);
    expect(q('SELECT COUNT(DISTINCT giocatore_id) AS n FROM giocatore_badge')[0].n).toBeGreaterThanOrEqual(8);
    expect(q("SELECT COUNT(DISTINCT b.tipo) AS n FROM giocatore_badge gb JOIN badge b ON b.id = gb.badge_id")[0].n).toBe(2);
  });

  it('una stagione aperta (e una chiusa), 8-10 partite giocate, una in convocazione', () => {
    expect(q('SELECT id FROM stagioni WHERE aperta = 1')).toHaveLength(1);
    expect(q('SELECT id FROM stagioni WHERE aperta = 0').length).toBeGreaterThanOrEqual(1);
    expect(giocate.length).toBeGreaterThanOrEqual(8);
    expect(giocate.length).toBeLessThanOrEqual(10);
    const conv = q<{ id: number }>("SELECT id FROM partite WHERE stato = 'convocazione'");
    expect(conv).toHaveLength(1);
    const righe = q('SELECT * FROM partecipazioni WHERE partita_id = ?', conv[0].id);
    expect(righe.length).toBeGreaterThanOrEqual(10);
    expect(righe.every((r) => r.squadra === null && r.gol === 0 && r.voto_pagella === null)).toBe(true);
  });

  it('i gol dei giocatori sommano al risultato, autogol compresi', () => {
    for (const p of giocate) {
      // punteggio di una squadra = gol dei suoi + autogol degli avversari
      const somma = (sq: 'A' | 'B') =>
        q<{ n: number }>(
          `SELECT COALESCE(SUM(CASE squadra WHEN ? THEN gol ELSE autogol END), 0) AS n FROM partecipazioni WHERE partita_id = ? AND squadra IS NOT NULL`,
          sq, p.id,
        )[0].n;
      expect(somma('A'), `partita ${p.id}, squadra A`).toBe(p.gol_a);
      expect(somma('B'), `partita ${p.id}, squadra B`).toBe(p.gol_b);
    }
  });

  it('ogni partita giocata: tutti in una squadra, due squadre non vuote, pagelle per tutti', () => {
    for (const p of giocate) {
      const righe = q<{ squadra: string | null; voto_pagella: number | null }>('SELECT squadra, voto_pagella FROM partecipazioni WHERE partita_id = ?', p.id);
      expect(righe.every((r) => r.squadra !== null && r.voto_pagella !== null), `partita ${p.id}`).toBe(true);
      expect(righe.filter((r) => r.squadra === 'A').length).toBeGreaterThanOrEqual(4);
      expect(righe.filter((r) => r.squadra === 'B').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('le posizioni delle pedine, quando ci sono, sono complete e nel campo', () => {
    const r = q<{ pos_x: number | null; pos_y: number | null }>('SELECT pos_x, pos_y FROM partecipazioni');
    expect(r.some((x) => x.pos_x !== null)).toBe(true);
    expect(r.every((x) => (x.pos_x === null) === (x.pos_y === null))).toBe(true);
  });

  it('MVP coerente: il vincitore ha piu\' voti di tutti; la parita\' non ha vincitore', () => {
    for (const p of giocate) {
      const voti = q<{ giocatore_id: number; n: number }>('SELECT giocatore_id, COUNT(*) AS n FROM voti_mvp WHERE partita_id = ? GROUP BY giocatore_id ORDER BY n DESC', p.id);
      const vincitori = q<{ giocatore_id: number }>('SELECT giocatore_id FROM mvp_vincitori WHERE partita_id = ?', p.id);
      expect(voti.length, `partita ${p.id}: voti`).toBeGreaterThan(0);
      if (p.mvp_stato === 'assegnato') {
        expect(vincitori).toHaveLength(1);
        expect(vincitori[0].giocatore_id).toBe(voti[0].giocatore_id);
        expect(voti.length === 1 || voti[0].n > voti[1].n, `partita ${p.id}: vincitore non unico`).toBe(true);
      } else {
        expect(p.mvp_stato).toBe('parita_da_decidere');
        expect(vincitori).toHaveLength(0);
        expect(voti[1].n).toBe(voti[0].n);
      }
    }
    expect(giocate.some((p) => p.mvp_stato === 'parita_da_decidere')).toBe(true);
    expect(q("SELECT id FROM partite WHERE mvp_stato != 'aperto' AND mvp_chiuso_il IS NULL")).toHaveLength(0);
  });

  it('i voti sono anonimi: solo hash SHA-256', () => {
    for (const v of q<{ hash_token: string }>('SELECT hash_token FROM voti_mvp')) expect(v.hash_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('non cancella niente e dice che e\' solo per il locale', () => {
    const sql = readFileSync(join(import.meta.dirname, '..', 'scripts', 'seed_prova.sql'), 'utf8');
    expect(sql).not.toMatch(/^\s*(DELETE|DROP|UPDATE)\b/im);
    expect(sql).toContain('NON eseguire mai sul database di produzione');
  });

  it('le API lo leggono in modo coerente con i numeri del DB', async () => {
    const home = (await chiama(db, 'GET', '/api/home')).json;
    expect(home.ultima_partita.id).toBe(10);
    expect(home.prossima_partita).toMatchObject({ id: 11, stato: 'convocazione' });
    expect(home.prossima_partita.giocatori).toHaveLength(12);
    expect(home.stagione.nome).toBe('Stagione 2026-27');
    const cl = (await chiama(db, 'GET', '/api/classifiche?stagione=2')).json;
    const golGiocatori = cl.gol.reduce((t: number, x: any) => t + x.valore, 0);
    const autogol = q<{ n: number }>("SELECT SUM(autogol) AS n FROM partecipazioni pa JOIN partite p ON p.id = pa.partita_id WHERE p.stagione_id = 2 AND p.stato = 'giocata'")[0].n;
    const risultati = q<{ n: number }>('SELECT SUM(gol_a + gol_b) AS n FROM partite WHERE stagione_id = 2')[0].n;
    expect(golGiocatori + autogol).toBe(risultati);
    expect(home.top_marcatori[0]).toEqual(expect.objectContaining({ nome: cl.gol[0].nome, valore: cl.gol[0].valore }));
  });
});
