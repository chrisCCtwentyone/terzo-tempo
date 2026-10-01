/**
 * Impianto comune delle prove nel browser (`npm run e2e` e `npm run e2e:admin`): D1 locale usa-e-getta,
 * wrangler pages dev sulla build di produzione, Chromium (Playwright) a 390x844, controlli su console,
 * CSP, risorse esterne e scroll orizzontale. MAI `playwright install`: serve un Chromium gia' installato
 * (PLAYWRIGHT_BROWSERS_PATH o E2E_CHROMIUM).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright-core'

export const RADICE = resolve(import.meta.dirname, '..')
export const DATI = mkdtempSync(join(tmpdir(), 'terzo-tempo-e2e-'))

export const falliti: string[] = []
export const verifica = (ok: boolean, cosa: string) => {
  if (!ok) falliti.push(cosa)
  console.log(`${ok ? '  ok   ' : '  FALLITO'} ${cosa}`)
}

const wrangler = (...args: string[]) => execFileSync('npx', ['wrangler', ...args], { cwd: RADICE, stdio: 'pipe' })
const d1 = (...args: string[]) => wrangler('d1', ...args, 'DB', '--local', '--persist-to', DATI)
export const sql = (comando: string) => d1('execute', '--command', comando)
export const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z'

/** Migrazioni + seed di prova (nomi inventati) nel D1 usa-e-getta. */
export function preparaBase() {
  d1('migrations', 'apply')
  d1('execute', '--file', 'scripts/seed_prova.sql')
}

/**
 * Dati ESTREMI, solo per le prove nel browser (mai nel seed di produzione ne' in seed_prova.sql): servono a stressare il
 * layout con nomi molto piu' lunghi di quelli veri. Nomi inventati. Ids alti (90+) per non toccare quelli del seed.
 *  - giocatori: un nome lungo con spazi e uno di una sola parola lunghissima (nessun punto dove andare a capo);
 *  - badge: due nomi lunghi (uno con spazi, uno senza) e una descrizione al massimo della lunghezza;
 *  - stagione dal nome lungo (chiusa, vecchia: non cambia la stagione aperta ne' la home);
 *  - campi: uno dal nome lungo con spazi e uno di una sola parola lunghissima (80 caratteri al massimo), sulle partite 120 e 121;
 *  - partita 120 giocata (nella stagione lunga, con i due giocatori lunghi sul campo, gol e cronaca con una parola
 *    lunghissima) e partita 121 in convocazione, DOPO la 11, cosi' la home continua a mostrare la 11.
 */
export function aggiungiDatiEstremi() {
  const GIOCATORI = [
    [90, 'Pettirosso Montefiascone Vannozzi S.C.'],
    [91, 'Wolfeschlegelsteinhausenbergerdorff M.'],
    [92, 'De Gregoriis Baldassarre-Malaspina R.'],
  ] as const
  const pos = (partita: number, righe: readonly [number, 'A' | 'B', number, number, number, number, number | null][]) =>
    `INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, pos_x, pos_y, gol, autogol, voto_pagella) VALUES ${righe.map(([g, sq, x, y, gol, og, v]) => `(${partita},${g},'${sq}',${x},${y},${gol},${og},${v})`).join(',')};`
  sql(
    [
      `INSERT INTO giocatori (id, nome, attivo, livello_segreto, creato_il) VALUES ${GIOCATORI.map(([id, n]) => `(${id},'${n}',1,3,'2026-07-01T10:00:00Z')`).join(',')};`,
      `INSERT INTO badge (id, nome, descrizione, tipo) VALUES
        (90,'Dribblomane Instancabile','Corre, dribbla e non si ferma mai, nemmeno quando la partita e'' finita da un pezzo e tutti sono negli spogliatoi',  'positivo'),
        (91,'Supercalifragilistichespiralidoso',NULL,'negativo'),
        (92,'Ritardatario cronico e incallito','Arriva sempre dopo il fischio d''inizio',  'negativo');`,
      `INSERT INTO giocatore_badge (giocatore_id, badge_id) VALUES (90,90),(90,92),(91,91),(91,90),(92,92),(92,91);`,
      `INSERT INTO stagioni (id, nome, aperta, data_inizio, data_fine) VALUES (90,'Stagione straordinaria dei campionati amichevoli 2024-25',0,'2024-09-01','2025-06-30');`,
      `INSERT INTO campi (id, nome, lat, lng, url_indicazioni) VALUES
        (90, 'Polisportiva Comunale Giovanni Battista Montefiascone-Vannozzi e Figli', 44.2, 10.2, 'https://www.google.com/maps/dir/?api=1&destination=44.2,10.2'),
        (91, 'Supercalifragilistichespiralidosoimpiantosportivocomunalenuovissimo', NULL, NULL, NULL);`,
      `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, cronaca, mvp_stato, mvp_chiuso_il, campo_id) VALUES
        (120, 90, '2025-05-01T19:00:00Z', 'giocata', 6, 5, 'Serata memorabile: Wolfeschlegelsteinhausenbergerdorff ha segnato due volte e poi ha inseguito il pallone fino a https://esempio.invalid/una/strada/lunghissima/senza/spazi/che/non/finisce/mai', 'assegnato', '2025-05-02T19:00:00Z', 90),
        (121, 2, '2036-10-15T19:00:00Z', 'convocazione', NULL, NULL, NULL, 'aperto', NULL, 91);`,
      pos(120, [
        [90, 'A', 16.7, 19.6, 3, 0, 9.5], [1, 'A', 50, 19.6, 2, 0, 8], [2, 'A', 83.3, 19.6, 1, 0, 7],
        [3, 'A', 16.7, 33, 0, 0, 6.5], [4, 'A', 50, 33, 0, 0, 6], [5, 'A', 83.3, 33, 0, 0, 5.5],
        [91, 'B', 16.7, 67, 2, 0, 8.5], [92, 'B', 50, 67, 2, 0, 8], [6, 'B', 83.3, 67, 1, 0, 7],
        [7, 'B', 16.7, 81, 0, 0, 6], [8, 'B', 50, 81, 0, 0, 6.5], [9, 'B', 83.3, 81, 0, 0, null],
      ]),
      `INSERT INTO mvp_vincitori (partita_id, giocatore_id) VALUES (120, 90);`,
      pos(121, [[90, 'A', 16.7, 19.6, 0, 0, null], [91, 'B', 16.7, 67, 0, 0, null], [92, 'B', 50, 67, 0, 0, null], [1, 'A', 50, 19.6, 0, 0, null]]),
    ].join('\n'),
  )
}

const server: ChildProcess[] = []
/** Avvia `wrangler pages dev` sulla build; `extra` = altri argomenti (es. --binding DEV_ADMIN_BYPASS=1). */
export async function avviaServer(porta: number, extra: string[] = []) {
  const proc = spawn('npx', ['wrangler', 'pages', 'dev', 'app/dist', '--port', String(porta), '--persist-to', DATI, ...extra], { cwd: RADICE, stdio: 'ignore', detached: true })
  server.push(proc)
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`http://localhost:${porta}/api/home`)).ok) return
    } catch {
      // non ancora pronto
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('wrangler pages dev non e\' partito entro 90 secondi')
}
export const fermaServer = () => {
  for (const s of server) {
    if (!s.pid) continue
    try {
      process.kill(-s.pid, 'SIGTERM')
    } catch {
      // gia' chiuso
    }
  }
}

export type Sessione = { ctx: BrowserContext; errori: string[]; csp: string[]; esterne: string[] }

/** Un contesto Chromium 390x844. `ignora` = errori di console attesi dalle prove (es. i 409 provocati apposta). */
export async function apri(browser: Browser, base: string, tema: 'light' | 'dark', extra: { reducedMotion?: 'reduce'; touch?: boolean; ignora?: RegExp } = {}): Promise<Sessione> {
  const { ignora = /status of (409|404)/, touch, ...opzioni } = extra
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: tema, locale: 'it-IT', timezoneId: 'Europe/Rome', hasTouch: touch, isMobile: touch, ...opzioni })
  const s: Sessione = { ctx, errori: [], csp: [], esterne: [] }
  await ctx.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  ctx.on('page', (p) => {
    p.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error' && !ignora.test(t)) s.errori.push(t)
      if (m.type() === 'warning') s.errori.push(`avviso: ${t}`)
    })
    p.on('pageerror', (e) => s.errori.push(`eccezione: ${e.message}`))
    p.on('request', (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith('data:')) s.esterne.push(r.url())
    })
  })
  return s
}

/** Aspetta che le animazioni finiscano, poi controlla: niente scroll orizzontale, niente contenuto rimasto a opacity 0. */
export async function assesta(p: Page, nome: string) {
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(900)
  const m = await p.evaluate(() => ({
    largo: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
    sw: document.documentElement.scrollWidth,
    trasparenti: [...document.querySelectorAll('main *')].filter((e) => getComputedStyle(e).opacity === '0').length,
    carico: /Carico /.test(document.querySelector('main')?.textContent ?? ''),
  }))
  verifica(!m.largo, `${nome}: nessuno scroll orizzontale (larghezza ${m.sw}px)`)
  verifica(m.trasparenti === 0, `${nome}: nessun contenuto a opacity 0`)
  verifica(!m.carico, `${nome}: nessun caricamento rimasto appeso`)
}

/** Schermata intera; la barra in basso (fissa) e la barra di salvataggio (sticky) vanno in fondo invece che a meta' immagine. */
export async function foto(p: Page, cartella: string, nome: string) {
  await p.evaluate(() => {
    ;(document.querySelector('.nav') as HTMLElement | null)?.style.setProperty('position', 'static')
    ;(document.querySelector('.barra-salva') as HTMLElement | null)?.style.setProperty('position', 'static')
  })
  await p.screenshot({ path: join(cartella, `${nome}.png`), fullPage: true })
  await p.evaluate(() => {
    ;(document.querySelector('.nav') as HTMLElement | null)?.style.removeProperty('position')
    ;(document.querySelector('.barra-salva') as HTMLElement | null)?.style.removeProperty('position')
  })
}

/**
 * Il marchio (logo Figurina) nell'intestazione: c'e', e' quello giusto (`<use href="#logo">` dentro il link col nome), ha un lato
 * di 30 px ed e' tutto dentro l'intestazione e dentro lo schermo. `nome` = etichetta della schermata per i messaggi.
 */
export async function verificaMarchio(p: Page, nome: string) {
  const m = await p.evaluate(() => {
    const logo = document.querySelector('header.brand .mark svg.logo')
    if (!logo) return null
    const r = logo.getBoundingClientRect()
    const h = document.querySelector('header.brand')!.getBoundingClientRect()
    const sprite = document.querySelector('symbol#logo')
    return {
      uso: logo.querySelector('use')?.getAttribute('href'),
      // misura di layout (l'intestazione e' inclinata di 1,5 gradi: il riquadro sullo schermo e' un po' piu' grande)
      w: parseFloat(getComputedStyle(logo).width), h: parseFloat(getComputedStyle(logo).height),
      dentro: r.left >= 0 && r.right <= window.innerWidth && r.top >= h.top - 1 && r.bottom <= h.bottom + 1,
      nelLink: !!logo.closest('a.mark')?.querySelector('b'),
      palloneNelMarchio: !!document.querySelector('.mark .ball'),
      simbolo: !!sprite && sprite.querySelectorAll('polygon').length === 6,
      sfondo: getComputedStyle(logo).borderTopWidth,
    }
  })
  verifica(!!m, `${nome}: il logo compare nell'intestazione`)
  if (!m) return
  verifica(m.uso === '#logo' && m.simbolo && m.nelLink, `${nome}: il logo e' la Figurina, accanto al nome, nel link dell'intestazione`)
  verifica(Math.abs(m.w - 30) < 0.5 && Math.abs(m.h - 30) < 0.5, `${nome}: logo 30x30 (${m.w}x${m.h})`)
  verifica(m.dentro, `${nome}: il logo sta dentro intestazione e schermo`)
  verifica(!m.palloneNelMarchio, `${nome}: niente pallone al posto del logo`)
}

/** Controlli finali di una sessione: CSP, risorse esterne, console. */
export async function chiudiSessione(s: Sessione, etichetta: string) {
  for (const pg of s.ctx.pages()) {
    const v = await pg.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
    s.csp.push(...v)
  }
  verifica(s.csp.length === 0, `${etichetta} zero violazioni CSP ${s.csp.join('; ')}`)
  verifica(s.esterne.length === 0, `${etichetta} nessuna richiesta a siti esterni ${s.esterne.join(', ')}`)
  verifica(s.errori.length === 0, `${etichetta} console pulita (zero errori e avvisi) ${s.errori.join(' | ')}`)
  await s.ctx.close()
}

export function concludi() {
  fermaServer()
  console.log(falliti.length ? `\nFALLITE ${falliti.length} verifiche:\n- ${falliti.join('\n- ')}` : '\nTutte le verifiche sono passate.')
  process.exit(falliti.length ? 1 : 0)
}

const PNG_FIRMA = '89504e470d0a1a0a'
/** Lato e tipo di colore letti dall'intestazione del PNG vero (non dall'estensione). Tipo 2 = RGB: nessun canale alfa, quindi nessuna trasparenza. */
export function leggiPng(dati: Buffer): { larghezza: number; altezza: number; opaco: boolean } | null {
  if (dati.subarray(0, 8).toString('hex') !== PNG_FIRMA || dati.toString('latin1', 12, 16) !== 'IHDR') return null
  return { larghezza: dati.readUInt32BE(16), altezza: dati.readUInt32BE(20), opaco: dati[25] === 2 }
}

/**
 * Icone e manifest SERVITI dal server vero (wrangler pages dev sulla build): content-type, JSON valido, ogni icona dichiarata esiste
 * ed e' un PNG della misura dichiarata, apple-touch-icon 180x180 senza trasparenza. E la pagina iniziale dichiara i link e le meta.
 */
export async function provaIconeServite(base: string) {
  console.log('\n== icone e manifest ==')
  const r = await fetch(`${base}/manifest.webmanifest`)
  verifica(r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('application/manifest+json'), `manifest: 200 e application/manifest+json (${r.status} ${r.headers.get('content-type')})`)
  let m: { name?: string; short_name?: string; start_url?: string; scope?: string; display?: string; icons?: { src: string; sizes: string; type: string; purpose?: string }[] } = {}
  try {
    m = await r.json()
  } catch {
    verifica(false, 'manifest: JSON valido')
  }
  verifica(m.name === 'Terzo Tempo' && m.short_name === 'Terzo Tempo' && m.start_url === '/' && m.scope === '/' && m.display === 'standalone', 'manifest: nome, start_url, scope e display standalone')
  verifica((m.icons ?? []).some((i) => i.purpose === 'maskable') && (m.icons ?? []).some((i) => i.sizes === '192x192') && (m.icons ?? []).some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'manifest: icone 192, 512 e maskable')
  for (const i of m.icons ?? []) {
    const ri = await fetch(base + i.src)
    const png = leggiPng(Buffer.from(await ri.arrayBuffer()))
    verifica(ri.status === 200 && ri.headers.get('content-type') === 'image/png' && `${png?.larghezza}x${png?.altezza}` === i.sizes, `icona ${i.src}: 200, image/png, ${i.sizes} (${png?.larghezza}x${png?.altezza})`)
  }
  const a = await fetch(`${base}/apple-touch-icon.png`)
  const png = leggiPng(Buffer.from(await a.arrayBuffer()))
  verifica(a.status === 200 && a.headers.get('content-type') === 'image/png' && png?.larghezza === 180 && png?.altezza === 180 && png.opaco, `apple-touch-icon.png: 200, image/png, 180x180, senza trasparenza (${png?.larghezza}x${png?.altezza})`)
  const svg = await fetch(`${base}/favicon.svg`)
  verifica(svg.status === 200 && (svg.headers.get('content-type') ?? '').startsWith('image/svg+xml'), 'favicon.svg: 200 e image/svg+xml')
  const ico = await fetch(`${base}/favicon.ico`)
  verifica(ico.status === 200 && !(ico.headers.get('content-type') ?? '').startsWith('text/html'), `favicon.ico: 200 e non la pagina dell'app (${ico.headers.get('content-type')})`)
  const html = await (await fetch(`${base}/`)).text()
  for (const [cosa, re] of [
    ['link manifest', /<link rel="manifest" href="\/manifest\.webmanifest"/],
    ['link icon svg', /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/],
    ['link icon png', /<link rel="icon" href="\/favicon-32\.png" type="image\/png"/],
    ['link apple-touch-icon', /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/],
    ['apple-mobile-web-app-capable', /<meta name="apple-mobile-web-app-capable" content="yes"/],
    ['mobile-web-app-capable', /<meta name="mobile-web-app-capable" content="yes"/],
    ['apple-mobile-web-app-title', /<meta name="apple-mobile-web-app-title" content="Terzo Tempo"/],
    ['apple-mobile-web-app-status-bar-style', /<meta name="apple-mobile-web-app-status-bar-style" content="default"/],
    ['viewport-fit=cover', /<meta name="viewport"[^>]*viewport-fit=cover/],
    ['theme-color chiaro e scuro', /theme-color" content="#f2e9d0" media="\(prefers-color-scheme: light\)"[\s\S]*theme-color" content="#12162a" media="\(prefers-color-scheme: dark\)"/],
  ] as const) verifica(re.test(html), `index: ${cosa}`)
}
