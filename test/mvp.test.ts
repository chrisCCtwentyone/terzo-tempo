import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esitoVoti } from '../functions/lib/mvp';
import { NOMI, giocatore, partita, stagione } from './aiuti';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, chiama } from './rotte';

const T = '2026-09-24T19:00:00Z'; // ora della partita
const ORA = Date.parse(T);
const H = 3600_000;
const a = (ms: number) => vi.setSystemTime(ORA + ms);

/** Un "telefono": ricorda il cookie che il server gli ha dato. */
function telefono(db: D1Finto) {
  let cookie: string | undefined;
  return {
    get cookie() { return cookie; },
    async vota(idPartita: number, giocatoreId: unknown) {
      const r = await chiama(db, 'POST', `/api/partite/${idPartita}/mvp`, { corpo: { giocatore_id: giocatoreId }, cookie });
      const set = r.headers.get('Set-Cookie');
      if (set) cookie = set.split(';')[0];
      return { ...r, set };
    },
    stato: (idPartita: number) => chiama(db, 'GET', `/api/partite/${idPartita}/mvp`, { cookie }),
  };
}

function scenario(opzioni: { giocata?: boolean } = {}) {
  const db = new D1Finto();
  const R = giocatore(db, NOMI.R), B = giocatore(db, NOMI.B), V = giocatore(db, NOMI.V), N = giocatore(db, NOMI.N);
  const s = stagione(db, 'Stagione', true);
  const id = partita(db, {
    stagione: s, data_ora: T, gol: opzioni.giocata === false ? undefined : [1, 0],
    righe: [{ g: R, sq: 'A', gol: 1 }, { g: V, sq: 'A' }, { g: B, sq: 'B' }],
  });
  return { db, R, B, V, N, id };
}

const admin = (db: D1Finto, metodo: string, percorso: string, corpo?: unknown) => chiama(db, metodo, percorso, { corpo, locale: true, env: ENV_BYPASS });

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('esitoVoti (puro)', () => {
  it('vincitore, parita\', nessun voto', () => {
    expect(esitoVoti([{ giocatore_id: 1, voti: 3 }, { giocatore_id: 2, voti: 1 }])).toMatchObject({ stato: 'assegnato', vincitore: 1 });
    expect(esitoVoti([{ giocatore_id: 1, voti: 2 }, { giocatore_id: 2, voti: 2 }, { giocatore_id: 3, voti: 1 }])).toMatchObject({ stato: 'parita_da_decidere', candidati: [1, 2], vincitore: null });
    expect(esitoVoti([])).toMatchObject({ stato: 'nessun_voto', vincitore: null });
  });
});

describe('voto MVP', () => {
  it('cookie HttpOnly/Secure/SameSite=Lax, e nel DB solo l\'hash del token', async () => {
    const { db, R, id } = scenario();
    a(H);
    const t = telefono(db);
    const r = await t.vota(id, R);
    expect(r.stato).toBe(201);
    expect(r.set).toMatch(/^tt_dispositivo=[0-9a-f]{64};/);
    for (const parte of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(r.set).toContain(parte);
    const token = t.cookie!.split('=')[1];
    const righe = db.tutti<{ hash_token: string }>('SELECT hash_token FROM voti_mvp');
    expect(righe).toHaveLength(1);
    expect(righe[0].hash_token).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(db.tutti('SELECT * FROM voti_mvp'))).not.toContain(token);
  });

  it('un voto per dispositivo per partita: il secondo e\' 409', async () => {
    const { db, R, B, id } = scenario();
    a(H);
    const t = telefono(db);
    expect((await t.vota(id, R)).stato).toBe(201);
    const secondo = await t.vota(id, B);
    expect(secondo.stato).toBe(409);
    expect(secondo.set).toBeNull();
    expect(db.tutti('SELECT * FROM voti_mvp')).toHaveLength(1);
    // un altro telefono vota, con un altro token
    const altro = telefono(db);
    expect((await altro.vota(id, B)).stato).toBe(201);
    expect(altro.cookie).not.toBe(t.cookie);
  });

  it('si puo\' votare se stessi e chi non ha giocato; non chi non e\' nel listone', async () => {
    const { db, R, N, id } = scenario();
    a(H);
    expect((await telefono(db).vota(id, R)).stato).toBe(201); // R ha giocato (anche se stesso)
    expect((await telefono(db).vota(id, N)).stato).toBe(201); // N non ha giocato
    expect((await telefono(db).vota(id, 999)).stato).toBe(400);
    const archiviato = giocatore(db, 'X. Vecchio', null, 0);
    expect((await telefono(db).vota(id, archiviato)).stato).toBe(400);
    expect((await telefono(db).vota(id, 'uno')).stato).toBe(400);
  });

  it('un voto sbagliato non consuma il dispositivo', async () => {
    const { db, R, id } = scenario();
    a(H);
    const t = telefono(db);
    expect((await t.vota(id, 999)).stato).toBe(400);
    expect((await t.vota(id, R)).stato).toBe(201);
  });

  it('richiesta non JSON o da un altro sito: rifiutata', async () => {
    const { db, id } = scenario();
    a(H);
    expect((await chiama(db, 'POST', `/api/partite/${id}/mvp`, { grezzo: 'x', headers: { 'Content-Type': 'text/plain' } })).stato).toBe(415);
    expect((await chiama(db, 'POST', `/api/partite/${id}/mvp`, { grezzo: '{', headers: { 'Content-Type': 'application/json' } })).stato).toBe(400);
    expect((await chiama(db, 'POST', `/api/partite/${id}/mvp`, { corpo: { giocatore_id: 1 }, headers: { Origin: 'https://sito-estraneo.example' } })).stato).toBe(403);
    expect(db.tutti('SELECT * FROM voti_mvp')).toHaveLength(0);
  });

  it('partita inesistente o ancora in convocazione: 404 / 409', async () => {
    const { db, R, id } = scenario({ giocata: false });
    a(H);
    expect((await telefono(db).vota(id, R)).stato).toBe(409);
    expect((await telefono(db).vota(777, R)).stato).toBe(404);
    expect((await telefono(db).stato(id)).json).toMatchObject({ stato: 'non_aperto', voti_totali: 0, chiude_il: null });
  });
});

describe('risultati nascosti mentre la votazione e\' aperta', () => {
  it('la GET dice solo quanti hanno votato e se questo dispositivo ha votato', async () => {
    const { db, R, B, id } = scenario();
    a(H);
    const io = telefono(db), tu = telefono(db), nessuno = telefono(db);
    await io.vota(id, R);
    await tu.vota(id, R);
    await telefono(db).vota(id, B);
    const mio = (await io.stato(id)).json;
    expect(mio).toEqual({ stato: 'aperto', voti_totali: 3, ha_votato: true, chiude_il: '2026-09-25T19:00:00Z' });
    expect((await nessuno.stato(id)).json).toEqual({ ...mio, ha_votato: false });

    // nemmeno il dettaglio partita e la home lasciano vedere i conteggi
    for (const percorso of [`/api/partite/${id}`, '/api/home']) {
      const t = (await chiama(db, 'GET', percorso, { cookie: io.cookie })).testo;
      for (const vietata of ['risultati', 'vincitore', 'candidati']) expect(t).not.toContain(`"${vietata}"`);
    }
    expect((await chiama(db, 'GET', `/api/partite/${id}`, { cookie: io.cookie })).json.mvp).toEqual(mio);
  });

  it('alla chiusura escono i risultati, con il vincitore', async () => {
    const { db, R, B, id } = scenario();
    a(H);
    await telefono(db).vota(id, R);
    await telefono(db).vota(id, R);
    await telefono(db).vota(id, B);
    a(25 * H);
    const { json } = await telefono(db).stato(id);
    expect(json).toMatchObject({ stato: 'assegnato', voti_totali: 3, vincitore: { giocatore_id: R, nome: 'M. Rossi' }, candidati: [] });
    expect(json.risultati.map((x: any) => [x.giocatore_id, x.voti])).toEqual([[R, 2], [B, 1]]);
  });
});

describe('finestra di 24 ore (chiusura lazy, senza cron)', () => {
  it('aperta fino a data_ora + 24h esclusa', async () => {
    const { db, R, B, id } = scenario();
    a(24 * H - 1000);
    expect((await telefono(db).vota(id, R)).stato).toBe(201);
    a(24 * H);
    const r = await telefono(db).vota(id, B);
    expect(r.stato).toBe(409);
    expect(r.json.errore).toContain('chiusa');
  });

  it('prima che l\'orario della partita arrivi si puo\' gia\' votare (partita segnata giocata)', async () => {
    const { db, R, id } = scenario();
    a(-H);
    expect((await telefono(db).vota(id, R)).stato).toBe(201);
  });

  it('la lettura dopo la scadenza chiude e salva; mvp_chiuso_il e\' la scadenza, non l\'ora della lettura', async () => {
    const { db, R, id } = scenario();
    a(H);
    await telefono(db).vota(id, R);
    expect(db.tutti<{ mvp_stato: string }>('SELECT mvp_stato FROM partite')[0].mvp_stato).toBe('aperto');
    a(72 * H);
    await chiama(db, 'GET', `/api/partite/${id}`);
    expect(db.tutti('SELECT mvp_stato, mvp_chiuso_il FROM partite')[0]).toMatchObject({ mvp_stato: 'assegnato', mvp_chiuso_il: '2026-09-25T19:00:00Z' });
    expect(db.tutti('SELECT giocatore_id FROM mvp_vincitori')).toEqual([{ giocatore_id: R }]);
  });

  it('senza voti: nessun_voto, nessun vincitore', async () => {
    const { db, id } = scenario();
    a(30 * H);
    expect((await telefono(db).stato(id)).json).toMatchObject({ stato: 'nessun_voto', voti_totali: 0, vincitore: null, risultati: [] });
    expect(db.tutti('SELECT * FROM mvp_vincitori')).toHaveLength(0);
  });

  it('partita caricata in ritardo: si chiude subito, nessuno puo\' votare giorni dopo', async () => {
    const { db, R, id } = scenario({ giocata: false });
    a(5 * 24 * H);
    for (const g of [1, 2, 3]) db.esegui("UPDATE partecipazioni SET squadra = ? WHERE giocatore_id = ?", g === 1 ? 'A' : 'B', g);
    expect((await admin(db, 'POST', `/api/admin/partite/${id}/giocata`, { gol_a: 1, gol_b: 0 })).stato).toBe(200);
    expect((await telefono(db).vota(id, R)).stato).toBe(409);
    expect((await telefono(db).stato(id)).json.stato).toBe('nessun_voto');
  });
});

describe('chiusura manuale (admin)', () => {
  it('chiude adesso, calcola il vincitore, poi i voti sono chiusi', async () => {
    const { db, R, B, id } = scenario();
    a(2 * H);
    await telefono(db).vota(id, B);
    const r = await admin(db, 'POST', `/api/admin/partite/${id}/mvp/chiudi`);
    expect(r.stato).toBe(200);
    expect(r.json).toMatchObject({ stato: 'assegnato', vincitore: { giocatore_id: B }, chiuso_il: '2026-09-24T21:00:00Z' });
    expect((await telefono(db).vota(id, R)).stato).toBe(409);
    expect((await admin(db, 'POST', `/api/admin/partite/${id}/mvp/chiudi`)).stato).toBe(409); // gia' chiusa
  });

  it('partita in convocazione: 409', async () => {
    const { db, id } = scenario({ giocata: false });
    expect((await admin(db, 'POST', `/api/admin/partite/${id}/mvp/chiudi`)).stato).toBe(409);
  });
});

describe('parita\'', () => {
  async function conParita() {
    const s = scenario();
    a(H);
    await telefono(s.db).vota(s.id, s.R);
    await telefono(s.db).vota(s.id, s.B);
    await telefono(s.db).vota(s.id, s.V);
    await telefono(s.db).vota(s.id, s.V);
    await telefono(s.db).vota(s.id, s.B);
    await telefono(s.db).vota(s.id, s.R); // R 2, B 2, V 2 ... tre pari merito
    return s;
  }

  it('stato "parita_da_decidere" con i candidati; nessun vincitore finche\' l\'admin non sceglie', async () => {
    const { db, R, B, V, id } = await conParita();
    const c = await admin(db, 'POST', `/api/admin/partite/${id}/mvp/chiudi`);
    expect(c.json).toMatchObject({ stato: 'parita_da_decidere', vincitore: null });
    expect(c.json.candidati.map((x: any) => x.giocatore_id).sort()).toEqual([R, B, V].sort());
    expect(db.tutti('SELECT * FROM mvp_vincitori')).toHaveLength(0);
    // vista pubblica: stessi dati
    expect((await telefono(db).stato(id)).json.stato).toBe('parita_da_decidere');
  });

  it('l\'admin sceglie solo fra i pari merito; il vincitore e\' uno solo', async () => {
    const s = scenario();
    a(H);
    await telefono(s.db).vota(s.id, s.R);
    await telefono(s.db).vota(s.id, s.R);
    await telefono(s.db).vota(s.id, s.B);
    await telefono(s.db).vota(s.id, s.B);
    await telefono(s.db).vota(s.id, s.V);
    await admin(s.db, 'POST', `/api/admin/partite/${s.id}/mvp/chiudi`);
    expect((await admin(s.db, 'POST', `/api/admin/partite/${s.id}/mvp/decidi`, { giocatore_id: s.V })).stato).toBe(400); // V non e' pari merito
    expect((await admin(s.db, 'POST', `/api/admin/partite/${s.id}/mvp/decidi`, { giocatore_id: s.B })).json).toMatchObject({ stato: 'assegnato', vincitore: { giocatore_id: s.B } });
    expect(db_vincitori(s.db)).toEqual([{ partita_id: s.id, giocatore_id: s.B }]);
    expect((await admin(s.db, 'POST', `/api/admin/partite/${s.id}/mvp/decidi`, { giocatore_id: s.R })).stato).toBe(409); // gia' deciso
  });

  it('decidere senza parita\' (o a votazione aperta): 409', async () => {
    const { db, R, id } = scenario();
    a(H);
    expect((await admin(db, 'POST', `/api/admin/partite/${id}/mvp/decidi`, { giocatore_id: R })).stato).toBe(409);
  });

  it('la parita\' emerge anche dalla chiusura lazy', async () => {
    const { db, R, B, id } = scenario();
    a(H);
    await telefono(db).vota(id, R);
    await telefono(db).vota(id, B);
    a(48 * H);
    expect((await telefono(db).stato(id)).json).toMatchObject({ stato: 'parita_da_decidere' });
  });
});

function db_vincitori(db: D1Finto) {
  return db.tutti('SELECT partita_id, giocatore_id FROM mvp_vincitori');
}
