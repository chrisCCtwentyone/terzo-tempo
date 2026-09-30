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
