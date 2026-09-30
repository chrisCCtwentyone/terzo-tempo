/**
 * SQL injection: ogni query D1 usa parametri (bind), e i payload classici non ottengono niente.
 *
 * Due difese, entrambe provate:
 *  1. STATICA: nel codice di functions/ nessun SQL e' costruito concatenando testo che arriva dal client.
 *     Le uniche interpolazioni ammesse sono in un elenco, ciascuna motivata (segnaposti "?", costanti).
 *  2. DINAMICA: su OGNI rotta (pubblica e admin, col bypass locale) si inviano payload da manuale in
 *     percorso, query string e corpo. Mai un 5xx, mai un messaggio di errore di SQLite, nessun dato in
 *     piu' (UNION), nessuna tabella toccata (DROP).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, FILE_ROTTE, chiama, rottaDi } from './rotte';

const RADICE = join(import.meta.dirname, '..');
const file = (dir: string): string[] =>
  readdirSync(join(RADICE, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? file(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));

describe('SQL: nessuna concatenazione di testo del client (analisi del codice)', () => {
  /** Le sole interpolazioni `${...}` ammesse dentro una stringa SQL, ciascuna con il motivo. */
  const AMMESSE = [
    'SELECT_ADMIN', // costante del codice (SELECT senza WHERE)
    'SELECT_CAMPO', // costante del codice (SELECT dei campi, senza WHERE)
    "ids.map(() => '?').join(',')", // solo segnaposti "?", uno per id (gli id vanno in bind)
    'tabella', // nome di tabella scritto nel codice dei chiamanti di aggiorna(), mai dal client
    "campi.map(([c]) => `${c} = ?`).join(', ')", // nomi di colonna scritti nel codice, valori in bind
    'c', // interno alla riga precedente
  ];

  it('ogni ${...} dentro un SQL e\' nell\'elenco ammesso', () => {
    const sospette: string[] = [];
    for (const f of file('functions')) {
      const src = readFileSync(join(RADICE, f), 'utf8');
      // template literal che contengono una parola chiave SQL
      for (const m of src.matchAll(/`([^`]|\\`)*`/g)) {
        const t = m[0];
        if (!/\b(SELECT|INSERT|UPDATE|DELETE|ORDER BY|WHERE|LIKE)\b/.test(t) || !t.includes('${')) continue;
        for (const e of t.matchAll(/\$\{([^}]*)\}/g)) if (!AMMESSE.includes(e[1].trim())) sospette.push(`${f}: \${${e[1]}}`);
      }
    }
    expect(sospette, 'interpolazione non ammessa in un SQL: usa bind(), o motivala in AMMESSE').toEqual([]);
  });

  it('nessuna stringa SQL costruita con "+" o con concat', () => {
    for (const f of file('functions')) {
      const src = readFileSync(join(RADICE, f), 'utf8');
      expect(src, f).not.toMatch(/['"`]\s*(SELECT|INSERT|UPDATE|DELETE)\b[^'"`]*['"`]\s*\+/i);
      expect(src, f).not.toMatch(/\bprepare\(\s*[a-zA-Z_]+\s*\+/);
    }
  });

  it('nessun ORDER BY / LIKE / nome di colonna dipende da un parametro di richiesta', () => {
    for (const f of file('functions')) {
      const src = readFileSync(join(RADICE, f), 'utf8');
      for (const riga of src.split('\n')) {
        if (/ORDER BY|LIKE/i.test(riga)) expect(riga, `${f}: ${riga.trim()}`).not.toMatch(/\$\{|\?ordine|searchParams/);
      }
    }
  });
});

/** Payload classici + casi limite di numeri e unicode. */
const PAYLOAD = [
  "' OR 1=1--",
  "1' OR '1'='1",
  '1; DROP TABLE giocatori;--',
  "1 UNION SELECT nome, livello_segreto, 3, 4 FROM giocatori--",
  "' UNION SELECT sql,2,3 FROM sqlite_master--",
  '1) OR (1=1',
  "%' OR '%'='",
  '"; DELETE FROM partite; --',
  "1'; ATTACH DATABASE '/tmp/x' AS x;--",
  '-1',
  '0',
  '99999999999999999999999999',
  '9007199254740993',
  '1e3',
  '0x10',
  'NaN',
  'Infinity',
  '1.5',
  '٣', // cifra araba
  '１２', // cifre a larghezza piena
  '\u0000',
  'ⓐⓓⓜⓘⓝ',
  '%00',
  'sempre%27%20OR%201=1--',
];

let db: D1Finto;
beforeEach(() => {
  db = new D1Finto(true);
  // nessuna richiesta di rete vera da questi test: il "Google" simulato risponde 404 ("link non riconosciuto")
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});
afterEach(() => vi.unstubAllGlobals());

/** Foto dello stato del DB: tabelle e numero di righe. */
function foto() {
  const tabelle = db.tutti<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
  return Object.fromEntries(tabelle.map((t) => [t, db.tutti<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0].n]));
}

const concreto = (rotta: string, p: string) => rotta.replace(/:\w+/g, encodeURIComponent(p));

function controlla(r: { stato: number; testo: string }, dove: string) {
  expect(r.stato, `${dove} -> ${r.stato} ${r.testo.slice(0, 120)}`).toBeLessThan(500);
  expect(r.testo, dove).not.toMatch(/sqlite|syntax error|SQLITE_|unrecognized token|no such (table|column)|D1_ERROR/i);
  expect(r.testo, `${dove}: dati che non dovrebbero comparire (UNION)`).not.toContain('sqlite_master');
  expect(r.testo, dove).not.toContain('CREATE TABLE');
}

describe('SQL: payload su ogni rotta pubblica e admin', () => {
  it('id nel percorso e parametri di query (stagione, tutti, cat...)', async () => {
    const prima = foto();
    let chiamate = 0;
    for (const f of FILE_ROTTE) {
      const rotta = rottaDi(f);
      const admin = rotta.startsWith('/api/admin/');
      const opzioni = admin ? { locale: true, env: ENV_BYPASS } : {};
      for (const p of PAYLOAD) {
        for (const metodo of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
          // le DELETE/POST valide con id "1" sono ammesse SOLO se il payload e' un numero vero: qui gli id sono sempre payload
          const r = await chiama(db, metodo, concreto(rotta, p), { ...opzioni, corpo: metodo === 'GET' || metodo === 'DELETE' ? undefined : {} });
          controlla(r, `${metodo} ${rotta} con id ${JSON.stringify(p)}`);
          chiamate++;
        }
        // stessa rotta, con il payload nella query string (stagione, tutti, id...)
        if (!admin) {
          for (const chiave of ['stagione', 'tutti', 'cat', 'id', 'ordine', 'q']) {
            const r = await chiama(db, 'GET', `${concreto(rotta, '1')}?${chiave}=${encodeURIComponent(p)}`);
            controlla(r, `GET ${rotta}?${chiave}=${JSON.stringify(p)}`);
            chiamate++;
          }
        }
      }
    }
    expect(chiamate).toBeGreaterThan(1000);
    // nessuna tabella persa, nessuna riga cancellata da un DROP/DELETE iniettato
    expect(foto()).toEqual(prima);
  }, 120_000);

  it('payload nei campi dei corpi JSON di tutte le rotte di scrittura admin', async () => {
    const corpi = (p: string): Record<string, unknown>[] => [
      { nome: p, descrizione: p, tipo: p, cognome: p, iniziali: p, cronaca: p, data_ora: p, data_inizio: p, data_fine: p, seed: p, stagione_id: p, giocatore_id: p, gol_a: p, gol_b: p, badge_ids: [p], giocatori: [p], convocati: [{ giocatore_id: p, squadra: p, pos_x: p, pos_y: p, gol: p, autogol: p, voto_pagella: p }], livello_segreto: p, attivo: p, aperta: p, link: p, campo_id: p, lat: p, lng: p, archiviato: p },
      { giocatore_id: 1, nome: p }, // id validi, testi malevoli
      { campo_id: 1, nome: `Campo ${Math.random()}`, link: `https://maps.app.goo.gl/${p}`, lat: 1, lng: 2 }, // campi: id validi, testi malevoli
    ];
    let chiamate = 0;
    for (const f of FILE_ROTTE.filter((x) => rottaDi(x).startsWith('/api/admin/'))) {
      for (const p of PAYLOAD) {
        for (const c of corpi(p)) {
          for (const metodo of ['POST', 'PUT', 'PATCH']) {
            const r = await chiama(db, metodo, rottaDi(f).replace(/:\w+/g, '3'), { locale: true, env: ENV_BYPASS, corpo: c });
            // un nome di campo (fino a 80 caratteri) si salva COME TESTO e torna identico: quell'eco e' il dato, non un'uscita di SQL
            const eco = JSON.stringify(p).slice(1, -1);
            const visto = rottaDi(f).startsWith('/api/admin/campi') ? { ...r, testo: r.testo.split(eco).join('[eco]').split(encodeURIComponent(p)).join('[eco]') } : r;
            controlla(visto, `${metodo} ${rottaDi(f)} corpo ${JSON.stringify(c).slice(0, 80)}`);
            chiamate++;
          }
        }
      }
    }
    expect(chiamate).toBeGreaterThan(1000);
    // le tabelle esistono ancora tutte (nessun DROP), e non e' uscito niente di sqlite_master
    expect(foto()).toHaveProperty('giocatori');
    expect(foto()).toHaveProperty('voti_mvp');
  }, 120_000);

  it('il voto MVP con payload nel giocatore_id e nel percorso', async () => {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (77, 2, '2999-01-01T19:00:00Z', 'giocata', 1, 0)");
    const prima = db.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n;
    for (const p of PAYLOAD) {
      for (const g of [p, [p], { a: p }, null, true]) {
        const r = await chiama(db, 'POST', '/api/partite/77/mvp', { corpo: { giocatore_id: g } });
        controlla(r, `voto con giocatore_id ${JSON.stringify(g)}`);
        expect(r.stato).toBe(400);
      }
      controlla(await chiama(db, 'POST', `/api/partite/${encodeURIComponent(p)}/mvp`, { corpo: { giocatore_id: 1 } }), `voto su partita ${p}`);
    }
    expect(db.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n).toBe(prima);
  });

  it('un nome con apici e SQL dentro si salva come TESTO e torna identico (bind)', async () => {
    const strano = "Robert'); DROP TABLE giocatori;--";
    const r = await chiama(db, 'POST', '/api/admin/badge', { locale: true, env: ENV_BYPASS, corpo: { nome: strano, tipo: 'positivo' } });
    expect(r.stato).toBe(201);
    expect(r.json.nome).toBe(strano);
    expect(db.tutti<{ nome: string }>('SELECT nome FROM badge WHERE nome = ?', strano)).toHaveLength(1);
    expect(foto()).toHaveProperty('giocatori');
    // e lo restituisce l'API pubblica dei giocatori (badge assegnato) come testo
    const g = await chiama(db, 'PUT', '/api/admin/giocatori/1/badge', { locale: true, env: ENV_BYPASS, corpo: { badge_ids: [r.json.id] } });
    expect(g.stato).toBe(200);
    const pubblico = await chiama(db, 'GET', '/api/giocatori/1');
    expect(pubblico.json.giocatore.badge[0].nome).toBe(strano);
  });
});
