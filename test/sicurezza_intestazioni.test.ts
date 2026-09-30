/**
 * Intestazioni di sicurezza e fuga di informazioni: su OGNI tipo di risposta (200, 404, 405, 415, 401, 403,
 * 500, pagina dell'app), la CSP e' rigorosa e non compare mai "livello" ne' un dettaglio interno.
 */
import { describe, expect, it } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_ADMIN, ENV_BYPASS, FILE_ROTTE, chiama, rottaDi } from './rotte';

const db = new D1Finto(true);

/** Le direttive della CSP come mappa nome -> valori. */
function direttive(csp: string): Map<string, string[]> {
  return new Map(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [n, ...v] = d.split(/\s+/); return [n, v] as [string, string[]]; }));
}

const RISPOSTE: [string, () => ReturnType<typeof chiama>][] = [
  ['200 pubblica', () => chiama(db, 'GET', '/api/home')],
  ['200 pagina dell\'app', () => chiama(db, 'GET', '/classifiche')],
  ['404 rotta inesistente', () => chiama(db, 'GET', '/api/non-esiste')],
  ['404 id', () => chiama(db, 'GET', '/api/giocatori/99999')],
  ['404 /lib', () => chiama(db, 'GET', '/lib/access.ts')],
  ['405', () => chiama(db, 'DELETE', '/api/stagioni')],
  ['415', () => chiama(db, 'POST', '/api/partite/10/mvp', { grezzo: 'x', headers: { 'Content-Type': 'text/plain' } })],
  ['409 voto', () => chiama(db, 'POST', '/api/partite/10/mvp', { corpo: { giocatore_id: 1 } })],
  ['401 admin', () => chiama(db, 'GET', '/api/admin/giocatori', { env: ENV_ADMIN })],
  ['403 admin non configurato', () => chiama(db, 'GET', '/api/admin/giocatori', { env: {}, token: 'a.b.c' })],
  ['403 CSRF', () => chiama(db, 'POST', '/api/admin/badge', { headers: { 'Sec-Fetch-Site': 'cross-site' }, corpo: {} })],
  ['HEAD', () => chiama(db, 'HEAD', '/api/home')],
  ['OPTIONS pubblica', () => chiama(db, 'OPTIONS', '/api/home')],
  ['OPTIONS admin', () => chiama(db, 'OPTIONS', '/api/admin/me', { env: ENV_ADMIN })],
  ['500', () => chiama(db, 'GET', '/api/stagioni', { env: { DB: { prepare: () => { throw new Error('segreto-interno'); } } as never } })],
  ['200 admin (locale)', () => chiama(db, 'GET', '/api/admin/giocatori', { locale: true, env: ENV_BYPASS })],
];

describe('CSP rigorosa', () => {
  it('nessun unsafe-inline, nessun unsafe-eval, nessun jolly, nessun http:, e le direttive che chiudono le vie d\'attacco', async () => {
    const csp = (await chiama(db, 'GET', '/')).headers.get('Content-Security-Policy')!;
    expect(csp).toBeTruthy();
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|wasm-unsafe-eval|\*|http:(?!\/)|blob:.*script/);
    const d = direttive(csp);
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('script-src')).toEqual(["'self'"]);
    expect(d.get('style-src')).toEqual(["'self'"]);
    expect(d.get('connect-src')).toEqual(["'self'"]);
    expect(d.get('font-src')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'none'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('frame-src')).toEqual(["'none'"]);
    expect(d.get('worker-src')).toEqual(["'none'"]);
    expect(d.has('upgrade-insecure-requests')).toBe(true);
    // le immagini possono essere data: (icone) ma mai da altri siti
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
  });
});

describe('intestazioni su ogni tipo di risposta', () => {
  for (const [nome, prova] of RISPOSTE) {
    it(nome, async () => {
      const r = await prova();
      const h = r.headers;
      expect(h.get('X-Content-Type-Options')).toBe('nosniff');
      expect(h.get('Referrer-Policy')).toBe('no-referrer');
      expect(h.get('X-Frame-Options')).toBe('DENY');
      expect(h.get('Strict-Transport-Security')).toMatch(/^max-age=\d{7,}/);
      expect(Number(/max-age=(\d+)/.exec(h.get('Strict-Transport-Security')!)![1])).toBeGreaterThanOrEqual(15768000);
      expect(h.get('Permissions-Policy')).toMatch(/camera=\(\)/);
      expect(h.get('Permissions-Policy')).toMatch(/geolocation=\(\)/);
      expect(h.get('Permissions-Policy')).toMatch(/microphone=\(\)/);
      expect(h.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
      expect(h.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
      expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(h.get('Content-Security-Policy')).not.toContain('unsafe-');
      // nessuna intestazione che riveli il server o permetta a un altro sito di leggere le risposte
      expect(h.get('Access-Control-Allow-Origin')).toBeNull();
      expect(h.get('Access-Control-Allow-Credentials')).toBeNull();
      expect(h.get('X-Powered-By')).toBeNull();
      expect(h.get('Server')).toBeNull();
    });
  }
});

describe('nessuna fuga di informazioni', () => {
  it('"livello" non compare in nessun corpo o intestazione pubblici, compresi 404, 405, 415, 409 e 500', async () => {
    for (const [nome, prova] of RISPOSTE.filter(([n]) => !n.includes('admin (locale)'))) {
      const r = await prova();
      const tutto = `${r.testo}\n${[...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')}`;
      expect(tutto, nome).not.toMatch(/livello/i);
      expect(tutto, nome).not.toMatch(/segreto-interno|at \w+ \(|node_modules|\.ts:\d+/);
    }
  });

  it('errori: mai lo stack, mai il messaggio dell\'eccezione, mai un percorso di file', async () => {
    const r = await chiama(db, 'GET', '/api/stagioni', { env: { DB: { prepare: () => { throw new Error('D1_ERROR: no such table: segreti at /srv/x.ts:12:3'); } } as never } });
    expect(r.stato).toBe(500);
    expect(r.json).toEqual({ errore: 'errore interno del servizio: riprova fra poco' });
  });

  it('risposte JSON: Cache-Control no-store, Content-Type JSON esatto', async () => {
    for (const f of FILE_ROTTE.filter((x) => !rottaDi(x).startsWith('/api/admin/'))) {
      const rotta = rottaDi(f).replace(/:\w+/g, '1');
      const r = await chiama(db, 'GET', rotta);
      if (r.stato === 405) continue;
      expect(r.headers.get('Cache-Control'), rotta).toContain('no-store');
      expect(r.headers.get('Content-Type'), rotta).toBe('application/json; charset=utf-8');
    }
  });

  it('OPTIONS e HEAD su rotte admin: mai 200 senza accesso', async () => {
    for (const m of ['OPTIONS', 'HEAD', 'TRACE', 'CONNECT', 'PROPFIND']) {
      const r = await chiama(db, m, '/api/admin/giocatori', { env: ENV_ADMIN }).catch(() => null);
      if (r) expect([401, 403]).toContain(r.stato);
    }
  });

  it('nessun livello_segreto neanche nei messaggi di errore delle rotte pubbliche con id o parametri strani', async () => {
    for (const p of ['/api/giocatori/abc', '/api/giocatori/-1', '/api/giocatori/1?stagione=x', '/api/partite/1?stagione=%27', '/api/classifiche?stagione=99999999999999999999']) {
      const r = await chiama(db, 'GET', p);
      expect(r.testo + JSON.stringify([...r.headers])).not.toMatch(/livello/i);
    }
  });
});
