/**
 * Prove nel BROWSER della partita in diretta (parte di `npm run e2e:admin`: server col bypass di sviluppo, D1 locale usa-e-getta,
 * Chromium 390x844 con touch). Specifica: CLAUDE.md, "Partita in diretta".
 *
 *  - flusso admin completo: inizia la diretta, 3 gol e 1 autogol, cambia un marcatore, elimina un gol, annulla l'ultimo, fine partita;
 *    il risultato e i gol si ritrovano nella schermata Risultato e nelle classifiche dopo "giocata";
 *  - rete assente: due gol in coda ("2 da inviare"), pagina ricaricata con le chiamate al server in errore (la coda resta), una risposta
 *    persa che obbliga a un secondo invio con lo stesso id_client, poi ognuno arriva UNA volta sola; un invio rifiutato dal server
 *    (partita chiusa nel frattempo) si mostra e non si ritenta;
 *  - doppio invio dello stesso id_client; partenza automatica all'orario; "da confermare" dopo due ore;
 *  - pagina pubblica che si aggiorna da sola (altra scheda), solo da visibile e solo in diretta;
 *  - nome con codice HTML (XSS) sulle schermate nuove; rilevatore di trabocchi sulle schermate nuove.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright-core'
import { apri, assesta, chiudiSessione, foto, iso, sql, verifica } from './impianto.ts'
import { provaTrabocchi, type Schermata } from './trabocchi.ts'

type Esito<T = any> = { stato: number; json: T }
const api = <T = any>(p: Page, percorso: string, init?: { method?: string; corpo?: unknown }) =>
  p.evaluate(async ([perc, m, c]) => {
    const r = await fetch(perc as string, { method: (m as string) ?? 'GET', headers: { 'Content-Type': 'application/json' }, body: c === undefined ? undefined : JSON.stringify(c) })
    return { stato: r.status, json: await r.json().catch(() => null) } as Esito<T>
  }, [percorso, init?.method, init?.corpo] as const)

/** Dal processo di prova (non dal browser): vale anche quando il browser e' senza rete. Il bypass di sviluppo apre l'admin da localhost. */
const srv = async <T = any>(BASE: string, percorso: string, init?: { method?: string; corpo?: unknown }): Promise<Esito<T>> => {
  const r = await fetch(BASE + percorso, { method: init?.method ?? 'GET', headers: { 'Content-Type': 'application/json' }, body: init?.corpo === undefined ? undefined : JSON.stringify(init.corpo) })
  return { stato: r.status, json: (await r.json().catch(() => null)) as T }
}

const H = 3600_000
/** Seed: giocatori 1-8 = Rossi M., Bianchi L., Verdi A.G., Esposito F., Russo D., Romano G., Colombo P., Ricci S. */
const SQ_A = [1, 2, 3, 4]
const SQ_B = [5, 6, 7, 8]
const uid = (() => {
  let n = 0
  return () => `e2e-live-${Date.now().toString(36)}-${++n}`
})()

/** Crea una partita (convocazione) con le squadre assegnate, via API. Restituisce l'id. */
async function creaPartita(p: Page, dataOra: string, conSquadre = true, a = SQ_A, b = SQ_B): Promise<number> {
  const stagione = (await api<{ stagioni: { id: number; aperta: boolean }[] }>(p, '/api/stagioni')).json.stagioni.find((s) => s.aperta)!.id
  const r = await api<{ id: number }>(p, '/api/admin/partite', { method: 'POST', corpo: { data_ora: dataOra, stagione_id: stagione, giocatori: [...a, ...b] } })
  if (r.stato !== 201) throw new Error(`creaPartita: ${r.stato} ${JSON.stringify(r.json)}`)
  if (conSquadre) {
    const s = await api(p, `/api/admin/partite/${r.json.id}/convocati`, { method: 'PUT', corpo: { convocati: [...a.map((g) => ({ giocatore_id: g, squadra: 'A' })), ...b.map((g) => ({ giocatore_id: g, squadra: 'B' }))] } })
    if (s.stato !== 200) throw new Error(`squadre: ${s.stato} ${JSON.stringify(s.json)}`)
  }
  return r.json.id
}
const segna = (p: Page, partita: number, giocatore: number, tipo = 'gol', id_client = uid()) =>
  api(p, `/api/admin/partite/${partita}/diretta/eventi`, { method: 'POST', corpo: { id_client, tipo, giocatore_id: giocatore } })
const diretta = (p: Page, partita: number) => api(p, `/api/partite/${partita}/diretta`)
const adminDiretta = (p: Page, partita: number) => api(p, `/api/admin/partite/${partita}/diretta`)
const gol = async (p: Page) => Object.fromEntries((await api<{ gol: { nome: string; valore: number }[] }>(p, '/api/classifiche?stagione=sempre')).json.gol.map((r) => [r.nome, r.valore])) as Record<string, number>
const cancella = (p: Page, partita: number) => api(p, `/api/admin/partite/${partita}`, { method: 'DELETE' })

async function misure(p: Page, selettore: string): Promise<{ w: number; h: number }[]> {
  return p.locator(selettore).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })))
}

export async function provaLive(browser: Browser, BASE: string, SCHERMATE: string, tema: 'light' | 'dark') {
  console.log(`\n== diretta, tema ${tema} ==`)
  const t = `${tema} diretta`
  mkdirSync(join(SCHERMATE, 'live'), { recursive: true })
  const s = await apri(browser, BASE, tema, { touch: true, ignora: /status of (400|404|409)|ERR_FAILED|ERR_INTERNET_DISCONNECTED/ })
  // la vibrazione si osserva: il telefono vero la ha (Android), il portatile no
  await s.ctx.addInitScript(() => {
    ;(window as unknown as { __vibra: unknown[] }).__vibra = []
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (x: unknown) => ((window as unknown as { __vibra: unknown[] }).__vibra.push(x), true) })
  })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/partite`)
  await p.locator('main h1').waitFor()
  const classificaPrima = await gol(p)

  // ---------- senza squadre: niente "Inizia diretta", un messaggio che porta alla sezione Squadre ----------
  const senza = await creaPartita(p, iso(Date.now() + 5 * H), false)
  await p.goto(`${BASE}/admin/partite/${senza}?sez=convocati`)
  await p.locator('.carta-diretta').waitFor()
  verifica((await p.getByRole('button', { name: 'Inizia diretta' }).count()) === 0, `${t}: senza squadre assegnate non c'e' "Inizia diretta"`)
  verifica(/servono le squadre/i.test(await p.locator('.carta-diretta').innerText()), `${t}: senza squadre un messaggio spiega che servono`)
  await p.getByRole('button', { name: 'Vai alle Squadre' }).click()
  await p.getByRole('heading', { name: 'Squadre', level: 2 }).waitFor()
  verifica(true, `${t}: "Vai alle Squadre" porta alla sezione Squadre`)
  const rifiutoInizia = await api(p, `/api/admin/partite/${senza}/diretta/inizia`, { method: 'POST', corpo: {} })
  verifica(rifiutoInizia.stato === 409 && /Squadre/.test(rifiutoInizia.json.errore), `${t}: il server rifiuta "inizia" senza squadre (${rifiutoInizia.stato})`)
  await cancella(p, senza)

  // ---------- il flusso completo ----------
  const P = await creaPartita(p, iso(Date.now() + 3 * H))
  await p.goto(`${BASE}/admin/partite/${P}?sez=squadre`)
  await p.locator('.carta-diretta').waitFor()
  const inizia = p.getByRole('button', { name: 'Inizia diretta' })
  const mInizia = await inizia.boundingBox()
  verifica((mInizia?.height ?? 0) >= 56 && (mInizia?.width ?? 0) > 200, `${t}: "Inizia diretta" e' un pulsante grande (${Math.round(mInizia?.width ?? 0)}x${Math.round(mInizia?.height ?? 0)})`)
  verifica((await p.locator('nav.nav.adm .live-link').count()) === 0, `${t}: senza partite in diretta niente scorciatoia LIVE`)
  await assesta(p, `${t} partita con "Inizia diretta"`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-01-partita-inizia-diretta`)
  await inizia.click()
  await p.waitForURL(new RegExp(`/admin/partite/${P}/live$`))
  await p.getByRole('heading', { name: 'In diretta', level: 1 }).waitFor()
  await p.locator('.live-squadre').first().waitFor()
  verifica((await diretta(p, P)).json.stato === 'in_diretta', `${t}: dopo "Inizia diretta" la diretta e' in_diretta (pubblico)`)

  // scorciatoia LIVE nella navigazione, solo ora che c'e' una diretta
  const live = p.locator('nav.nav.adm a.live-link')
  await live.waitFor()
  verifica((await live.getAttribute('href')) === `/admin/partite/${P}/live` && (await p.locator('nav.nav.adm .nav-in a').count()) === 6, `${t}: scorciatoia "Live" nella navigazione admin (6 voci), verso la schermata live`)
  const misureNav = await misure(p, 'nav.nav.adm .nav-in a')
  verifica(misureNav.every((m) => m.w >= 44 && m.h >= 44), `${t}: navigazione a 6 voci: aree di tocco >= 44 px`)

  const stato = p.locator('.live-invio')
  verifica(/Tutto inviato/.test(await stato.innerText()), `${t}: indicatore "tutto inviato" a coda vuota`)
  const punti = async () => (await p.locator('.live-tabellone .sc').allInnerTexts()).join('-')
  verifica((await punti()) === '0-0', `${t}: tabellone 0-0`)
  const tessere = await misure(p, '.live-squadre .live-tessera')
  verifica(tessere.length === 8 && tessere.every((m) => m.h >= 56), `${t}: otto figurine in campo, tutte alte almeno 56 px (${tessere.map((m) => Math.round(m.h)).join(',')})`)
  verifica((await p.locator('.live-squadre h3').allTextContents()).join('|') === 'Casaccati|Smollicati', `${t}: due colonne, Casaccati e Smollicati`)
  const tessera = (nome: string) => p.locator('.live-squadre').first().getByRole('button', { name: nome, exact: true })
  const inviato = () => p.locator('.live-invio[data-pendenti="0"]').waitFor({ timeout: 20_000 })

  // conferma rapida: "Gol di Rossi M.?" con [Gol] [Autogol] [Annulla], nel pannello della pagina (mai confirm())
  let dialoghi = 0
  p.on('dialog', (d) => { dialoghi++; void d.dismiss() })
  await tessera('Rossi M.').click()
  const pannello = p.getByRole('group', { name: 'Conferma del gol' })
  await pannello.waitFor()
  verifica((await pannello.innerText()).replace(/\s+/g, ' ').includes('Gol di Rossi M.?'), `${t}: toccando la figurina compare "Gol di Rossi M.?"`)
  const bottoni = await misure(p, '.live-az .btn')
  verifica(bottoni.length === 3 && bottoni.every((m) => m.h >= 56), `${t}: [Gol] [Autogol] [Annulla] alti almeno 56 px (${bottoni.map((m) => Math.round(m.h)).join(',')})`)
  verifica((await p.locator('.live-az .btn').allTextContents()).join('|') === 'Gol|Autogol|Annulla', `${t}: i tre pulsanti sono Gol, Autogol, Annulla`)
  const riquadro = (await pannello.boundingBox())!
  verifica(riquadro.y >= 0 && riquadro.y + riquadro.height <= 844, `${t}: il pannello di conferma e' tutto dentro lo schermo (${Math.round(riquadro.y)}-${Math.round(riquadro.y + riquadro.height)})`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-02-conferma-gol`)
  await pannello.getByRole('button', { name: 'Annulla' }).click()
  verifica((await pannello.count()) === 0 && (await punti()) === '0-0', `${t}: "Annulla" chiude il pannello senza segnare niente`)

  // 3 gol e 1 autogol: ogni tocco e' uno in piu' (tessera + conferma), con feedback subito
  await tessera('Rossi M.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await p.locator('.live-tabellone .half.a .sc.punto-nuovo').waitFor({ timeout: 2000 })
  verifica((await punti()) === '1-0', `${t}: il punteggio salta subito, prima ancora dell'invio (1-0)`)
  verifica((await p.evaluate(() => (window as unknown as { __vibra: unknown[] }).__vibra.length)) >= 1, `${t}: vibrazione al gol (navigator.vibrate chiamato)`)
  await tessera('Russo D.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await tessera('Rossi M.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await tessera('Romano G.').click()
  await pannello.getByRole('button', { name: 'Autogol', exact: true }).click() // l'autogol di Romano (B) e' un punto per A
  await inviato()
  verifica((await punti()) === '3-1', `${t}: 3 gol e 1 autogol: Casaccati 3 (2 gol di Rossi + autogol di Romano), Smollicati 1 (${await punti()})`)
  const lista = async () => (await p.locator('ol.live-gol .live-riga-testa .chi').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
  verifica((await lista()).join(' | ') === 'Rossi M. Casaccati | Russo D. Smollicati | Rossi M. Casaccati | Romano G. Autogol · punto Casaccati', `${t}: l'elenco dei gol e' in ordine, con l'autogol riconoscibile (${(await lista()).join(' | ')})`)
  const sulServer = (await adminDiretta(p, P)).json
  verifica(sulServer.eventi.length === 4 && sulServer.squadre.map((x: { gol: number }) => x.gol).join('-') === '3-1', `${t}: sul server 4 eventi, 3-1`)
  await assesta(p, `${t} schermata live`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-03-live-con-gol`)

  // cambia marcatore del 2 gol (Russo -> Colombo)
  await p.getByRole('button', { name: /^Cambia marcatore del gol 2/ }).click()
  const cambia = p.getByRole('group', { name: 'Cambia il gol 2' })
  await cambia.waitFor()
  await foto(p, join(SCHERMATE, 'live'), `${tema}-04-cambia-marcatore`)
  await cambia.getByRole('button', { name: 'Colombo P.', exact: true }).click()
  await inviato()
  verifica((await lista())[1].startsWith('Colombo P. Smollicati'), `${t}: cambia marcatore: il 2 gol e' di Colombo (${(await lista())[1]})`)
  // elimina il 3 gol, con la conferma nella pagina
  await p.getByRole('button', { name: /^Elimina il gol 3/ }).click()
  const confEl = p.getByRole('group', { name: 'Conferma' })
  await confEl.waitFor()
  verifica(/Eliminare il gol di Rossi M\.\?/.test(await confEl.innerText()), `${t}: elimina chiede conferma nella pagina`)
  await confEl.getByRole('button', { name: 'Sì, elimina' }).click()
  await inviato()
  verifica((await punti()) === '2-1' && (await lista()).length === 3, `${t}: eliminato il 3 gol: 2-1 con 3 gol in elenco (${await punti()})`)
  // annulla ultimo: toglie l'autogol
  const annulla = p.getByRole('button', { name: /^Annulla ultimo/ })
  const mAnnulla = await annulla.boundingBox()
  verifica((mAnnulla?.height ?? 0) >= 56 && (mAnnulla?.width ?? 0) > 250, `${t}: "Annulla ultimo" e' un pulsante grande (${Math.round(mAnnulla?.width ?? 0)}x${Math.round(mAnnulla?.height ?? 0)})`)
  await annulla.click()
  await inviato()
  verifica((await punti()) === '1-1' && (await lista()).length === 2, `${t}: "Annulla ultimo" toglie l'autogol di Romano: 1-1 (${await punti()})`)
  // un altro gol, di Bianchi
  await tessera('Bianchi L.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await inviato()
  verifica((await punti()) === '2-1', `${t}: gol di Bianchi: 2-1`)
  const finale = (await adminDiretta(p, P)).json
  verifica(finale.eventi.map((e: { nome: string }) => e.nome).join(',') === 'Rossi M.,Colombo P.,Bianchi L.' && finale.squadre.map((x: { gol: number }) => x.gol).join('-') === '2-1', `${t}: sul server restano Rossi, Colombo, Bianchi (2-1)`)
  verifica(dialoghi === 0, `${t}: nessun confirm()/alert() del browser (${dialoghi})`)

  // fine partita: conferma nella pagina, poi la schermata Risultato
  await p.getByRole('button', { name: 'Fine partita', exact: true }).click()
  const confFine = p.getByRole('group', { name: 'Conferma' })
  await confFine.waitFor()
  verifica(/Finire la partita sul Casaccati 2 – 1 Smollicati\?/.test((await confFine.innerText()).replace(/\s+/g, ' ')), `${t}: "Fine partita" chiede conferma col punteggio (${(await confFine.innerText()).replace(/\s+/g, ' ').slice(0, 70)})`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-05-fine-partita-conferma`)
  await confFine.getByRole('button', { name: 'Sì, fine partita' }).click()
  await p.waitForURL(new RegExp(`/admin/partite/${P}\\?sez=risultato`))
  await p.getByRole('heading', { name: 'Risultato', level: 2 }).waitFor()
  const cont = async (nome: string) => p.getByRole('group', { name: `Gol di ${nome}`, exact: true }).locator('output').innerText()
  verifica((await cont('Rossi M.')) === '1' && (await cont('Colombo P.')) === '1' && (await cont('Bianchi L.')) === '1' && (await cont('Russo D.')) === '0', `${t}: nella schermata Risultato i gol per giocatore (Rossi 1, Colombo 1, Bianchi 1, Russo 0)`)
  verifica((await p.locator('.band .sc').allInnerTexts()).join('-') === '2-1', `${t}: nella schermata Risultato il punteggio e' 2-1`)
  const dopoFine = (await api<{ stato: string; squadre: { gol: number | null }[] }>(p, `/api/partite/${P}`)).json
  verifica(dopoFine.stato === 'convocazione' && (await diretta(p, P)).json.stato === 'da_confermare', `${t}: dopo "Fine partita" la partita aspetta ancora voti e "giocata" (da_confermare)`)
  await p.getByRole('button', { name: 'Segna come giocata' }).click()
  await p.getByRole('heading', { name: 'Voto MVP', level: 2 }).waitFor()
  const giocata = (await api<{ stato: string; squadre: { gol: number }[]; mvp: { stato: string } }>(p, `/api/partite/${P}`)).json
  verifica(giocata.stato === 'giocata' && giocata.squadre.map((x) => x.gol).join('-') === '2-1' && giocata.mvp.stato === 'aperto', `${t}: "Segna come giocata": 2-1 e il voto MVP si apre solo adesso`)
  const classificaDopo = await gol(p)
  const piuUno = (n: string) => (classificaDopo[n] ?? 0) - (classificaPrima[n] ?? 0)
  verifica(piuUno('Rossi M.') === 1 && piuUno('Colombo P.') === 1 && piuUno('Bianchi L.') === 1 && piuUno('Russo D.') === 0, `${t}: nelle classifiche +1 a Rossi, Colombo e Bianchi, niente a Russo`)
  const dopoGiocata = await segna(p, P, 1)
  verifica(dopoGiocata.stato === 409, `${t}: a partita giocata un gol e' rifiutato (${dopoGiocata.stato})`)

  // ---------- doppio invio dello stesso id_client, partenza automatica all'orario ----------
  const Q = await creaPartita(p, iso(Date.now() - 10 * 60_000)) // l'orario e' gia' passato di 10 minuti
  verifica((await diretta(p, Q)).json.stato === 'in_diretta', `${t}: partenza automatica: una partita con l'orario passato e le squadre e' in diretta senza che nessuno la inizi`)
  const stesso = uid()
  const a = await segna(p, Q, 1, 'gol', stesso)
  const b = await segna(p, Q, 1, 'gol', stesso)
  verifica(a.stato === 201 && b.stato === 200 && a.json.evento.id === b.json.evento.id && (await diretta(p, Q)).json.eventi.length === 1, `${t}: lo stesso id_client due volte: 201 poi 200, un solo evento`)
  const senzaSq = await creaPartita(p, iso(Date.now() - 10 * 60_000), false)
  verifica((await diretta(p, senzaSq)).json.stato === 'non_iniziata', `${t}: con l'orario passato ma SENZA squadre non parte da sola`)
  await cancella(p, senzaSq)

  // ---------- la pagina pubblica: IN DIRETTA, si aggiorna da sola ----------
  const pub = await s.ctx.newPage()
  await pub.goto(`${BASE}/`)
  await pub.locator('.card.diretta').waitFor()
  const cartaHome = (await pub.locator('.card.diretta').textContent()) ?? ''
  verifica(/IN DIRETTA/.test(cartaHome) && (await pub.locator('.card.diretta .live-dot').count()) === 1, `${t}: la Home ha in cima la carta "IN DIRETTA" col pallino rosso`)
  verifica((await pub.locator('main .card').first().evaluate((e) => e.classList.contains('diretta'))) && (await pub.locator('.card.diretta .band .sc').allInnerTexts()).join('-') === '1-0', `${t}: la carta e' la PRIMA della Home e mostra il punteggio (1-0)`)
  verifica((await pub.locator('.card.diretta .live-dot').evaluate((e) => getComputedStyle(e).animationName)) === 'pulsa', `${t}: il pallino pulsa (animazione "pulsa")`)
  await assesta(pub, `${t} home in diretta`)
  await foto(pub, join(SCHERMATE, 'live'), `${tema}-06-home-in-diretta`)
  await pub.getByRole('link', { name: 'Segui la diretta' }).click()
  await pub.waitForURL(new RegExp(`/partite/${Q}$`))
  await pub.locator('[data-diretta="in_diretta"]').waitFor()
  verifica((await pub.locator('.live-marcatori li').count()) === 1 && /Rossi M\./.test(await pub.locator('.live-marcatori').innerText()), `${t}: pagina pubblica in diretta: punteggio e marcatori`)
  await assesta(pub, `${t} partita pubblica in diretta`)
  await foto(pub, join(SCHERMATE, 'live'), `${tema}-07-pagina-pubblica-in-diretta`)
  // un gol segnato dall'admin (schermata LIVE, un'altra scheda) arriva da solo sulla pagina pubblica entro il polling (~10 s)
  await p.goto(`${BASE}/admin/partite/${Q}/live`)
  await p.locator('.live-squadre').first().waitFor()
  await tessera('Romano G.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await inviato()
  const inizioAttesa = Date.now()
  await pub.waitForFunction(() => document.querySelectorAll('.live-marcatori li').length === 2, undefined, { timeout: 20_000 })
  const attesa = Date.now() - inizioAttesa
  verifica(attesa < 15_000 && (await pub.locator('.live-marcatori li').nth(1).innerText()).includes('Romano G.'), `${t}: la pagina pubblica aperta in un'altra scheda mostra il gol da sola (dopo ${Math.round(attesa / 100) / 10} s)`)
  verifica((await pub.locator('main .band .sc').allInnerTexts()).join('-') === '1-1', `${t}: il punteggio pubblico si e' aggiornato (1-1)`)
  // solo da visibile: con la pagina nascosta niente richieste, al ritorno in primo piano una subito
  let richieste = 0
  pub.on('request', (r) => { if (r.url().includes(`/api/partite/${Q}/diretta`)) richieste++ })
  await pub.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await pub.waitForTimeout(11_500)
  verifica(richieste === 0, `${t}: pagina nascosta: nessuna richiesta di aggiornamento in 11 secondi (${richieste})`)
  await pub.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await pub.waitForTimeout(800)
  verifica(richieste >= 1, `${t}: tornando in primo piano la pagina si aggiorna subito (${richieste})`)

  // ---------- "Risultato da confermare" dopo due ore ----------
  const finto = await api(p, `/api/admin/partite/${Q}`, { method: 'PATCH', corpo: { data_ora: iso(Date.now() - 3 * H) } }) // l'orario finto: l'inizio e' 3 ore fa
  verifica(finto.stato === 200, `${t}: orario della partita spostato a 3 ore fa (${finto.stato})`)
  verifica((await diretta(p, Q)).json.stato === 'da_confermare', `${t}: dopo 2 ore dall'inizio la diretta e' "da confermare"`)
  const tardi = await segna(p, Q, 2)
  verifica(tardi.stato === 409 && /finita/.test(tardi.json.errore), `${t}: dopo le 2 ore un gol e' rifiutato (${tardi.stato})`)
  await pub.reload()
  await pub.locator('[data-diretta="da_confermare"]').waitFor()
  verifica(/Risultato da confermare/.test((await pub.locator('.diretta-testa').textContent()) ?? '') && !(await pub.locator('.diretta-testa .live-dot').count()), `${t}: la pagina pubblica dice "Risultato da confermare" (senza pallino)`)
  const poiRichieste = richieste
  await pub.waitForTimeout(11_500)
  verifica(richieste === poiRichieste, `${t}: non in diretta: la pagina pubblica non interroga piu' il server (${richieste - poiRichieste})`)
  await assesta(pub, `${t} partita da confermare`)
  await foto(pub, join(SCHERMATE, 'live'), `${tema}-08-pagina-pubblica-da-confermare`)
  await pub.goto(`${BASE}/`)
  await pub.locator('.card.diretta').waitFor()
  verifica(/Risultato da confermare/.test((await pub.locator('.card.diretta').textContent()) ?? ''), `${t}: la carta della Home dice "Risultato da confermare"`)
  await p.goto(`${BASE}/admin/partite/${Q}/live`)
  await p.getByText('La diretta è finita').waitFor()
  verifica((await p.locator('.live-squadre').count()) === 0, `${t}: la schermata LIVE di una diretta finita non offre piu' i pulsanti dei gol`)
  await pub.close()

  // ---------- senza rete ----------
  const O = await creaPartita(p, iso(Date.now() - 5 * 60_000))
  await p.goto(`${BASE}/admin/partite/${O}/live`)
  await p.locator('.live-squadre').first().waitFor()
  await inviato()
  await s.ctx.setOffline(true)
  await p.waitForFunction(() => navigator.onLine === false)
  await tessera('Verdi A.G.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await tessera('Ricci S.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await p.waitForFunction(() => /2 da inviare/.test(document.querySelector('.live-invio')?.textContent ?? ''))
  const testoStato = (await stato.innerText()).trim()
  verifica(/2 da inviare/.test(testoStato) && /senza rete/.test(testoStato), `${t}: offline, due gol: l'indicatore dice "2 da inviare · senza rete" (${testoStato})`)
  verifica((await p.locator('.in-invio').count()) === 2 && (await punti()) === '1-1', `${t}: offline i due gol sono gia' sul tabellone (1-1) e segnati "in invio"`)
  await p.waitForTimeout(900) // il punteggio finisce di saltare
  await foto(p, join(SCHERMATE, 'live'), `${tema}-09-da-inviare`)
  const codaSalvata = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').length as number, `tt_live_coda_${O}`)
  verifica((await codaSalvata()) === 2, `${t}: la coda e' scritta sul telefono (localStorage): 2 voci`)
  verifica((await srv(BASE, `/api/admin/partite/${O}/diretta`)).json.eventi.length === 0, `${t}: offline il server non ha ricevuto niente`)
  // la pagina si ricarica quando il segnale e' debole: la pagina si carica, le chiamate al server no. La coda resta e la schermata si disegna lo stesso.
  // segnale debole: l'accesso (/api/admin/me) passa, tutte le altre chiamate al server falliscono. La regola va messa PRIMA di tornare online:
  // appena torna la rete la pagina riprova da sola a inviare (evento "online"), ed e' proprio quello che si prova piu' sotto.
  const chiamate = (u: URL) => u.pathname.startsWith('/api/') && u.pathname !== '/api/admin/me'
  const blocca = (r: { abort: (c?: string) => Promise<void> }) => r.abort('failed')
  await s.ctx.route(chiamate, blocca)
  await s.ctx.setOffline(false)
  await p.reload()
  await p.locator('.live-squadre').first().waitFor()
  await p.waitForFunction(() => /2 da inviare/.test(document.querySelector('.live-invio')?.textContent ?? ''))
  verifica((await codaSalvata()) === 2 && (await p.locator('.in-invio').count()) === 2 && (await punti()) === '1-1', `${t}: dopo la ricarica (server irraggiungibile) la coda c'e' ancora: "2 da inviare", 2 gol in invio, 1-1`)
  await p.waitForFunction(() => /senza rete/.test(document.querySelector('.live-invio')?.textContent ?? ''), undefined, { timeout: 10_000 })
  verifica(/2 da inviare/.test(await stato.innerText()) && /senza rete/.test(await stato.innerText()), `${t}: dopo la ricarica con il server irraggiungibile l'indicatore dice "2 da inviare · senza rete" (${(await stato.innerText()).trim()})`)
  // torna il segnale, ma la RISPOSTA del primo invio va persa: il server lo registra, il telefono non lo sa e riprova con lo stesso id_client
  await s.ctx.unroute(chiamate, blocca)
  let invii = 0
  const persa = async (r: import('playwright-core').Route) => {
    invii++
    if (invii === 1) {
      await r.fetch() // la richiesta ARRIVA al server...
      await r.abort('failed') // ...ma il telefono non vede la risposta
    } else await r.continue()
  }
  await s.ctx.route('**/diretta/eventi', persa)
  // "torna il segnale": la pagina riceve l'evento online e riprova subito
  await s.ctx.setOffline(true)
  await p.waitForFunction(() => navigator.onLine === false)
  await s.ctx.setOffline(false)
  await inviato()
  await s.ctx.unroute('**/diretta/eventi', persa)
  const dopoInvio = (await srv(BASE, `/api/admin/partite/${O}/diretta`)).json
  verifica(dopoInvio.eventi.length === 2 && new Set(dopoInvio.eventi.map((e: { id_client: string }) => e.id_client)).size === 2, `${t}: tornata la rete, i due gol sono arrivati UNA volta sola, anche con una risposta persa (${dopoInvio.eventi.length} eventi, ${invii} richieste)`)
  verifica(invii >= 3 && (await codaSalvata()) === 0 && /Tutto inviato/.test(await stato.innerText()), `${t}: il primo invio e' stato ripetuto da solo (${invii} richieste), coda vuota, "tutto inviato"`)
  verifica((await punti()) === '1-1' && (await p.locator('.in-invio').count()) === 0, `${t}: a coda vuota lo stato mostrato e' quello del server (1-1, nessun "in invio")`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-10-tutto-inviato`)

  // un invio rifiutato dal server (partita chiusa nel frattempo): si mostra l'errore, non si ritenta all'infinito
  await s.ctx.setOffline(true)
  await p.waitForFunction(() => navigator.onLine === false)
  await tessera('Esposito F.').click()
  await pannello.getByRole('button', { name: 'Gol', exact: true }).click()
  await p.waitForFunction(() => /1 da inviare/.test(document.querySelector('.live-invio')?.textContent ?? ''))
  const chiusa = await srv(BASE, `/api/admin/partite/${O}/diretta/fine`, { method: 'POST', corpo: {} })
  verifica(chiusa.stato === 200, `${t}: nel frattempo un altro admin chiude la partita (${chiusa.stato})`)
  let tentativi = 0
  p.on('request', (r) => { if (r.url().endsWith(`/api/admin/partite/${O}/diretta/eventi`) && r.method() === 'POST') tentativi++ })
  await s.ctx.setOffline(false)
  const rifiuto = p.locator('.live-rifiutate')
  await rifiuto.waitFor({ timeout: 20_000 })
  verifica(/finita|già giocata/.test(await rifiuto.innerText()) && /Gol non registrato/.test(await rifiuto.innerText()), `${t}: l'invio rifiutato si mostra con la ragione (${(await rifiuto.innerText()).replace(/\s+/g, ' ').slice(0, 80)})`)
  await foto(p, join(SCHERMATE, 'live'), `${tema}-11-invio-rifiutato`)
  const vistiPrima = tentativi
  await p.waitForTimeout(6000)
  verifica(vistiPrima === 1 && tentativi === 1, `${t}: l'invio rifiutato non si ritenta (${tentativi} richiesta in 6 secondi)`)
  await rifiuto.getByRole('button', { name: 'Scarta' }).click()
  await p.waitForFunction(() => !document.querySelector('.live-rifiutate'))
  verifica((await codaSalvata()) === 0 && (await srv(BASE, `/api/admin/partite/${O}/diretta`)).json.eventi.length === 2, `${t}: "Scarta" toglie l'errore e svuota la coda; sul server restano i 2 gol arrivati`)

  // ---------- pulizia: le partite di prova non devono restare in diretta ----------
  for (const x of [Q, O]) {
    const r = await cancella(p, x)
    verifica(r.stato === 200, `${t}: partita di prova ${x} eliminata (${r.stato})`)
  }
  await chiudiSessione(s, `${t}`)
}

/** Nome con codice HTML su una diretta vera: nessuna esecuzione, il testo resta testo (pagina pubblica e schermata LIVE). */
export async function provaLiveXss(browser: Browser, BASE: string) {
  console.log('\n== diretta: nome con codice HTML ==')
  const s = await apri(browser, BASE, 'light', { touch: true })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/partite`)
  await p.locator('main h1').waitFor()
  await p.addInitScript(() => { (window as unknown as { __xss?: number }).__xss = 0 })
  const brutto = '<img src=x onerror="window.__xss=1">'
  sql(`INSERT INTO giocatori (id, nome, attivo, livello_segreto, creato_il) VALUES (97, '${brutto.replace(/'/g, "''")}', 1, 1, '2026-07-01T10:00:00Z');`)
  const X = await creaPartita(p, iso(Date.now() - 5 * 60_000), true, [1, 2, 3, 97], [5, 6, 7, 8])
  await segna(p, X, 97)
  await segna(p, X, 97, 'autogol')
  for (const [nome, url] of [['pagina pubblica', `${BASE}/partite/${X}`], ['schermata LIVE', `${BASE}/admin/partite/${X}/live`], ['Home', `${BASE}/`]] as const) {
    await p.goto(url)
    await p.locator('main h1').waitFor()
    await p.locator('.live-marcatori, .live-gol, .card.diretta').first().waitFor()
    await p.waitForTimeout(700)
    const m = await p.evaluate(() => ({ xss: (window as unknown as { __xss: number }).__xss, img: document.querySelectorAll('main img[src="x"]').length, testo: document.querySelector('main')!.textContent ?? '' }))
    verifica(m.xss === 0 && m.img === 0, `diretta ${nome}: il nome con codice HTML non viene eseguito (xss=${m.xss}, img=${m.img})`)
    if (nome !== 'Home') verifica(m.testo.includes(brutto), `diretta ${nome}: il nome compare come testo, per intero`)
  }
  await cancella(p, X)
  await chiudiSessione(s, 'diretta xss')
}

/** Movimento ridotto: nessuna animazione attiva nelle schermate della diretta (il pallino non pulsa, il punteggio non salta). */
export async function provaLiveMovimentoRidotto(browser: Browser, BASE: string) {
  console.log('\n== diretta: movimento ridotto ==')
  const s = await apri(browser, BASE, 'light', { touch: true, reducedMotion: 'reduce' })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/partite`)
  await p.locator('main h1').waitFor()
  const X = await creaPartita(p, iso(Date.now() - 5 * 60_000))
  await segna(p, X, 1)
  const animate = async () => p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length)
  await p.goto(`${BASE}/`)
  await p.locator('.card.diretta .live-dot').waitFor()
  verifica((await animate()) === 0, 'prefers-reduced-motion: nella Home con la carta "IN DIRETTA" nessuna animazione attiva')
  await p.goto(`${BASE}/partite/${X}`)
  await p.locator('[data-diretta="in_diretta"]').waitFor()
  verifica((await animate()) === 0, 'prefers-reduced-motion: nella pagina pubblica in diretta nessuna animazione attiva')
  await p.goto(`${BASE}/admin/partite/${X}/live`)
  await p.locator('.live-squadre').first().waitFor()
  await p.getByRole('button', { name: 'Rossi M.', exact: true }).first().click()
  await p.getByRole('button', { name: 'Gol', exact: true }).click()
  await p.locator('.live-invio[data-pendenti="0"]').waitFor()
  verifica((await animate()) === 0, 'prefers-reduced-motion: nella schermata LIVE (dopo un gol) nessuna animazione attiva')
  await cancella(p, X)
  await s.ctx.close()
}

/**
 * Le schermate nuove, per il rilevatore di trabocchi: LIVE (in diretta con gol e nomi lunghi, conferma aperta, cambia aperto, da confermare,
 * non iniziata, giocata), la partita con "Inizia diretta", la pagina pubblica (in diretta, da confermare) e la Home con la carta.
 * Servono partite create prima: `creaFixture`.
 */
export type Fixture = { vivo: number; confermare: number; non: number }

export async function creaFixture(browser: Browser, BASE: string): Promise<Fixture> {
  const s = await apri(browser, BASE, 'light', { touch: true })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/partite`)
  await p.locator('main h1').waitFor()
  // nomi lunghi dei dati estremi (90, 91, 92: vedi impianto.ts) in campo, con qualche gol
  const vivo = await creaPartita(p, iso(Date.now() - 10 * 60_000), true, [1, 2, 90, 3], [91, 92, 6, 7])
  for (const [g, tipo] of [[90, 'gol'], [91, 'gol'], [92, 'autogol'], [1, 'gol'], [91, 'gol'], [6, 'gol'], [90, 'autogol']] as const) await segna(p, vivo, g, tipo)
  const confermare = await creaPartita(p, iso(Date.now() - 10 * 60_000), true, [1, 2, 90, 3], [91, 92, 6, 7])
  for (const [g, tipo] of [[90, 'gol'], [91, 'gol'], [1, 'autogol']] as const) await segna(p, confermare, g, tipo)
  await api(p, `/api/admin/partite/${confermare}`, { method: 'PATCH', corpo: { data_ora: iso(Date.now() - 4 * H) } })
  const non = await creaPartita(p, iso(Date.now() + 6 * H), true, [1, 2, 90, 3], [91, 92, 6, 7])
  await s.ctx.close()
  return { vivo, confermare, non }
}

export async function eliminaFixture(browser: Browser, BASE: string, f: Fixture) {
  const s = await apri(browser, BASE, 'light', { touch: true })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/partite`)
  await p.locator('main h1').waitFor()
  for (const id of [f.vivo, f.confermare, f.non]) await cancella(p, id)
  await s.ctx.close()
}

export const schermateLive = (f: Fixture): Schermata[] => {
  const live = (id: number) => `/admin/partite/${id}/live`
  return [
    { nome: 'live in diretta (nomi lunghi, gol)', url: live(f.vivo), attesa: '.live-squadre' },
    {
      nome: 'live in diretta, conferma del gol aperta',
      url: live(f.vivo),
      attesa: '.live-squadre',
      prepara: async (p) => {
        await p.locator('.live-squadre .live-tessera', { hasText: 'Wolfeschlegel' }).first().click()
        await p.getByRole('group', { name: 'Conferma del gol' }).waitFor()
      },
    },
    {
      nome: 'live in diretta, cambia marcatore aperto',
      url: live(f.vivo),
      attesa: '.live-squadre',
      prepara: async (p) => {
        await p.getByRole('button', { name: /^Cambia marcatore del gol 1/ }).click()
        await p.locator('.live-cambia').waitFor()
      },
    },
    {
      nome: 'live in diretta, elimina gol (conferma)',
      url: live(f.vivo),
      attesa: '.live-squadre',
      prepara: async (p) => {
        await p.getByRole('button', { name: /^Elimina il gol 2/ }).click()
        await p.getByRole('group', { name: 'Conferma' }).waitFor()
      },
    },
    {
      nome: 'live in diretta, fine partita (conferma)',
      url: live(f.vivo),
      attesa: '.live-squadre',
      prepara: async (p) => {
        await p.getByRole('button', { name: 'Fine partita', exact: true }).click()
        await p.getByRole('group', { name: 'Conferma' }).waitFor()
      },
    },
    { nome: 'live da confermare', url: live(f.confermare), attesa: '.live-gol' },
    { nome: 'live non iniziata', url: live(f.non), attesa: 'main h1' },
    { nome: 'admin partita con "Inizia diretta"', url: `/admin/partite/${f.non}?sez=squadre`, attesa: '.carta-diretta' },
    { nome: 'admin partita in diretta (apri LIVE)', url: `/admin/partite/${f.vivo}?sez=risultato`, attesa: '.carta-diretta' },
    { nome: 'pubblico home con la carta IN DIRETTA', url: '/', attesa: '.card.diretta' },
    { nome: 'pubblico partita in diretta', url: `/partite/${f.vivo}`, attesa: '[data-diretta="in_diretta"]' },
    { nome: 'pubblico partita da confermare', url: `/partite/${f.confermare}`, attesa: '[data-diretta="da_confermare"]' },
  ]
}

export async function provaLiveTrabocchi(browser: Browser, BASE: string) {
  const f = await creaFixture(browser, BASE)
  try {
    await provaTrabocchi(browser, BASE, 'diretta', schermateLive(f), { touch: true })
  } finally {
    await eliminaFixture(browser, BASE, f)
  }
}
