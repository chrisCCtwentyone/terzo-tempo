/**
 * Autenticazione e autorizzazione dell'admin: prove da attaccante. Completa test/admin_chiuso.test.ts
 * con i percorsi mascherati, le intestazioni falsificate, il bypass di sviluppo e cio' che Pages Functions
 * potrebbe esporre. Le risposte di rifiuto non devono dare indizi (nessun nome di variabile, nessun motivo).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AUD, DOMINIO, EMAIL, b64url, corpoValido, firma, nuovaChiave, pubblicaChiavi, type Chiave } from './accesso';
import { D1Finto } from './d1_finto';
import { ENV_ADMIN, ENV_BYPASS, FILE_ROTTE, chiama } from './rotte';

const db = new D1Finto(true);
let chiave: Chiave;
beforeAll(async () => {
  chiave = await nuovaChiave();
});
afterEach(() => vi.unstubAllGlobals());

const chiuso = (stato: number, dove: string) => expect([401, 403], dove).toContain(stato);

describe('percorsi mascherati verso l\'admin', () => {
  const PERCORSI = [
    '/API/admin/giocatori', '/Api/Admin/Giocatori', '/api//admin/giocatori', '/api///admin//giocatori', '//api/admin/giocatori',
    '/api/admin/giocatori/', '/api/admin/giocatori//', '/api/admin/./giocatori', '/api/./admin/giocatori', '/api/x/../admin/giocatori',
    '/api/admin/../admin/giocatori', '/api/%61dmin/giocatori', '/api/%41dmin/giocatori', '/%61pi/admin/giocatori', '/%61%70%69/%61%64%6d%69%6e/giocatori',
    '/api%2Fadmin/giocatori', '/api%2fadmin%2fgiocatori', '/api/admin%2Fgiocatori', '/api%5Cadmin/giocatori', '/api\\admin\\giocatori',
    '/api/%2561dmin/giocatori', '/api/%252561dmin/giocatori', '/api/%2e/admin/giocatori', '/api/%2e%2e/api/admin/giocatori',
    '/api/admin;x=1/giocatori', '/api;x=1/admin/giocatori', '/api/admin/giocatori;.json', '/api/admin/giocatori%00', '/api/admin/giocatori%20',
    // percentuali malformate: non devono far cadere la decodifica e lasciare "admin" nascosto
    '/api/%61dmin/%zz', '/api/%61dmin/%', '/api/%61dmin/giocatori%', '/api/%61dmin/%E0%A4%A', '/%61pi/%61dmin/%zz/%zz',
    '/api/admin/me', '/api/admin', '/api/admin/', '/api/admin/nonesiste', '/api/admin/giocatori/1/badge', '/api/admin/partite/1/mvp/decidi',
  ];

  for (const metodo of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${metodo}: sempre 401/403 senza credenziali (e con la configurazione vera)`, async () => {
      for (const p of PERCORSI) {
        const r = await chiama(db, metodo, p, { env: ENV_ADMIN, corpo: ['GET', 'HEAD', 'OPTIONS'].includes(metodo) ? undefined : {} });
        chiuso(r.stato, `${metodo} ${p}`);
      }
    });
  }

  it('un token valido sul percorso mascherato funziona come sul percorso vero (nessuna discrepanza da sfruttare)', async () => {
    pubblicaChiavi([chiave.jwk]);
    const token = await firma(chiave);
    expect((await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token })).stato).toBe(200);
    // il percorso strano o e' rifiutato dal router (404) o dall'handler, ma MAI serve dati senza passare dal controllo
    const r = await chiama(db, 'GET', '/API/admin/giocatori', { env: ENV_ADMIN });
    chiuso(r.stato, 'senza token');
  });

  it('i rifiuti non danno indizi: stessi messaggi, nessun nome di variabile o di email', async () => {
    const casi = [
      await chiama(db, 'GET', '/api/admin/me', { env: {} }), // non configurato
      await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_ADMIN, EMAIL_AUTORIZZATE: '' }, token: await firma(chiave) }),
      await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: 'a.b.c' }),
      await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_ADMIN, EMAIL_AUTORIZZATE: 'altro@prova.invalid' }, token: await firma(chiave) }),
    ];
    pubblicaChiavi([chiave.jwk]);
    casi.push(await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_ADMIN, EMAIL_AUTORIZZATE: 'altro@prova.invalid' }, token: await firma(chiave) }));
    for (const r of casi) {
      expect(r.testo).not.toMatch(/ACCESS_|EMAIL_AUTORIZZATE|DA_COMPILARE|cloudflareaccess|firma|chiave|scaduto|audience|autorizzat/i);
      expect(r.testo).not.toContain(EMAIL);
      expect(['accesso richiesto', 'accesso negato', 'servizio momentaneamente non disponibile']).toContain(r.json.errore);
    }
  });
});

describe('intestazioni e cookie falsificati', () => {
  it('Cf-Access-Authenticated-User-Email da solo non basta (l\'email si legge SOLO dal token firmato)', async () => {
    pubblicaChiavi([chiave.jwk]);
    const varianti: Record<string, string>[] = [
      { 'Cf-Access-Authenticated-User-Email': EMAIL },
      { 'Cf-Access-Authenticated-User-Email': EMAIL, 'Cf-Access-Authenticated-User-Id': 'x' },
      { 'X-Forwarded-Email': EMAIL, 'X-Auth-Request-Email': EMAIL, 'Remote-User': EMAIL, 'X-Remote-User': EMAIL },
      { Authorization: `Bearer ${EMAIL}` },
      { 'Cf-Access-Client-Id': 'x.access', 'Cf-Access-Client-Secret': 'y' },
    ];
    for (const headers of varianti) {
      for (const p of ['/api/admin/me', '/api/admin/giocatori']) {
        chiuso((await chiama(db, 'GET', p, { env: ENV_ADMIN, headers })).stato, JSON.stringify(headers));
      }
    }
  });

  it('cookie CF_Authorization e intestazione con token contraffatti: rifiutati', async () => {
    pubblicaChiavi([chiave.jwk]);
    const buono = await firma(chiave);
    const [t, c, f] = buono.split('.');
    const corpoAltro = b64url(JSON.stringify({ ...corpoValido(), email: 'intruso@prova.invalid' }));
    const corpoNonScaduto = b64url(JSON.stringify({ ...corpoValido(), exp: 4102444800 }));
    const contraffatti = [
      '', 'x', 'null', 'undefined', '...', 'a.b.c', `${t}.${c}`, `${t}.${c}.`, `${t}.${c}.${f}.extra`,
      `${t}.${corpoAltro}.${f}`, // corpo cambiato, firma vecchia
      `${t}.${corpoNonScaduto}.${f}`,
      `${t}.${c}.${f.slice(0, -4)}AAAA`, // firma alterata
      `${t}.${c}.${'A'.repeat(342)}`,
      `${b64url('{"alg":"none"}')}.${c}.`,
      `${b64url('{"alg":"None","kid":"chiave-di-prova"}')}.${c}.${f}`,
      `${b64url('{"alg":"HS256","kid":"chiave-di-prova"}')}.${c}.${f}`,
      `${b64url('{"alg":"RS256","kid":"chiave-di-prova","jku":"https://evil.example/k"}')}.${corpoAltro}.${f}`,
      `${b64url(JSON.stringify({ alg: 'RS256', kid: 'chiave-di-prova', jwk: chiave.jwk }))}.${corpoAltro}.${f}`,
      buono.replace(/[A-Za-z0-9_-]/, '*'),
    ];
    for (const token of contraffatti) {
      chiuso((await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token })).stato, `intestazione: ${token.slice(0, 40)}`);
      chiuso((await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, cookie: `CF_Authorization=${token}` })).stato, `cookie: ${token.slice(0, 40)}`);
    }
  });

  it('firma valida di un\'ALTRA coppia di chiavi (stesso kid): 403', async () => {
    pubblicaChiavi([chiave.jwk]);
    const altra = await nuovaChiave('chiave-di-prova'); // stesso kid, chiave diversa
    const r = await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(altra) });
    expect(r.stato).toBe(403);
  });

  it('un token di un\'altra applicazione dello stesso team (stessa firma e stesso iss, AUD diverso): 403', async () => {
    pubblicaChiavi([chiave.jwk]);
    for (const aud of [['aud-di-un-altra-app'], 'aud-di-un-altra-app', [], '', [`${AUD}x`], [AUD.toUpperCase()], [[AUD]], undefined]) {
      const r = await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave, { ...corpoValido(), aud }) });
      expect(r.stato, `aud ${JSON.stringify(aud)}`).toBe(403);
    }
    // controprova: AUD giusto (stringa o insieme che lo contiene) passa
    for (const aud of [AUD, [AUD], ['altra', AUD]]) {
      expect((await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave, { ...corpoValido(), aud }) })).stato).toBe(200);
    }
  });

  it('iss, exp, nbf ai limiti', async () => {
    pubblicaChiavi([chiave.jwk]);
    const ora = Math.floor(Date.now() / 1000);
    const prova = async (corpo: Record<string, unknown>) => (await chiama(db, 'GET', '/api/admin/me', { env: ENV_ADMIN, token: await firma(chiave, { ...corpoValido(), ...corpo }) })).stato;
    expect(await prova({ exp: ora })).toBe(403); // scade adesso
    expect(await prova({ exp: ora + 5 })).toBe(200);
    expect(await prova({ exp: String(ora + 3600) })).toBe(403); // non numerico
    expect(await prova({ exp: null })).toBe(403);
    expect(await prova({ nbf: ora + 30 })).toBe(200); // tolleranza di un minuto sull'orologio
    expect(await prova({ nbf: ora + 120 })).toBe(403);
    expect(await prova({ iss: `https://${DOMINIO}/` })).toBe(403);
    expect(await prova({ iss: `http://${DOMINIO}` })).toBe(403);
    expect(await prova({ iss: `https://evil.${DOMINIO}` })).toBe(403);
    expect(await prova({ iss: undefined })).toBe(403);
  });

  it('email: il confronto e\' esatto (dopo trim e minuscole), non "contiene" ne\' "finisce con"', async () => {
    pubblicaChiavi([chiave.jwk]);
    const prova = async (email: unknown, elenco = EMAIL) => (await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_ADMIN, EMAIL_AUTORIZZATE: elenco }, token: await firma(chiave, { ...corpoValido(), email }) })).stato;
    expect(await prova(EMAIL.toUpperCase())).toBe(200);
    expect(await prova(`  ${EMAIL}\t`)).toBe(200);
    expect(await prova(`x${EMAIL}`)).toBe(403);
    expect(await prova(`${EMAIL}x`)).toBe(403);
    expect(await prova(`${EMAIL},altro@prova.invalid`)).toBe(403);
    expect(await prova([EMAIL])).toBe(403);
    expect(await prova({ toString: 'x' })).toBe(403);
    expect(await prova('')).toBe(403);
    expect(await prova('altro@prova.invalid')).toBe(403);
    // elenco con maiuscole, spazi, voci vuote, virgole finali
    expect(await prova(EMAIL, `  ${EMAIL.toUpperCase()} , ,altro@prova.invalid,`)).toBe(200);
    // un elenco fatto solo di virgole/spazi NON vuol dire "tutti"
    expect(await prova(EMAIL, ' , , ')).toBe(403);
    expect(await prova('', ' , , ')).toBe(403);
  });
});

describe('bypass di sviluppo: impossibile in produzione', () => {
  const PROD = { headers: { 'Cf-Ray': '8a1b2c3d4e5f-MXP', 'Cf-Connecting-Ip': '203.0.113.7' } };

  it('sul sito vero (hostname pubblico) non si apre con nessuna intestazione', async () => {
    const varianti: Record<string, string>[] = [
      { Host: 'localhost' }, { Host: '127.0.0.1:8788' }, { 'X-Forwarded-Host': 'localhost' }, { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Real-Ip': '127.0.0.1' }, { 'Cf-Connecting-Ip': '127.0.0.1' }, { Forwarded: 'for=127.0.0.1;host=localhost' }, { Origin: 'http://localhost:8788' }, { Referer: 'http://localhost/' },
    ];
    for (const headers of varianti) {
      chiuso((await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, headers })).stato, JSON.stringify(headers));
    }
  });

  it('DEV_ADMIN_BYPASS=1 rimasto per errore fra le variabili di produzione: si spegne da solo perche\' Access e\' configurato', async () => {
    for (const origine of ['http://localhost:8788', 'http://127.0.0.1:8788', 'http://[::1]:8788']) {
      const r = await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_BYPASS, ...ENV_ADMIN }, origine });
      chiuso(r.stato, origine);
    }
    // basta anche solo UNA delle tre configurazioni
    for (const uno of [{ ACCESS_TEAM_DOMAIN: DOMINIO }, { ACCESS_AUD: AUD }, { EMAIL_AUTORIZZATE: EMAIL }]) {
      chiuso((await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_BYPASS, ...uno }, locale: true })).stato, JSON.stringify(Object.keys(uno)));
    }
  });

  it('una richiesta passata dall\'edge di Cloudflare (Cf-Ray) non usa mai il bypass, nemmeno da localhost', async () => {
    chiuso((await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, locale: true, headers: PROD.headers })).stato, 'Cf-Ray');
  });

  it('controprova: in locale, senza Access e senza edge, il bypass funziona (lo sviluppo non si rompe)', async () => {
    expect((await chiama(db, 'GET', '/api/admin/me', { env: ENV_BYPASS, locale: true })).stato).toBe(200);
    // ...anche con segnaposto ("DA_COMPILARE" = non configurato)
    expect((await chiama(db, 'GET', '/api/admin/me', { env: { ...ENV_BYPASS, ACCESS_AUD: 'DA_COMPILARE', ACCESS_TEAM_DOMAIN: 'DA_COMPILARE' }, locale: true })).stato).toBe(200);
  });

  it('il bypass non compare in wrangler.toml, ne\' in .dev.vars.example con un valore diverso da 1 (che finirebbe in git)', () => {
    const radice = join(import.meta.dirname, '..');
    const toml = readFileSync(join(radice, 'wrangler.toml'), 'utf8').split('\n').filter((r) => !r.trim().startsWith('#')).join('\n');
    expect(toml).not.toMatch(/DEV_ADMIN_BYPASS/);
    const esempio = readFileSync(join(radice, '.dev.vars.example'), 'utf8');
    expect(esempio).toMatch(/^ACCESS_AUD=DA_COMPILARE$/m);
    expect(esempio).toMatch(/^ACCESS_TEAM_DOMAIN=DA_COMPILARE$/m);
  });
});

describe('cosa espone Pages Functions', () => {
  it('nessun file fuori da functions/api e dal middleware esporta un handler (lib/ non diventa una rotta)', () => {
    const radice = join(import.meta.dirname, '..');
    const tutti = (dir: string): string[] => readdirSync(join(radice, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tutti(join(dir, e.name)) : [join(dir, e.name)]));
    for (const f of tutti('functions').filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(radice, f), 'utf8');
      const esporta = /export\s+(const|async function|function)\s+onRequest(Get|Post|Put|Patch|Delete|Head|Options)?\b/.test(src);
      if (f.startsWith(join('functions', 'api'))) expect(esporta, `${f} deve esportare onRequest`).toBe(true);
      else if (f !== join('functions', '_middleware.ts')) expect(esporta, `${f} non deve essere una rotta`).toBe(false);
    }
  });

  it('ogni rotta admin sta sotto functions/api/admin/ (Access protegge solo quel prefisso) e nessun\'altra dice "admin" nel percorso', () => {
    const conAdmin = FILE_ROTTE.filter((f) => /admin/i.test(f.split('functions')[1]));
    for (const f of conAdmin) expect(f.split('functions')[1]).toMatch(/^[\\/]api[\\/]admin[\\/]/);
  });

  it('/lib, /functions, /_middleware e file di configurazione non escono dal middleware come contenuto', async () => {
    for (const p of ['/lib/access', '/lib/access.ts', '/LIB/access.ts', '/%6cib/access.ts', '/api/../lib/access.ts', '/lib%2Faccess.ts', '/lib/%zz']) {
      const r = await chiama(db, 'GET', p);
      expect(r.stato, p).toBe(404);
      expect(r.testo, p).not.toContain('verificaAccesso');
    }
  });
});
