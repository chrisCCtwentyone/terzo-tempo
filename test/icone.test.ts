/**
 * Icona, manifest e marchio: le icone che il telefono mette sulla Home e nel browser sono quelle dichiarate, hanno la misura
 * giusta, i colori del tema concordano ovunque e il logo dell'intestazione e' davvero la Figurina. Il server vero (content-type,
 * CSP nel browser) lo provano `npm run e2e` e scripts/controlla_produzione.sh.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onRequest as middleware } from '../functions/_middleware';
import type { Env } from '../functions/lib/risposta';
import { D1Finto } from './d1_finto';
import { chiama } from './rotte';

const RADICE = join(import.meta.dirname, '..');
const PUBLIC = join(RADICE, 'app', 'public');
const leggi = (...p: string[]) => readFileSync(join(RADICE, ...p), 'utf8');
const db = new D1Finto(true);

/** Lato e tipo di colore dall'intestazione del PNG (tipo 2 = RGB, niente canale alfa). */
const esa = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const byte = (file: string) => new Uint8Array(readFileSync(join(PUBLIC, file)));
function png(file: string) {
  const b = byte(file);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  expect(esa(b.slice(0, 8)), `${file}: firma PNG`).toBe('89504e470d0a1a0a');
  return { larghezza: dv.getUint32(16), altezza: dv.getUint32(20), tipoColore: b[25] };
}

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as {
  name: string; short_name: string; start_url: string; scope: string; display: string; background_color: string; theme_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
const indice = leggi('app', 'index.html');
const token = leggi('app', 'src', 'stili', 'tokens.css');
const carta = { chiaro: /:root\{[^}]*?--paper:(#[0-9a-f]{6})/.exec(token)?.[1], scuro: /:root\[data-theme="dark"\]\{[^}]*?--paper:(#[0-9a-f]{6})/.exec(token)?.[1] };

describe('manifest', () => {
  it('nome, avvio e modalita\' standalone', () => {
    expect(manifest.name).toBe('Terzo Tempo');
    expect(manifest.short_name).toBe('Terzo Tempo');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });
  it('ogni icona dichiarata esiste, e\' un PNG della misura dichiarata; ci sono 192, 512 e la maskable', () => {
    for (const i of manifest.icons) {
      expect(i.type).toBe('image/png');
      expect(i.src.startsWith('/')).toBe(true);
      expect(existsSync(join(PUBLIC, i.src)), i.src).toBe(true);
      const { larghezza, altezza } = png(i.src.slice(1));
      expect(`${larghezza}x${altezza}`, i.src).toBe(i.sizes);
    }
    expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose ?? 'any'}`).sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  });
  it('colori = carta del tema chiaro (sfondo e barra coerenti con l\'app)', () => {
    expect(carta.chiaro).toBeTruthy();
    expect(manifest.background_color).toBe(carta.chiaro);
    expect(manifest.theme_color).toBe(carta.chiaro);
  });
});

describe('icone', () => {
  it('apple-touch-icon: 180x180, RGB (nessuna trasparenza: sfondo pieno, gli angoli li ritaglia iOS)', () => {
    expect(png('apple-touch-icon.png')).toEqual({ larghezza: 180, altezza: 180, tipoColore: 2 });
  });
  it('tutte le icone PNG sono RGB opache; favicon 32x32', () => {
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon-32.png']) expect(png(f).tipoColore, f).toBe(2);
    expect(png('favicon-32.png')).toMatchObject({ larghezza: 32, altezza: 32 });
  });
  it('favicon.svg e\' il logo sorgente (stesse forme), favicon.ico contiene PNG', () => {
    const sorgente = leggi('docs', 'logo', 'logo-figurina.svg');
    const svg = leggi('app', 'public', 'favicon.svg');
    for (const f of sorgente.match(/(?<![\w-])(?:points|d)="[^"]+"/g) ?? []) expect(svg).toContain(f);
    const ico = byte('favicon.ico');
    const dv = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(dv.getUint16(2, true)).toBe(1); // tipo: icona
    expect(dv.getUint16(4, true)).toBeGreaterThanOrEqual(2);
    expect(esa(ico.slice(dv.getUint32(18, true), dv.getUint32(18, true) + 4))).toBe('89504e47');
  });
});

describe('index.html', () => {
  it('link del manifest e delle icone', () => {
    expect(indice).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(indice).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(indice).toContain('<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />');
    expect(indice).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    for (const href of indice.match(/href="(\/[^"]+)"/g) ?? []) expect(existsSync(join(PUBLIC, href.slice(7, -1))), href).toBe(true);
  });
  it('meta della webapp su iPhone e Android', () => {
    expect(indice).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(indice).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(indice).toContain('<meta name="apple-mobile-web-app-title" content="Terzo Tempo" />');
    expect(indice).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
  });
  it('viewport-fit=cover, perche\' le zone sicure (env) valgano qualcosa', () => {
    expect(/<meta name="viewport" content="[^"]*viewport-fit=cover/.test(indice)).toBe(true);
  });
  it('theme-color chiaro e scuro = --paper dei due temi (e le costanti di lib/tema.ts, che il cambio tema a mano scrive nelle meta)', () => {
    const chiaro = /<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: light\)"/.exec(indice)?.[1];
    const scuro = /<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: dark\)"/.exec(indice)?.[1];
    expect(carta.scuro).toBeTruthy();
    expect(chiaro).toBe(carta.chiaro);
    expect(scuro).toBe(carta.scuro);
    const costanti = /COLORE_TEMA = \{ light: '(#[0-9a-f]{6})', dark: '(#[0-9a-f]{6})' \}/.exec(leggi('app', 'src', 'lib', 'tema.ts'));
    expect([costanti?.[1], costanti?.[2]]).toEqual([carta.chiaro, carta.scuro]);
  });
});

describe('zone sicure di iPhone (viewport-fit=cover)', () => {
  const base = leggi('app', 'src', 'stili', 'base.css');
  const ui = leggi('app', 'src', 'stili', 'ui.css');
  it('sopra (orologio), sotto (barra del gesto) e ai lati (tacca in orizzontale)', () => {
    expect(base).toMatch(/body\{[^}]*padding-top:env\(safe-area-inset-top/);
    expect(base).toMatch(/body\{[^}]*padding-bottom:calc\(88px \+ env\(safe-area-inset-bottom/);
    expect(base).toMatch(/\.wrap\{[^}]*env\(safe-area-inset-left[^}]*env\(safe-area-inset-right|\.wrap\{[^}]*env\(safe-area-inset-right[^}]*env\(safe-area-inset-left/);
    expect(ui).toMatch(/\.nav\{position:fixed[^}]*calc\(8px \+ env\(safe-area-inset-bottom/);
    expect(ui).toMatch(/\.nav\{position:fixed[^}]*env\(safe-area-inset-left/);
  });
});

describe('marchio nell\'intestazione', () => {
  it('il simbolo "logo" dello sprite ha le stesse forme del logo sorgente', () => {
    const sorgente = leggi('docs', 'logo', 'logo-figurina.svg');
    const sprite = leggi('app', 'src', 'ui', 'Icone.tsx');
    // in JSX gli attributi sono camelCase (stroke-width -> strokeWidth)
    const forme = (sorgente.match(/(?<![\w-])(?:points|d|x|y|width|height|cx|cy|r|rx|fill|stroke|stroke-width|transform)="[^"]+"/g) ?? []).map((f) => f.replace('stroke-width', 'strokeWidth'));
    expect(forme.length).toBeGreaterThan(40);
    const simbolo = /<symbol id="logo"[\s\S]*?<\/symbol>/.exec(sprite)?.[0] ?? '';
    for (const f of forme) expect(simbolo, f).toContain(f);
  });
  it('le tre intestazioni (sito pubblico, area admin, area riservata) usano il logo, non piu\' il pallone', () => {
    const app = leggi('app', 'src', 'App.tsx');
    const admin = leggi('app', 'src', 'admin', 'Admin.tsx');
    expect(app.match(/<Marchio \/><b>Terzo Tempo<\/b>/g)).toHaveLength(1);
    expect(admin.match(/<Marchio \/><b>Terzo Tempo<\/b>/g)).toHaveLength(2);
    expect(app + admin).not.toMatch(/<Pallone size=\{26\} \/><b>/);
  });
});

describe('middleware e manifest', () => {
  it('la CSP ammette il manifest e le icone del sito (manifest-src e img-src \'self\')', async () => {
    const csp = (await chiama(db, 'GET', '/manifest.webmanifest')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
  });
  const con = (tipo: string | null, stato = 200) => {
    const headers: Record<string, string> = tipo ? { 'Content-Type': tipo } : {};
    const ctx = { request: new Request('https://terzo-tempo.pages.dev/manifest.webmanifest'), env: { DB: db } as unknown as Env, data: {}, waitUntil() {}, passThroughOnException() {}, next: async () => new Response('{}', { status: stato, headers }) };
    return (middleware as unknown as (c: unknown) => Promise<Response>)(ctx);
  };
  it('un tipo sbagliato diventa application/manifest+json; quello giusto resta', async () => {
    for (const sbagliato of ['application/octet-stream', 'text/plain', 'application/json', null]) {
      expect((await con(sbagliato)).headers.get('Content-Type'), String(sbagliato)).toBe('application/manifest+json');
    }
    expect((await con('application/manifest+json')).headers.get('Content-Type')).toBe('application/manifest+json');
  });
  it('la pagina dell\'app (manifest mancante) NON e\' spacciata per manifest, e un errore resta un errore', async () => {
    expect((await con('text/html; charset=utf-8')).headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect((await con('text/plain', 404)).headers.get('Content-Type')).toBe('text/plain');
  });
  it('le intestazioni di sicurezza ci sono anche sul manifest', async () => {
    const r = await con('application/manifest+json');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});

describe.skipIf(!existsSync(join(RADICE, 'app', 'dist')))('build (app/dist)', () => {
  it('manifest, icone e i link di index.html ci sono nella build', () => {
    const dist = join(RADICE, 'app', 'dist');
    for (const f of ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.svg', 'favicon-32.png', 'favicon.ico']) expect(existsSync(join(dist, f)), f).toBe(true);
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('viewport-fit=cover');
  });
});
