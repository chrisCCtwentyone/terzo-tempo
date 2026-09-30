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
      `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, cronaca, mvp_stato, mvp_chiuso_il) VALUES
        (120, 90, '2025-05-01T19:00:00Z', 'giocata', 6, 5, 'Serata memorabile: Wolfeschlegelsteinhausenbergerdorff ha segnato due volte e poi ha inseguito il pallone fino a https://esempio.invalid/una/strada/lunghissima/senza/spazi/che/non/finisce/mai', 'assegnato', '2025-05-02T19:00:00Z'),
        (121, 2, '2026-10-15T19:00:00Z', 'convocazione', NULL, NULL, NULL, 'aperto', NULL);`,
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
