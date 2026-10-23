/**
 * Ingressi ostili e logica: numeri fuori range, stringhe lunghissime, corpi enormi o malformati, tipi sbagliati,
 * id incrociati fra partite e stagioni, stati non validi. L'admin e' fidato, ma un token rubato o un errore
 * non devono poter corrompere i dati ne' mandare in tilt il servizio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CONVOCATI, MAX_CORPO_BYTE, MAX_LINK_CAMPO, MAX_NOME_CAMPO } from '../functions/lib/costanti';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, chiama } from './rotte';

let db: D1Finto;
beforeEach(() => {
  db = new D1Finto(true);
});
const admin = (metodo: string, percorso: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  chiama(db, metodo, percorso, { locale: true, env: ENV_BYPASS, corpo, ...extra });
const righe = (t: string) => db.tutti<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0].n;

describe('lunghezze massime', () => {
  const lungo = (n: number) => 'a'.repeat(n);

  it('badge: nome 40, descrizione 120', async () => {
    expect((await admin('POST', '/api/admin/badge', { nome: lungo(41), tipo: 'positivo' })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/badge', { nome: lungo(40), tipo: 'positivo' })).stato).toBe(201);
    expect((await admin('POST', '/api/admin/badge', { nome: 'B', descrizione: lungo(121), tipo: 'positivo' })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/badge', { nome: 'C', descrizione: lungo(120), tipo: 'positivo' })).stato).toBe(201);
    expect((await admin('PATCH', '/api/admin/badge/1', { nome: lungo(41) })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/badge/1', { descrizione: lungo(121) })).stato).toBe(400);
    // lo spazio non conta per arrivare a 40: il testo pulito e' quello che si misura
    expect((await admin('POST', '/api/admin/badge', { nome: `   ${lungo(41)}   `, tipo: 'negativo' })).stato).toBe(400);
  });

  it('stagione: nome 60', async () => {
    expect((await admin('POST', '/api/admin/stagioni', { nome: lungo(61), data_inizio: '2027-01-01', aperta: false })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/stagioni', { nome: lungo(60), data_inizio: '2027-01-01', aperta: false })).stato).toBe(201);
    expect((await admin('PATCH', '/api/admin/stagioni/1', { nome: lungo(61) })).stato).toBe(400);
  });

  it('giocatore: cognome 40, iniziali 3', async () => {
    expect((await admin('POST', '/api/admin/giocatori', { cognome: lungo(41) })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/giocatori', { cognome: 'Prova', iniziali: 'ABCD' })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/giocatori', { cognome: lungo(200_000) })).stato).toBeGreaterThanOrEqual(400);
  });

  it('campo: nome 80 (come gli altri nomi: niente caratteri di controllo), link 2000', async () => {
    expect((await admin('POST', '/api/admin/campi', { nome: lungo(MAX_NOME_CAMPO + 1) })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi', { nome: `   ${lungo(MAX_NOME_CAMPO + 1)}   ` })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi', { nome: lungo(MAX_NOME_CAMPO) })).stato).toBe(201);
    expect((await admin('PATCH', '/api/admin/campi/1', { nome: lungo(MAX_NOME_CAMPO + 1) })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi', { nome: 'Ok', link: `https://maps.app.goo.gl/${lungo(MAX_LINK_CAMPO)}` })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi/risolvi', { link: `https://maps.app.goo.gl/${lungo(MAX_LINK_CAMPO)}` })).stato).toBe(400);
    for (const nome of ['Cam\u0000po', 'Cam\u0007po', 'a\nb', 'a\tb', 'x‮abc', 'x⁦y', 'x\u2028y', 'x\u2029y', 'x\uFEFFy', 'x\u009Fy']) {
      expect((await admin('POST', '/api/admin/campi', { nome })).stato, JSON.stringify(nome)).toBe(400);
      expect((await admin('PATCH', '/api/admin/campi/1', { nome })).stato, JSON.stringify(nome)).toBe(400);
    }
    expect((await admin('POST', '/api/admin/campi', { nome: 'Perché ⚽ Sport' })).stato).toBe(201);
  });

  it('cronaca: 5000 caratteri, con a capo ammessi', async () => {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (60, 2, '2026-09-01T19:00:00Z', 'giocata', 1, 0)");
    expect((await admin('PATCH', '/api/admin/partite/60', { cronaca: lungo(5001) })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/partite/60', { cronaca: `${lungo(2000)}\nriga due\r\n\triga tre` })).stato).toBe(200);
    expect((await admin('PATCH', '/api/admin/partite/60', { cronaca: lungo(5000) })).stato).toBe(200);
  });

  it('caratteri di controllo e invisibili che ribaltano il testo: rifiutati nei nomi', async () => {
    for (const nome of ['Bad\u0000ge', 'Bad\u0007ge', 'a\nb', 'a\tb', 'x‮abc', 'x⁦y', 'x y', 'x﻿y', 'x\u001Fy', 'x\u009Fy']) {
      expect((await admin('POST', '/api/admin/badge', { nome, tipo: 'positivo' })).stato, JSON.stringify(nome)).toBe(400);
      expect((await admin('POST', '/api/admin/stagioni', { nome, data_inizio: '2027-01-01', aperta: false })).stato, JSON.stringify(nome)).toBe(400);
    }
    expect((await admin('PATCH', '/api/admin/partite/60', { cronaca: 'ciao\u0000mondo' })).stato).toBeGreaterThanOrEqual(400);
    // le lettere accentate e l'emoji restano ammesse
    expect((await admin('POST', '/api/admin/badge', { nome: 'Perché ⚽', tipo: 'positivo' })).stato).toBe(201);
  });
});

describe('corpi enormi, malformati, di tipo sbagliato', () => {
  it('oltre MAX_CORPO_BYTE: 413, e non si scrive niente', async () => {
    const prima = righe('badge');
    const grande = JSON.stringify({ nome: 'X', tipo: 'positivo', extra: 'a'.repeat(MAX_CORPO_BYTE) });
    const r = await admin('POST', '/api/admin/badge', undefined, { grezzo: grande });
    expect(r.stato).toBe(413);
    expect(righe('badge')).toBe(prima);
    // anche senza Content-Length dichiarato (corpo a pezzi)
    const url = 'http://localhost:8788/api/admin/badge';
    const pezzi = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode('a'.repeat(10_000))); c.close(); } });
    const richiesta = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pezzi, duplex: 'half' } as RequestInit);
    expect(richiesta.headers.get('Content-Length')).toBeNull();
    const { onRequest } = await import('../functions/api/admin/badge/index');
    const risposta = await (onRequest as unknown as (c: unknown) => Promise<Response>)({ request: richiesta, env: { DB: db }, params: {}, data: {} });
    expect(risposta.status).toBe(413);
  });

  it('campi e risolvi: corpo oltre il limite = 413 (senza aprire nessun link), JSON malformato = 400, mai 500', async () => {
    const rete = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', rete);
    try {
      const grande = JSON.stringify({ link: 'https://maps.app.goo.gl/x', extra: 'a'.repeat(MAX_CORPO_BYTE) });
      expect((await admin('POST', '/api/admin/campi/risolvi', undefined, { grezzo: grande })).stato).toBe(413);
      expect((await admin('POST', '/api/admin/campi', undefined, { grezzo: JSON.stringify({ nome: 'X', extra: 'a'.repeat(MAX_CORPO_BYTE) }) })).stato).toBe(413);
      expect((await admin('PATCH', '/api/admin/campi/1', undefined, { grezzo: JSON.stringify({ nome: 'X', extra: 'a'.repeat(MAX_CORPO_BYTE) }) })).stato).toBe(413);
      for (const grezzo of ['{', 'null', '[]', '"x"', '{"link":', '{"link":NaN}']) {
        for (const rotta of ['/api/admin/campi/risolvi', '/api/admin/campi']) expect((await admin('POST', rotta, undefined, { grezzo })).stato, `${rotta} ${grezzo}`).toBe(400);
      }
      expect((await admin('POST', '/api/admin/campi/risolvi', undefined, { grezzo: '[' .repeat(50_000) + ']'.repeat(50_000) })).stato).toBeLessThan(500);
      expect(rete).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sotto il limite passa', async () => {
    const r = await admin('POST', '/api/admin/badge', undefined, { grezzo: JSON.stringify({ nome: 'Piccolo', tipo: 'positivo' }) });
    expect(r.stato).toBe(201);
  });

  it('JSON malformato o non oggetto: 400; Content-Type mancante o sbagliato: 415; mai 500', async () => {
    for (const grezzo of ['{', '{"a":', 'null', '[]', '"testo"', '123', 'true', '{"nome":"a"', '\u0000', '{"a":1}}', "{'a':1}", '{"a":NaN}', '{"a":undefined}', '']) {
      const r = await admin('POST', '/api/admin/badge', undefined, { grezzo });
      expect(r.stato, JSON.stringify(grezzo)).toBe(400);
    }
    expect((await admin('POST', '/api/admin/badge', undefined, { grezzo: '{"nome":"a","tipo":"positivo"}', headers: { 'Content-Type': 'text/plain' } })).stato).toBe(415);
    expect((await chiama(db, 'POST', '/api/admin/badge', { locale: true, env: ENV_BYPASS, grezzo: '{}', headers: { 'Content-Type': '' } })).stato).toBe(415);
    // JSON profondamente annidato: non fa cadere il servizio
    const annidato = '['.repeat(50_000) + ']'.repeat(50_000);
    expect((await admin('POST', '/api/admin/badge', undefined, { grezzo: annidato })).stato).toBeLessThan(500);
    // UTF-8 non valido
    expect((await admin('POST', '/api/admin/badge', undefined, { grezzo: '{"nome":"�","tipo":"positivo"}' })).stato).toBeLessThan(500);
  });

  it('elenchi giganti: 400 col nome del campo (D1 accetta ~100 parametri per query: prima erano un 500)', async () => {
    const molti = Array.from({ length: MAX_CONVOCATI + 1 }, (_, i) => i + 1);
    for (const [rotta, corpo, campo] of [
      ['/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: molti }, 'giocatori'],
      ['/api/admin/partite/11/convocati', { convocati: molti.map((g) => ({ giocatore_id: g })) }, 'convocati'],
    ] as const) {
      const r = await admin(rotta.endsWith('convocati') ? 'PUT' : 'POST', rotta, corpo);
      expect(r.stato, rotta).toBe(400);
      expect(r.json.errore).toContain(campo);
    }
    const r = await admin('PUT', '/api/admin/giocatori/1/badge', { badge_ids: Array.from({ length: 5000 }, (_, i) => i + 1) });
    expect(r.stato).toBe(400);
    // il limite e' esatto: MAX_CONVOCATI passa la validazione dell'elenco
    const ok = await admin('POST', '/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: molti.slice(0, 3) });
    expect(ok.stato).toBe(201);
  });
});

describe('numeri fuori range e tipi sbagliati', () => {
  it('gol, autogol, livello, voto, posizioni', async () => {
    const conv = (c: Record<string, unknown>) => admin('PUT', '/api/admin/partite/11/convocati', { convocati: [{ giocatore_id: 1, squadra: 'A', ...c }] });
    const cattivi: Record<string, unknown>[] = [
      { gol: -1 }, { gol: 100 }, { gol: 1e9 }, { gol: 1.5 }, { gol: '3' }, { gol: null }, { gol: true }, { gol: [1] }, { gol: {} },
      { autogol: -1 }, { autogol: 100 }, { autogol: 2 ** 53 },
      { voto_pagella: 0 }, { voto_pagella: 0.5 }, { voto_pagella: 10.5 }, { voto_pagella: 11 }, { voto_pagella: -7 }, { voto_pagella: 7.3 }, { voto_pagella: '7' }, { voto_pagella: 1e309 },
      { pos_x: -1, pos_y: 5 }, { pos_x: 101, pos_y: 5 }, { pos_x: 5 }, { pos_y: 5 }, { pos_x: 'a', pos_y: 1 }, { pos_x: 1e309, pos_y: 1 },
      { squadra: 'C' }, { squadra: 'a' }, { squadra: '' }, { squadra: 1 }, { squadra: ['A'] },
      { giocatore_id: 0 }, { giocatore_id: -3 }, { giocatore_id: 1.5 }, { giocatore_id: '1' }, { giocatore_id: 2 ** 60 }, { giocatore_id: null },
    ];
    for (const c of cattivi) {
      // 1e309 e' infinito: JSON.stringify lo scriverebbe "null", quindi si sostituisce il segnaposto a mano
      const grezzo = JSON.stringify({ convocati: [{ giocatore_id: 1, squadra: 'A', ...c }] })  .replace(/null/g, (m) => (c.voto_pagella === 1e309 || c.pos_x === 1e309 ? '1e309' : m));
      const r = await admin('PUT', '/api/admin/partite/11/convocati', undefined, { grezzo });
      expect(r.stato, JSON.stringify(c)).toBe(400);
    }
    // e i valori ai bordi validi passano
    expect((await conv({ gol: 99, autogol: 0, voto_pagella: 10, pos_x: 0, pos_y: 100 })).stato).toBe(200);
    expect((await conv({ gol: 0, voto_pagella: 1 })).stato).toBe(200);
  });

  it('livello segreto 1..5, gol del risultato 0..99, id enormi, Infinity da JSON', async () => {
    for (const livello of [0, 6, -1, 2.5, '3', 1e309, 2 ** 53, true]) {
      // JSON.stringify(1e309) darebbe "null": il numero infinito si scrive a mano
      const grezzo = livello === 1e309 ? '{"cognome":"Prova","livello_segreto":1e309}' : JSON.stringify({ cognome: 'Prova', livello_segreto: livello });
      const r = await admin('POST', '/api/admin/giocatori', undefined, { grezzo });
      expect(r.stato, String(livello)).toBe(400);
    }
    for (const [gol_a, gol_b] of [[-1, 0], [0, 100], [1e9, 0], [1.5, 1], ['1', 1], [null, 1]]) {
      expect((await admin('POST', '/api/admin/partite/11/giocata', { gol_a, gol_b })).stato, `${gol_a} ${gol_b}`).toBe(400);
    }
    expect((await admin('PATCH', '/api/admin/giocatori/99999999999999999999999')).stato).toBe(404);
    expect((await admin('PATCH', '/api/admin/giocatori/1', { livello_segreto: 3 })).stato).toBe(200);
    // seed: intero 0..2^32-1
    for (const seed of [-1, 2 ** 32, 1.5, '3', 1e309]) {
      const r = await admin('POST', '/api/admin/partite/11/genera-squadre', undefined, { grezzo: seed === 1e309 ? '{"seed":1e309}' : JSON.stringify({ seed }) });
      expect(r.stato, String(seed)).toBe(400);
    }
  });

  it('campo_id e coordinate: solo interi e numeri veri, nei limiti', async () => {
    for (const campo_id of [0, -1, 1.5, '1', 1e309, 2 ** 53, true, false, [1], { id: 1 }, 99999]) {
      const grezzo = campo_id === 1e309 ? '{"campo_id":1e309}' : JSON.stringify({ campo_id });
      expect((await admin('PATCH', '/api/admin/partite/11', undefined, { grezzo })).stato, String(campo_id)).toBe(400);
    }
    for (const [lat, lng] of [[91, 0], [-91, 0], [0, 181], [0, -181], ['1', '2'], [true, false], [[1], [2]], [1e309, 0]]) {
      const grezzo = lat === 1e309 ? '{"nome":"Z","lat":1e309,"lng":0}' : JSON.stringify({ nome: 'Z', lat, lng });
      expect((await admin('POST', '/api/admin/campi', undefined, { grezzo })).stato, `${lat},${lng}`).toBe(400);
    }
    expect((await admin('POST', '/api/admin/campi', { nome: 'Z', lat: -90, lng: 180 })).stato).toBe(201);
    expect((await admin('POST', '/api/admin/campi', { nome: 'Z2', lat: 90, lng: -180 })).stato).toBe(201);
  });

  it('date impossibili e testi al posto dei numeri', async () => {
    for (const d of ['2026-02-30T20:00', '2026-13-01T20:00', '2026-01-01T25:00', '2026-01-01T20:61', 'ieri', '', '0000-00-00T00:00', '2026-01-01T20:00:00+99:99x', '9999999999-01-01T00:00', 20260101, null, ['2026-01-01T20:00']]) {
      expect((await admin('POST', '/api/admin/partite', { data_ora: d, giocatori: [] })).stato, JSON.stringify(d)).toBe(400);
    }
    for (const d of ['2026-02-30', '2026-1-1', '01/01/2026', 20260101, '2026-01-01T00:00']) {
      expect((await admin('POST', '/api/admin/stagioni', { nome: `S${Math.random()}`, data_inizio: d, aperta: false })).stato, JSON.stringify(d)).toBe(400);
    }
  });
});

describe('id incrociati e stati non validi', () => {
  it('i convocati di una partita non finiscono in un\'altra: ogni PUT tocca solo la partita dell\'URL', async () => {
    const a = db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partecipazioni WHERE partita_id = 10')[0].n;
    const r = await admin('PUT', '/api/admin/partite/11/convocati', { convocati: [{ giocatore_id: 1 }, { giocatore_id: 2 }] });
    expect(r.stato).toBe(200);
    expect(db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partecipazioni WHERE partita_id = 10')[0].n).toBe(a);
    // il corpo non puo' scegliere la partita: un campo partita_id e' ignorato, non usato
    const x = await admin('PUT', '/api/admin/partite/11/convocati', { convocati: [{ giocatore_id: 3, partita_id: 10, squadra: 'A' }], partita_id: 10 });
    expect(x.stato).toBe(200);
    expect(db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partecipazioni WHERE partita_id = 10')[0].n).toBe(a);
  });

  it('giocatore inesistente nei convocati o nella nuova partita: 400, e la partita non resta a meta\'', async () => {
    const partite = righe('partite');
    expect((await admin('PUT', '/api/admin/partite/11/convocati', { convocati: [{ giocatore_id: 9999 }] })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: [1, 9999] })).stato).toBe(400);
    expect(righe('partite')).toBe(partite);
  });

  it('stagione: partita in una stagione inesistente, o modifica verso una stagione inesistente: rifiutata', async () => {
    expect((await admin('POST', '/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: [], stagione_id: 9999 })).stato).toBe(404);
    expect((await admin('PATCH', '/api/admin/partite/11', { stagione_id: 9999 })).stato).toBe(409);
    expect((await admin('PATCH', '/api/admin/partite/9999', { cronaca: 'x' })).stato).toBe(404);
    // spostare una partita in un'altra stagione ESISTENTE e' una funzione dell'admin: consentita, e cambia solo quella partita
    const altre = db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partite WHERE stagione_id = 1')[0].n;
    expect((await admin('PATCH', '/api/admin/partite/11', { stagione_id: 1 })).stato).toBe(200);
    expect(db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partite WHERE stagione_id = 1')[0].n).toBe(altre + 1);
  });

  it('"giocata" due volte: 409; risultato di una partita non giocata: 409; giocata senza squadre: 409', async () => {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora) VALUES (61, 2, '2027-03-01T19:00:00Z')");
    db.esegui("INSERT INTO partecipazioni (partita_id, giocatore_id, squadra) VALUES (61, 1, 'A'), (61, 2, 'B')");
    expect((await admin('POST', '/api/admin/partite/61/giocata', { gol_a: 1, gol_b: 0 })).stato).toBe(200);
    expect((await admin('POST', '/api/admin/partite/61/giocata', { gol_a: 9, gol_b: 9 })).stato).toBe(409);
    expect(db.tutti<{ gol_a: number }>('SELECT gol_a FROM partite WHERE id = 61')[0].gol_a).toBe(1);
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora) VALUES (62, 2, '2027-03-08T19:00:00Z')");
    expect((await admin('PATCH', '/api/admin/partite/62', { gol_a: 3 })).stato).toBe(409);
    expect((await admin('POST', '/api/admin/partite/62/giocata', { gol_a: 1, gol_b: 0 })).stato).toBe(409); // senza convocati con squadra
    expect((await admin('DELETE', '/api/admin/partite/61')).stato).toBe(409); // giocata: non si cancella
  });

  it('voto su partita non giocata / chiusa / inesistente; per giocatore inesistente o archiviato', async () => {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora) VALUES (63, 2, '2999-03-08T19:00:00Z')");
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (64, 2, '2999-03-01T19:00:00Z', 'giocata', 1, 0)");
    db.esegui("INSERT INTO giocatori (id, nome, attivo) VALUES (900, 'Archiviato', 0)");
    const voti = righe('voti_mvp');
    expect((await chiama(db, 'POST', '/api/partite/63/mvp', { corpo: { giocatore_id: 1 } })).stato).toBe(409); // non giocata
    expect((await chiama(db, 'POST', '/api/partite/10/mvp', { corpo: { giocatore_id: 1 } })).stato).toBe(409); // chiusa
    expect((await chiama(db, 'POST', '/api/partite/9999/mvp', { corpo: { giocatore_id: 1 } })).stato).toBe(404);
    expect((await chiama(db, 'POST', '/api/partite/64/mvp', { corpo: { giocatore_id: 9999 } })).stato).toBe(400);
    expect((await chiama(db, 'POST', '/api/partite/64/mvp', { corpo: { giocatore_id: 900 } })).stato).toBe(400); // archiviato
    expect(righe('voti_mvp')).toBe(voti);
    // si vota solo chi ha giocato QUESTA partita: il giocatore di un'altra partita no, un convocato con la squadra si'
    expect((await chiama(db, 'POST', '/api/partite/64/mvp', { corpo: { giocatore_id: 1 } })).stato).toBe(400);
    expect(righe('voti_mvp')).toBe(voti);
    db.esegui("INSERT INTO partecipazioni (partita_id, giocatore_id, squadra) VALUES (64, 1, 'A')");
    expect((await chiama(db, 'POST', '/api/partite/64/mvp', { corpo: { giocatore_id: 1 } })).stato).toBe(201);
  });

  it('MVP dell\'admin: un giocatore di un\'altra partita non e\' un candidato', async () => {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato, mvp_chiuso_il) VALUES (65, 2, '2026-03-01T19:00:00Z', 'giocata', 1, 0, 'nessun_voto', '2026-03-02T19:00:00Z')");
    db.esegui("INSERT INTO partecipazioni (partita_id, giocatore_id, squadra) VALUES (65, 1, 'A'), (65, 2, 'B')");
    const fuori = db.tutti<{ id: number }>('SELECT id FROM giocatori WHERE id NOT IN (1, 2) LIMIT 1')[0].id;
    expect((await admin('POST', '/api/admin/partite/65/mvp/decidi', { giocatore_id: fuori })).stato).toBe(400);
    expect(db.tutti('SELECT 1 FROM mvp_vincitori WHERE partita_id = 65')).toHaveLength(0);
    expect((await admin('POST', '/api/admin/partite/65/mvp/decidi', { giocatore_id: 1 })).stato).toBe(200);
    expect((await admin('POST', '/api/admin/partite/65/mvp/decidi', { giocatore_id: 2 })).stato).toBe(409); // gia' assegnato: il vincitore e' uno solo
  });

  it('un badge inesistente: 409 e il giocatore non perde i suoi (transazione)', async () => {
    const prima = db.tutti('SELECT badge_id FROM giocatore_badge WHERE giocatore_id = 1 ORDER BY badge_id');
    expect((await admin('PUT', '/api/admin/giocatori/1/badge', { badge_ids: [1, 99999] })).stato).toBe(409);
    expect(db.tutti('SELECT badge_id FROM giocatore_badge WHERE giocatore_id = 1 ORDER BY badge_id')).toEqual(prima);
  });
});

describe('errori senza dettagli', () => {
  it('un guasto del DB sull\'admin e sul voto esce come 500 generico con le intestazioni di sicurezza', async () => {
    const guasto = { prepare: () => { throw new Error('dettaglio-segreto: /srv/db/tabella'); }, batch: () => { throw new Error('dettaglio-segreto'); } };
    for (const [metodo, percorso, corpo] of [['GET', '/api/admin/giocatori', undefined], ['POST', '/api/admin/badge', { nome: 'X', tipo: 'positivo' }], ['POST', '/api/partite/1/mvp', { giocatore_id: 1 }], ['GET', '/api/partite/1', undefined]] as const) {
      const r = await chiama(db, metodo, percorso, { locale: true, env: { ...ENV_BYPASS, DB: guasto as never }, corpo });
      expect(r.stato, percorso).toBe(500);
      expect(r.testo).not.toMatch(/dettaglio|srv|tabella|stack|at \w+ \(/);
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    }
  });
});
