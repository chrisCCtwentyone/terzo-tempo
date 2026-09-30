/**
 * L'admin e' FAIL-CLOSED: senza credenziali valide, o con la configurazione
 * incompleta, ogni rotta /api/admin/* risponde 401/403 (mai aperto). Il bypass
 * di sviluppo funziona solo con DEV_ADMIN_BYPASS=1 E richiesta da localhost.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AUD, DOMINIO, EMAIL, b64url, chiaviIrraggiungibili, corpoValido, firma, nuovaChiave, pubblicaChiavi, type Chiave } from './accesso';
import { D1Finto } from './d1_finto';
import { ENV_ADMIN, ENV_BYPASS, ROTTE_ADMIN, chiama, rottaDi } from './rotte';

const db = new D1Finto(true);
let chiave: Chiave;
beforeAll(async () => {
  chiave = await nuovaChiave();
});
afterEach(() => vi.unstubAllGlobals());

const METODI = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
/** Percorso concreto di una rotta (":id" -> 1). */
const concreto = (file: string) => rottaDi(file).replace(/:\w+/g, '1');
const chiuso = (stato: number) => expect([401, 403]).toContain(stato);

describe('ogni rotta admin, senza credenziali', () => {
  it('ci sono rotte admin da provare', () => {
    expect(ROTTE_ADMIN.length).toBeGreaterThan(10);
  });

  for (const configurazione of [{}, { ...ENV_ADMIN }, { ACCESS_TEAM_DOMAIN: 'DA_COMPILARE', ACCESS_AUD: 'DA_COMPILARE', EMAIL_AUTORIZZATE: EMAIL }]) {
    it(`401/403 con ${JSON.stringify(Object.keys(configurazione)) === '[]' ? 'nessuna configurazione' : Object.keys(configurazione).join('+')}`, async () => {
      pubblicaChiavi([chiave.jwk]);
      for (const file of ROTTE_ADMIN) {
        for (const metodo of METODI) {
          const r = await chiama(db, metodo, concreto(file), { env: configurazione, corpo: metodo === 'GET' ? undefined : {} });
          chiuso(r.stato);
        }
      }
    });
  }

  it('anche con un percorso scritto in modo insolito', async () => {
    for (const p of ['/API/ADMIN/giocatori', '/api//admin/giocatori', '/api/%61dmin/giocatori', '/api/admin/../admin/giocatori', '/api/%2561dmin/giocatori', '/api\\admin/giocatori']) {
      chiuso((await chiama(db, 'GET', p, { env: ENV_ADMIN })).stato);
    }
  });

  it('nessun dato nella risposta di rifiuto', async () => {
    const r = await chiama(db, 'GET', '/api/admin/giocatori', { env: ENV_ADMIN });
    expect(r.json).toEqual({ errore: 'accesso richiesto' });
    expect(r.stato).toBe(401);
  });
});

describe('configurazione mancante: 403 anche con un token valido', () => {
  const casi: [string, Record<string, string>][] = [
    ['manca ACCESS_TEAM_DOMAIN', { ...ENV_ADMIN, ACCESS_TEAM_DOMAIN: '' }],
    ['manca ACCESS_AUD', { ...ENV_ADMIN, ACCESS_AUD: '' }],
    ['manca EMAIL_AUTORIZZATE', { ...ENV_ADMIN, EMAIL_AUTORIZZATE: '' }],
    ['EMAIL_AUTORIZZATE segnaposto', { ...ENV_ADMIN, EMAIL_AUTORIZZATE: 'DA_COMPILARE' }],
    ['ACCESS_AUD segnaposto', { ...ENV_ADMIN, ACCESS_AUD: 'DA_COMPILARE' }],
  ];
  for (const [nome, env] of casi) {
    it(nome, async () => {
      pubblicaChiavi([chiave.jwk]);
      const r = await chiama(db, 'GET', '/api/admin/giocatori', { env, token: await firma(chiave) });
      expect(r.stato).toBe(403);
      expect(r.json.errore).toContain('non configurato');
    });
  }
});

describe('il token di Access', () => {
  const con = async (corpo: Record<string, unknown>, k = chiave) => chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(k, corpo) });

  it('valido e con email autorizzata: passa', async () => {
    pubblicaChiavi([chiave.jwk]);
    const r = await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave) });
    expect(r.stato).toBe(200);
    expect(r.json).toEqual({ email: EMAIL });
    // l'intestazione del cookie di Access vale come l'intestazione del token
    const c = await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, cookie: `CF_Authorization=${await firma(chiave)}` });
    expect(c.stato).toBe(200);
  });

  it('email maiuscola/spazi: si confronta senza distinguere', async () => {
    pubblicaChiavi([chiave.jwk]);
    expect((await con({ ...corpoValido(), email: ` ${EMAIL.toUpperCase()} ` })).stato).toBe(200);
  });

  const rifiutati: [string, () => Promise<{ stato: number }>][] = [
    ['email non in elenco', () => con({ ...corpoValido(), email: 'altro@prova.invalid' })],
    ['senza email', () => con({ ...corpoValido(), email: undefined })],
    ['scaduto', () => con({ ...corpoValido(), exp: Math.floor(Date.now() / 1000) - 5 })],
    ['senza scadenza', () => con({ ...corpoValido(), exp: undefined })],
    ['AUD di un\'altra applicazione', () => con({ ...corpoValido(), aud: ['altra'] })],
    ['emittente diverso', () => con({ ...corpoValido(), iss: 'https://altro.cloudflareaccess.com' })],
    ['non ancora valido', () => con({ ...corpoValido(), nbf: Math.floor(Date.now() / 1000) + 3600 })],
    ['firmato con un\'altra chiave', async () => con(corpoValido(), { ...(await nuovaChiave()), jwk: chiave.jwk })],
    ['alg none', async () => chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(corpoValido()))}.` })],
    ['alg HS256', async () => chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave, corpoValido(), { alg: 'HS256', kid: chiave.jwk.kid }) })],
    ['token non JWT', async () => chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: 'abc' })],
    ['kid sconosciuto', async () => chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave, corpoValido(), { alg: 'RS256', kid: 'sconosciuta' }) })],
  ];
  for (const [nome, prova] of rifiutati) {
    it(`${nome}: 403`, async () => {
      pubblicaChiavi([chiave.jwk]);
      expect((await prova()).stato).toBe(403);
    });
  }

  it('chiavi pubbliche irraggiungibili: 503, mai aperto', async () => {
    chiaviIrraggiungibili();
    expect((await con(corpoValido())).stato).toBe(503);
  });

  it('usa il dominio e l\'AUD della configurazione', () => {
    expect(DOMINIO).toBe(ENV_ADMIN.ACCESS_TEAM_DOMAIN);
    expect(AUD).toBe(ENV_ADMIN.ACCESS_AUD);
  });
});

describe('bypass di sviluppo', () => {
  it('DEV_ADMIN_BYPASS=1 da localhost: passa', async () => {
    const r = await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, locale: true });
    expect(r.stato).toBe(200);
  });

  it('DEV_ADMIN_BYPASS=1 ma richiesta dal sito pubblico: chiuso', async () => {
    for (const file of ROTTE_ADMIN) {
      const r = await chiama(db, 'GET', concreto(file), { env: ENV_BYPASS });
      chiuso(r.stato);
    }
  });

  it('da localhost ma senza DEV_ADMIN_BYPASS (o con un valore diverso da "1"): chiuso', async () => {
    for (const env of [{}, { DEV_ADMIN_BYPASS: '0' }, { DEV_ADMIN_BYPASS: 'true' }, { DEV_ADMIN_BYPASS: '' }, { DEV_ADMIN_BYPASS: '1 ' }]) {
      chiuso((await chiama(db, 'GET', '/api/admin/me', { env, locale: true })).stato);
    }
  });

  it('un hostname che assomiglia a localhost non basta', async () => {
    for (const origine of ['https://localhost.evil.example', 'https://evil-localhost.example', 'https://x.localhost', 'https://127.0.0.2', 'https://terzo-tempo.pages.dev']) {
      const r = await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, origine });
      chiuso(r.stato);
    }
    // e 127.0.0.1 / [::1] sono davvero locali
    for (const origine of ['http://127.0.0.1:8788', 'http://[::1]:8788']) {
      expect((await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, origine })).stato).toBe(200);
    }
  });
});

describe('le rotte pubbliche restano pubbliche', () => {
  it('nessuna richiesta di accesso su /api/home', async () => {
    expect((await chiama(db, 'GET', '/api/home', { env: ENV_ADMIN })).stato).toBe(200);
  });
});
