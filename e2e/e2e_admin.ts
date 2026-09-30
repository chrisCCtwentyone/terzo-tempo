/**
 * Prova nel BROWSER dell'area admin, sulla build di produzione (npm run e2e:admin).
 * wrangler pages dev con D1 locale usa-e-getta; DEV_ADMIN_BYPASS=1 passato con --binding (nessun .dev.vars);
 * un SECONDO server senza bypass prova la pagina "Area riservata". Chromium a 390x844 con touch (hasTouch).
 *
 * Flusso completo (chiaro e scuro): badge, giocatore con livello e badge, stagione (409 spiegato), nuova partita
 * coi convocati, squadre generate e ritoccate, campo con moduli e TRASCINAMENTO col dito (eventi touch veri via CDP),
 * gol/voti/cronaca, "Segna come giocata", pagina pubblica, MVP (chiusura, nessun_voto, parita'), modifica ed eliminazione.
 * Controlli su ogni schermata: console pulita, CSP, scroll orizzontale, aree di tocco >= 44 px, focus visibile,
 * nessuna risposta pubblica con "livello". Screenshot in E2E_SCREENS (default e2e/schermate/admin, ignorata da git).
 *
 * Variabili: E2E_PORT (8798; il server senza bypass usa la porta successiva), E2E_SCREENS, E2E_CHROMIUM.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core'
import { caselle } from '../shared/moduli.ts'
import { DATI, RADICE, apri, assesta, avviaServer, chiudiSessione, concludi, falliti, foto, preparaBase, sql, verifica, type Sessione } from './impianto.ts'

const PORTA = Number(process.env.E2E_PORT ?? 8798)
const BASE = `http://localhost:${PORTA}`
const BASE_SENZA = `http://localhost:${PORTA + 1}`
const SCHERMATE = resolve(process.env.E2E_SCREENS ?? join(RADICE, 'e2e/schermate/admin'))

type Gioc = { id: number; nome: string; attivo: boolean; livello_segreto: number | null; badge_ids: number[] }
type PosDati = { giocatore_id: number; nome: string; squadra: 'A' | 'B' | null; pos_x: number | null; pos_y: number | null; gol: number; autogol: number; voto_pagella: number | null }
type PartitaDati = { id: number; stagione_id: number; data_ora: string; stato: string; squadre: { codice: string; nome: string; gol: number | null }[]; cronaca: string | null; giocatori: PosDati[]; mvp: Record<string, any> }

/** Fetch same-origin dalla pagina (stessi cookie e Origin del browser). */
const api = <T = any>(p: Page, percorso: string, init?: { method?: string; corpo?: unknown }) =>
  p.evaluate(async ([perc, m, c]) => {
    const r = await fetch(perc as string, { method: (m as string) ?? 'GET', headers: { 'Content-Type': 'application/json' }, body: c === undefined ? undefined : JSON.stringify(c) })
    return { stato: r.status, json: await r.json().catch(() => null) } as { stato: number; json: T }
  }, [percorso, init?.method, init?.corpo] as const)

/** Le schermate admin, con le verifiche comuni: nessuno scroll orizzontale, aree di tocco, screenshot. */
async function schermata(p: Page, nome: string, tema: string) {
  await assesta(p, `${tema} ${nome}`)
  const piccoli = await p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input:not(.sr), select, textarea, [role="button"], [role="radio"], summary')]
      .filter((e) => {
        const r = e.getBoundingClientRect()
        const nascosto = r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden' || !!e.closest('[hidden], .salta')
        return !nascosto && (r.height < 43.5 || r.width < 43.5)
      })
      .map((e) => `${e.tagName.toLowerCase()}.${e.className || ''}[${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}] ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`),
  )
  verifica(piccoli.length === 0, `${tema} ${nome}: aree di tocco di almeno 44 px ${piccoli.slice(0, 6).join(' | ')}`)
  await foto(p, SCHERMATE, `${tema}-${nome}`)
}

/** Trascina col dito: touchStart / touchMove / touchEnd veri (CDP), non mouse. `durante` gira a dito ancora giu'. */
async function trascina(cdp: CDPSession, da: { x: number; y: number }, a: { x: number; y: number }, durante?: () => Promise<void>) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: da.x, y: da.y, id: 1 }] })
  const passi = 12
  for (let i = 1; i <= passi; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: da.x + ((a.x - da.x) * i) / passi, y: da.y + ((a.y - da.y) * i) / passi, id: 1 }] })
    await new Promise((r) => setTimeout(r, 16))
  }
  if (durante) await durante()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await new Promise((r) => setTimeout(r, 300))
}

const centro = async (p: Page, sel: string) => {
  const b = (await p.locator(sel).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** Il punto del campo (percentuali) in pixel della finestra. */
const puntoCampo = async (p: Page, xPct: number, yPct: number) => {
  const b = (await p.locator('.pitch').boundingBox())!
  return { x: b.x + (b.width * xPct) / 100, y: b.y + (b.height * yPct) / 100 }
}
const vediCampo = (p: Page) => p.evaluate(() => {
  const el = document.querySelector('.pitch') as HTMLElement
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70)
})

const NOMI_CONV = ['Rossi M.', 'Bianchi L.', 'Verdi A.G.', 'Esposito F.', 'Russo D.', 'Romano G.', 'Colombo P.', 'Ricci S.', 'Marino R.']

async function provaAdmin(browser: Browser, tema: 'light' | 'dark', pubblico: string[]) {
  console.log(`\n== admin, tema ${tema} ==`)
  const s: Sessione = await apri(browser, BASE, tema, { touch: true, ignora: /status of 409/ })
  const p = await s.ctx.newPage()
  // nessuna risposta PUBBLICA deve contenere "livello" (l'admin si')
  p.on('response', async (r) => {
    const u = new URL(r.url())
    if (u.origin !== BASE || !u.pathname.startsWith('/api/') || u.pathname.startsWith('/api/admin/')) return
    try {
      const t = await r.text()
      if (/livello/i.test(t) || /livello/i.test(JSON.stringify(r.headers()))) pubblico.push(u.pathname)
    } catch {
      // risposta non leggibile (navigazione chiusa)
    }
  })
  const cdp = await s.ctx.newCDPSession(p)
  const nuovo = tema === 'light' ? 'Provaluce' : 'Provanotte'
  const nomeNuovo = `${nuovo} G.M.`
  const archiviato = `${nuovo}arch`

  // ---------- accesso e navigazione ----------
  await p.goto(`${BASE}/admin`)
  await p.locator('main h1').waitFor()
  await p.getByRole('heading', { name: 'Partite', level: 1 }).waitFor()
  await schermata(p, 'partite-elenco', tema)
  const nav = p.locator('nav.nav.adm')
  const voci = (await nav.getByRole('link').allTextContents()).map((t) => t.trim()).join(',')
  verifica(voci === 'Partite,Giocatori,Badge,Stagioni', `${tema} navigazione admin propria: Partite, Giocatori, Badge, Stagioni (${voci})`)
  verifica((await p.locator('nav.nav:not(.adm)').count()) === 0, `${tema} nessuna navigazione pubblica nell'area admin`)
  verifica(await p.getByRole('link', { name: 'Torna al sito' }).isVisible(), `${tema} c'è il link "Torna al sito"`)
  verifica((await p.locator('.admbar .etich').textContent()) === 'Area admin', `${tema} barra admin distinta`)

  // ---------- badge: crea, modifica ----------
  await nav.getByRole('link', { name: 'Badge' }).click()
  await p.getByRole('heading', { name: 'Badge', level: 1 }).waitFor()
  await p.getByText('Positivi').first().waitFor()
  await schermata(p, 'badge-elenco', tema)
  await p.getByRole('button', { name: 'Nuovo badge' }).click()
  await p.getByLabel('Nome del badge').fill(`Jolly ${tema}`)
  await p.getByLabel('Descrizione (facoltativa)').fill('Gioca ovunque')
  await schermata(p, 'badge-nuovo', tema)
  await p.getByRole('button', { name: 'Crea il badge' }).click()
  await p.getByRole('status').filter({ hasText: `Creato il badge Jolly ${tema}` }).waitFor()
  verifica((await api<{ badge: any[] }>(p, '/api/admin/badge')).json.badge.some((b) => b.nome === `Jolly ${tema}` && b.descrizione === 'Gioca ovunque' && b.tipo === 'positivo'), `${tema} badge creato (positivo, con descrizione)`)
  await p.getByRole('button', { name: new RegExp(`Jolly ${tema}`) }).click()
  await p.getByLabel('Descrizione (facoltativa)').fill('Gioca dove serve')
  await p.getByRole('group', { name: 'Tipo di badge' }).getByRole('button', { name: 'Negativo' }).click()
  await p.getByRole('group', { name: 'Tipo di badge' }).getByRole('button', { name: 'Positivo' }).click()
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato il badge' }).waitFor()
  verifica((await api<{ badge: any[] }>(p, '/api/admin/badge')).json.badge.some((b) => b.nome === `Jolly ${tema}` && b.descrizione === 'Gioca dove serve'), `${tema} badge modificato`)

  // ---------- giocatori: form a due campi, validazione, livello, badge, archiviazione ----------
  await nav.getByRole('link', { name: 'Giocatori' }).click()
  await p.getByRole('heading', { name: 'Giocatori', level: 1 }).waitFor()
  await p.locator('.riga-btn').first().waitFor()
  await schermata(p, 'giocatori-elenco', tema)
  await p.getByRole('button', { name: 'Nuovo giocatore' }).click()
  await p.getByLabel('Iniziali del nome').fill('Mario')
  await p.getByLabel('Cognome', { exact: true }).fill(nuovo.toLowerCase())
  verifica(await p.getByText(/Iniziali del nome: facoltative; se ci sono, da 1 a 3 lettere/).isVisible(), `${tema} iniziali non valide: errore chiaro`)
  verifica(await p.getByRole('button', { name: 'Aggiungi il giocatore' }).isDisabled(), `${tema} con un campo non valido non si salva`)
  await p.getByLabel('Iniziali del nome').fill('g m')
  verifica(await p.getByText(nomeNuovo).first().isVisible(), `${tema} anteprima tollerante: "${nuovo.toLowerCase()}" + "g m" -> ${nomeNuovo}`)
  verifica(await p.getByText('Visibile solo agli admin').isVisible(), `${tema} avviso "visibile solo agli admin" sul livello`)
  await p.getByRole('radio', { name: 'Livello 4' }).click()
  verifica((await p.getByRole('radio', { name: 'Livello 4' }).getAttribute('aria-checked')) === 'true', `${tema} livello segreto a 5 passi: scelto 4`)
  verifica((await p.locator('.lvl button.pieno').count()) === 4, `${tema} livello: 4 passi pieni su 5`)
  await p.getByRole('button', { name: `Jolly ${tema} (badge positivo)` }).click()
  await p.getByRole('button', { name: 'Fragile (badge negativo)' }).click()
  verifica((await p.locator('.chip.neg[aria-pressed="true"]').count()) === 1 && (await p.locator('.chip:not(.neg)[aria-pressed="true"]').count()) === 1, `${tema} chip badge: positivo e negativo distinti`)
  await schermata(p, 'giocatori-nuovo', tema)
  await p.getByRole('button', { name: 'Aggiungi il giocatore' }).click()
  await p.getByRole('status').filter({ hasText: `Aggiunto ${nomeNuovo}` }).waitFor()
  const elenco = (await api<{ giocatori: Gioc[] }>(p, '/api/admin/giocatori')).json.giocatori
  const creato = elenco.find((g: any) => g.nome === nomeNuovo)
  verifica(!!creato && creato.livello_segreto === 4 && creato.badge_ids.length === 2, `${tema} giocatore creato via UI con livello 4 e due badge (${JSON.stringify(creato)})`)
  // un secondo, da archiviare
  await p.getByLabel('Cognome', { exact: true }).fill(archiviato)
  await p.getByLabel('Iniziali del nome').fill('x')
  await p.getByRole('button', { name: 'Aggiungi il giocatore' }).click()
  await p.getByRole('status').filter({ hasText: `Aggiunto ${archiviato} X.` }).waitFor()
  await p.getByRole('button', { name: 'Nuovo giocatore' }).click()
  await p.locator('.riga-btn', { hasText: `${archiviato} X.` }).click()
  await p.getByRole('button', { name: 'Archivia il giocatore' }).click()
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato' }).waitFor()
  await schermata(p, 'giocatori-archiviato', tema)
  verifica((await p.locator('.riga-btn.archiviato', { hasText: 'archiviato' }).count()) >= 1, `${tema} l'archiviato resta nell'elenco admin, segnato`)
  verifica(!(await api<{ giocatori: any[] }>(p, '/api/giocatori')).json.giocatori.some((g) => g.nome.startsWith(archiviato)), `${tema} l'archiviato non compare nel listone pubblico`)
  // modifica del nome (solo iniziali) e rientro
  await p.locator('.riga-btn', { hasText: nomeNuovo }).click()
  await p.getByLabel('Iniziali del nome').fill('g m z')
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('status').filter({ hasText: `Salvato ${nuovo} G.M.Z.` }).waitFor()
  await p.getByLabel('Iniziali del nome').fill('g m')
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('status').filter({ hasText: `Salvato ${nomeNuovo}` }).waitFor()
  // errore del server (doppione): messaggio testuale, dati non persi
  await p.getByLabel('Cognome', { exact: true }).fill('Rossi')
  await p.getByLabel('Iniziali del nome').fill('m')
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('alert').filter({ hasText: 'esiste già un giocatore con questo nome' }).waitFor()
  verifica((await p.getByLabel('Cognome', { exact: true }).inputValue()) === 'Rossi', `${tema} salvataggio fallito: il testo inserito resta nel campo`)
  await p.getByLabel('Cognome', { exact: true }).fill(nuovo)
  await p.getByLabel('Iniziali del nome').fill('g m')

  // ---------- badge: eliminazione con conferma nella pagina ----------
  await nav.getByRole('link', { name: 'Badge' }).click()
  await p.getByRole('heading', { name: 'Badge', level: 1 }).waitFor()
  await p.getByRole('button', { name: new RegExp(`Jolly ${tema}`) }).click()
  await p.getByRole('button', { name: 'Elimina', exact: true }).click()
  const conf = p.getByRole('group', { name: 'Conferma' })
  await conf.waitFor()
  verifica(/assegnato a 1 giocatore/.test(await conf.innerText()), `${tema} badge assegnato: conferma nella pagina che lo dice (${(await conf.innerText()).slice(0, 60)}...)`)
  await schermata(p, 'badge-elimina-conferma', tema)
  await conf.getByRole('button', { name: 'Annulla' }).click()
  verifica((await api<{ badge: any[] }>(p, '/api/admin/badge')).json.badge.some((b) => b.nome === `Jolly ${tema}`), `${tema} "Annulla": il badge c'è ancora`)
  await p.getByRole('button', { name: 'Elimina', exact: true }).click()
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: 'Sì, elimina' }).click()
  await p.getByRole('status').filter({ hasText: 'Eliminato il badge' }).waitFor()
  verifica(!(await api<{ badge: any[] }>(p, '/api/admin/badge')).json.badge.some((b) => b.nome === `Jolly ${tema}`), `${tema} badge eliminato dopo la conferma`)

  // ---------- stagioni: crea, 409 spiegato, chiudi, apri ----------
  await nav.getByRole('link', { name: 'Stagioni' }).click()
  await p.getByRole('heading', { name: 'Stagioni', level: 1 }).waitFor()
  await p.locator('.stagione').first().waitFor()
  await schermata(p, 'stagioni-elenco', tema)
  const nomeStag = `Stagione prova ${tema}`
  await p.getByRole('button', { name: 'Nuova stagione' }).click()
  await p.getByLabel('Nome della stagione').fill(nomeStag)
  await p.getByLabel('Data di inizio').fill('2026-10-01')
  await p.getByRole('button', { name: 'Aprila subito' }).click() // di base spenta: c'è già un'altra aperta
  await p.getByRole('button', { name: 'Crea la stagione' }).click()
  await p.getByRole('alert').filter({ hasText: /Ce n'è una sola stagione aperta alla volta/ }).waitFor()
  verifica(true, `${tema} stagione: con un'altra aperta il rifiuto (409) è spiegato`)
  await schermata(p, 'stagioni-errore-409', tema)
  await p.getByRole('button', { name: 'Aprila subito' }).click()
  await p.getByRole('button', { name: 'Crea la stagione' }).click()
  await p.getByRole('status').filter({ hasText: `Creata la stagione ${nomeStag}` }).waitFor()
  await p.getByRole('button', { name: 'Chiudi la stagione' }).click()
  await p.getByRole('status').filter({ hasText: /Chiusa la stagione/ }).waitFor()
  await p.locator('.stagione', { hasText: nomeStag }).getByRole('button', { name: 'Apri la stagione' }).click()
  await p.getByRole('status').filter({ hasText: `Aperta la stagione ${nomeStag}` }).waitFor()
  const aperte = (await api<{ stagioni: any[] }>(p, '/api/stagioni')).json.stagioni.filter((x) => x.aperta)
  verifica(aperte.length === 1 && aperte[0].nome === nomeStag, `${tema} una sola stagione aperta, quella nuova (${aperte.map((x) => x.nome)})`)
  await schermata(p, 'stagioni-dopo', tema)
  const stagioneId = aperte[0].id

  // ---------- nuova partita ----------
  await nav.getByRole('link', { name: 'Partite' }).click()
  await p.getByRole('link', { name: /Nuova partita/ }).click()
  await p.getByRole('heading', { name: 'Nuova partita', level: 1 }).waitFor()
  await p.locator('.conv-scelta label').first().waitFor()
  verifica((await p.locator('.conv-scelta label', { hasText: archiviato }).count()) === 0, `${tema} nuova partita: l'archiviato non è fra i convocabili`)
  verifica((await p.locator('select').inputValue()) === String(stagioneId), `${tema} nuova partita: stagione aperta preselezionata`)
  verifica(await p.getByRole('button', { name: 'Crea la partita' }).isDisabled(), `${tema} nuova partita: senza data e convocati non si crea`)
  await p.getByLabel('Data e ora').fill('2026-10-08T21:00')
  for (const n of [...NOMI_CONV, nomeNuovo]) await p.locator('.conv-scelta label', { hasText: n }).click()
  verifica(await p.getByText('10 convocati').isVisible(), `${tema} nuova partita: 10 convocati scelti toccando le figurine`)
  await schermata(p, 'partita-nuova', tema)
  await p.getByRole('button', { name: 'Crea la partita' }).click()
  await p.waitForURL(/\/admin\/partite\/\d+\?sez=squadre/)
  const id = Number(new URL(p.url()).pathname.split('/').pop())
  const conv = await api<PartitaDati>(p, `/api/partite/${id}`)
  verifica(conv.json.stato === 'convocazione' && conv.json.giocatori.length === 10 && conv.json.data_ora === '2026-10-08T19:00:00Z' && conv.json.stagione_id === stagioneId, `${tema} partita creata: 10 convocati, 21:00 di Roma = 19:00Z, stagione giusta`)

  // ---------- squadre: genera, ritocca a mano, rigenera, salva ----------
  await p.getByRole('heading', { name: 'Partita', level: 1 }).waitFor()
  await p.getByRole('button', { name: 'Genera squadre' }).click()
  await p.getByRole('status').filter({ hasText: /Proposta pronta/ }).waitFor()
  const conta = async () => ({
    A: Number(/· (\d+)/.exec(await p.locator('section[aria-label="Squadra Casaccati"] h3').innerText())![1]),
    B: Number(/· (\d+)/.exec(await p.locator('section[aria-label="Squadra Smollicati"] h3').innerText())![1]),
  })
  let c = await conta()
  verifica(c.A === 5 && c.B === 5, `${tema} il generatore propone due squadre da 5 (${c.A}-${c.B})`)
  verifica((await p.locator('section[aria-label^="Squadra"] .bdg').count()) > 0, `${tema} le squadre mostrano i badge dei giocatori`)
  verifica(/Modifiche non salvate/i.test((await p.locator('.barra-salva').textContent()) ?? ''), `${tema} la proposta non è salvata: "Modifiche non salvate"`)
  await schermata(p, 'partita-squadre-proposta', tema)
  await p.locator('section[aria-label="Squadra Casaccati"] li button', { hasText: 'Smollicati' }).first().click()
  c = await conta()
  verifica(c.A === 4 && c.B === 6, `${tema} ritocco a mano: un tocco sposta un giocatore da una squadra all'altra (${c.A}-${c.B})`)
  await schermata(p, 'partita-squadre-ritocco', tema)
  await p.locator('section[aria-label="Squadra Smollicati"] li button', { hasText: 'Casaccati' }).first().click()
  c = await conta()
  verifica(c.A === 5 && c.B === 5, `${tema} secondo spostamento: di nuovo 5-5`)
  await p.getByRole('button', { name: 'Rigenera le squadre' }).click()
  await p.getByRole('status').filter({ hasText: /Proposta pronta/ }).waitFor()
  const dopoRigenera = await api<PartitaDati>(p, `/api/partite/${id}`)
  verifica(dopoRigenera.json.giocatori.every((g) => g.squadra !== null), `${tema} "Rigenera" salva prima la bozza (i convocati sono sul server con le squadre del ritocco)`)
  c = await conta()
  verifica(c.A + c.B === 10 && Math.abs(c.A - c.B) <= 1, `${tema} rigenerate (${c.A}-${c.B})`)
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato', hasNotText: 'non' }).first().waitFor()
  const conSquadre = await api<PartitaDati>(p, `/api/partite/${id}`)
  verifica(conSquadre.json.giocatori.filter((g) => g.squadra === 'A').length === c.A && conSquadre.json.giocatori.filter((g) => g.squadra === 'B').length === c.B, `${tema} squadre salvate sul server`)
  verifica(/Tutto salvato/i.test((await p.locator('.barra-salva').textContent()) ?? ''), `${tema} dopo il salvataggio: "Tutto salvato"`)
  await schermata(p, 'partita-squadre-salvate', tema)

  // ---------- campo: moduli, trascinamento col dito, aggancio e scambio ----------
  await p.getByRole('button', { name: 'Campo', exact: true }).click()
  await p.locator('.pitch').waitFor()
  verifica((await p.getByRole('group', { name: 'Modulo Casaccati' }).innerText()).replace(/\s+/g, ' ') === 'Automatico 1-2-1 2-2', `${tema} moduli di una squadra da 5: 1-2-1 e 2-2 (più Automatico)`)
  await p.getByRole('group', { name: 'Modulo Casaccati' }).getByRole('button', { name: '2-2' }).click()
  await p.getByRole('group', { name: 'Modulo Smollicati' }).getByRole('button', { name: '1-2-1' }).click()
  verifica(/Modifiche non salvate/i.test((await p.locator('.barra-salva').textContent()) ?? ''), `${tema} campo: indicatore "modifiche non salvate" dopo aver scelto i moduli`)
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato', hasNotText: 'non' }).first().waitFor()
  const cas2 = caselle('2-2', true)!
  const cas121 = caselle('1-2-1', false)!
  const posiz = async () => (await api<PartitaDati>(p, `/api/partite/${id}`)).json.giocatori
  const prima = await posiz()
  const suCaselle = (gg: PosDati[], cas: { x: number; y: number }[]) => gg.every((g) => cas.some((k) => Math.abs(k.x - g.pos_x!) < 0.11 && Math.abs(k.y - g.pos_y!) < 0.11))
  verifica(suCaselle(prima.filter((g) => g.squadra === 'A'), cas2) && suCaselle(prima.filter((g) => g.squadra === 'B'), cas121), `${tema} posizioni salvate = coordinate delle caselle dei moduli scelti`)
  verifica(prima.filter((g) => g.squadra === 'A').every((g) => g.pos_y! <= 50) && prima.filter((g) => g.squadra === 'B').every((g) => g.pos_y! >= 50), `${tema} ogni squadra nella sua metà campo (A in alto, come LATO_ALTO)`)
  await vediCampo(p)
  await p.waitForTimeout(400)
  await schermata(p, 'partita-campo-moduli', tema)
  await vediCampo(p)

  const ped = (n: string) => `.ped.mov[aria-label^="${n},"]`
  // ordine delle caselle di A: 0 portiere, 1-2 difesa, 3-4 attacco. Trascino la 4 (attacco dx) sulla 1 (difesa sx).
  const giocA = (k: number) => prima.filter((g) => g.squadra === 'A').find((g) => Math.abs(g.pos_x! - cas2[k].x) < 0.11 && Math.abs(g.pos_y! - cas2[k].y) < 0.11)!
  const [g4, g1] = [giocA(4), giocA(1)]
  const scrollPrima = await p.evaluate(() => window.scrollY)
  let durante: { trascina: boolean; scroll: number; touchAction: string } | null = null
  await trascina(cdp, await centro(p, ped(g4.nome)), await puntoCampo(p, cas2[1].x + 2, cas2[1].y + 1.5), async () => {
    durante = await p.evaluate((sel) => ({ trascina: !!document.querySelector('.ped.trascina'), scroll: window.scrollY, touchAction: getComputedStyle(document.querySelector(sel)!).touchAction }), ped(g4.nome))
  })
  verifica(durante!.trascina, `${tema} trascinamento col dito (touch): la pedina segue il dito`)
  verifica(durante!.touchAction === 'none' && durante!.scroll === scrollPrima, `${tema} touch-action: none e nessuno scroll della pagina durante il trascinamento (scroll ${scrollPrima} -> ${durante!.scroll})`)
  await p.waitForTimeout(250)
  const stilePed = async (n: string) => (await p.locator(ped(n)).getAttribute('style'))!
  verifica(stilePed !== undefined && (await stilePed(g4.nome)).includes(`left: ${cas2[1].x}%`) && (await stilePed(g1.nome)).includes(`left: ${cas2[4].x}%`), `${tema} aggancio alla casella più vicina e SCAMBIO con chi la occupava`)
  verifica(/Modifiche non salvate/i.test((await p.locator('.barra-salva').textContent()) ?? ''), `${tema} dopo il trascinamento: "modifiche non salvate"`)
  await vediCampo(p)
  await schermata(p, 'partita-campo-dopo-trascinamento', tema)
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato', hasNotText: 'non' }).first().waitFor()
  const dopoPrimo = await posiz()
  verifica(dopoPrimo.find((g) => g.giocatore_id === g4.giocatore_id)!.pos_x === cas2[1].x && dopoPrimo.find((g) => g.giocatore_id === g1.giocatore_id)!.pos_x === cas2[4].x, `${tema} API: il primo scambio è persistito (${g4.nome} sulla casella 1, ${g1.nome} sulla 4)`)
  await vediCampo(p)

  // secondo trascinamento (squadra B): il portiere sul giocatore di una casella qualsiasi + prova di "mezzo campo"
  const bb = prima.filter((g) => g.squadra === 'B')
  const giocB = (k: number) => bb.find((g) => Math.abs(g.pos_x! - cas121[k].x) < 0.11 && Math.abs(g.pos_y! - cas121[k].y) < 0.11)!
  const [b0, b3] = [giocB(0), giocB(3)] // 0 portiere, 3 attaccante (1-2-1: 0 P, 1 D, 2-3 C, 4 A -> 4)
  const b4 = giocB(4)
  await vediCampo(p)
  await trascina(cdp, await centro(p, ped(b4.nome)), await puntoCampo(p, cas121[0].x, cas121[0].y - 6)) // rilascio "sopra": tenuto nella sua metà, aggancia il portiere
  await p.waitForTimeout(250)
  verifica((await stilePed(b4.nome)).includes(`top: ${cas121[0].y}%`) && (await stilePed(b0.nome)).includes(`top: ${cas121[4].y}%`), `${tema} secondo trascinamento (squadra B): scambio attaccante/portiere`)
  // rilascio nell'altra metà campo: la pedina resta nella sua metà (aggancia una casella della propria squadra)
  await trascina(cdp, await centro(p, ped(b3.nome)), await puntoCampo(p, 50, 12))
  await p.waitForTimeout(250)
  const yB3 = Number(/top:\s*([\d.]+)%/.exec(await stilePed(b3.nome))![1])
  verifica(yB3 >= 50, `${tema} una pedina di B lasciata nella metà di A resta nella sua metà (y=${yB3})`)
  // mouse/pointer: stesso codice, evento pointer di tipo mouse
  const a0 = giocA(0)
  const da = await centro(p, ped(a0.nome))
  const verso = await puntoCampo(p, cas2[2].x, cas2[2].y)
  await p.mouse.move(da.x, da.y)
  await p.mouse.down()
  await p.mouse.move((da.x + verso.x) / 2, (da.y + verso.y) / 2, { steps: 5 })
  await p.mouse.move(verso.x, verso.y, { steps: 5 })
  await p.mouse.up()
  await p.waitForTimeout(250)
  // tastiera: Invio seleziona, le frecce cambiano casella (2-2 di A: 0 portiere, 1-2 difesa, 3-4 attacco)
  const chiHa = async (k: number) => {
    const tutti = await p.locator('.ped.mov').evaluateAll((els) => els.map((e) => ({ n: e.getAttribute('aria-label')!.split(',')[0], s: e.getAttribute('style')! })))
    return tutti.find((x) => x.s.includes(`left: ${cas2[k].x}%`) && x.s.includes(`top: ${cas2[k].y}%`))!.n
  }
  const tastiera = await chiHa(1)
  const vicino = await chiHa(2)
  await p.keyboard.press('Shift')
  await p.locator(ped(tastiera)).focus()
  const focusVisibile = await p.locator(ped(tastiera)).evaluate((e) => getComputedStyle(e.querySelector('.fig')!).outlineStyle)
  await p.keyboard.press('Enter')
  verifica((await p.locator(ped(tastiera)).getAttribute('aria-pressed')) === 'true', `${tema} tastiera: Invio seleziona la pedina`)
  await p.keyboard.press('ArrowRight')
  await p.waitForTimeout(250)
  verifica((await chiHa(2)) === tastiera && (await chiHa(1)) === vicino, `${tema} tastiera: la freccia sposta la pedina selezionata sulla casella a destra e scambia (${tastiera} <-> ${vicino})`)
  await p.keyboard.press('ArrowDown')
  await p.waitForTimeout(250)
  verifica((await chiHa(4)) === tastiera, `${tema} tastiera: freccia in giù, casella dell'attacco`)
  verifica(focusVisibile !== 'none', `${tema} focus visibile sulla pedina da tastiera (outline ${focusVisibile})`)
  await p.getByRole('status').filter({ hasText: /va in |scambia/ }).first().waitFor({ state: 'attached' })
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  await p.getByRole('status').filter({ hasText: 'Salvato', hasNotText: 'non' }).first().waitFor()
  const dopo = await posiz()
  const cambiati = dopo.filter((g) => {
    const v = prima.find((x) => x.giocatore_id === g.giocatore_id)!
    return Math.abs(v.pos_x! - g.pos_x!) > 0.05 || Math.abs(v.pos_y! - g.pos_y!) > 0.05
  })
  verifica(cambiati.length >= 4, `${tema} la posizione salvata cambia via API per i giocatori trascinati/scambiati (${cambiati.map((g) => g.nome).join(', ')})`)
  verifica(suCaselle(dopo.filter((g) => g.squadra === 'A'), cas2) && suCaselle(dopo.filter((g) => g.squadra === 'B'), cas121) && new Set(dopo.map((g) => `${g.squadra}${g.pos_x}${g.pos_y}`)).size === 10, `${tema} dopo tutti i movimenti ogni giocatore sta su una casella diversa`)

  // ---------- risultato: gol, autogol, voti, cronaca; poi "giocata" ----------
  await p.getByRole('button', { name: 'Risultato', exact: true }).click()
  await p.getByRole('heading', { name: 'Risultato', level: 2 }).waitFor()
  const dopoSq = await posiz()
  const A = dopoSq.filter((g) => g.squadra === 'A')
  const B = dopoSq.filter((g) => g.squadra === 'B')
  const piu = async (nome: string, cosa: string, volte: number) => { for (let i = 0; i < volte; i++) await p.getByRole('button', { name: `Uno in più: ${cosa} di ${nome}` }).click() }
  await piu(A[0].nome, 'Gol', 2)
  await piu(A[1].nome, 'Gol', 1)
  await piu(B[0].nome, 'Gol', 1)
  await piu(B[1].nome, 'Autogol', 1)
  verifica((await p.getByRole('group', { name: `Gol di ${A[0].nome}`, exact: true }).locator('output').innerText()) === '2', `${tema} contatore gol: +`)
  await p.getByRole('button', { name: `Uno in meno: Gol di ${A[0].nome}` }).click()
  await piu(A[0].nome, 'Gol', 1)
  verifica(await p.getByRole('button', { name: `Uno in meno: Gol di ${A[3].nome}` }).isDisabled(), `${tema} contatore: non scende sotto zero`)
  const punti = await p.locator('.band .sc').allInnerTexts()
  verifica(punti.join('-') === '4-1', `${tema} il punteggio si calcola da gol e autogol (autogol a favore degli avversari): ${punti.join('-')}`)
  await p.locator(`#v${A[0].giocatore_id}`).selectOption('8.5')
  await p.locator(`#v${A[1].giocatore_id}`).selectOption('6')
  await p.locator(`#v${B[0].giocatore_id}`).selectOption('7.5')
  const voti = await p.locator(`#v${A[0].giocatore_id} option`).allInnerTexts()
  verifica(voti.length === 20 && voti[0] === '–' && voti[1] === '1,0' && voti[2] === '1,5' && voti[19] === '10,0', `${tema} voto: vuoto + da 1 a 10 a mezzi punti (${voti.length} voci)`)
  await p.getByLabel('Cronaca (facoltativa)').fill('Serata di prova: una partita tutta di corsa.\nFinale in crescendo.')
  await schermata(p, 'partita-risultato', tema)
  verifica(/Modifiche non salvate/i.test((await p.locator('.barra-salva').textContent()) ?? ''), `${tema} risultato: indicatore "modifiche non salvate"`)
  await p.getByRole('button', { name: 'Segna come giocata' }).click()
  await p.getByRole('heading', { name: 'Voto MVP', level: 2 }).waitFor()
  await p.getByText('Voto aperto').waitFor()
  const giocata = await api<PartitaDati>(p, `/api/partite/${id}`)
  verifica(giocata.json.stato === 'giocata' && giocata.json.squadre[0].gol === 4 && giocata.json.squadre[1].gol === 1, `${tema} segnata giocata col risultato calcolato 4-1 (salva prima la bozza)`)
  verifica(giocata.json.cronaca?.startsWith('Serata di prova') === true, `${tema} cronaca salvata`)
  const gA = giocata.json.giocatori.find((g) => g.giocatore_id === A[0].giocatore_id)!
  verifica(gA.gol === 2 && gA.voto_pagella === 8.5 && giocata.json.giocatori.find((g) => g.giocatore_id === A[1].giocatore_id)!.voto_pagella === 6, `${tema} gol e voti in pagella salvati`)
  verifica(giocata.json.mvp.stato === 'aperto', `${tema} dopo "giocata" il voto MVP è aperto`)

  // avvisi: correggo un gol dopo la partita, i conti non tornano
  await p.getByRole('button', { name: 'Risultato', exact: true }).click()
  await p.getByRole('button', { name: `Uno in meno: Gol di ${B[0].nome}` }).click()
  await p.getByRole('button', { name: 'Salva', exact: true }).click()
  await p.getByRole('alert').filter({ hasText: /I conti non tornano/ }).waitFor()
  verifica(/Smollicati: il risultato è 1, i gol registrati \(autogol avversari compresi\) sono 0/.test(await p.getByRole('alert').filter({ hasText: /I conti non tornano/ }).innerText()), `${tema} gli avvisi del backend si vedono, con le lettere accentate`)
  await schermata(p, 'partita-risultato-avvisi', tema)
  await p.getByRole('button', { name: 'Aggiorna il risultato a 4-0' }).click()
  await p.getByRole('status').filter({ hasText: 'Risultato aggiornato: 4-0' }).waitFor()
  verifica((await api<PartitaDati>(p, `/api/partite/${id}`)).json.squadre.map((x) => x.gol).join('-') === '4-0', `${tema} risultato corretto a 4-0 (PATCH)`)

  // ---------- la pagina pubblica mostra tutto ----------
  const pub = await s.ctx.newPage()
  await pub.goto(`${BASE}/partite/${id}`)
  await pub.locator('.ped').first().waitFor()
  await assesta(pub, `${tema} pagina pubblica`)
  const testo = await pub.locator('main').innerText()
  verifica((await pub.locator('.band .sc').allInnerTexts()).join('-') === '4-0', `${tema} pubblico: risultato 4-0`)
  verifica(testo.includes('Serata di prova: una partita tutta di corsa.'), `${tema} pubblico: cronaca`)
  verifica(testo.includes(A[0].nome) && (await pub.locator('.pr .voto').allInnerTexts()).includes('8,5'), `${tema} pubblico: marcatori e pagella con i voti`)
  const stiliPub = await pub.locator('.ped').evaluateAll((els) => els.map((e) => ({ n: e.getAttribute('aria-label')!, s: e.getAttribute('style')! })))
  const pubblicoSuCaselle = dopoSq.every((g) => {
    const k = stiliPub.find((x) => x.n.startsWith(g.nome))
    return !!k && k.s.includes(`left: ${g.pos_x}%`) && k.s.includes(`top: ${g.pos_y}%`)
  })
  verifica(pubblicoSuCaselle && stiliPub.length === 10, `${tema} pubblico: le 10 pedine stanno sulle caselle salvate dall'admin`)
  verifica((await pub.locator('.pitch .cart').allInnerTexts()).every((t) => /^\S.* (\p{Lu}\.)+$/u.test(t)), `${tema} pubblico: sul campo "Cognome I." per intero`)
  await foto(pub, SCHERMATE, `${tema}-pagina-pubblica-partita`)
  await pub.close()

  // ---------- MVP: chiusura, nessun_voto, scelta ----------
  await p.getByRole('button', { name: 'MVP', exact: true }).click()
  await p.getByText('Voto aperto').waitFor()
  verifica(/0\s*voti/i.test((await p.locator('.conto').textContent()) ?? ''), `${tema} MVP: stato aperto con il numero dei voti (0)`)
  await schermata(p, 'mvp-aperto', tema)
  await p.getByRole('button', { name: 'Chiudi voto ora' }).click()
  await p.getByRole('group', { name: 'Conferma' }).waitFor()
  verifica(/Chiudere il voto adesso/.test(await p.getByRole('group', { name: 'Conferma' }).innerText()), `${tema} MVP: "Chiudi voto ora" chiede conferma nella pagina`)
  await schermata(p, 'mvp-chiudi-conferma', tema)
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: 'Sì, chiudi il voto' }).click()
  await p.getByText('Nessuno ha votato: scegli tu l\'MVP').waitFor()
  verifica((await api<PartitaDati>(p, `/api/partite/${id}`)).json.mvp.stato === 'nessun_voto', `${tema} MVP: senza voti lo stato è nessun_voto`)
  verifica((await p.locator('.conv-scelta label').count()) === 10, `${tema} MVP nessun_voto: la scelta è fra i 10 giocatori della partita`)
  await schermata(p, 'mvp-nessun-voto', tema)
  await p.locator('.conv-scelta label', { hasText: A[0].nome }).click()
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: "Conferma l'MVP" }).click()
  await p.getByText("MVP scelto dall'admin").first().waitFor()
  const fin = (await api<PartitaDati>(p, `/api/partite/${id}`)).json.mvp
  verifica(fin.stato === 'assegnato' && fin.vincitore.nome === A[0].nome && fin.voti_totali === 0, `${tema} MVP assegnato dall'admin dopo nessun voto`)
  await schermata(p, 'mvp-assegnato', tema)

  // parità: la partita 5 del seed ha un pari merito (nel tema scuro la ripristino, perché la chiaro l'ha decisa)
  await p.goto(`${BASE}/admin/partite/5?sez=mvp`)
  await p.getByText("Parità: scegli l'MVP fra i pari merito.").waitFor()
  const cand = await p.locator('.conv-scelta label').count()
  verifica(cand >= 2, `${tema} MVP parità: la scelta è fra i ${cand} pari merito`)
  await schermata(p, 'mvp-parita', tema)
  await p.locator('.conv-scelta label').first().click()
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: "Conferma l'MVP" }).click()
  await p.getByText('MVP della partita').waitFor()
  verifica((await api<PartitaDati>(p, '/api/partite/5')).json.mvp.stato === 'assegnato', `${tema} MVP parità decisa dall'admin`)
  sql("DELETE FROM mvp_vincitori WHERE partita_id = 5; UPDATE partite SET mvp_stato = 'parita_da_decidere' WHERE id = 5;") // per il giro successivo

  // ---------- modifica ed eliminazione (in convocazione) ----------
  await p.goto(`${BASE}/admin/partite/nuova`)
  await p.locator('.conv-scelta label').first().waitFor()
  await p.getByLabel('Data e ora').fill('2026-11-05T20:30')
  await p.locator('.conv-scelta label', { hasText: 'Rossi M.' }).click()
  await p.getByRole('button', { name: 'Crea la partita' }).click()
  await p.waitForURL(/\/admin\/partite\/\d+\?sez=squadre/)
  const id2 = Number(new URL(p.url()).pathname.split('/').pop())
  await p.getByRole('button', { name: 'Partita', exact: true }).click()
  await p.getByLabel('Data e ora').fill('2026-11-06T19:15')
  await p.getByRole('button', { name: 'Salva le modifiche' }).click()
  await p.getByRole('status').filter({ hasText: 'Partita modificata' }).waitFor()
  verifica((await api<PartitaDati>(p, `/api/partite/${id2}`)).json.data_ora === '2026-11-06T18:15:00Z', `${tema} modifica della partita: nuova data e ora (ora di Roma)`)
  await schermata(p, 'partita-modifica', tema)
  await p.getByRole('button', { name: 'Elimina la partita' }).click()
  await p.getByRole('group', { name: 'Conferma' }).waitFor()
  await schermata(p, 'partita-elimina-conferma', tema)
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: 'Annulla' }).click()
  verifica((await api(p, `/api/partite/${id2}`)).stato === 200, `${tema} "Annulla": la partita c'è ancora`)
  await p.getByRole('button', { name: 'Elimina la partita' }).click()
  await p.getByRole('group', { name: 'Conferma' }).getByRole('button', { name: 'Sì, elimina' }).click()
  await p.waitForURL((u) => u.pathname === '/admin/partite')
  verifica((await p.request.get(`${BASE}/api/partite/${id2}`)).status() === 404, `${tema} partita eliminata dopo la conferma`)
  await p.goto(`${BASE}/admin/partite/${id}?sez=partita`)
  await p.getByText('Una partita già giocata non si può eliminare').waitFor()
  verifica((await p.getByRole('button', { name: 'Elimina la partita' }).count()) === 0, `${tema} una partita giocata non offre l'eliminazione (lo spiega)`)

  // ---------- pagine e schermate rimanenti ----------
  await p.goto(`${BASE}/admin/partite`)
  await p.getByRole('heading', { name: 'Partite', level: 1 }).waitFor()
  await p.locator('.match').first().waitFor()
  await schermata(p, 'partite-elenco-finale', tema)
  await p.goto(`${BASE}/admin/partite/${id}?sez=convocati`)
  await p.getByText('La partita è già stata giocata').waitFor()
  await schermata(p, 'partita-convocati-giocata', tema)
  await p.goto(`${BASE}/admin/pagina-che-non-c-e`)
  await p.getByRole('heading', { name: 'Pagina non trovata' }).waitFor()
  await schermata(p, 'pagina-non-trovata', tema)

  // il livello segreto non è uscito da nessuna risposta pubblica
  verifica(pubblico.length === 0, `${tema} nessuna risposta PUBBLICA contiene "livello" (${pubblico.join(', ')})`)
  await chiudiSessione(s, tema)
}

async function provaSenzaAccesso(browser: Browser, tema: 'light' | 'dark') {
  console.log(`\n== senza accesso, tema ${tema} ==`)
  const s = await apri(browser, BASE_SENZA, tema, { touch: true, ignora: /status of (401|403)/ })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE_SENZA}/admin`)
  await p.getByRole('heading', { name: 'Area riservata agli admin' }).waitFor()
  await schermata(p, 'area-riservata', tema)
  verifica((await p.locator('input').count()) === 0, `${tema} senza bypass: "Area riservata agli admin" e nessun form di password`)
  verifica(await p.getByRole('link', { name: 'Torna al sito' }).isVisible(), `${tema} senza bypass: "Torna al sito"`)
  const r = await api(p, '/api/admin/giocatori')
  verifica(r.stato === 403 || r.stato === 401, `${tema} senza bypass: /api/admin/* rifiuta (${r.stato})`)
  const scrittura = await api(p, '/api/admin/giocatori', { method: 'POST', corpo: { cognome: 'Rossi', iniziali: 'X' } })
  verifica(scrittura.stato === 403 || scrittura.stato === 401, `${tema} senza bypass: nessuna scrittura (${scrittura.stato})`)
  await p.goto(`${BASE_SENZA}/admin/giocatori`)
  await p.getByRole('heading', { name: 'Area riservata agli admin' }).waitFor()
  await p.getByRole('link', { name: 'Torna al sito' }).click()
  await p.waitForURL((u) => u.pathname === '/')
  await chiudiSessione(s, `${tema} senza accesso`)
}

/** Movimento ridotto: nessuna animazione attiva nell'area admin. */
async function provaMovimentoRidotto(browser: Browser) {
  console.log('\n== movimento ridotto, admin ==')
  const s = await apri(browser, BASE, 'light', { touch: true, reducedMotion: 'reduce' })
  const p = await s.ctx.newPage()
  await p.goto(`${BASE}/admin/giocatori`)
  await p.locator('.riga-btn').first().waitFor()
  const animate = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length)
  verifica(animate === 0, `prefers-reduced-motion: nessuna animazione attiva nell'admin (${animate})`)
  await s.ctx.close()
}

async function main() {
  mkdirSync(SCHERMATE, { recursive: true })
  console.log(`dati di prova in ${DATI}, schermate in ${SCHERMATE}`)
  preparaBase()
  await avviaServer(PORTA, ['--binding', 'DEV_ADMIN_BYPASS=1'])
  await avviaServer(PORTA + 1)
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined })
  const pubblico: string[] = []
  try {
    await provaAdmin(browser, 'light', pubblico)
    await provaAdmin(browser, 'dark', pubblico)
    await provaSenzaAccesso(browser, 'light')
    await provaSenzaAccesso(browser, 'dark')
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
