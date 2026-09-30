/**
 * Prova nel BROWSER (Chromium) della build di produzione, con le Functions vere
 * e un D1 locale usa-e-getta (migrazioni + scripts/seed_prova.sql + tre partite
 * di prova create qui, senza toccare il seed).   Uso: `npm run e2e`
 *
 * Controlla, in tema chiaro e scuro a 390x844: tutte le schermate, il voto MVP
 * (anche il 409 al secondo voto e la chiusura a tempo scaduto), console senza
 * errori, nessuna violazione della CSP, nessuna risorsa esterna, nessuno scroll
 * orizzontale. Salva uno screenshot per schermata in E2E_SCREENS
 * (default: e2e/schermate/, ignorata da git).
 *
 * Variabili: E2E_PORT (8799), E2E_SCREENS, E2E_CHROMIUM (percorso dell'eseguibile;
 * se manca vale PLAYWRIGHT_BROWSERS_PATH). MAI `playwright install` qui.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'

const RADICE = resolve(import.meta.dirname, '..')
const PORTA = Number(process.env.E2E_PORT ?? 8799)
const BASE = `http://localhost:${PORTA}`
const SCHERMATE = resolve(process.env.E2E_SCREENS ?? join(RADICE, 'e2e/schermate'))
const DATI = mkdtempSync(join(tmpdir(), 'terzo-tempo-e2e-'))

const falliti: string[] = []
const verifica = (ok: boolean, cosa: string) => {
  if (!ok) falliti.push(cosa)
  console.log(`${ok ? '  ok   ' : '  FALLITO'} ${cosa}`)
}

const wrangler = (...args: string[]) => execFileSync('npx', ['wrangler', ...args], { cwd: RADICE, stdio: 'pipe' })
const d1 = (...args: string[]) => wrangler('d1', ...args, 'DB', '--local', '--persist-to', DATI)
const sql = (comando: string) => d1('execute', '--command', comando)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z'

/** Partite di prova RELATIVE A ORA (il seed ha date fisse: il voto aperto dipende dall'orologio). */
function preparaDati() {
  d1('migrations', 'apply')
  d1('execute', '--file', 'scripts/seed_prova.sql')
  const ora = Date.now()
  const H = 3600_000
  const conv = (righe: string) =>
    `INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, pos_x, pos_y, gol, autogol, voto_pagella) VALUES ${righe};`
  sql(
    [
      // 100: giocata 2 ore fa, voto APERTO. Squadra A con pedine posizionate; B senza posizioni (prova del ripiego automatico). Un autogol.
      `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato) VALUES (100, 2, '${iso(ora - 2 * H)}', 'giocata', 3, 2, 'aperto');`,
      conv(`(100,1,'A',25,20,2,0,8.5),(100,2,'A',50,32,0,0,6.5),(100,3,'A',75,20,0,1,5.5),(100,4,'B',NULL,NULL,1,0,7),(100,5,'B',NULL,NULL,0,0,NULL),(100,6,'B',NULL,NULL,1,0,6)`),
      // 101: giocata 3 giorni fa, votazione chiusa SENZA voti, senza cronaca.
      `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato, mvp_chiuso_il) VALUES (101, 2, '${iso(ora - 72 * H)}', 'giocata', 1, 1, 'nessun_voto', '${iso(ora - 48 * H)}');`,
      conv(`(101,7,'A',50,25,1,0,7),(101,8,'B',50,75,1,0,7)`),
      // 110: piu' vecchia, zero voti ma MVP assegnato a mano dall'admin.
      `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato, mvp_chiuso_il) VALUES (110, 2, '${iso(ora - 96 * H)}', 'giocata', 1, 0, 'assegnato', '${iso(ora - 72 * H)}');`,
      conv(`(110,7,'A',50,25,1,0,7),(110,8,'B',50,75,0,0,6)`),
      `INSERT INTO mvp_vincitori (partita_id, giocatore_id) VALUES (110, 7);`,
    ].join('\n'),
  )
}

/** Una partita il cui voto si chiude fra `secondi` secondi (prova del conto alla rovescia e della chiusura). */
function partitaInScadenza(id: number, secondi: number) {
  sql(
    `INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b, mvp_stato) VALUES (${id}, 2, '${iso(Date.now() - 24 * 3600_000 + secondi * 1000)}', 'giocata', 1, 0, 'aperto');` +
      `INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, gol) VALUES (${id},1,'A',1),(${id},2,'B',0);`,
  )
}

let server: ChildProcess | null = null
async function avviaServer() {
  server = spawn('npx', ['wrangler', 'pages', 'dev', 'app/dist', '--port', String(PORTA), '--persist-to', DATI], { cwd: RADICE, stdio: 'ignore', detached: true })
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/home`)).ok) return
    } catch {
      // non ancora pronto
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('wrangler pages dev non e\' partito entro 90 secondi')
}
const fermaServer = () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // gia' chiuso
    }
  }
}

type Sessione = { ctx: BrowserContext; errori: string[]; csp: string[]; esterne: string[] }

async function apri(browser: Browser, tema: 'light' | 'dark', extra: { reducedMotion?: 'reduce' } = {}): Promise<Sessione> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: tema, locale: 'it-IT', timezoneId: 'Europe/Rome', ...extra })
  const s: Sessione = { ctx, errori: [], csp: [], esterne: [] }
  await ctx.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  ctx.on('page', (p) => {
    p.on('console', (m) => {
      const t = m.text()
      // 409 e 404 attesi dalle prove esplicite ("hai gia' votato", partita inesistente): il browser li registra come errori di rete
      if (m.type() === 'error' && !/status of (409|404)/.test(t)) s.errori.push(t)
      if (m.type() === 'warning') s.errori.push(`avviso: ${t}`)
    })
    p.on('pageerror', (e) => s.errori.push(`eccezione: ${e.message}`))
    p.on('request', (r) => {
      if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) s.esterne.push(r.url())
    })
  })
  return s
}

/** Aspetta che le animazioni finiscano, poi controlla: niente scroll orizzontale, niente contenuto rimasto a opacity 0. */
async function assesta(p: Page, nome: string) {
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

/** Schermata intera; la barra in basso (fissa) va in fondo alla pagina invece che a meta' immagine. */
async function foto(p: Page, nome: string) {
  await p.evaluate(() => ((document.querySelector('.nav') as HTMLElement).style.position = 'static'))
  await p.screenshot({ path: join(SCHERMATE, `${nome}.png`), fullPage: true })
  await p.evaluate(() => ((document.querySelector('.nav') as HTMLElement).style.position = ''))
}

async function vai(p: Page, percorso: string, nome: string, tema: string) {
  await p.goto(BASE + percorso)
  await p.locator('main h1').waitFor()
  await assesta(p, `${tema} ${nome}`)
  await foto(p, `${tema}-${nome}`)
}

async function provaTema(browser: Browser, tema: 'light' | 'dark') {
  console.log(`\n== tema ${tema} ==`)
  const s = await apri(browser, tema)
  const p = await s.ctx.newPage()

  // ---- tutte le schermate (link diretti: si condividono cosi') ----
  await vai(p, '/', 'home', tema)
  verifica(await p.getByText('Vedi la partita').first().isVisible(), `${tema} home: c'e' l'ultima partita`)
  verifica((await p.locator('.conv li').count()) > 0, `${tema} home: ci sono i convocati`)
  verifica((await p.locator('.podio .pc').count()) === 3, `${tema} home: podio a tre`)
  verifica(await p.getByText('Miglior voto').isVisible(), `${tema} home: statistica curiosa`)
  verifica(await p.getByText('Voto MVP aperto').isVisible(), `${tema} home: l'ultima partita ha il voto aperto e invita a votare`)
  verifica(await p.getByRole('link', { name: 'Vota ora' }).isVisible(), `${tema} home: link "Vota ora"`)
  verifica(!(await p.locator('body').innerText()).toLowerCase().includes('assist'), `${tema}: nessun assist da nessuna parte`)

  await vai(p, '/classifiche', 'classifiche-gol-stagione', tema)
  verifica(/stagione=2/.test(p.url()) === false, `${tema} classifiche: l'URL di partenza e' pulito`)
  for (const [cat, nome] of [['presenze', 'presenze'], ['media_voto', 'media-voto'], ['mvp', 'mvp'], ['pct_vittorie', 'pct-vittorie']] as const) {
    await p.getByRole('button', { name: cat === 'media_voto' ? 'Media voto' : cat === 'pct_vittorie' ? '% vittorie' : cat === 'mvp' ? 'MVP' : 'Presenze', exact: true }).click()
    await p.waitForURL(new RegExp(`cat=${cat}`))
    await assesta(p, `${tema} classifiche ${cat}`)
    if (cat === 'media_voto') verifica((await p.getByText(/almeno \d+ partite/).count()) === 0, `${tema} classifiche: nessun minimo di partite da spiegare`)
    await foto(p, `${tema}-classifiche-${nome}-stagione`)
  }
  await p.getByRole('button', { name: 'Sempre', exact: true }).click()
  await p.waitForURL(/stagione=sempre/)
  await assesta(p, `${tema} classifiche sempre`)
  await foto(p, `${tema}-classifiche-sempre`)
  await p.locator('select.tendina').selectOption({ label: 'Stagione 2025-26' })
  await p.waitForURL(/stagione=1/)
  await assesta(p, `${tema} classifiche stagione chiusa`)
  await foto(p, `${tema}-classifiche-stagione-chiusa`)

  await vai(p, '/partite', 'partite-elenco', tema)
  verifica((await p.locator('a.match').count()) >= 13, `${tema} partite: elenco per stagione`)

  await vai(p, '/partite/10', 'partita-giocata', tema)
  verifica((await p.locator('.ped').count()) === 12, `${tema} partita 10: 12 pedine sul campo`)
  verifica(await p.getByText('Cronaca di prova').isVisible(), `${tema} partita 10: cronaca`)
  verifica((await p.locator('.tab2 li').count()) > 0, `${tema} partita 10: marcatori`)
  verifica((await p.locator('.pr').count()) === 12, `${tema} partita 10: pagella`)
  // posizione salvata: la pedina di A. G. Verdi sta a pos_x 16.7 / pos_y 19.6
  const stile = await p.locator('.ped[aria-label^="A. G. Verdi"]').getAttribute('style')
  verifica(/left:\s*16\.7%/.test(stile ?? '') && /top:\s*19\.6%/.test(stile ?? ''), `${tema} partita 10: pedina alla posizione salvata (${stile})`)
  verifica(await p.getByText('Voto MVP').first().isVisible(), `${tema} partita 10: blocco voto`)
  verifica((await p.locator('#voto-mvp .stamp').count()) === 1, `${tema} partita 10: bollino del vincitore`)

  await vai(p, '/partite/5', 'partita-parita', tema)
  verifica(await p.getByText('decide l\'admin').first().isVisible(), `${tema} partita 5: parita', decide l'admin`)
  await vai(p, '/partite/101', 'partita-nessun-voto-senza-cronaca', tema)
  verifica(await p.getByText('Nessun voto').first().isVisible(), `${tema} partita 101: nessun voto`)
  verifica((await p.getByRole('heading', { name: 'Cronaca' }).count()) === 0, `${tema} partita 101: senza cronaca la pagina sta bene`)
  await vai(p, '/partite/110', 'partita-mvp-scelto-dall-admin', tema)
  verifica((await p.getByText('Scelto dall\'admin: nessun voto ricevuto').count()) >= 1, `${tema} partita 110: MVP scelto dall'admin dopo zero voti, detto chiaramente`)
  await vai(p, '/partite/11', 'partita-convocazione', tema)
  verifica(await p.getByRole('heading', { name: 'Convocati' }).isVisible(), `${tema} partita 11: convocati`)
  verifica((await p.getByRole('heading', { name: 'Voto MVP' }).count()) === 0, `${tema} partita 11: nessun voto MVP prima della partita`)

  await vai(p, '/giocatori', 'giocatori', tema)
  verifica((await p.locator('.row .bdg').count()) > 10, `${tema} giocatori: badge nel listone`)
  verifica(await p.locator('.bdg.neg').first().isVisible(), `${tema} giocatori: badge negativi`)
  await vai(p, '/giocatori/1', 'scheda-giocatore', tema)
  verifica((await p.locator('.stat').count()) === 5, `${tema} scheda: cinque statistiche`)
  verifica((await p.locator('.dot').count()) === 5, `${tema} scheda: ultimi 5 V/P/S`)
  verifica((await p.locator('svg.chart .pt').count()) > 3, `${tema} scheda: grafico dei voti`)
  verifica((await p.locator('.big .stamp').count()) === 1, `${tema} scheda: bollino MVP`)
  verifica(await p.getByText('Non passa mai').isVisible(), `${tema} scheda: descrizione del badge`)
  await vai(p, '/giocatori/999', 'errore-giocatore-inesistente', tema)
  verifica(await p.getByRole('alert').isVisible(), `${tema} giocatore inesistente: errore testuale`)
  await vai(p, '/pagina-che-non-c-e', 'pagina-non-trovata', tema)
  await vai(p, '/admin', 'admin-segnaposto', tema)

  // ---- navigazione con la barra in basso e il pulsante indietro ----
  await p.goto(BASE + '/')
  for (const [nome, url] of [['Classifiche', '/classifiche'], ['Partite', '/partite'], ['Giocatori', '/giocatori'], ['Home', '/']] as const) {
    await p.locator('nav.nav').getByRole('link', { name: nome }).click()
    await p.waitForURL((u) => u.pathname === url)
    verifica((await p.locator(`nav.nav a[aria-current="page"]`).textContent())?.trim() === nome, `${tema} navigazione: ${nome} attiva`)
  }
  await p.getByRole('link', { name: 'Area admin' }).click()
  await p.waitForURL('**/admin')
  await p.goBack()
  await p.waitForURL((u) => u.pathname === '/')
  verifica((await p.locator('main h1').textContent()) === 'Home', `${tema} navigazione: indietro torna alla home`)

  // ---- voto MVP sulla partita 100 (voto aperto) ----
  await vai(p, '/partite/100', 'partita-voto-aperto', tema)
  verifica(await p.getByText(/Chiude|chiude/).first().isVisible(), `${tema} voto: c'e' la chiusura`)
  const conto = await p.locator('[role="timer"]').innerText()
  verifica(/\d\d:\d\d:\d\d/.test(conto), `${tema} voto: conto alla rovescia (${conto.split('\n')[0]})`)
  verifica((await p.locator('.vota input[type=radio]').count()) === 16, `${tema} voto: tutti i giocatori votabili`)
  verifica((await p.locator('.ped').count()) === 6, `${tema} partita 100: sei pedine (una squadra con ripiego automatico)`)
  const invitoHome = await (async () => {
    const q = await s.ctx.newPage()
    await q.goto(BASE + '/')
    await q.locator('main h1').waitFor()
    await q.getByText('Voto MVP aperto').waitFor()
    await q.waitForTimeout(900)
    return q
  })()
  await foto(invitoHome, `${tema}-home-voto-aperto`)
  await invitoHome.getByRole('link', { name: 'Vota ora' }).click()
  await invitoHome.waitForURL(/\/partite\/100#voto-mvp/)
  await invitoHome.getByRole('heading', { name: 'Voto MVP' }).waitFor()
  await invitoHome.waitForTimeout(400)
  verifica(await invitoHome.locator('#voto-mvp').evaluate((e) => e.getBoundingClientRect().top < 300), `${tema} voto: "Vota ora" porta al blocco del voto`)
  await invitoHome.close()

  // una seconda scheda aperta PRIMA del voto: servira' per il 409 dall'interfaccia
  const vecchia = await s.ctx.newPage()
  await vecchia.goto(BASE + '/partite/100')
  await vecchia.locator('.vota').waitFor()

  await p.getByText('P. Colombo', { exact: false }).first().waitFor({ state: 'attached' })
  await p.locator('.vota label', { hasText: 'Colombo' }).click()
  await p.getByRole('group', { name: 'Conferma del voto' }).waitFor()
  verifica((await p.getByRole('group', { name: 'Conferma del voto' }).innerText()).includes('P. Colombo'), `${tema} voto: conferma nella pagina, non confirm()`)
  await p.waitForTimeout(400)
  await foto(p, `${tema}-partita-voto-conferma`)
  await p.getByRole('button', { name: 'Conferma il voto' }).click()
  await p.getByText(/Voto registrato/).waitFor()
  await p.waitForTimeout(500)
  verifica((await p.locator('.vota').count()) === 0, `${tema} voto: dopo il voto l'elenco sparisce`)
  verifica(await p.getByText(/Hai gia' votato da questo telefono/).isVisible(), `${tema} voto: "hai gia' votato"`)
  verifica((tema === 'light' ? /1 ha votato/ : /2 hanno votato/).test(await p.locator('#voto-mvp').innerText()), `${tema} voto: solo il numero dei votanti, mentre e' aperto`)
  verifica(!/Colombo\s*\n?\s*1/.test(await p.locator('#voto-mvp').innerText()), `${tema} voto: nessun conteggio per giocatore mentre e' aperto`)
  await foto(p, `${tema}-partita-voto-registrato`)

  // secondo voto direttamente all'API: 409
  const r2 = await p.evaluate(async () => {
    const r = await fetch('/api/partite/100/mvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ giocatore_id: 2 }) })
    return { stato: r.status, corpo: await r.json() }
  })
  verifica(r2.stato === 409 && /gia' votato/.test(r2.corpo.errore), `${tema} voto: secondo voto = 409 (${r2.corpo.errore})`)

  // secondo voto dall'interfaccia (la scheda "vecchia" mostra ancora l'elenco)
  await vecchia.locator('.vota label', { hasText: 'Bianchi' }).click()
  await vecchia.getByRole('button', { name: 'Conferma il voto' }).click()
  await vecchia.getByRole('alert').filter({ hasText: /gia' votato/i }).waitFor()
  await vecchia.waitForTimeout(500)
  verifica(await vecchia.getByText(/Hai gia' votato da questo telefono/).isVisible(), `${tema} voto: la scheda vecchia mostra il 409 e "hai gia' votato"`)
  await foto(vecchia, `${tema}-partita-voto-409`)
  await vecchia.close()

  // dopo il ricaricamento il telefono ricorda il voto (cookie del dispositivo)
  await p.reload()
  await p.getByText(/Hai gia' votato da questo telefono/).waitFor()
  verifica(true, `${tema} voto: dopo il ricaricamento il voto e' ricordato`)

  // ---- conto alla rovescia fino alla chiusura automatica ----
  const idScadenza = tema === 'light' ? 102 : 103
  partitaInScadenza(idScadenza, 14)
  await p.goto(`${BASE}/partite/${idScadenza}`)
  await p.locator('[role="timer"]').waitFor()
  verifica(/00:00:\d\d/.test(await p.locator('[role="timer"]').innerText()), `${tema} voto: conto alla rovescia in secondi`)
  await p.getByText(/Nessun voto: per questa partita/).waitFor({ timeout: 40_000 })
  verifica(true, `${tema} voto: a tempo scaduto la pagina passa da sola all'esito`)
  await p.waitForTimeout(600)
  await foto(p, `${tema}-partita-voto-chiuso-a-tempo`)

  // ---- tema manuale (il pulsante cambia e ricorda il tema) ----
  const prima = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await p.getByRole('button', { name: /Cambia tema/ }).click()
  const dopo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
  verifica(prima !== dopo, `${tema} tema: il pulsante cambia i colori`)
  await p.reload()
  await p.locator('main h1').waitFor()
  verifica((await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === dopo, `${tema} tema: la scelta e' ricordata`)

  // ---- font, CSP, console ----
  const font = await p.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`)
  })
  verifica(font.some((f) => f.includes('Anton')) && font.some((f) => f.includes('Nunito Sans')), `${tema} font self-hosted caricati (${font.join(', ')})`)
  for (const pg of s.ctx.pages()) {
    const v = await pg.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
    s.csp.push(...v)
  }
  verifica(s.csp.length === 0, `${tema} zero violazioni CSP ${s.csp.join('; ')}`)
  verifica(s.esterne.length === 0, `${tema} nessuna richiesta a siti esterni ${s.esterne.join(', ')}`)
  verifica(s.errori.length === 0, `${tema} console pulita (zero errori e avvisi) ${s.errori.join(' | ')}`)
  await s.ctx.close()
}

/** Movimento ridotto: nessuna animazione attiva. */
async function provaMovimentoRidotto(browser: Browser) {
  console.log('\n== movimento ridotto ==')
  const s = await apri(browser, 'light', { reducedMotion: 'reduce' })
  const p = await s.ctx.newPage()
  await p.goto(BASE + '/partite/10')
  await p.locator('.ped').first().waitFor()
  const animate = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length)
  verifica(animate === 0, `prefers-reduced-motion: nessuna animazione attiva (${animate})`)
  await s.ctx.close()
}

async function main() {
  mkdirSync(SCHERMATE, { recursive: true })
  console.log(`dati di prova in ${DATI}, schermate in ${SCHERMATE}`)
  preparaDati()
  await avviaServer()
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined })
  try {
    await provaTema(browser, 'light')
    await provaTema(browser, 'dark')
    await provaMovimentoRidotto(browser)
  } finally {
    await browser.close()
  }
}

main()
  .catch((e) => {
    falliti.push(`errore: ${e instanceof Error ? e.stack : e}`)
  })
  .finally(() => {
    fermaServer()
    rmSync(DATI, { recursive: true, force: true })
    console.log(falliti.length ? `\nFALLITE ${falliti.length} verifiche:\n- ${falliti.join('\n- ')}` : '\nTutte le verifiche sono passate.')
    process.exit(falliti.length ? 1 : 0)
  })
