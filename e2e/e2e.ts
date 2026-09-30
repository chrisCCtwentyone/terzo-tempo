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
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { DATI, RADICE, apri as apriContesto, assesta, avviaServer, chiudiSessione, concludi, falliti, foto as fotoIn, iso, preparaBase, sql, verifica } from './impianto.ts'

const PORTA = Number(process.env.E2E_PORT ?? 8799)
const BASE = `http://localhost:${PORTA}`
const SCHERMATE = resolve(process.env.E2E_SCREENS ?? join(RADICE, 'e2e/schermate'))
// 409 e 404 attesi dalle prove esplicite (già votato, partita inesistente); 403 = /api/admin/me senza accesso (la pagina "Area riservata").
// Il browser li registra come errori di rete.
const apri = (browser: Browser, tema: 'light' | 'dark', extra: { reducedMotion?: 'reduce' } = {}) => apriContesto(browser, BASE, tema, { ...extra, ignora: /status of (409|404|403)/ })
const foto = (p: Page, nome: string) => fotoIn(p, SCHERMATE, nome)

/** Partite di prova RELATIVE A ORA (il seed ha date fisse: il voto aperto dipende dall'orologio). */
function preparaDati() {
  preparaBase()
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

async function vai(p: Page, percorso: string, nome: string, tema: string) {
  await p.goto(BASE + percorso)
  await p.locator('main h1').waitFor()
  await assesta(p, `${tema} ${nome}`)
  if (!percorso.startsWith('/admin')) {
    // il piede di ogni pagina pubblica: pulsante "Area admin" (verso /admin, area di tocco >= 44 px) e chip "Info"
    const cta = p.locator('footer.pie a.admin-cta')
    const riquadro = await cta.boundingBox()
    verifica((await cta.count()) === 1 && (await cta.getAttribute('href')) === '/admin' && (riquadro?.height ?? 0) >= 44, `${tema} ${nome}: pulsante "Area admin" nel piede, verso /admin`)
    verifica((await p.locator('footer.pie a[href="/info"]').count()) === 1, `${tema} ${nome}: link "Info" nel piede`)
  }
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
  // il piede in fondo alla Home, visto come lo vede il telefono (con la barra di navigazione)
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await p.waitForTimeout(300)
  await p.screenshot({ path: join(SCHERMATE, `${tema}-home-piede.png`) })
  await p.evaluate(() => window.scrollTo(0, 0))

  await vai(p, '/classifiche', 'classifiche-gol-stagione', tema)
  verifica(/stagione=2/.test(p.url()) === false, `${tema} classifiche: l'URL di partenza e' pulito`)
  for (const [cat, nome] of [['presenze', 'presenze'], ['media_voto', 'media-voto'], ['mvp', 'mvp'], ['pct_vittorie', 'pct-vittorie']] as const) {
    await p.getByRole('button', { name: cat === 'media_voto' ? 'Media voto' : cat === 'pct_vittorie' ? '% vittorie' : cat === 'mvp' ? 'MVP' : 'Presenze', exact: true }).click()
    await p.waitForURL(new RegExp(`cat=${cat}`))
    await assesta(p, `${tema} classifiche ${cat}`)
    if (cat === 'media_voto') verifica((await p.getByText(/almeno \d+ partite/).count()) === 0, `${tema} classifiche: nessun minimo di partite da spiegare`)
    await foto(p, `${tema}-classifiche-${nome}-stagione`)
  }
  // un solo selettore: ogni stagione col suo nome + "Tutte le stagioni"; niente piu' "Sempre" ne' tendina a parte
  const periodo = p.getByRole('group', { name: 'Periodo' })
  verifica((await periodo.getByRole('button').allInnerTexts()).join('|') === 'Stagione 2026-27|Stagione 2025-26|Tutte le stagioni', `${tema} classifiche: il periodo elenca ogni stagione e "Tutte le stagioni"`)
  verifica((await periodo.getByRole('button', { name: 'Stagione 2026-27' }).getAttribute('aria-pressed')) === 'true', `${tema} classifiche: di default la stagione aperta`)
  verifica((await p.getByRole('button', { name: 'Sempre', exact: true }).count()) === 0 && (await p.locator('select.tendina').count()) === 0, `${tema} classifiche: nessun "Sempre" e nessuna tendina a parte`)
  await periodo.getByRole('button', { name: 'Tutte le stagioni' }).click()
  await p.waitForURL(/stagione=sempre/)
  await assesta(p, `${tema} classifiche tutte le stagioni`)
  verifica(await p.getByText('Terzo Tempo · Tutte le stagioni').isVisible(), `${tema} classifiche: "Tutte le stagioni" nel sopratitolo`)
  await foto(p, `${tema}-classifiche-tutte-le-stagioni`)
  await periodo.getByRole('button', { name: 'Stagione 2025-26' }).click()
  await p.waitForURL(/stagione=1/)
  verifica((await periodo.getByRole('button', { name: 'Stagione 2025-26' }).getAttribute('aria-pressed')) === 'true', `${tema} classifiche: la stagione scelta e' evidenziata e sta nell'URL`)
  await assesta(p, `${tema} classifiche stagione chiusa`)
  await foto(p, `${tema}-classifiche-stagione-chiusa`)

  await vai(p, '/partite', 'partite-elenco', tema)
  verifica((await p.locator('a.match').count()) >= 13, `${tema} partite: elenco per stagione`)

  await vai(p, '/partite/10', 'partita-giocata', tema)
  verifica((await p.locator('.ped').count()) === 12, `${tema} partita 10: 12 pedine sul campo`)
  verifica(await p.getByText('Cronaca di prova').isVisible(), `${tema} partita 10: cronaca`)
  verifica((await p.locator('.tab2 li').count()) > 0, `${tema} partita 10: marcatori`)
  verifica((await p.locator('.pr').count()) === 12, `${tema} partita 10: pagella`)
  // posizione salvata: la pedina di Verdi A.G. sta a pos_x 16.7 / pos_y 19.6
  const stile = await p.locator('.ped[aria-label^="Verdi A.G."]').getAttribute('style')
  verifica(/left:\s*16\.7%/.test(stile ?? '') && /top:\s*19\.6%/.test(stile ?? ''), `${tema} partita 10: pedina alla posizione salvata (${stile})`)
  const cart = await p.locator('.pitch .cart').allInnerTexts()
  verifica(cart.length === 12 && cart.every((t) => /^\S.* (\p{Lu}\.)+$/u.test(t)), `${tema} partita 10: sul campo il nome è "Cognome I." per intero (${cart.slice(0, 4).join(', ')}...)`)
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
  // ---- Info: link nel piede e credits (solo il nickname, link al profilo e al codice) ----
  await p.goto(BASE + '/')
  await p.locator('main h1').waitFor()
  verifica(await p.locator('footer.pie').getByRole('link', { name: 'Info' }).isVisible(), `${tema} piede: link "Info"`)
  await p.locator('footer.pie').getByRole('link', { name: 'Info' }).click()
  await p.waitForURL('**/info')
  await vai(p, '/info', 'info', tema)
  verifica(await p.getByText('chrisCCtwentyone').first().isVisible(), `${tema} info: il nickname`)
  const profilo = p.locator('a[href="https://github.com/chrisCCtwentyone"]')
  const codice = p.locator('a[href="https://github.com/chrisCCtwentyone/terzo-tempo"]')
  verifica((await profilo.count()) === 1 && (await codice.count()) === 1, `${tema} info: link al profilo e al codice sorgente`)
  verifica((await profilo.getAttribute('target')) === '_blank' && /noopener/.test((await profilo.getAttribute('rel')) ?? ''), `${tema} info: link esterni con target _blank e rel noopener`)
  await vai(p, '/admin', 'admin-area-riservata', tema)
  verifica(await p.getByRole('heading', { name: /Area riservata agli admin/ }).isVisible(), `${tema} /admin senza accesso: "Area riservata agli admin"`)
  verifica((await p.locator('input[type=password], input[type=email]').count()) === 0, `${tema} /admin senza accesso: nessun form di password`)
  verifica(await p.getByRole('link', { name: 'Torna al sito' }).isVisible(), `${tema} /admin senza accesso: link "Torna al sito"`)

  // ---- navigazione con la barra in basso e il pulsante indietro ----
  await p.goto(BASE + '/')
  for (const [nome, url] of [['Classifiche', '/classifiche'], ['Partite', '/partite'], ['Giocatori', '/giocatori'], ['Home', '/']] as const) {
    await p.locator('nav.nav').getByRole('link', { name: nome }).click()
    await p.waitForURL((u) => u.pathname === url)
    verifica((await p.locator(`nav.nav a[aria-current="page"]`).textContent())?.trim() === nome, `${tema} navigazione: ${nome} attiva`)
  }
  await p.locator('footer.pie a.admin-cta').click()
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

  await p.getByText('Colombo P.', { exact: false }).first().waitFor({ state: 'attached' })
  await p.locator('.vota label', { hasText: 'Colombo' }).click()
  await p.getByRole('group', { name: 'Conferma del voto' }).waitFor()
  verifica((await p.getByRole('group', { name: 'Conferma del voto' }).innerText()).includes('Colombo P.'), `${tema} voto: conferma nella pagina, non confirm()`)
  await p.waitForTimeout(400)
  await foto(p, `${tema}-partita-voto-conferma`)
  await p.getByRole('button', { name: 'Conferma il voto' }).click()
  await p.getByText(/Voto registrato/).waitFor()
  await p.waitForTimeout(500)
  verifica((await p.locator('.vota').count()) === 0, `${tema} voto: dopo il voto l'elenco sparisce`)
  verifica(await p.getByText(/Hai già votato da questo telefono/).isVisible(), `${tema} voto: "hai già votato"`)
  verifica((tema === 'light' ? /1 ha votato/ : /2 hanno votato/).test(await p.locator('#voto-mvp').innerText()), `${tema} voto: solo il numero dei votanti, mentre e' aperto`)
  verifica(!/Colombo\s*\n?\s*1/.test(await p.locator('#voto-mvp').innerText()), `${tema} voto: nessun conteggio per giocatore mentre e' aperto`)
  await foto(p, `${tema}-partita-voto-registrato`)

  // secondo voto direttamente all'API: 409
  const r2 = await p.evaluate(async () => {
    const r = await fetch('/api/partite/100/mvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ giocatore_id: 2 }) })
    return { stato: r.status, corpo: await r.json() }
  })
  verifica(r2.stato === 409 && /già votato/.test(r2.corpo.errore), `${tema} voto: secondo voto = 409 (${r2.corpo.errore})`)

  // secondo voto dall'interfaccia (la scheda "vecchia" mostra ancora l'elenco)
  await vecchia.locator('.vota label', { hasText: 'Bianchi' }).click()
  await vecchia.getByRole('button', { name: 'Conferma il voto' }).click()
  await vecchia.getByRole('alert').filter({ hasText: /già votato/i }).waitFor()
  await vecchia.waitForTimeout(500)
  verifica(await vecchia.getByText(/Hai già votato da questo telefono/).isVisible(), `${tema} voto: la scheda vecchia mostra il 409 e "hai già votato"`)
  await foto(vecchia, `${tema}-partita-voto-409`)
  await vecchia.close()

  // dopo il ricaricamento il telefono ricorda il voto (cookie del dispositivo)
  await p.reload()
  await p.getByText(/Hai già votato da questo telefono/).waitFor()
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
  await chiudiSessione(s, tema)
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
  await avviaServer(PORTA)
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
    rmSync(DATI, { recursive: true, force: true })
    concludi()
  })
