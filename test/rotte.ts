/**
 * Esegue le Pages Functions VERE (middleware compreso) senza Cloudflare: il
 * percorso viene risolto sui file di functions/api/ come fa Pages, e il
 * middleware di radice chiama l'handler come `next()`.
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { onRequest as middleware } from '../functions/_middleware';
import type { Env } from '../functions/lib/risposta';
import { D1Finto } from './d1_finto';

const API = join(import.meta.dirname, '..', 'functions', 'api');

export const PUBBLICO = 'https://terzo-tempo.pages.dev';
export const LOCALE = 'http://localhost:8788';

function elencaFile(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? elencaFile(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/** Percorso di rotta di un file: ".../[id]/mvp.ts" -> "/api/partite/:id/mvp". */
export function rottaDi(file: string): string {
  const seg = relative(API, file).replace(/\.ts$/, '').split(sep).filter((s) => s !== 'index');
  return '/api/' + seg.map((s) => s.replace(/^\[(.+)\]$/, ':$1')).join('/');
}

export const FILE_ROTTE = elencaFile(API);
export const ROTTE_ADMIN = FILE_ROTTE.filter((f) => rottaDi(f).startsWith('/api/admin/'));
export const ROTTE_PUBBLICHE = FILE_ROTTE.filter((f) => !rottaDi(f).startsWith('/api/admin/'));

type Handler = (c: unknown) => Promise<Response> | Response;
const tabella = FILE_ROTTE.map((file) => ({ file, segmenti: rottaDi(file).split('/').filter(Boolean) })).sort(
  (a, b) => a.segmenti.filter((s) => s.startsWith(':')).length - b.segmenti.filter((s) => s.startsWith(':')).length,
);

function trova(percorso: string) {
  const s = percorso.split('/').filter(Boolean);
  for (const r of tabella) {
    if (r.segmenti.length !== s.length) continue;
    const params: Record<string, string> = {};
    const ok = r.segmenti.every((x, i) => (x.startsWith(':') ? ((params[x.slice(1)] = s[i]), true) : x === s[i]));
    if (ok) return { file: r.file, params };
  }
  return null;
}

export type Chiamata = {
  corpo?: unknown;
  /** corpo grezzo (per provare JSON non valido) */
  grezzo?: string;
  cookie?: string;
  token?: string;
  headers?: Record<string, string>;
  env?: Partial<Env>;
  /** default: sito pubblico. Con `locale` -> http://localhost:8788 */
  locale?: boolean;
  /** origine completa, per provare hostname particolari */
  origine?: string;
};

export type Esito = { stato: number; testo: string; json: any; headers: Headers };

/** Configurazione admin di prova, senza bypass. */
export const ENV_ADMIN = { ACCESS_TEAM_DOMAIN: 'team-di-prova.cloudflareaccess.com', ACCESS_AUD: 'aud-di-prova-0123456789', EMAIL_AUTORIZZATE: 'admin@prova.invalid' };
/** Sviluppo locale: solo il bypass, su localhost. */
export const ENV_BYPASS = { DEV_ADMIN_BYPASS: '1' };

export async function chiama(db: D1Finto, metodo: string, percorso: string, c: Chiamata = {}): Promise<Esito> {
  const headers: Record<string, string> = { ...c.headers };
  if (c.cookie) headers['Cookie'] = c.cookie;
  if (c.token) headers['Cf-Access-Jwt-Assertion'] = c.token;
  let body: string | undefined = c.grezzo;
  if (c.corpo !== undefined) body = JSON.stringify(c.corpo);
  if (body !== undefined) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  const request = new Request((c.origine ?? (c.locale ? LOCALE : PUBBLICO)) + percorso, { method: metodo, headers, body });
  const env = { DB: db, ...c.env } as unknown as Env;
  const trovata = trova(new URL(request.url).pathname);

  const ctx: Record<string, unknown> = { request, env, data: {}, params: trovata?.params ?? {}, waitUntil() {}, passThroughOnException() {}, functionPath: '' };
  ctx.next = async () => {
    if (!trovata) return new Response('<html>pagina dell\'app</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    const modulo = (await import(pathToFileURL(trovata.file).href)) as { onRequest: Handler };
    return modulo.onRequest(ctx);
  };
  const risposta = await (middleware as unknown as Handler)(ctx);
  const testo = await risposta.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(testo);
  } catch {
    // non JSON
  }
  return { stato: risposta.status, testo, json: parsed, headers: risposta.headers };
}
