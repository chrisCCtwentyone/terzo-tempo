import { describe, expect, it } from 'vitest';
import { MIN_PARTITE_CLASSIFICA } from '../functions/lib/costanti';
import { aggrega, classifica, classifiche, type RigaPresenza } from '../functions/lib/statistiche';
import { scenarioStatistiche } from './aiuti';
import { D1Finto } from './d1_finto';
import { chiama } from './rotte';

const nomi = (v: { nome: string }[]) => v.map((x) => x.nome);

describe('classifiche: funzioni pure', () => {
  const riga = (g: number, nome: string, partita: number, sq: 'A' | 'B', gol: number, voto: number | null, gol_a: number, gol_b: number): RigaPresenza => ({
    giocatore_id: g, nome, attivo: 1, partita_id: partita, stagione_id: 1, data_ora: `2026-01-0${partita}T19:00:00Z`, squadra: sq, gol, autogol: 0, voto, gol_a, gol_b,
  });

  it('a pari valore la posizione e\' la stessa (1, 1, 3) e l\'ordine e\' per cognome', () => {
    const t = aggrega([riga(1, 'M. Rossi', 1, 'A', 2, 7, 2, 0), riga(2, 'L. Bianchi', 1, 'A', 2, 7, 2, 0), riga(3, 'A. G. Verdi', 1, 'B', 1, 6, 2, 0)], []);
    const c = classifica(t, (x) => x.gol);
    expect(c.map((x) => [x.nome, x.posizione])).toEqual([['L. Bianchi', 1], ['M. Rossi', 1], ['A. G. Verdi', 3]]);
  });

  it('un valore non calcolabile non entra in classifica, non diventa zero', () => {
    const t = aggrega([riga(1, 'M. Rossi', 1, 'A', 0, null, 1, 0)], []);
    expect(t[0].media_voto).toBeNull();
    expect(classifiche(t).media_voto).toEqual([]);
    expect(classifiche(t).gol).toEqual([]);
  });
});

describe('classifiche: scenario calcolato a mano', () => {
  // Stagione due (3 partite): R gol 4, voti 8/7/9, V1 P2; B gol 2 (+1 autogol), voti 7/7/6, V1 P2;
  // V gol 2, voti 6/6.5/7, V0 P2 S1; N gol 0 (1 autogol), voti 5/5.5/5, V0 P2 S1.
  it('per stagione', async () => {
    const db = new D1Finto();
    const { s2 } = scenarioStatistiche(db);
    const { json } = await chiama(db, 'GET', `/api/classifiche?stagione=${s2}`);
    expect(json.stagione).toMatchObject({ nome: 'Stagione due', aperta: true });
    expect(json.minimo_partite).toBe(MIN_PARTITE_CLASSIFICA);
    expect(json.gol.map((x: any) => [x.nome, x.valore, x.posizione])).toEqual([['M. Rossi', 4, 1], ['L. Bianchi', 2, 2], ['A. G. Verdi', 2, 2]]);
    expect(json.presenze.every((x: any) => x.valore === 3)).toBe(true);
    expect(json.media_voto.map((x: any) => [x.nome, x.valore])).toEqual([['M. Rossi', 8], ['L. Bianchi', 6.67], ['A. G. Verdi', 6.5], ['P. Neri', 5.17]]);
    // MVP della stagione due: R (m1), B (m2); la parita' di m3 non e' ancora decisa: nessuno
    expect(json.mvp.map((x: any) => [x.nome, x.valore])).toEqual([['L. Bianchi', 1], ['M. Rossi', 1]]);
    expect(json.pct_vittorie.map((x: any) => [x.nome, x.valore])).toEqual([['L. Bianchi', 33.3], ['M. Rossi', 33.3], ['P. Neri', 0], ['A. G. Verdi', 0]]);
  });

  it('sempre: somma le stagioni', async () => {
    const db = new D1Finto();
    scenarioStatistiche(db);
    const { json } = await chiama(db, 'GET', '/api/classifiche?stagione=sempre');
    expect(json.stagione).toBeNull();
    expect(json.gol[0]).toMatchObject({ nome: 'M. Rossi', valore: 5 });
    expect(json.media_voto[0]).toMatchObject({ nome: 'M. Rossi', valore: 7.5 });
    expect(json.mvp[0]).toMatchObject({ nome: 'M. Rossi', valore: 2 });
    expect(json.pct_vittorie[0]).toMatchObject({ nome: 'M. Rossi', valore: 50 });
    // senza parametro = sempre
    expect((await chiama(db, 'GET', '/api/classifiche')).json).toEqual(json);
  });

  it('nessun minimo di partite: media voto e % vittorie elencano subito chi ha 1 sola partita', async () => {
    const db = new D1Finto();
    const { s1 } = scenarioStatistiche(db);
    const { json } = await chiama(db, 'GET', `/api/classifiche?stagione=${s1}`); // 1 sola partita
    expect(json.minimo_partite).toBe(0);
    expect(json.media_voto.length).toBeGreaterThan(0);
    expect(json.pct_vittorie).toHaveLength(4); // tutti i presenti, con 1 sola partita
    expect(nomi(json.presenze)).toHaveLength(4);
    expect(json.gol).toHaveLength(1);
  });

  it('stagione inesistente o malformata: 404', async () => {
    const db = new D1Finto();
    expect((await chiama(db, 'GET', '/api/classifiche?stagione=99')).stato).toBe(404);
    expect((await chiama(db, 'GET', '/api/classifiche?stagione=abc')).stato).toBe(404);
  });
});

describe('scheda giocatore', () => {
  it('totali, ultimi 5 V/P/S (dal piu\' recente) e pagelle per partita', async () => {
    const db = new D1Finto();
    const { R, N } = scenarioStatistiche(db);
    const { json } = await chiama(db, 'GET', `/api/giocatori/${R}`);
    expect(json.giocatore).toMatchObject({ id: R, nome: 'M. Rossi', badge: [] });
    expect(json.totali).toMatchObject({ presenze: 4, gol: 5, autogol: 0, media_voto: 7.5, vittorie: 2, pareggi: 2, sconfitte: 0, pct_vittorie: 50, mvp: 2, gol_a_partita: 1.25 });
    expect(json.ultime_5.map((x: any) => x.esito)).toEqual(['P', 'P', 'V', 'V']);
    expect(json.voti_per_partita.map((x: any) => x.voto)).toEqual([6, 8, 7, 9]); // cronologico
    const n = (await chiama(db, 'GET', `/api/giocatori/${N}`)).json;
    expect(n.totali).toMatchObject({ autogol: 1, gol: 0, sconfitte: 2 });
    expect(n.ultime_5.map((x: any) => x.esito)).toEqual(['P', 'P', 'S', 'S']);
  });

  it('chi non ha mai giocato: zeri e null, non valori inventati', async () => {
    const db = new D1Finto();
    db.esegui("INSERT INTO giocatori (nome) VALUES ('Z. Nuovo')");
    const { json } = await chiama(db, 'GET', '/api/giocatori/1');
    expect(json.totali).toMatchObject({ presenze: 0, media_voto: null, pct_vittorie: null, gol_a_partita: null });
    expect(json.ultime_5).toEqual([]);
  });

  it('giocatore inesistente: 404', async () => {
    expect((await chiama(new D1Finto(), 'GET', '/api/giocatori/5')).stato).toBe(404);
  });
});
