/** Guardie sulla configurazione e sul middleware. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SQUADRE } from '../functions/lib/costanti';
import { D1Finto } from './d1_finto';
import { chiama } from './rotte';

const RADICE = join(import.meta.dirname, '..');
const leggi = (p: string) => readFileSync(join(RADICE, p), 'utf8');
const file = (dir: string): string[] =>
  readdirSync(join(RADICE, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? file(join(dir, e.name)) : [join(dir, e.name)]));

describe('wrangler.toml', () => {
  const toml = leggi('wrangler.toml');
  const senzaCommenti = toml.split('\n').filter((r) => !r.trim().startsWith('#')).join('\n');

  it('il database_id e il dominio Access sono segnaposto marcati (il progetto Cloudflare non esiste ancora)', () => {
    expect(senzaCommenti).toMatch(/database_id = "DA_COMPILARE/);
    expect(senzaCommenti).toMatch(/ACCESS_TEAM_DOMAIN = "DA_COMPILARE"/);
    expect(senzaCommenti).toMatch(/ACCESS_AUD = "DA_COMPILARE"/);
    expect(senzaCommenti).toMatch(/binding = "DB"/);
  });

  it('le email admin e il bypass di sviluppo NON stanno nel file (finisce in git)', () => {
    expect(senzaCommenti).not.toMatch(/EMAIL_AUTORIZZATE/);
    expect(senzaCommenti).not.toMatch(/DEV_ADMIN_BYPASS/);
    expect(senzaCommenti).not.toMatch(/@/);
  });

  it('.dev.vars e i database locali sono ignorati da git', () => {
    const ignorati = leggi('.gitignore');
    expect(ignorati).toMatch(/^\.dev\.vars$/m);
    expect(ignorati).toMatch(/^\.wrangler\/$/m);
  });
});

describe('script npm', () => {
  it('dev, build, preview, test e typecheck; il typecheck e\' `tsc -b` (tsc --noEmit qui non controllerebbe niente)', () => {
    const { scripts } = JSON.parse(leggi('package.json'));
    for (const s of ['dev', 'build', 'preview', 'test', 'typecheck']) expect(scripts[s], s).toBeTruthy();
    expect(scripts.typecheck).toBe('tsc -b');
    expect(scripts.build).toMatch(/^tsc -b && /);
    expect(scripts.typecheck + scripts.build + scripts.test).not.toMatch(/\|/); // niente pipe su comandi che devono poter fallire
    expect(JSON.parse(leggi('tsconfig.json')).references.length).toBeGreaterThanOrEqual(3);
  });
});

describe('i nomi delle squadre stanno in UN solo punto', () => {
  it('ne\' nel DB ne\' altrove nel codice', () => {
    const consentito = join('functions', 'lib', 'costanti.ts');
    const sorgenti = ['functions', 'migrations', 'app/src', 'scripts'].flatMap(file).filter((f) => f !== consentito);
    expect(sorgenti.length).toBeGreaterThan(10);
    for (const f of sorgenti) {
      for (const nome of Object.values(SQUADRE)) expect(leggi(f), `${relative('.', f)}: "${nome}"`).not.toContain(nome);
    }
  });
});

describe('middleware', () => {
  it('/lib non e\' raggiungibile', async () => {
    for (const p of ['/lib/access', '/lib/mvp.ts', '/LIB/x']) expect((await chiama(new D1Finto(), 'GET', p)).stato).toBe(404);
  });

  it('intestazioni di sicurezza su API e pagine', async () => {
    for (const p of ['/api/stagioni', '/', '/api/admin/me']) {
      const { headers } = await chiama(new D1Finto(), 'GET', p);
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(headers.get('X-Frame-Options')).toBe('DENY');
      expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    }
    expect((await chiama(new D1Finto(), 'GET', '/api/stagioni')).headers.get('Cache-Control')).toContain('no-store');
  });

  it('un errore interno non esce mai con dettagli', async () => {
    const guasto = { prepare: () => { throw new Error('dettaglio-segreto-del-db'); } };
    const r = await chiama(new D1Finto(), 'GET', '/api/stagioni', { env: { DB: guasto as never } });
    expect(r.stato).toBe(500);
    expect(r.testo).not.toContain('dettaglio-segreto');
    expect(r.json).toEqual({ errore: 'errore interno del servizio: riprova fra poco' });
  });

  it('metodo non ammesso: 405 con Allow', async () => {
    const r = await chiama(new D1Finto(), 'DELETE', '/api/stagioni');
    expect(r.stato).toBe(405);
    expect(r.headers.get('Allow')).toBe('GET');
  });
});
