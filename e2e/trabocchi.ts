/**
 * Rilevatore automatico di TRABOCCHI DI TESTO, per ogni schermata (pubblica e admin).
 *
 * Nato da un difetto vero visto su iPhone: il nome di un badge usciva dalla sua chip e si sovrapponeva alla
 * descrizione; il campo "data" nativo usciva dai bordi. In Chromium i test passavano, ma il telefono e' Safari:
 * per questo il rilevatore gira in TRE condizioni che simulano le differenze di Safari (e di chi ha il testo grande):
 *   a. `font`       web font caricati (Anton, Nunito Sans);
 *   b. `senzafont`  web font BLOCCATI (404 su .woff2 e .woff): si usano i font di sistema di ripiego, con metriche diverse;
 *   c. `ingrandito` testo ingrandito: `html{font-size:120%}` iniettato E ogni font-size in px moltiplicato per 1,2
 *                   (il CSS del sito e' in px: il solo 120% sull'html non cambierebbe quasi niente).
 * a 320, 360, 390 e 430 px, in chiaro e in scuro. Per ogni elemento visibile con testo diretto FALLISCE se:
 *   - scrollWidth > clientWidth + 1 (o scrollHeight, se il testo e' tagliato da overflow:hidden), salvo gli elementi con
 *     `text-overflow:ellipsis` + `overflow:hidden` voluti e i contenitori che scorrono di proposito (overflow-x:auto);
 *   - il riquadro del testo (Range.getClientRects sui nodi di testo) esce dal riquadro del suo contenitore con bordo o
 *     sfondo (o dallo schermo);
 *   - due blocchi di testo si sovrappongono.
 * In piu': un controllo di modulo (input, select, textarea) che esce dal contenitore o dallo schermo, e la pagina che
 * scorre in orizzontale.
 */
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { verifica } from './impianto.ts'

export const LARGHEZZE = [320, 360, 390, 430] as const
export const CONDIZIONI = ['font', 'senzafont', 'ingrandito'] as const
export type Condizione = (typeof CONDIZIONI)[number]
export type Tema = 'light' | 'dark'

export type Trabocco = { tipo: 'largo' | 'alto' | 'fuori' | 'sovrapposto' | 'controllo' | 'pagina'; el: string; testo: string; dettaglio: string }

/** Una schermata da visitare: `prepara` porta la pagina nello stato voluto (form aperto, riga espansa...). */
export type Schermata = { nome: string; url: string; base?: string; attesa?: string; prepara?: (p: Page) => Promise<void> }

/** La misura, eseguita DENTRO la pagina. Funzione sola: viene serializzata, non puo' usare niente dal modulo. */
export function misuraNellaPagina(): Trabocco[] {
  const trovati: Trabocco[] = []
  const vistiChiave = new Set<string>()
  const segna = (t: Trabocco) => {
    const k = `${t.tipo}|${t.el}|${t.testo}`
    if (vistiChiave.has(k)) return
    vistiChiave.add(k)
    trovati.push(t)
  }
  const sel = (e: Element) => {
    const c = typeof (e as HTMLElement).className === 'string' ? (e as HTMLElement).className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''
    return e.tagName.toLowerCase() + (c ? '.' + c : '')
  }
  const testoDi = (e: Element) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  const nascosto = (e: Element) => {
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0' || !!e.closest('[hidden], .sr, .salta, svg, head, script, style, template')
  }
  const alfaTrasparente = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || c === 'rgba(0, 0, 0, 0)'
  /** L'elemento ha un bordo o uno sfondo propri: e' un "riquadro" che il testo non deve oltrepassare. */
  const riquadro = (e: Element) => {
    const s = getComputedStyle(e)
    const bordo = (['Top', 'Right', 'Bottom', 'Left'] as const).some((l) => parseFloat(s[`border${l}Width`]) > 0 && s[`border${l}Style`] !== 'none')
    return bordo || !alfaTrasparente(s.backgroundColor) || s.backgroundImage !== 'none'
  }
  const contenitoreDi = (e: Element): Element | null => {
    for (let x: Element | null = e; x && x !== document.body && x !== document.documentElement; x = x.parentElement) if (riquadro(x)) return x
    return null
  }
  const conTrasformazione = (e: Element) => {
    for (let x: Element | null = e; x; x = x.parentElement) if (getComputedStyle(x).transform !== 'none') return true
    return false
  }
  const dentroScorrimento = (e: Element) => {
    for (let x: Element | null = e.parentElement; x; x = x.parentElement) {
      const o = getComputedStyle(x).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
    return false
  }
  /** Righe di testo dei nodi di testo diretti: rettangoli per riga (Range), ristretti all'altezza della riga (line-height). */
  const righeDi = (e: Element) => {
    const s = getComputedStyle(e)
    const lh = parseFloat(s.lineHeight)
    const out: { l: number; t: number; r: number; b: number }[] = []
    for (const n of [...e.childNodes]) {
      if (n.nodeType !== 3 || !(n.textContent ?? '').trim()) continue
      const rg = document.createRange()
      rg.selectNodeContents(n)
      for (const q of [...rg.getClientRects()]) {
        if (q.width < 0.5 || q.height < 0.5) continue
        const h = Number.isFinite(lh) ? Math.min(q.height, lh) : q.height
        const cy = (q.top + q.bottom) / 2
        out.push({ l: q.left, t: cy - h / 2, r: q.right, b: cy + h / 2 })
      }
    }
    return out
  }
  const largo = document.documentElement.clientWidth
  /**
   * scrollWidth conta anche i figli in posizione assoluta e gli pseudo-elementi ::before/::after (il bollino dei badge
   * sulla figurina, la sottolineatura rossa dei titoli): decorazioni volute, non testo. Si rimisura con quelli nascosti.
   */
  const trabocca = (h: HTMLElement, dim: 'Width' | 'Height') => {
    const grezzo = dim === 'Width' ? h.scrollWidth > h.clientWidth + 1 : h.scrollHeight > h.clientHeight + 1
    if (!grezzo) return null
    const assoluti = [...h.querySelectorAll<HTMLElement>('*')].filter((x) => ['absolute', 'fixed'].includes(getComputedStyle(x).position))
    assoluti.forEach((x) => x.setAttribute('data-tt-abs', ''))
    // niente <style> inline: la CSP del sito lo blocca (style-src 'self'); un foglio costruito via CSSOM e' permesso
    const foglio = new CSSStyleSheet()
    foglio.replaceSync('[data-tt-abs],*::before,*::after{display:none!important}')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, foglio]
    const veroL = dim === 'Width' ? h.scrollWidth > h.clientWidth + 1 : h.scrollHeight > h.clientHeight + 1
    const misura = dim === 'Width' ? `scrollWidth ${h.scrollWidth} > clientWidth ${h.clientWidth}` : `scrollHeight ${h.scrollHeight} > clientHeight ${h.clientHeight}`
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((f) => f !== foglio)
    assoluti.forEach((x) => x.removeAttribute('data-tt-abs'))
    return veroL ? misura : null
  }
  const fissoOAppiccicato = (e: Element) => {
    for (let x: Element | null = e; x; x = x.parentElement) {
      const p = getComputedStyle(x).position
      if (p === 'fixed' || p === 'sticky') return true
    }
    return false
  }

  type Blocco = { e: Element; righe: { l: number; t: number; r: number; b: number }[]; nome: string; testo: string }
  const blocchi: Blocco[] = []

  for (const e of [...document.body.querySelectorAll('*')]) {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'OPTION'].includes(e.tagName)) continue
    if (!testoDi(e)) continue
    if (nascosto(e)) continue
    const h = e as HTMLElement
    const s = getComputedStyle(h)
    const ellissi = s.textOverflow === 'ellipsis' && (s.overflowX === 'hidden' || s.overflowX === 'clip')
    const scorre = s.overflowX === 'auto' || s.overflowX === 'scroll'
    const nome = sel(e)
    const testo = testoDi(e)

    // 1. il contenuto e' piu' largo (o, se tagliato, piu' alto) della scatola
    if (h.clientWidth > 0 && !ellissi && !scorre) {
      const m = trabocca(h, 'Width')
      if (m) segna({ tipo: 'largo', el: nome, testo, dettaglio: m })
    }
    if (h.clientHeight > 0 && (s.overflowY === 'hidden' || s.overflowY === 'clip') && !(ellissi && s.whiteSpace === 'nowrap')) {
      const m = trabocca(h, 'Height')
      if (m) segna({ tipo: 'alto', el: nome, testo, dettaglio: m })
    }

    // 2. il riquadro del testo esce dal riquadro (bordo o sfondo) che lo contiene, o dallo schermo
    let righe = righeDi(e)
    if (righe.length === 0) continue
    if (ellissi) {
      // il testo oltre il bordo e' tagliato (con i puntini): conta solo la parte visibile
      const c = h.getBoundingClientRect()
      const pl = c.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft)
      const pr = c.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight)
      righe = righe.map((q) => ({ ...q, l: Math.max(q.l, pl), r: Math.min(q.r, pr) }))
    }
    const l = Math.min(...righe.map((q) => q.l))
    const r = Math.max(...righe.map((q) => q.r))
    const tol = conTrasformazione(e) ? 3 : 1.5
    const cont = contenitoreDi(e)
    if (cont) {
      const c = cont.getBoundingClientRect()
      if (l < c.left - tol || r > c.right + tol) {
        segna({ tipo: 'fuori', el: nome, testo, dettaglio: `testo ${Math.round(l)}..${Math.round(r)} fuori da ${sel(cont)} ${Math.round(c.left)}..${Math.round(c.right)}` })
      }
    }
    if (!dentroScorrimento(e) && (l < -tol || r > largo + tol)) {
      segna({ tipo: 'fuori', el: nome, testo, dettaglio: `testo ${Math.round(l)}..${Math.round(r)} fuori dallo schermo (${largo})` })
    }
    if (!fissoOAppiccicato(e)) blocchi.push({ e, righe, nome, testo })
  }

  // 3. due blocchi di testo che si sovrappongono (mai uno dentro l'altro: quelli sono padre e figlio)
  for (let i = 0; i < blocchi.length; i++) {
    for (let j = i + 1; j < blocchi.length; j++) {
      const a = blocchi[i]
      const b = blocchi[j]
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue
      // due pedine di squadre diverse possono toccarsi per i DATI (posizioni salvate piu' vicine della loro larghezza):
      // non e' il CSS. Il testo della stessa pedina (nome, voto) resta controllato.
      const pa = a.e.closest('.ped')
      const pb = b.e.closest('.ped')
      if (pa && pb && pa !== pb) continue
      let hit: string | null = null
      for (const p of a.righe) {
        for (const q of b.righe) {
          const dx = Math.min(p.r, q.r) - Math.max(p.l, q.l)
          const dy = Math.min(p.b, q.b) - Math.max(p.t, q.t)
          const minH = Math.min(p.b - p.t, q.b - q.t)
          if (dx > 2 && dy > Math.max(2, minH * 0.25)) hit = `${Math.round(dx)}x${Math.round(dy)} px`
        }
      }
      if (hit) segna({ tipo: 'sovrapposto', el: `${a.nome} x ${b.nome}`, testo: `${a.testo} / ${b.testo}`, dettaglio: hit })
    }
  }

  // controlli di modulo: dentro il contenitore e dentro lo schermo
  for (const e of [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]) {
    if (nascosto(e)) continue
    const r = e.getBoundingClientRect()
    const cont = contenitoreDi(e.parentElement ?? e)
    const c = cont?.getBoundingClientRect()
    if (r.left < -0.5 || r.right > largo + 0.5 || (c && (r.left < c.left - 0.5 || r.right > c.right + 0.5))) {
      segna({ tipo: 'controllo', el: sel(e), testo: (e as HTMLInputElement).type ?? '', dettaglio: `${Math.round(r.left)}..${Math.round(r.right)} (schermo ${largo}${c ? `, contenitore ${Math.round(c.left)}..${Math.round(c.right)}` : ''})` })
    }
  }
  // controlli nativi robusti su iOS: blocco largo quanto il contenitore, senza l'aspetto nativo (che ignora width)
  for (const e of [...document.querySelectorAll<HTMLElement>('.fld input:not([type="hidden"]), .fld select, .fld textarea, select.tendina, .voto-sel select')]) {
    if (nascosto(e)) continue
    const cs = getComputedStyle(e)
    const app = cs.getPropertyValue('-webkit-appearance') || cs.getPropertyValue('appearance')
    const male = [app !== 'none' ? `appearance ${app}` : '', cs.display !== 'block' ? `display ${cs.display}` : '', cs.boxSizing !== 'border-box' ? 'box-sizing' : '', cs.maxWidth !== '100%' ? `max-width ${cs.maxWidth}` : '', cs.minWidth !== '0px' ? `min-width ${cs.minWidth}` : '', parseFloat(cs.minHeight) < 44 ? `min-height ${cs.minHeight}` : ''].filter(Boolean)
    if (male.length) segna({ tipo: 'controllo', el: sel(e), testo: (e as HTMLInputElement).type ?? '', dettaglio: `non robusto su iOS: ${male.join(', ')}` })
  }
  if (document.documentElement.scrollWidth > largo + 1) {
    segna({ tipo: 'pagina', el: 'html', testo: '', dettaglio: `la pagina scorre in orizzontale: scrollWidth ${document.documentElement.scrollWidth} > ${largo}` })
  }
  return trovati
}

/** Ingrandisce il testo come "testo piu' grande" dei telefoni: html 120% e ogni font-size in px per 1,2. */
async function ingrandisci(p: Page) {
  await p.evaluate(() => {
    document.documentElement.style.fontSize = '120%'
    const els = [...document.body.querySelectorAll<HTMLElement>('*')]
    const misure = els.map((e) => parseFloat(getComputedStyle(e).fontSize))
    els.forEach((e, i) => e.style.setProperty('font-size', `${(misure[i] * 1.2).toFixed(2)}px`, 'important'))
  })
}

/** Un contesto per condizione: font bloccati con 404 sui .woff2/.woff, oppure movimento ridotto per non misurare a meta' animazione. */
async function contesto(browser: Browser, tema: Tema, larghezza: number, condizione: Condizione, touch: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: larghezza, height: 844 }, colorScheme: tema, locale: 'it-IT', timezoneId: 'Europe/Rome', reducedMotion: 'reduce', hasTouch: touch, isMobile: touch })
  if (condizione === 'senzafont') await ctx.route(/\.woff2?(\?.*)?$/, (r) => r.fulfill({ status: 404, body: '' }))
  return ctx
}

export type Rapporto = { schermata: string; condizione: Condizione; tema: Tema; larghezza: number; trabocchi: Trabocco[] }

/** Visita le schermate in tutte le condizioni. `base` e' l'origine di default; una schermata puo' averne un'altra. */
export async function visitaTrabocchi(browser: Browser, base: string, schermate: Schermata[], opzioni: { touch?: boolean; condizioni?: readonly Condizione[]; temi?: readonly Tema[]; larghezze?: readonly number[] } = {}): Promise<Rapporto[]> {
  const { touch = false, condizioni = CONDIZIONI, temi = ['light', 'dark'] as const, larghezze = LARGHEZZE } = opzioni
  const rapporti: Rapporto[] = []
  for (const condizione of condizioni) {
    for (const tema of temi) {
      // le quattro larghezze in parallelo (contesti separati)
      await Promise.all(
        larghezze.map(async (w) => {
          const ctx = await contesto(browser, tema, w, condizione, touch)
          const p = await ctx.newPage()
          try {
            for (const sc of schermate) {
              await p.goto((sc.base ?? base) + sc.url)
              await p.locator(sc.attesa ?? 'main h1').first().waitFor()
              await p.waitForFunction(() => !/Carico /.test(document.querySelector('main')?.textContent ?? ''))
              await sc.prepara?.(p)
              await p.waitForFunction(() => !/Carico /.test(document.querySelector('main')?.textContent ?? ''))
              await p.evaluate(() => document.fonts.ready)
              await p.waitForLoadState('networkidle')
              const caricati = await p.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length)
              if (condizione === 'senzafont' && caricati > 0) rapporti.push({ schermata: sc.nome, condizione, tema, larghezza: w, trabocchi: [{ tipo: 'pagina', el: 'font', testo: '', dettaglio: 'la condizione "senza font" ha caricato dei web font' }] })
              if (condizione !== 'senzafont' && caricati === 0) rapporti.push({ schermata: sc.nome, condizione, tema, larghezza: w, trabocchi: [{ tipo: 'pagina', el: 'font', testo: '', dettaglio: 'nessun web font caricato' }] })
              if (condizione === 'ingrandito') await ingrandisci(p)
              await p.waitForTimeout(60)
              rapporti.push({ schermata: sc.nome, condizione, tema, larghezza: w, trabocchi: await p.evaluate(misuraNellaPagina) })
            }
          } finally {
            await ctx.close()
          }
        }),
      )
    }
  }
  return rapporti
}

/** Riassunto per schermata e per condizione (somma su temi e larghezze). */
export function riassumi(rapporti: Rapporto[]) {
  const per = new Map<string, Record<Condizione, number>>()
  for (const r of rapporti) {
    const riga = per.get(r.schermata) ?? { font: 0, senzafont: 0, ingrandito: 0 }
    riga[r.condizione] += r.trabocchi.length
    per.set(r.schermata, riga)
  }
  const totale: Record<Condizione, number> = { font: 0, senzafont: 0, ingrandito: 0 }
  for (const riga of per.values()) for (const c of CONDIZIONI) totale[c] += riga[c]
  return { per, totale }
}

/** Le violazioni distinte (tipo + elemento + testo), con dove e in che condizione compaiono: per capire la causa. */
export function distinte(rapporti: Rapporto[]) {
  const m = new Map<string, { tipo: string; el: string; testo: string; dettaglio: string; schermate: Set<string>; condizioni: Set<string>; larghezze: Set<number>; volte: number }>()
  for (const r of rapporti) {
    for (const t of r.trabocchi) {
      const k = `${t.tipo}|${t.el}|${t.testo}`
      const v = m.get(k) ?? { tipo: t.tipo, el: t.el, testo: t.testo, dettaglio: t.dettaglio, schermate: new Set(), condizioni: new Set(), larghezze: new Set(), volte: 0 }
      v.schermate.add(r.schermata)
      v.condizioni.add(r.condizione)
      v.larghezze.add(r.larghezza)
      v.volte++
      m.set(k, v)
    }
  }
  return [...m.values()].sort((a, b) => b.volte - a.volte)
}

/**
 * Esegue la visita e verifica: nessun trabocco. Con E2E_TRABOCCHI=report NON fallisce e stampa il riassunto
 * (serve per contare i trabocchi prima di correggere); con E2E_TRABOCCHI_JSON=percorso salva anche i dettagli.
 */
export async function provaTrabocchi(browser: Browser, base: string, etichetta: string, schermate: Schermata[], opzioni: Parameters<typeof visitaTrabocchi>[3] = {}) {
  console.log(`\n== trabocchi di testo: ${etichetta} (${schermate.length} schermate x ${(opzioni.condizioni ?? CONDIZIONI).length} condizioni x 2 temi x ${(opzioni.larghezze ?? LARGHEZZE).length} larghezze) ==`)
  const rapporti = await visitaTrabocchi(browser, base, schermate, opzioni)
  const { per, totale } = riassumi(rapporti)
  const report = process.env.E2E_TRABOCCHI === 'report'
  console.log(`  ${'schermata'.padEnd(44)} font  senzafont  ingrandito`)
  for (const [nome, r] of per) console.log(`  ${nome.padEnd(44)} ${String(r.font).padStart(4)}  ${String(r.senzafont).padStart(9)}  ${String(r.ingrandito).padStart(10)}`)
  console.log(`  ${'TOTALE'.padEnd(44)} ${String(totale.font).padStart(4)}  ${String(totale.senzafont).padStart(9)}  ${String(totale.ingrandito).padStart(10)}`)
  const elenco = distinte(rapporti)
  for (const d of elenco.slice(0, report ? 60 : 12)) {
    console.log(`  - [${d.tipo}] ${d.el} "${d.testo}" ${d.dettaglio} (${d.volte}x; ${[...d.condizioni].join('/')}; ${[...d.larghezze].join(',')}px; ${[...d.schermate].slice(0, 3).join(', ')})`)
  }
  if (process.env.E2E_TRABOCCHI_JSON) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.E2E_TRABOCCHI_JSON.replace(/\.json$/, `-${etichetta}.json`), JSON.stringify({ totale, per: Object.fromEntries(per), distinte: elenco.map((d) => ({ ...d, schermate: [...d.schermate], condizioni: [...d.condizioni], larghezze: [...d.larghezze] })) }, null, 1))
  }
  if (report) return
  for (const c of CONDIZIONI) {
    if (!(opzioni.condizioni ?? CONDIZIONI).includes(c)) continue
    verifica(totale[c] === 0, `trabocchi di testo ${etichetta}, condizione ${c}: zero (${totale[c]}) ${elenco.filter((d) => d.condizioni.has(c)).slice(0, 5).map((d) => `${d.el} "${d.testo}"`).join(' | ')}`)
  }
}

/**
 * Prova del rilevatore stesso: su una pagina vera si costruiscono a mano tre trabocchi (chip stretta con testo lungo, due testi
 * uno sull'altro, parola lunghissima in un riquadro) e il rilevatore DEVE trovarli. Senza questa prova un rilevatore rotto
 * direbbe "zero trabocchi" per sempre. Solo CSSOM (element.style): la CSP del sito vieta gli stili inline nel markup.
 */
export async function provaRilevatore(browser: Browser, base: string) {
  const ctx = await contesto(browser, 'light', 390, 'font', false)
  const p = await ctx.newPage()
  await p.goto(base + '/info')
  await p.locator('main h1').waitFor()
  await p.evaluate(() => {
    const crea = (tag: string, testo: string, stile: Record<string, string>) => {
      const e = document.createElement(tag)
      e.textContent = testo
      e.className = 'prova-rilevatore'
      for (const [k, v] of Object.entries(stile)) e.style.setProperty(k, v)
      document.querySelector('main')!.appendChild(e)
      return e
    }
    // 1. chip a larghezza fissa e senza andare a capo (il difetto visto su iPhone)
    crea('span', 'Dribblomane', { display: 'inline-block', width: '40px', border: '2px solid #000', 'white-space': 'nowrap' })
    // 2. due testi uno sull'altro
    const a = crea('div', 'Sovrapposto uno', { position: 'relative', height: '20px' })
    const b = crea('div', 'Sovrapposto due', { position: 'relative', top: '-14px', height: '20px' })
    a.style.setProperty('background', 'transparent')
    b.style.setProperty('background', 'transparent')
    // 3. parola lunghissima dentro un riquadro con bordo
    crea('p', 'Wolfeschlegelsteinhausenbergerdorffwolfeschlegelsteinhausenbergerdorff', { border: '2px solid #000', 'white-space': 'nowrap', 'overflow-wrap': 'normal', 'word-break': 'normal' })
  })
  const trovati = await p.evaluate(misuraNellaPagina)
  const tipi = new Set(trovati.map((t) => t.tipo))
  verifica(tipi.has('largo') && tipi.has('fuori'), `rilevatore: vede la chip stretta e la parola lunga (${[...tipi].join(', ')})`)
  verifica(tipi.has('sovrapposto'), `rilevatore: vede due testi uno sull'altro (${trovati.filter((t) => t.tipo === 'sovrapposto').length})`)
  await ctx.close()
}

/** Il campo data resta usabile: si tocca, prende il fuoco e il selettore nativo si puo' aprire (showPicker dopo un tocco vero). */
export async function provaSelettoreData(browser: Browser, base: string) {
  const ctx = await contesto(browser, 'light', 390, 'font', true)
  const p = await ctx.newPage()
  await p.goto(`${base}/admin/stagioni`)
  await p.getByRole('button', { name: 'Nuova stagione' }).click()
  const data = p.getByLabel('Data di inizio')
  await data.tap()
  const stato = await data.evaluate((e: HTMLInputElement) => {
    let picker = 'ok'
    try {
      e.showPicker()
    } catch (err) {
      picker = err instanceof Error ? err.name : 'errore'
    }
    const r = e.getBoundingClientRect()
    const c = e.closest('.card')!.getBoundingClientRect()
    return { fuoco: document.activeElement === e, picker, dentro: r.left >= c.left && r.right <= c.right, tipo: e.type, alto: r.height }
  })
  verifica(stato.fuoco && stato.tipo === 'date' && stato.dentro && stato.alto >= 44, `selettore di data: si tocca, prende il fuoco, sta nella carta, alto ${Math.round(stato.alto)} px`)
  verifica(stato.picker === 'ok', `selettore di data: showPicker() dopo il tocco non da errori (${stato.picker})`)
  await data.fill('2026-10-01')
  verifica((await data.inputValue()) === '2026-10-01', 'selettore di data: il valore si scrive e si legge (ISO)')
  await ctx.close()
}
