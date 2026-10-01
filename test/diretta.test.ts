/**
 * Partita in diretta: stati (calcolati alla lettura), gol e autogol, idempotenza, concorrenza, fine partita, rotte pubbliche.
 * Spec: CLAUDE.md, "Partita in diretta" (01/10/2026). Nomi inventati.
 *
 * Scenario: partita alle 19:00Z con due squadre da due giocatori: A = Rossi, Bianchi; B = Verdi, Neri; Gialli e' convocato
 * senza squadra. Si usa un orologio finto (solo Date).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURATA_MASSIMA_DIRETTA_MS, MAX_EVENTI_DIRETTA } from '../functions/lib/costanti';
import { D1Finto } from './d1_finto';
import { giocatore, partita, stagione } from './aiuti';
import { ENV_BYPASS, chiama } from './rotte';

const ORARIO = '2026-10-01T19:00:00Z';
const T0 = Date.parse(ORARIO);
const ORA = 60 * 60 * 1000;

let db: D1Finto;
let R: number, Bi: number, V: number, N: number, Gi: number;
let P: number;

const quando = (ms: number) => vi.setSystemTime(ms);
const ad = (metodo: string, percorso: string, corpo?: unknown, extra: object = {}) => chiama(db, metodo, percorso, { corpo, locale: true, env: ENV_BYPASS, ...extra });
const pub = (percorso: string) => chiama(db, 'GET', percorso);

let n = 0;
const uuid = () => `evento-${String(++n).padStart(6, '0')}-prova`;
const gol = (giocatore_id: number, tipo = 'gol', id_client = uuid(), partitaId = P) => ad('POST', `/api/admin/partite/${partitaId}/diretta/eventi`, { id_client, tipo, giocatore_id });
const diretta = (partitaId = P) => ad('GET', `/api/admin/partite/${partitaId}/diretta`);
const righe = (sql: string, ...v: unknown[]) => db.tutti<any>(sql, ...v);
/** "Segna come giocata": serve che ogni convocato abbia una squadra, quindi chi e' rimasto senza esce dalla lista (come farebbe l'admin). */
const giocata = (a: number, b: number) => {
  db.esegui('DELETE FROM partecipazioni WHERE partita_id = ? AND squadra IS NULL', P);
  return ad('POST', `/api/admin/partite/${P}/giocata`, { gol_a: a, gol_b: b });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  quando(T0 - ORA); // un'ora prima
  db = new D1Finto();
  R = giocatore(db, 'Rossi M.', 5);
  Bi = giocatore(db, 'Bianchi L.', 4);
  V = giocatore(db, 'Verdi A.G.', 3);
  N = giocatore(db, 'Neri P.', 2);
  Gi = giocatore(db, 'Gialli T.', 1);
  const s = stagione(db, 'Stagione di prova', true);
  P = partita(db, { stagione: s, data_ora: ORARIO, righe: [{ g: R, sq: 'A' }, { g: Bi, sq: 'A' }, { g: V, sq: 'B' }, { g: N, sq: 'B' }, { g: Gi, sq: null }] });
});
afterEach(() => vi.useRealTimers());

describe('stato della diretta (calcolato alla lettura)', () => {
  it('prima dell\'orario e senza che nessuno la inizi: non_iniziata', async () => {
    const r = await diretta();
    expect(r.stato).toBe(200);
    expect(r.json).toMatchObject({ partita_id: P, stato: 'non_iniziata', inizio: null, scade_il: null, eventi: [] });
    expect(r.json.squadre).toEqual([{ codice: 'A', nome: 'Casaccati', gol: 0 }, { codice: 'B', nome: 'Smollicati', gol: 0 }]);
  });

  it('(b) all\'orario della partita parte DA SOLA, se le squadre sono assegnate', async () => {
    quando(T0 - 1000);
    expect((await diretta()).json.stato).toBe('non_iniziata');
    quando(T0);
    const r = await diretta();
    expect(r.json).toMatchObject({ stato: 'in_diretta', inizio: ORARIO, scade_il: '2026-10-01T21:00:00Z' });
    // nessuna scrittura: e' solo il calcolo alla lettura
    expect(righe('SELECT diretta_iniziata_il i, diretta_finita_il f FROM partite WHERE id = ?', P)[0]).toEqual({ i: null, f: null });
  });

  it('senza le squadre assegnate NON parte da sola: niente "IN DIRETTA 0-0" su una partita senza squadre', async () => {
    db.esegui('UPDATE partecipazioni SET squadra = NULL WHERE partita_id = ?', P);
    quando(T0 + 10 * 60 * 1000);
    expect((await diretta()).json.stato).toBe('non_iniziata');
    expect((await pub('/api/home')).json.diretta).toBeNull();
    // basta una squadra sola: serve almeno un giocatore PER squadra
    db.esegui("UPDATE partecipazioni SET squadra = 'A' WHERE partita_id = ?", P);
    expect((await diretta()).json.stato).toBe('non_iniziata');
    db.esegui("UPDATE partecipazioni SET squadra = 'B' WHERE partita_id = ? AND giocatore_id = ?", P, N);
    expect((await diretta()).json.stato).toBe('in_diretta');
  });

  it('(c) dopo due ore dall\'inizio diventa "da confermare" (se c\'e\' stata una diretta); la durata e\' una costante', async () => {
    expect(DURATA_MASSIMA_DIRETTA_MS).toBe(2 * ORA);
    quando(T0 + 10 * 60 * 1000);
    expect((await gol(R)).stato).toBe(201);
    quando(T0 + 2 * ORA - 1000);
    expect((await diretta()).json.stato).toBe('in_diretta');
    quando(T0 + 2 * ORA);
    const r = await diretta();
    expect(r.json).toMatchObject({ stato: 'da_confermare', scade_il: null });
    expect(r.json.squadre[0].gol).toBe(1); // il punteggio dei gol registrati resta
  });

  it('partita partita da sola e scaduta SENZA nessun gol: torna non_iniziata (non c\'e\' niente da confermare)', async () => {
    quando(T0 + 3 * ORA);
    expect((await diretta()).json.stato).toBe('non_iniziata');
    expect((await pub('/api/home')).json.diretta).toBeNull();
  });

  it('partita avviata a mano senza gol e scaduta: da_confermare', async () => {
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/inizia`)).stato).toBe(200);
    quando(T0 + 3 * ORA);
    expect((await diretta()).json.stato).toBe('da_confermare');
  });

  it('"giocata": finita, col risultato ufficiale', async () => {
    quando(T0 + 10 * 60 * 1000);
    await gol(R);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    const g = await giocata(1, 0);
    expect(g.stato).toBe(200);
    const r = await pub(`/api/partite/${P}/diretta`);
    expect(r.json).toMatchObject({ stato: 'finita', eventi: [] });
    expect(r.json.squadre.map((s: any) => s.gol)).toEqual([1, 0]);
  });
});

describe('POST .../diretta/inizia', () => {
  it('parte a mano, anche prima dell\'orario, e dura due ore da QUEL momento', async () => {
    const r = await ad('POST', `/api/admin/partite/${P}/diretta/inizia`);
    expect(r.stato).toBe(200);
    expect(r.json.diretta).toMatchObject({ stato: 'in_diretta', inizio: new Date(T0 - ORA).toISOString().slice(0, 19) + 'Z' });
    quando(T0 - ORA + 2 * ORA - 1000);
    expect((await diretta()).json.stato).toBe('in_diretta');
    quando(T0 - ORA + 2 * ORA);
    expect((await diretta()).json.stato).toBe('da_confermare');
  });

  it('e\' idempotente: una seconda pressione non sposta l\'inizio', async () => {
    const a = await ad('POST', `/api/admin/partite/${P}/diretta/inizia`);
    quando(T0 - ORA + 60 * 1000);
    const b = await ad('POST', `/api/admin/partite/${P}/diretta/inizia`);
    expect(b.stato).toBe(200);
    expect(b.json.diretta.inizio).toBe(a.json.diretta.inizio);
  });

  it('se e\' gia\' partita da sola fissa l\'inizio all\'orario della partita', async () => {
    quando(T0 + 5 * 60 * 1000);
    const r = await ad('POST', `/api/admin/partite/${P}/diretta/inizia`);
    expect(r.json.diretta).toMatchObject({ stato: 'in_diretta', inizio: ORARIO });
    expect(righe('SELECT diretta_iniziata_il i FROM partite WHERE id = ?', P)[0].i).toBe(ORARIO);
  });

  it('409 senza squadre (e il messaggio manda alla sezione Squadre); 404 partita inesistente; 409 se giocata o finita', async () => {
    db.esegui('UPDATE partecipazioni SET squadra = NULL WHERE partita_id = ?', P);
    const r = await ad('POST', `/api/admin/partite/${P}/diretta/inizia`);
    expect(r.stato).toBe(409);
    expect(r.json.errore).toContain('Squadre');
    expect(righe('SELECT diretta_iniziata_il i FROM partite WHERE id = ?', P)[0].i).toBeNull();
    expect((await ad('POST', '/api/admin/partite/999/diretta/inizia')).stato).toBe(404);
    expect((await ad('POST', '/api/admin/partite/abc/diretta/inizia')).stato).toBe(404);
    db.esegui("UPDATE partecipazioni SET squadra = CASE WHEN giocatore_id IN (?, ?) THEN 'A' ELSE 'B' END WHERE partita_id = ? AND giocatore_id != ?", R, Bi, P, Gi);
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/inizia`)).stato).toBe(200);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/inizia`)).stato).toBe(409); // gia' finita
  });
});

describe('POST .../diretta/eventi', () => {
  beforeEach(() => quando(T0 + 5 * 60 * 1000)); // in diretta

  it('registra un gol: la squadra si deduce dal giocatore; 201 con l\'evento e lo stato', async () => {
    const id = uuid();
    const r = await gol(R, 'gol', id);
    expect(r.stato).toBe(201);
    expect(r.json.evento).toMatchObject({ id_client: id, tipo: 'gol', squadra: 'A', giocatore_id: R, nome: 'Rossi M.', annullato: false });
    expect(r.json.diretta.squadre.map((s: any) => s.gol)).toEqual([1, 0]);
    expect(r.json.diretta.eventi).toHaveLength(1);
  });

  it('un AUTOGOL vale per la squadra AVVERSARIA (come tutto il resto del codice)', async () => {
    const r = await gol(R, 'autogol'); // Rossi e' di A: il punto va a B
    expect(r.json.evento).toMatchObject({ tipo: 'autogol', squadra: 'B', giocatore_id: R });
    expect(r.json.diretta.squadre.map((s: any) => s.gol)).toEqual([0, 1]);
    const v = await gol(V, 'autogol'); // Verdi e' di B: il punto va ad A
    expect(v.json.evento.squadra).toBe('A');
    expect(v.json.diretta.squadre.map((s: any) => s.gol)).toEqual([1, 1]);
  });

  it('con un id_client gia\' visto risponde 200 con l\'evento che c\'e\', senza duplicarlo (anche se i campi cambiano)', async () => {
    const id = uuid();
    const a = await gol(R, 'gol', id);
    const b = await gol(R, 'gol', id);
    const c = await gol(V, 'autogol', id); // stesso id_client, altri valori: vale il primo invio
    expect([a.stato, b.stato, c.stato]).toEqual([201, 200, 200]);
    expect(b.json.evento.id).toBe(a.json.evento.id);
    expect(c.json.evento).toMatchObject({ id: a.json.evento.id, tipo: 'gol', giocatore_id: R });
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(1);
  });

  it('un invio ripetuto riesce anche DOPO che il gol e\' stato annullato (non risorge) e dopo la fine', async () => {
    const id = uuid();
    const a = await gol(R, 'gol', id);
    await ad('DELETE', `/api/admin/partite/${P}/diretta/eventi/${id}`);
    const b = await gol(R, 'gol', id);
    expect(b.stato).toBe(200);
    expect(b.json.evento.annullato).toBe(true);
    expect(b.json.diretta.eventi).toHaveLength(0);
    const id2 = uuid();
    await gol(V, 'gol', id2);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await gol(V, 'gol', id2)).stato).toBe(200);
    expect(a.json.evento.id).toBeGreaterThan(0);
  });

  it('un id_client gia\' usato per un\'ALTRA partita e\' rifiutato (409)', async () => {
    const id = uuid();
    await gol(R, 'gol', id);
    const altra = partita(db, { stagione: 1, data_ora: ORARIO, righe: [{ g: R, sq: 'A' }, { g: V, sq: 'B' }] });
    quando(T0 + 5 * 60 * 1000);
    const r = await gol(R, 'gol', id, altra);
    expect(r.stato).toBe(409);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(1);
  });

  it('rifiuta i campi non validi (400, col nome del campo)', async () => {
    const cattivi: [string, unknown][] = [
      ['id_client', undefined], ['id_client', ''], ['id_client', 'corto'], ['id_client', '12345678'], ['id_client', 'a'.repeat(65)], ['id_client', 'con spazio qui'], ['id_client', "x'; DROP TABLE eventi_partita;--"], ['id_client', 42], ['id_client', null],
    ];
    for (const [campo, valore] of cattivi) {
      const r = await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: valore, tipo: 'gol', giocatore_id: R });
      expect(r.stato, `${campo}=${String(valore)}`).toBe(400);
      expect(r.json.errore).toMatch(/^id_client:/);
    }
    for (const tipo of [undefined, '', 'assist', 'tiro', 'GOL', 1, null, ['gol']]) {
      const r = await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo, giocatore_id: R });
      expect(r.stato, String(tipo)).toBe(400);
      expect(r.json.errore).toMatch(/^tipo:/);
    }
    for (const g of [undefined, 0, -1, 1.5, '1', null, 1e20, [R]]) {
      const r = await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo: 'gol', giocatore_id: g });
      expect(r.stato, String(g)).toBe(400);
      expect(r.json.errore).toMatch(/^giocatore_id:/);
    }
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo: 'gol' })).stato).toBe(400);
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, undefined, { grezzo: '{non json', headers: { 'Content-Type': 'application/json' } })).stato).toBe(400);
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, undefined, { grezzo: '[]', headers: { 'Content-Type': 'application/json' } })).stato).toBe(400);
    expect((await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, undefined, { grezzo: '{}', headers: { 'Content-Type': 'text/plain' } })).stato).toBe(415);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(0);
  });

  it('rifiuta il giocatore che non e\' in campo: inesistente, convocato senza squadra, di un\'altra partita', async () => {
    const fuori = giocatore(db, 'Fuori R.');
    for (const g of [9999, Gi, fuori]) {
      const r = await gol(g);
      expect(r.stato, String(g)).toBe(400);
      expect(r.json.errore).toBe('giocatore_id: non è in campo in questa partita');
    }
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(0);
  });

  it('rifiuta se la partita non e\' in diretta (non iniziata) o e\' finita (da confermare, giocata); 404 se non esiste', async () => {
    quando(T0 - ORA);
    const prima = await gol(R);
    expect(prima.stato).toBe(409);
    expect(prima.json.errore).toMatch(/non è iniziata/);
    quando(T0 + 5 * 60 * 1000);
    expect((await gol(R)).stato).toBe(201);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    const dopo = await gol(R);
    expect(dopo.stato).toBe(409);
    expect(dopo.json.errore).toMatch(/finita/);
    await giocata(1, 0);
    expect((await gol(R)).json.errore).toMatch(/già giocata/);
    quando(T0 + 5 * ORA);
    expect((await gol(R, 'gol', uuid(), 999)).stato).toBe(404);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(1);
  });

  it('dopo le due ore (da confermare) non si registra piu\' niente', async () => {
    await gol(R);
    quando(T0 + 2 * ORA + 1000);
    expect((await gol(V)).stato).toBe(409);
  });

  it('limite di eventi per partita (MAX_EVENTI_DIRETTA), annullati compresi', async () => {
    expect(MAX_EVENTI_DIRETTA).toBe(200);
    for (let i = 0; i < MAX_EVENTI_DIRETTA; i++) db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client, annullato) VALUES (?, 'gol', 'A', ?, ?, ?)", P, R, `riempi-${String(i).padStart(5, '0')}`, i % 2);
    const r = await gol(R);
    expect(r.stato).toBe(409);
    expect(r.json.errore).toMatch(/troppi gol/);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(MAX_EVENTI_DIRETTA);
    // un invio ripetuto di uno gia' registrato riesce comunque
    expect((await gol(R, 'gol', 'riempi-00000')).stato).toBe(200);
  });
});

describe('concorrenza: due admin che segnano insieme', () => {
  beforeEach(() => quando(T0 + 5 * 60 * 1000));

  it('entrambi gli eventi sono registrati, in un ordine coerente, con id diversi', async () => {
    const [a, b, c] = await Promise.all([gol(R), gol(V), gol(N, 'autogol')]);
    expect([a.stato, b.stato, c.stato]).toEqual([201, 201, 201]);
    const lista = (await diretta()).json.eventi;
    expect(lista).toHaveLength(3);
    const ids = lista.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...ids].sort((x: number, y: number) => x - y)); // l'ordine di arrivo e' l'ordine dell'elenco
    expect(lista.map((e: any) => e.giocatore_id).sort()).toEqual([R, V, N].sort());
  });

  it('lo STESSO id_client inviato due volte insieme crea un solo evento', async () => {
    const id = uuid();
    const r = await Promise.all([gol(R, 'gol', id), gol(R, 'gol', id), gol(R, 'gol', id)]);
    expect(r.map((x) => x.stato).sort()).toEqual([200, 200, 201]);
    expect(new Set(r.map((x) => x.json.evento.id)).size).toBe(1);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(1);
  });

  it('due "annulla ultimo" con azioni diverse annullano due gol diversi; con la stessa azione, uno solo', async () => {
    for (const g of [R, Bi, V, N]) await gol(g);
    const [x, y] = await Promise.all([ad('POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: uuid() }), ad('POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: uuid() })]);
    expect([x.stato, y.stato]).toEqual([200, 200]);
    expect(new Set([x.json.evento.id, y.json.evento.id]).size).toBe(2);
    expect((await diretta()).json.eventi.map((e: any) => e.giocatore_id)).toEqual([R, Bi]);
    const id = uuid();
    const [p, q] = await Promise.all([ad('POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: id }), ad('POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: id })]);
    expect(p.json.evento.id).toBe(q.json.evento.id);
    expect((await diretta()).json.eventi).toHaveLength(1);
  });

  it('un gol che arriva mentre si preme "Fine partita" non si perde in silenzio: o e\' contato, o e\' rifiutato', async () => {
    await gol(R);
    const [f, g] = await Promise.all([ad('POST', `/api/admin/partite/${P}/diretta/fine`), gol(V)]);
    expect(f.stato).toBe(200);
    const contati = righe('SELECT COALESCE(SUM(gol), 0) n FROM partecipazioni WHERE partita_id = ?', P)[0].n;
    const registrati = righe('SELECT COUNT(*) n FROM eventi_partita WHERE annullato = 0')[0].n;
    expect(contati).toBe(registrati);
    expect(g.stato === 201 || g.stato === 409).toBe(true);
  });
});

describe('PATCH .../diretta/eventi/:eid', () => {
  let id: string;
  beforeEach(async () => {
    quando(T0 + 5 * 60 * 1000);
    id = uuid();
    await gol(R, 'gol', id);
  });
  const patch = (corpo: unknown, eid: string | number = id) => ad('PATCH', `/api/admin/partite/${P}/diretta/eventi/${eid}`, corpo);

  it('cambia il marcatore: la squadra si ricalcola dal nuovo giocatore', async () => {
    const r = await patch({ giocatore_id: V });
    expect(r.stato).toBe(200);
    expect(r.json.evento).toMatchObject({ giocatore_id: V, tipo: 'gol', squadra: 'B', nome: 'Verdi A.G.' });
    expect(r.json.diretta.squadre.map((s: any) => s.gol)).toEqual([0, 1]);
  });

  it('cambia il tipo (gol <-> autogol): il punto passa agli avversari', async () => {
    const r = await patch({ tipo: 'autogol' });
    expect(r.json.evento).toMatchObject({ tipo: 'autogol', squadra: 'B', giocatore_id: R });
    expect(r.json.diretta.squadre.map((s: any) => s.gol)).toEqual([0, 1]);
    expect((await patch({ tipo: 'gol', giocatore_id: Bi })).json.evento).toMatchObject({ tipo: 'gol', squadra: 'A', giocatore_id: Bi });
  });

  it('si indica con l\'id del server oppure con l\'id_client; e\' idempotente', async () => {
    const numerico = righe('SELECT id FROM eventi_partita WHERE id_client = ?', id)[0].id;
    expect((await patch({ giocatore_id: Bi }, numerico)).stato).toBe(200);
    expect((await patch({ giocatore_id: Bi }, id)).stato).toBe(200); // stessi valori: niente da fare, riesce
    expect(righe('SELECT giocatore_id g FROM eventi_partita')[0].g).toBe(Bi);
  });

  it('errori: corpo vuoto o tipo/giocatore non validi 400; giocatore non in campo 400; gol inesistente 404; annullato 409', async () => {
    expect((await patch({})).stato).toBe(400);
    expect((await patch({ tipo: 'assist' })).stato).toBe(400);
    expect((await patch({ giocatore_id: 'x' })).stato).toBe(400);
    const fuori = await patch({ giocatore_id: Gi });
    expect(fuori.stato).toBe(400);
    expect(fuori.json.errore).toBe('giocatore_id: non è in campo in questa partita');
    expect((await patch({ tipo: 'autogol' }, 'inesistente-123')).stato).toBe(404);
    expect((await patch({ tipo: 'autogol' }, 99999)).stato).toBe(404);
    expect((await patch({ tipo: 'autogol' }, 'abc')).stato).toBe(404);
    expect((await patch({ tipo: 'autogol' }, '0')).stato).toBe(404);
    await ad('DELETE', `/api/admin/partite/${P}/diretta/eventi/${id}`);
    expect((await patch({ tipo: 'autogol' })).stato).toBe(409);
    expect(righe('SELECT tipo, giocatore_id g FROM eventi_partita')[0]).toEqual({ tipo: 'gol', g: R });
  });

  it('un gol di un\'altra partita non si tocca (404)', async () => {
    const altra = partita(db, { stagione: 1, data_ora: ORARIO, righe: [{ g: R, sq: 'A' }, { g: V, sq: 'B' }] });
    expect((await ad('PATCH', `/api/admin/partite/${altra}/diretta/eventi/${id}`, { tipo: 'autogol' })).stato).toBe(404);
    expect((await ad('DELETE', `/api/admin/partite/${altra}/diretta/eventi/${id}`)).stato).toBe(404);
  });

  it('dopo la fine non si cambia piu\' (409), ma un invio ripetuto con gli stessi valori riesce', async () => {
    await patch({ giocatore_id: Bi });
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await patch({ giocatore_id: V })).stato).toBe(409);
    expect((await patch({ giocatore_id: Bi })).stato).toBe(200);
  });
});

describe('DELETE .../diretta/eventi/:eid e annulla-ultimo', () => {
  beforeEach(() => quando(T0 + 5 * 60 * 1000));
  const elimina = (eid: string | number) => ad('DELETE', `/api/admin/partite/${P}/diretta/eventi/${eid}`);
  const annulla = (...a: [unknown?]) => ad('POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: a.length ? a[0] : uuid() });

  it('elimina un gol dell\'elenco (annullamento logico: la riga resta, non conta piu\'); idempotente', async () => {
    const a = uuid();
    const b = uuid();
    await gol(R, 'gol', a);
    await gol(V, 'gol', b);
    const r = await elimina(a);
    expect(r.stato).toBe(200);
    expect(r.json.evento.annullato).toBe(true);
    expect(r.json.diretta.eventi.map((e: any) => e.giocatore_id)).toEqual([V]);
    expect(r.json.diretta.squadre.map((s: any) => s.gol)).toEqual([0, 1]);
    expect((await elimina(a)).stato).toBe(200); // gia' annullato: riesce
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(2);
    expect((await elimina('mai-esistito-1')).stato).toBe(404);
    expect((await elimina(99999)).stato).toBe(404);
  });

  it('dopo la fine non si elimina piu\' (409), se non un gol gia\' annullato', async () => {
    const a = uuid();
    await gol(R, 'gol', a);
    await gol(V, 'gol', uuid());
    await elimina(a);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await elimina(a)).stato).toBe(200);
    const vivo = righe('SELECT id FROM eventi_partita WHERE annullato = 0')[0].id;
    expect((await elimina(vivo)).stato).toBe(409);
  });

  it('annulla-ultimo toglie l\'ultimo gol, poi il penultimo; 409 quando non c\'e\' piu\' niente', async () => {
    await gol(R);
    await gol(V);
    const a = await annulla();
    expect(a.stato).toBe(200);
    expect(a.json.evento).toMatchObject({ giocatore_id: V, annullato: true });
    const b = await annulla();
    expect(b.json.evento).toMatchObject({ giocatore_id: R, annullato: true });
    expect(b.json.diretta.eventi).toEqual([]);
    const c = await annulla();
    expect(c.stato).toBe(409);
    expect(c.json.errore).toMatch(/nessun gol/);
  });

  it('annulla-ultimo e\' idempotente rispetto all\'id_client dell\'azione: una ripetizione non annulla un altro gol', async () => {
    await gol(R);
    await gol(V);
    await gol(N);
    const azione = uuid();
    const a = await annulla(azione);
    const b = await annulla(azione);
    expect([a.stato, b.stato]).toEqual([200, 200]);
    expect(b.json.evento.id).toBe(a.json.evento.id);
    expect(b.json.diretta.eventi.map((e: any) => e.giocatore_id)).toEqual([R, V]);
    // anche dopo che e' arrivato un altro gol
    await gol(Bi);
    expect((await annulla(azione)).json.evento.id).toBe(a.json.evento.id);
    expect((await diretta()).json.eventi.map((e: any) => e.giocatore_id)).toEqual([R, V, Bi]);
  });

  it('annulla-ultimo: id_client non valido 400; partita non in diretta 409; 404 partita inesistente', async () => {
    await gol(R);
    expect((await annulla('corto')).stato).toBe(400);
    expect((await annulla(undefined)).stato).toBe(400);
    expect((await ad('POST', '/api/admin/partite/999/diretta/annulla-ultimo', { id_client: uuid() })).stato).toBe(404);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await annulla()).stato).toBe(409);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita WHERE annullato = 0')[0].n).toBe(1);
  });
});

describe('POST .../diretta/fine', () => {
  beforeEach(() => quando(T0 + 5 * 60 * 1000));
  const fine = () => ad('POST', `/api/admin/partite/${P}/diretta/fine`);
  const partecipazione = (g: number) => righe('SELECT gol, autogol FROM partecipazioni WHERE partita_id = ? AND giocatore_id = ?', P, g)[0];

  it('calcola dagli eventi i gol e gli autogol per giocatore e li scrive nei campi della schermata Risultato', async () => {
    await gol(R);
    await gol(R);
    await gol(V);
    await gol(N, 'autogol'); // punto per A
    const eliminato = uuid();
    await gol(Bi, 'gol', eliminato);
    await ad('DELETE', `/api/admin/partite/${P}/diretta/eventi/${eliminato}`); // non conta
    const r = await fine();
    expect(r.stato).toBe(200);
    expect(r.json.diretta.stato).toBe('da_confermare');
    expect(r.json.risultato).toEqual({ A: 3, B: 1 }); // R, R, autogol di N  |  V
    expect(partecipazione(R)).toEqual({ gol: 2, autogol: 0 });
    expect(partecipazione(V)).toEqual({ gol: 1, autogol: 0 });
    expect(partecipazione(N)).toEqual({ gol: 0, autogol: 1 });
    expect(partecipazione(Bi)).toEqual({ gol: 0, autogol: 0 });
    // la partita resta "in convocazione": i voti e "giocata" come prima
    expect(righe('SELECT stato, gol_a, gol_b, diretta_finita_il f FROM partite WHERE id = ?', P)[0]).toMatchObject({ stato: 'convocazione', gol_a: null, gol_b: null });
    const dettaglio = (await pub(`/api/partite/${P}`)).json;
    expect(dettaglio.stato).toBe('convocazione');
    expect(dettaglio.squadre.map((s: any) => s.gol)).toEqual([null, null]); // il contratto di sempre: in convocazione i gol sono null
    expect((await pub(`/api/partite/${P}/diretta`)).json.stato).toBe('da_confermare');
  });

  it('i numeri tornano con la "giocata" e con le classifiche (stessi campi, stessa semantica)', async () => {
    await gol(R);
    await gol(R);
    await gol(V);
    await gol(N, 'autogol');
    const { json } = await fine();
    expect((await pub('/api/classifiche?stagione=sempre')).json.gol).toEqual([]); // non ancora giocata: non conta
    for (const g of [R, Bi, V, N]) db.esegui('UPDATE partecipazioni SET voto_pagella = 7 WHERE partita_id = ? AND giocatore_id = ?', P, g);
    const g = await giocata(json.risultato.A, json.risultato.B);
    expect(g.stato).toBe(200);
    expect(g.json.avvisi).toEqual([]); // i gol dei giocatori tornano col risultato
    expect(g.json.squadre.map((s: any) => s.gol)).toEqual([3, 1]);
    const classifica = (await pub('/api/classifiche?stagione=sempre')).json.gol;
    expect(classifica.map((r: any) => [r.nome, r.valore])).toEqual([['Rossi M.', 2], ['Verdi A.G.', 1]]);
    const scheda = (await pub(`/api/giocatori/${N}`)).json;
    expect(scheda.totali).toMatchObject({ gol: 0, autogol: 1 });
    // il voto MVP si apre solo con "giocata"
    expect((await pub(`/api/partite/${P}/mvp`)).json.stato).toBe('aperto');
  });

  it('e\' idempotente e NON ricalcola alla seconda pressione (le correzioni a mano restano)', async () => {
    await gol(R);
    await fine();
    db.esegui('UPDATE partecipazioni SET gol = 5 WHERE partita_id = ? AND giocatore_id = ?', P, R); // correzione dell'admin nella schermata Risultato
    const seconda = await fine();
    expect(seconda.stato).toBe(200);
    expect(partecipazione(R).gol).toBe(5);
  });

  it('funziona anche se e\' scaduta (da confermare) e nessuno l\'ha chiusa; 409 se non e\' iniziata o se e\' gia\' giocata; 404', async () => {
    await gol(V);
    quando(T0 + 3 * ORA);
    expect((await fine()).stato).toBe(200);
    expect(partecipazione(V).gol).toBe(1);
    const altra = partita(db, { stagione: 1, data_ora: '2027-01-01T19:00:00Z', righe: [{ g: R, sq: 'A' }, { g: V, sq: 'B' }] });
    expect((await ad('POST', `/api/admin/partite/${altra}/diretta/fine`)).stato).toBe(409);
    await giocata(0, 1);
    expect((await fine()).stato).toBe(409);
    expect((await ad('POST', '/api/admin/partite/999/diretta/fine')).stato).toBe(404);
  });

  it('senza gol: 0-0, tutti i contatori a zero', async () => {
    db.esegui('UPDATE partecipazioni SET gol = 3 WHERE partita_id = ?', P); // una cifra scritta prima
    const r = await fine();
    expect(r.json.risultato).toEqual({ A: 0, B: 0 });
    expect(partecipazione(R)).toEqual({ gol: 0, autogol: 0 });
  });
});

describe('durante la diretta chi ha segnato non si sposta dalla schermata Squadre', () => {
  it('PUT convocati che toglie o sposta un marcatore e\' rifiutato (409) finche\' la diretta e\' aperta; dopo la fine e\' libero', async () => {
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    const tutti = (squadre: Record<number, 'A' | 'B' | null>) => ({ convocati: Object.entries(squadre).map(([g, squadra]) => ({ giocatore_id: Number(g), squadra })) });
    const base = { [R]: 'A', [Bi]: 'A', [V]: 'B', [N]: 'B' } as const;
    expect((await ad('PUT', `/api/admin/partite/${P}/convocati`, tutti({ ...base, [R]: 'B' }))).stato).toBe(409);
    expect((await ad('PUT', `/api/admin/partite/${P}/convocati`, tutti({ [Bi]: 'A', [V]: 'B', [N]: 'B' }))).stato).toBe(409); // tolto
    expect((await ad('PUT', `/api/admin/partite/${P}/convocati`, tutti({ ...base, [V]: 'A' }))).stato).toBe(200); // un altro puo' muoversi
    expect((await ad('PUT', `/api/admin/partite/${P}/convocati`, tutti({ ...base, [R]: 'A' }))).stato).toBe(200);
    await ad('POST', `/api/admin/partite/${P}/diretta/fine`);
    expect((await ad('PUT', `/api/admin/partite/${P}/convocati`, tutti({ ...base, [R]: 'B' }))).stato).toBe(200);
  });
});

describe('rotte pubbliche', () => {
  it('GET /api/partite/:id/diretta: stato, punteggio, marcatori in ordine con nome, squadra e autogol; senza id_client ne\' livello', async () => {
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    await gol(V, 'autogol');
    await gol(N);
    const r = await pub(`/api/partite/${P}/diretta`);
    expect(r.stato).toBe(200);
    expect(r.json.stato).toBe('in_diretta');
    expect(r.json.squadre).toEqual([{ codice: 'A', nome: 'Casaccati', gol: 2 }, { codice: 'B', nome: 'Smollicati', gol: 1 }]);
    expect(r.json.eventi.map((e: any) => [e.nome, e.squadra, e.autogol])).toEqual([['Rossi M.', 'A', false], ['Verdi A.G.', 'A', true], ['Neri P.', 'B', false]]);
    expect(r.testo).not.toMatch(/id_client|evento-0|livello/i);
    expect(r.headers.get('Cache-Control')).toMatch(/no-store/);
    expect(r.headers.get('Content-Type')).toMatch(/application\/json/);
    // l'admin invece vede l'id_client
    expect((await diretta()).json.eventi[0].id_client).toMatch(/^evento-/);
    for (const brutto of ['/api/partite/abc/diretta', '/api/partite/0/diretta', '/api/partite/999/diretta']) expect((await pub(brutto)).stato).toBe(404);
  });

  it('un nome con codice HTML esce come testo JSON (nessuna interpretazione): nosniff e application/json', async () => {
    const xss = '<img src=x onerror=alert(1)>';
    db.esegui('UPDATE giocatori SET nome = ? WHERE id = ?', xss, R);
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    const r = await pub(`/api/partite/${P}/diretta`);
    expect(r.json.eventi[0].nome).toBe(xss);
    expect(r.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('/api/home e /api/diretta dicono se c\'e\' una partita in diretta (e il punteggio); null altrimenti', async () => {
    expect((await pub('/api/home')).json.diretta).toBeNull();
    expect((await pub('/api/diretta')).json).toEqual({ diretta: null });
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    const h = (await pub('/api/home')).json.diretta;
    expect(h).toMatchObject({ partita_id: P, stato: 'in_diretta', data_ora: ORARIO });
    expect(h.squadre.map((s: any) => s.gol)).toEqual([1, 0]);
    expect((await pub('/api/diretta')).json.diretta).toEqual(h);
    quando(T0 + 2 * ORA + 1000);
    expect((await pub('/api/home')).json.diretta).toMatchObject({ partita_id: P, stato: 'da_confermare' });
    await giocata(1, 0);
    expect((await pub('/api/home')).json.diretta).toBeNull();
  });

  it('se ce ne sono due, la home preferisce quella IN DIRETTA a quella da confermare', async () => {
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    quando(T0 + 2 * ORA + 1000); // la prima e' scaduta
    const seconda = partita(db, { stagione: 1, data_ora: new Date(T0 + 2 * ORA).toISOString().slice(0, 19) + 'Z', righe: [{ g: R, sq: 'A' }, { g: V, sq: 'B' }] });
    expect((await pub('/api/home')).json.diretta).toMatchObject({ partita_id: seconda, stato: 'in_diretta' });
  });

  it('niente cache: ogni risposta della diretta e\' no-store', async () => {
    for (const p of ['/api/diretta', `/api/partite/${P}/diretta`]) expect((await pub(p)).headers.get('Cache-Control')).toMatch(/no-store/);
  });
});

describe('sicurezza', () => {
  it('senza credenziali ogni rotta della diretta e\' chiusa: nessuna scrittura', async () => {
    quando(T0 + 5 * 60 * 1000);
    const prove: [string, string, unknown][] = [
      ['GET', `/api/admin/partite/${P}/diretta`, undefined],
      ['POST', `/api/admin/partite/${P}/diretta/inizia`, {}],
      ['POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo: 'gol', giocatore_id: R }],
      ['PATCH', `/api/admin/partite/${P}/diretta/eventi/1`, { tipo: 'autogol' }],
      ['DELETE', `/api/admin/partite/${P}/diretta/eventi/1`, undefined],
      ['POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: uuid() }],
      ['POST', `/api/admin/partite/${P}/diretta/fine`, {}],
    ];
    for (const [m, p, c] of prove) {
      const r = await chiama(db, m, p, { corpo: c });
      expect([401, 403], `${m} ${p}`).toContain(r.stato);
    }
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(0);
    expect(righe('SELECT diretta_iniziata_il i, diretta_finita_il f FROM partite WHERE id = ?', P)[0]).toEqual({ i: null, f: null });
  });

  it('da un altro sito (CSRF) nessuna scrittura della diretta, nemmeno con l\'accesso valido', async () => {
    quando(T0 + 5 * 60 * 1000);
    const evil = { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' };
    for (const [m, p, c] of [
      ['POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo: 'gol', giocatore_id: R }],
      ['POST', `/api/admin/partite/${P}/diretta/fine`, {}],
      ['POST', `/api/admin/partite/${P}/diretta/inizia`, {}],
      ['POST', `/api/admin/partite/${P}/diretta/annulla-ultimo`, { id_client: uuid() }],
    ] as [string, string, unknown][]) {
      expect((await ad(m, p, c, { headers: evil })).stato, `${m} ${p}`).toBe(403);
    }
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(0);
  });

  it('un corpo oltre 64 KB e\' rifiutato (413)', async () => {
    quando(T0 + 5 * 60 * 1000);
    const r = await ad('POST', `/api/admin/partite/${P}/diretta/eventi`, { id_client: uuid(), tipo: 'gol', giocatore_id: R, extra: 'x'.repeat(70_000) });
    expect(r.stato).toBe(413);
  });

  it('il livello segreto non compare in nessuna risposta della diretta, nemmeno quella dell\'admin', async () => {
    quando(T0 + 5 * 60 * 1000);
    const r = await gol(R);
    expect(r.testo).not.toMatch(/livello/i);
    expect((await diretta()).testo).not.toMatch(/livello/i);
  });

  it('cancellare la partita porta via i suoi gol; un giocatore con gol non si cancella (si archivia)', async () => {
    quando(T0 + 5 * 60 * 1000);
    await gol(R);
    expect((await ad('DELETE', `/api/admin/giocatori/${R}`)).stato).toBe(409);
    db.esegui('UPDATE partite SET diretta_iniziata_il = NULL WHERE id = ?', P);
    expect((await ad('DELETE', `/api/admin/partite/${P}`)).stato).toBe(200);
    expect(righe('SELECT COUNT(*) n FROM eventi_partita')[0].n).toBe(0);
  });
});

describe('migrazione 0005', () => {
  it('i tipi di evento stanno in una tabella (estendibile con una INSERT), non in un CHECK', () => {
    expect(righe('SELECT tipo FROM tipi_evento ORDER BY tipo').map((r) => r.tipo)).toEqual(['autogol', 'gol']);
    expect(() => db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client) VALUES (?, 'assist', 'A', ?, 'abcdefgh-1')", P, R)).toThrow(/FOREIGN KEY/);
    db.esegui("INSERT INTO tipi_evento (tipo) VALUES ('assist')");
    db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client) VALUES (?, 'assist', 'A', ?, 'abcdefgh-1')", P, R);
  });

  it('l\'id_client e l\'azione di annullamento sono unici; niente email nella tabella', () => {
    const colonne = righe('PRAGMA table_info(eventi_partita)').map((c) => c.name);
    expect(colonne).toEqual(['id', 'partita_id', 'tipo', 'squadra', 'giocatore_id', 'id_client', 'annullato', 'annullato_da', 'creato_il']);
    db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client) VALUES (?, 'gol', 'A', ?, 'abcdefgh-1')", P, R);
    expect(() => db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client) VALUES (?, 'gol', 'A', ?, 'abcdefgh-1')", P, R)).toThrow(/UNIQUE/);
    expect(() => db.esegui("INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client) VALUES (?, 'gol', 'C', ?, 'abcdefgh-2')", P, R)).toThrow(/CHECK/);
  });
});
