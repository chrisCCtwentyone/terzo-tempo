/** Carte dei giocatori: /api/carte (pubblico), /api/carte/:id (immagine) e /api/admin/giocatori/:id/carta. Byte sintetici, nessuna immagine vera. */
import { describe, expect, it } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_ADMIN, ENV_BYPASS, chiama } from './rotte';
import { giocatore, NOMI } from './aiuti';

/** Magic bytes + riempimento qualsiasi. */
const finto = (testa: number[], lunghezza = 200) => Uint8Array.from({ length: lunghezza }, (_, i) => testa[i] ?? (i * 7) % 256);
const JPEG = finto([0xff, 0xd8, 0xff, 0xe0]);
const PNG = finto([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = finto([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

const carta = (db: D1Finto, id: number | string, binario: Uint8Array | undefined, tipo = 'image/jpeg', extra: object = {}) =>
  chiama(db, 'PUT', `/api/admin/giocatori/${id}/carta`, { locale: true, env: ENV_BYPASS, binario, headers: { 'Content-Type': tipo }, ...extra });
const scenario = () => {
  const db = new D1Finto();
  return { db, a: giocatore(db, NOMI.R, 5), b: giocatore(db, NOMI.B, 2) };
};
const righe = (db: D1Finto) => db.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM carte')[0].n;

describe('carica una carta (PUT)', () => {
  it('JPEG, PNG e WebP veri: salvati col tipo RICONOSCIUTO, risposta { versione }', async () => {
    const { db, a } = scenario();
    for (const [byte, tipo] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
      const r = await carta(db, a, byte, tipo);
      expect(r.stato, tipo).toBe(200);
      expect(r.json.versione).toBeGreaterThan(1_700_000_000_000);
      const riga = db.tutti<{ tipo: string; versione: number }>('SELECT tipo, versione FROM carte WHERE giocatore_id = ?', a);
      expect(riga).toEqual([{ tipo, versione: r.json.versione }]); // una sola riga: upsert
    }
  });

  it('tipo dichiarato maiuscolo o con parametri: accettato se i byte coincidono', async () => {
    const { db, a } = scenario();
    expect((await carta(db, a, JPEG, 'Image/JPEG; charset=binary')).stato).toBe(200);
  });

  it('magic bytes sbagliati, vuoto, troncato: 400, niente salvato', async () => {
    const { db, a } = scenario();
    for (const byte of [finto([0x00, 0x01, 0x02]), new Uint8Array(0), Uint8Array.of(0xff, 0xd8), new TextEncoder().encode('<html><script>alert(1)</script>'), new TextEncoder().encode('GIF89a')]) {
      expect((await carta(db, a, byte)).stato, String(byte.length)).toBe(400);
    }
    expect(righe(db)).toBe(0);
  });

  it('tipo dichiarato diverso dal reale: rifiutato (non si salva ne\' il dichiarato ne\' il reale)', async () => {
    const { db, a } = scenario();
    expect((await carta(db, a, PNG, 'image/jpeg')).stato).toBe(400);
    expect((await carta(db, a, JPEG, 'image/webp')).stato).toBe(400);
    expect((await carta(db, a, WEBP, 'image/png')).stato).toBe(400);
    // RIFF senza WEBP (es. un WAV)
    expect((await carta(db, a, finto([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]), 'image/webp')).stato).toBe(400);
    expect(righe(db)).toBe(0);
  });

  it('Content-Type non ammesso o assente (anche JSON): 415', async () => {
    const { db, a } = scenario();
    for (const tipo of ['application/json', 'text/plain', 'image/gif', 'image/svg+xml', 'application/octet-stream', '']) {
      expect((await carta(db, a, JPEG, tipo)).stato, tipo).toBe(415);
    }
    expect(righe(db)).toBe(0);
  });

  it('oltre 400 KB: 413, anche senza Content-Length dichiarato; 400 KB esatti passano', async () => {
    const { db, a } = scenario();
    const limite = 400 * 1024;
    expect((await carta(db, a, finto([0xff, 0xd8, 0xff], limite + 1))).stato).toBe(413);
    expect((await carta(db, a, finto([0xff, 0xd8, 0xff], limite), 'image/jpeg', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(limite + 1_000_000) } })).stato).toBe(413);
    expect(righe(db)).toBe(0);
    expect((await carta(db, a, finto([0xff, 0xd8, 0xff], limite))).stato).toBe(200);
  });

  it('giocatore inesistente o id malformato: 404, niente salvato', async () => {
    const { db } = scenario();
    for (const id of [999, 0, 'abc', '-1', '1.5']) expect((await carta(db, id, JPEG)).stato, String(id)).toBe(404);
    expect(righe(db)).toBe(0);
  });

  it('senza corpo: 400', async () => {
    const { db, a } = scenario();
    expect((await carta(db, a, undefined)).stato).toBe(400);
  });

  it('senza accesso admin: 401/403, niente salvato', async () => {
    const { db, a } = scenario();
    const r = await carta(db, a, JPEG, 'image/jpeg', { env: ENV_ADMIN, locale: false });
    expect([401, 403]).toContain(r.stato);
    expect(righe(db)).toBe(0);
  });

  it('da un altro sito: 403 anche col bypass, niente salvato; dallo stesso sito passa', async () => {
    const { db, a } = scenario();
    for (const headers of [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }] as Record<string, string>[]) {
      const r = await carta(db, a, JPEG, 'image/jpeg', { headers: { 'Content-Type': 'image/jpeg', ...headers } });
      expect(r.stato, JSON.stringify(headers)).toBe(403);
      const d = await chiama(db, 'DELETE', `/api/admin/giocatori/${a}/carta`, { locale: true, env: ENV_BYPASS, headers });
      expect(d.stato).toBe(403);
    }
    expect(righe(db)).toBe(0);
    expect((await carta(db, a, JPEG, 'image/jpeg', { headers: { 'Content-Type': 'image/jpeg', Origin: 'http://localhost:8788' } })).stato).toBe(200);
  });
});

describe('toglie la carta (DELETE)', () => {
  it('idempotente; 404 solo per il giocatore inesistente; l\'altra carta resta', async () => {
    const { db, a, b } = scenario();
    await carta(db, a, JPEG);
    await carta(db, b, PNG, 'image/png');
    const del = (id: number | string) => chiama(db, 'DELETE', `/api/admin/giocatori/${id}/carta`, { locale: true, env: ENV_BYPASS });
    expect((await del(a)).json).toEqual({ ok: true });
    expect((await del(a)).json).toEqual({ ok: true });
    expect((await del(999)).stato).toBe(404);
    expect((await del('abc')).stato).toBe(404);
    expect(db.tutti('SELECT giocatore_id FROM carte')).toEqual([{ giocatore_id: b }]);
  });

  it('cancellando il giocatore sparisce anche la carta (ON DELETE CASCADE)', async () => {
    const { db, a } = scenario();
    await carta(db, a, JPEG);
    expect(righe(db)).toBe(1);
    expect((await chiama(db, 'DELETE', `/api/admin/giocatori/${a}`, { locale: true, env: ENV_BYPASS })).json).toEqual({ ok: true });
    expect(righe(db)).toBe(0);
  });

  it('altri metodi sulla rotta: 405', async () => {
    const { db, a } = scenario();
    for (const m of ['GET', 'POST', 'PATCH']) expect((await chiama(db, m, `/api/admin/giocatori/${a}/carta`, { locale: true, env: ENV_BYPASS })).stato, m).toBe(405);
  });
});

describe('lettura pubblica', () => {
  it('GET /api/carte: solo id -> versione, vuoto se non ce ne sono', async () => {
    const { db, a, b } = scenario();
    const vuoto = await chiama(db, 'GET', '/api/carte');
    expect(vuoto.stato).toBe(200);
    expect(vuoto.json).toEqual({ carte: {} });
    expect(vuoto.headers.get('Cache-Control')).toContain('no-store');
    const v = (await carta(db, a, JPEG)).json.versione;
    const r = await chiama(db, 'GET', '/api/carte');
    expect(r.json).toEqual({ carte: { [a]: v } });
    expect(Object.keys(r.json)).toEqual(['carte']);
    expect(r.testo).not.toMatch(/livello|nome|immagine|tipo/i);
    expect(r.json.carte[b]).toBeUndefined();
  });

  it('GET /api/carte/:id: byte identici, tipo salvato, cache lunga, nosniff; ?v= ignorato', async () => {
    const { db, a, b } = scenario();
    await carta(db, a, WEBP, 'image/webp');
    for (const q of ['', '?v=123', '?v=abc']) {
      const r = await chiama(db, 'GET', `/api/carte/${a}${q}`);
      expect(r.stato).toBe(200);
      expect(r.headers.get('Content-Type')).toBe('image/webp');
      expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(Array.from(r.byte)).toEqual(Array.from(WEBP));
    }
    // senza carta, id malformato, id enorme: 404 JSON
    for (const id of [b, 999, 'abc', '0', '-1', '99999999999999999999']) {
      const r = await chiama(db, 'GET', `/api/carte/${id}`);
      expect(r.stato, String(id)).toBe(404);
      expect(r.json.errore).toBeTruthy();
    }
  });

  it('sostituire la carta cambia byte, tipo e versione', async () => {
    const { db, a } = scenario();
    const v1 = (await carta(db, a, JPEG)).json.versione;
    await new Promise((f) => setTimeout(f, 3));
    const v2 = (await carta(db, a, PNG, 'image/png')).json.versione;
    expect(v2).toBeGreaterThan(v1);
    const r = await chiama(db, 'GET', `/api/carte/${a}`);
    expect(r.headers.get('Content-Type')).toBe('image/png');
    expect(Array.from(r.byte)).toEqual(Array.from(PNG));
  });

  it('sul sito pubblico non si scrive: POST/PUT/DELETE su /api/carte = 405', async () => {
    const { db, a } = scenario();
    for (const m of ['POST', 'PUT', 'DELETE']) {
      expect((await chiama(db, m, '/api/carte')).stato, m).toBe(405);
      expect((await chiama(db, m, `/api/carte/${a}`)).stato, m).toBe(405);
    }
  });
});
