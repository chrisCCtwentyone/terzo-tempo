/** Rotte /api/admin/* (col bypass di sviluppo, gia' provato in admin_chiuso.test.ts). */
import { describe, expect, it } from 'vitest';
import { SQUADRE } from '../functions/lib/costanti';
import { romaAUtc } from '../functions/lib/valida';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, chiama } from './rotte';

const ad = (db: D1Finto, metodo: string, percorso: string, corpo?: unknown, extra: object = {}) =>
  chiama(db, metodo, percorso, { corpo, locale: true, env: ENV_BYPASS, ...extra });

describe('giocatori', () => {
  it('crea da cognome e iniziali (form tollerante, nome canonico), rifiuta i doppioni', async () => {
    const db = new D1Finto();
    const r = await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'Verdi', iniziali: 'A.G.', livello_segreto: 4 });
    expect(r.stato).toBe(201);
    expect(r.json).toMatchObject({ nome: 'Verdi A.G.', cognome: 'Verdi', iniziali: 'A.G.', attivo: true, livello_segreto: 4, badge_ids: [] });
    // forme tolleranti: stesso risultato canonico
    expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome: '  de   luca ', iniziali: 'v' })).json).toMatchObject({ nome: 'De Luca V.', cognome: 'De Luca', iniziali: 'V.' });
    expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'ROSSI', iniziali: 's c' })).json.nome).toBe('Rossi S.C.');
    for (const [cognome, iniziali] of [['', 'M'], ['Rossi', ''], ['Rossi', 'Mario'], ['Rossi', 'M1'], ['R0ssi', 'M'], [42, 'M'], ['Rossi', undefined], [undefined, 'M'], ['Rossi.', 'M']]) {
      expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome, iniziali })).stato, `${cognome}/${iniziali}`).toBe(400);
    }
    expect((await ad(db, 'POST', '/api/admin/giocatori', { nome: 'Rossi M.' })).stato, 'il nome intero non si accetta piu').toBe(400);
    expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'VERDI', iniziali: 'a g' })).stato).toBe(409);
    for (const livello of [0, 6, 2.5, '3']) {
      expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'Neri', iniziali: 'B', livello_segreto: livello })).stato, String(livello)).toBe(400);
    }
    expect((await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'Neri', iniziali: 'B' })).json.livello_segreto).toBeNull();
  });

  it('cambia solo il cognome o solo le iniziali: l\'altra parte resta', async () => {
    const db = new D1Finto(true);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/3', { iniziali: 'b' })).json).toMatchObject({ nome: 'Verdi B.', cognome: 'Verdi', iniziali: 'B.' });
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/3', { cognome: 'verdi rossi' })).json).toMatchObject({ nome: 'Verdi Rossi B.', cognome: 'Verdi Rossi' });
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/14', { iniziali: 'v z' })).json).toMatchObject({ nome: 'De Luca V.Z.', cognome: 'De Luca', iniziali: 'V.Z.' });
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/3', { cognome: '' })).stato).toBe(400);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/1', { cognome: 'Bianchi', iniziali: 'L' })).stato, 'omonimo di Bianchi L.').toBe(409);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/999', { cognome: 'Neri' })).stato).toBe(404);
  });

  it('modifica (livello compreso, e togliere il livello), archivia, cancella', async () => {
    const db = new D1Finto(true);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/1', { livello_segreto: 2 })).json.livello_segreto).toBe(2);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/1', { livello_segreto: null })).json.livello_segreto).toBeNull();
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/1', { attivo: false })).json.attivo).toBe(false);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/1', {})).stato).toBe(400);
    expect((await ad(db, 'PATCH', '/api/admin/giocatori/999', { attivo: true })).stato).toBe(404);
    // archiviato: sparisce dal listone pubblico, resta con ?tutti=1
    expect((await chiama(db, 'GET', '/api/giocatori')).json.giocatori).toHaveLength(15);
    expect((await chiama(db, 'GET', '/api/giocatori?tutti=1')).json.giocatori).toHaveLength(16);
    // con partite: non si cancella
    expect((await ad(db, 'DELETE', '/api/admin/giocatori/2')).stato).toBe(409);
    const nuovo = (await ad(db, 'POST', '/api/admin/giocatori', { cognome: 'Nuovo', iniziali: 'Z' })).json.id;
    expect((await ad(db, 'DELETE', `/api/admin/giocatori/${nuovo}`)).stato).toBe(200);
    expect((await ad(db, 'DELETE', `/api/admin/giocatori/${nuovo}`)).stato).toBe(404);
  });

  it('elenco admin: tutti, archiviati compresi, con livello e badge', async () => {
    const db = new D1Finto(true);
    const { json } = await ad(db, 'GET', '/api/admin/giocatori');
    expect(json.giocatori).toHaveLength(16);
    expect(json.giocatori.find((g: any) => g.nome === 'Rossi M.')).toMatchObject({ livello_segreto: 5, badge_ids: [expect.any(Number), expect.any(Number)] });
  });
});

describe('badge', () => {
  it('la migrazione crea la lista iniziale (7 positivi, 5 negativi)', async () => {
    const db = new D1Finto();
    const { json } = await ad(db, 'GET', '/api/admin/badge');
    expect(json.badge.filter((b: any) => b.tipo === 'positivo').map((b: any) => b.nome).sort()).toEqual(['Cecchino', 'Corridore', 'Dribblomane', 'Instancabile', 'Muro', 'Regista', 'Saracinesca']);
    expect(json.badge.filter((b: any) => b.tipo === 'negativo').map((b: any) => b.nome).sort()).toEqual(['Egoista', 'Fragile', 'Polemico', 'Ritardatario', 'Turista']);
  });

  it('i 12 badge iniziali hanno la descrizione approvata (migrazione 0002)', async () => {
    const { json } = await ad(new D1Finto(), 'GET', '/api/admin/badge');
    const d = Object.fromEntries(json.badge.map((b: any) => [b.nome, b.descrizione]));
    expect(Object.keys(d)).toHaveLength(12);
    expect(d.Corridore).toBe('Brucia tutti in velocità');
    expect(d.Turista).toBe('Non torna in difesa');
    expect(d.Fragile).toBe('Sempre acciaccato');
    expect(Object.values(d).every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
  });

  it('crea, modifica, cancella; assegna e toglie ai giocatori', async () => {
    const db = new D1Finto(true);
    const nuovo = await ad(db, 'POST', '/api/admin/badge', { nome: 'Jolly', descrizione: 'Gioca ovunque', tipo: 'positivo' });
    expect(nuovo.stato).toBe(201);
    expect((await ad(db, 'POST', '/api/admin/badge', { nome: 'jolly', tipo: 'positivo' })).stato).toBe(409);
    expect((await ad(db, 'POST', '/api/admin/badge', { nome: 'X', tipo: 'neutro' })).stato).toBe(400);
    expect((await ad(db, 'PATCH', `/api/admin/badge/${nuovo.json.id}`, { descrizione: null, tipo: 'negativo' })).json).toMatchObject({ descrizione: null, tipo: 'negativo' });

    const put = await ad(db, 'PUT', '/api/admin/giocatori/14/badge', { badge_ids: [nuovo.json.id, 1] });
    expect(put.json.badge_ids).toEqual([nuovo.json.id, 1]);
    const listone = (await chiama(db, 'GET', '/api/giocatori')).json.giocatori.find((g: any) => g.id === 14);
    expect(listone.badge.map((b: any) => b.nome).sort()).toEqual(['Corridore', 'Jolly']);
    expect((await ad(db, 'PUT', '/api/admin/giocatori/14/badge', { badge_ids: [999] })).stato).toBe(409);
    expect((await ad(db, 'PUT', '/api/admin/giocatori/14/badge', { badge_ids: [] })).json.badge_ids).toEqual([]);
    expect((await ad(db, 'PUT', '/api/admin/giocatori/999/badge', { badge_ids: [] })).stato).toBe(404);
    // cancellare un badge lo toglie a chi lo ha
    expect((await ad(db, 'DELETE', '/api/admin/badge/1')).stato).toBe(200);
    expect(db.tutti('SELECT * FROM giocatore_badge WHERE badge_id = 1')).toHaveLength(0);
  });
});

describe('stagioni', () => {
  it('una sola aperta alla volta; apri e chiudi', async () => {
    const db = new D1Finto();
    const a = await ad(db, 'POST', '/api/admin/stagioni', { nome: 'Uno', data_inizio: '2026-01-01' });
    expect(a).toMatchObject({ stato: 201 });
    expect(a.json.aperta).toBe(true);
    expect((await ad(db, 'POST', '/api/admin/stagioni', { nome: 'Due', data_inizio: '2026-06-01' })).stato).toBe(409);
    const b = await ad(db, 'POST', '/api/admin/stagioni', { nome: 'Due', data_inizio: '2026-06-01', aperta: false });
    expect(b.json.aperta).toBe(false);
    expect((await ad(db, 'POST', `/api/admin/stagioni/${b.json.id}/apri`)).stato).toBe(409);
    const c = await ad(db, 'POST', `/api/admin/stagioni/${a.json.id}/chiudi`, { data_fine: '2026-05-31' });
    expect(c.json).toEqual({ id: a.json.id, aperta: false, data_fine: '2026-05-31' });
    expect((await ad(db, 'POST', `/api/admin/stagioni/${b.json.id}/apri`)).json.aperta).toBe(true);
    // chiudere senza corpo: data di oggi
    expect((await ad(db, 'POST', `/api/admin/stagioni/${b.json.id}/chiudi`)).json.data_fine).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await ad(db, 'POST', '/api/admin/stagioni/99/chiudi')).stato).toBe(404);
    expect((await ad(db, 'POST', '/api/admin/stagioni', { nome: 'Tre', data_inizio: '2026-02-30' })).stato).toBe(400);
    expect((await chiama(db, 'GET', '/api/stagioni')).json.stagioni.map((s: any) => s.nome)).toEqual(['Due', 'Uno']);
  });
});

describe('partita: dal convocato alla cronaca', () => {
  it('flusso completo', async () => {
    const db = new D1Finto(true);
    // niente stagione aperta: serve stagione_id
    db.esegui('UPDATE stagioni SET aperta = 0, data_fine = ? WHERE id = 2', '2026-09-30');
    const senza = await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1, 2] });
    expect(senza.stato).toBe(409);
    await ad(db, 'POST', '/api/admin/stagioni/2/apri');

    // crea la convocazione: 21:00 a Roma d'estate = 19:00Z
    const nuova = await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1, 2, 3, 4, 5, 6] });
    expect(nuova).toMatchObject({ stato: 201, json: { data_ora: '2026-10-08T19:00:00Z', stato: 'convocazione' } });
    const id = nuova.json.id;
    expect((await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1, 999] })).stato).toBe(400);
    expect((await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1, 1] })).stato).toBe(400);
    expect(db.tutti('SELECT * FROM partite')).toHaveLength(12); // nessuna partita a meta'

    // giocata subito: mancano le squadre
    expect((await ad(db, 'POST', `/api/admin/partite/${id}/giocata`, { gol_a: 1, gol_b: 0 })).stato).toBe(409);

    // squadre e pedine
    const squadre = await ad(db, 'PUT', `/api/admin/partite/${id}/convocati`, {
      convocati: [
        { giocatore_id: 1, squadra: 'A', pos_x: 50, pos_y: 90 }, { giocatore_id: 2, squadra: 'A', pos_x: 20, pos_y: 60 }, { giocatore_id: 3, squadra: 'A' },
        { giocatore_id: 4, squadra: 'B', pos_x: 50.5, pos_y: 10 }, { giocatore_id: 5, squadra: 'B' }, { giocatore_id: 6, squadra: 'B' },
      ],
    });
    expect(squadre.stato).toBe(200);
    expect(squadre.json.giocatori.find((g: any) => g.giocatore_id === 4)).toMatchObject({ squadra: 'B', pos_x: 50.5, pos_y: 10 });
    expect(squadre.json.giocatori.find((g: any) => g.giocatore_id === 3)).toMatchObject({ pos_x: null, pos_y: null });

    // gol, autogol, pagelle
    const dati = await ad(db, 'PUT', `/api/admin/partite/${id}/convocati`, {
      convocati: [
        { giocatore_id: 1, squadra: 'A', gol: 2, voto_pagella: 8.5 }, { giocatore_id: 2, squadra: 'A', voto_pagella: 6 }, { giocatore_id: 3, squadra: 'A', voto_pagella: 6.5 },
        { giocatore_id: 4, squadra: 'B', gol: 1, autogol: 1, voto_pagella: 5.5 }, { giocatore_id: 5, squadra: 'B', voto_pagella: 6 }, { giocatore_id: 6, squadra: 'B' },
      ],
    });
    expect(dati.json.avvisi).toEqual([]); // ancora in convocazione: niente confronto

    // risultato: A = 2 gol + 1 autogol di B = 3; B = 1 gol. Se dico 3-2 l'avviso segnala i conti
    const giocata = await ad(db, 'POST', `/api/admin/partite/${id}/giocata`, { gol_a: 3, gol_b: 2 });
    expect(giocata.stato).toBe(200);
    expect(giocata.json.stato).toBe('giocata');
    expect(giocata.json.squadre).toEqual([{ codice: 'A', nome: SQUADRE.A, gol: 3 }, { codice: 'B', nome: SQUADRE.B, gol: 2 }]);
    expect(giocata.json.avvisi).toHaveLength(1);
    expect(giocata.json.avvisi[0]).toContain(SQUADRE.B);
    expect((await ad(db, 'POST', `/api/admin/partite/${id}/giocata`, { gol_a: 3, gol_b: 1 })).stato).toBe(409); // gia' giocata

    // correzione del risultato e cronaca
    expect((await ad(db, 'PATCH', `/api/admin/partite/${id}`, { gol_b: 1, cronaca: 'Vittoria netta.' })).json).toMatchObject({ gol_a: 3, gol_b: 1, cronaca: 'Vittoria netta.' });
    expect((await ad(db, 'PATCH', `/api/admin/partite/${id}`, { cronaca: '' })).json.cronaca).toBeNull();
    expect((await ad(db, 'PUT', `/api/admin/partite/${id}/convocati`, { convocati: [{ giocatore_id: 1, squadra: 'A' }] })).stato).toBe(409); // squadra B vuota
    // una partita giocata non si cancella
    expect((await ad(db, 'DELETE', `/api/admin/partite/${id}`)).stato).toBe(409);

    // il pubblico la vede
    const pubblica = (await chiama(db, 'GET', `/api/partite/${id}`)).json;
    expect(pubblica).toMatchObject({ id, stato: 'giocata', cronaca: null });
    expect(pubblica.giocatori.find((g: any) => g.giocatore_id === 1)).toMatchObject({ gol: 2, voto_pagella: 8.5, squadra: 'A' });
  });

  it('convocazione: si puo\' cancellare, e i dati sbagliati sono rifiutati', async () => {
    const db = new D1Finto(true);
    const { json } = await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1, 2] });
    const id = json.id;
    const put = (convocati: unknown[]) => ad(db, 'PUT', `/api/admin/partite/${id}/convocati`, { convocati });
    expect((await put([{ giocatore_id: 1, voto_pagella: 7.3 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, voto_pagella: 0.5 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, voto_pagella: 10.5 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, squadra: 'C' }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, pos_x: 10 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, pos_x: 101, pos_y: 5 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, gol: -1 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1 }, { giocatore_id: 1 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 999 }])).stato).toBe(400);
    expect((await put([{ giocatore_id: 1, voto_pagella: 7.5 }, { giocatore_id: 2, voto_pagella: 10 }])).stato).toBe(200);
    expect((await ad(db, 'PATCH', `/api/admin/partite/${id}`, { gol_a: 2 })).stato).toBe(409); // il risultato non si scrive prima di "giocata"
    expect((await ad(db, 'DELETE', `/api/admin/partite/${id}`)).stato).toBe(200);
    expect(db.tutti('SELECT * FROM partecipazioni WHERE partita_id = ?', id)).toHaveLength(0);
  });
});

describe('generatore di squadre (endpoint)', () => {
  it('propone due squadre dai convocati, stesso seed = stessa proposta, non salva niente', async () => {
    const db = new D1Finto(true);
    const prima = await ad(db, 'POST', '/api/admin/partite/11/genera-squadre', { seed: 5 });
    expect(prima.stato).toBe(200);
    expect(prima.json.seed).toBe(5);
    const [A, B] = prima.json.squadre;
    expect([A.codice, A.nome, B.codice, B.nome]).toEqual(['A', SQUADRE.A, 'B', SQUADRE.B]);
    expect(A.giocatori.length).toBe(6);
    expect(B.giocatori.length).toBe(6);
    const convocati = db.tutti<{ giocatore_id: number }>('SELECT giocatore_id FROM partecipazioni WHERE partita_id = 11').map((x) => x.giocatore_id).sort((x, y) => x - y);
    expect([...A.giocatori, ...B.giocatori].map((g: any) => g.giocatore_id).sort((x: number, y: number) => x - y)).toEqual(convocati);
    expect((await ad(db, 'POST', '/api/admin/partite/11/genera-squadre', { seed: 5 })).json).toEqual(prima.json);
    expect(db.tutti('SELECT * FROM partecipazioni WHERE partita_id = 11 AND squadra IS NOT NULL')).toHaveLength(0);
    // senza seed ne sceglie uno e lo restituisce
    const libero = await ad(db, 'POST', '/api/admin/partite/11/genera-squadre');
    expect(Number.isInteger(libero.json.seed)).toBe(true);
    expect((await ad(db, 'POST', '/api/admin/partite/11/genera-squadre', { seed: -1 })).stato).toBe(400);
    expect((await ad(db, 'POST', '/api/admin/partite/99/genera-squadre', { seed: 1 })).stato).toBe(404);
  });

  it('con un solo convocato: 400 (servono due squadre)', async () => {
    const db = new D1Finto(true);
    const { json } = await ad(db, 'POST', '/api/admin/partite', { data_ora: '2026-10-08T21:00', giocatori: [1] });
    expect((await ad(db, 'POST', `/api/admin/partite/${json.id}/genera-squadre`, { seed: 1 })).stato).toBe(400);
  });
});

describe('data_ora: Europe/Rome -> UTC', () => {
  it('ora legale (CEST, +2) e ora solare (CET, +1)', () => {
    expect(new Date(romaAUtc(2026, 10, 8, 21, 0, 0)).toISOString()).toBe('2026-10-08T19:00:00.000Z');
    expect(new Date(romaAUtc(2026, 12, 3, 21, 0, 0)).toISOString()).toBe('2026-12-03T20:00:00.000Z');
    // il giorno del cambio d'ora (25/10/2026): alle 21:00 e' gia' ora solare
    expect(new Date(romaAUtc(2026, 10, 25, 21, 0, 0)).toISOString()).toBe('2026-10-25T20:00:00.000Z');
  });

  it('con Z o scostamento e\' un istante preciso; date impossibili rifiutate', async () => {
    const db = new D1Finto(true);
    const crea = (data_ora: unknown) => ad(db, 'POST', '/api/admin/partite', { data_ora, giocatori: [] });
    expect((await crea('2026-10-08T21:00:00+02:00')).json.data_ora).toBe('2026-10-08T19:00:00Z');
    expect((await crea('2026-10-08T19:00:00Z')).json.data_ora).toBe('2026-10-08T19:00:00Z');
    expect((await crea('2026-12-03 21:00')).json.data_ora).toBe('2026-12-03T20:00:00Z');
    for (const male of ['2026-02-30T21:00', '2026-13-01T21:00', '2026-10-08T25:00', 'domani', '', 5, null]) {
      expect((await crea(male)).stato, String(male)).toBe(400);
    }
  });
});
