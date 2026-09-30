/**
 * Prova di layout dei form admin: a ogni larghezza da telefono nessun campo si sovrappone a un altro
 * e nessuno esce dal suo contenitore. Nata da un difetto vero: in "Nuova partita" gli input nativi
 * date/time hanno una larghezza minima intrinseca e, dentro una griglia con `1fr`, si sovrapponevano
 * al campo vicino a 390 px.
 */
import type { Page } from 'playwright-core'
import { foto, verifica } from './impianto.ts'

export const LARGHEZZE = [320, 360, 390, 430] as const

export type Difetti = { sovrapposti: string[]; fuori: string[]; controlli: number }

/** Misura i controlli dei form visibili nella pagina; NON dipende da cosa e' aperto: guarda tutto il DOM. */
export function misuraModuli(p: Page): Promise<Difetti> {
  return p.evaluate(() => {
    const SELETTORE = 'input:not(.sr):not([type="hidden"]), select, textarea, .lvl, .chips, .azioni-modulo > button, .azioni-modulo > a'
    const etichetta = (e: Element) => {
      const h = e as HTMLElement
      const lab = h.id ? document.querySelector(`label[for="${CSS.escape(h.id)}"]`)?.textContent : ''
      return `${e.tagName.toLowerCase()}[${(lab || h.getAttribute('aria-label') || h.textContent || '').trim().slice(0, 28)}]`
    }
    const visibile = (e: Element) => {
      const r = e.getBoundingClientRect()
      const s = getComputedStyle(e)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden], .salta, .barra-salva, .nav')
    }
    const tutti = [...document.querySelectorAll(SELETTORE)].filter(visibile)
    // solo i controlli "di livello alto": un pulsante dentro .lvl o .chips non e' un fratello di .lvl
    const controlli = tutti.filter((e) => !tutti.some((altro) => altro !== e && altro.contains(e)))
    const rett = (e: Element) => {
      const r = e.getBoundingClientRect()
      return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }
    }
    const sovrapposti: string[] = []
    for (let i = 0; i < controlli.length; i++) {
      for (let j = i + 1; j < controlli.length; j++) {
        const a = rett(controlli[i])
        const b = rett(controlli[j])
        const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (dx > 1 && dy > 1) sovrapposti.push(`${etichetta(controlli[i])} x ${etichetta(controlli[j])} (${Math.round(dx)}x${Math.round(dy)} px)`)
      }
    }
    const fuori: string[] = []
    for (const e of controlli) {
      const r = rett(e)
      const cont = e.closest('.fld, .lvl-box, .azioni-modulo, .modulo, .card, form') ?? document.body
      const c = rett(cont)
      const esce = r.x < c.x - 0.5 || r.x + r.w > c.x + c.w + 0.5
      const oltreSchermo = r.x < -0.5 || r.x + r.w > innerWidth + 0.5
      if (esce || oltreSchermo) fuori.push(`${etichetta(e)} x=${Math.round(r.x)}..${Math.round(r.x + r.w)} contenitore ${Math.round(c.x)}..${Math.round(c.x + c.w)} schermo ${innerWidth}`)
      // il testo dentro un campo non deve gonfiarlo oltre il contenitore (scrollWidth di una riga a se')
    }
    return { sovrapposti, fuori, controlli: controlli.length }
  })
}

/** Verifica e (se `cartella`) fotografa la schermata corrente alla larghezza corrente. */
export async function controllaModuli(p: Page, nome: string, minimo = 1, cartella?: string, file?: string) {
  const d = await misuraModuli(p)
  const w = p.viewportSize()!.width
  verifica(d.controlli >= minimo, `${nome} @${w}px: il form ha dei campi da misurare (${d.controlli})`)
  verifica(d.sovrapposti.length === 0, `${nome} @${w}px: nessun campo sovrapposto a un altro ${d.sovrapposti.slice(0, 4).join(' | ')}`)
  verifica(d.fuori.length === 0, `${nome} @${w}px: nessun campo esce dal contenitore ${d.fuori.slice(0, 4).join(' | ')}`)
  if (cartella && file) await foto(p, cartella, file)
}

/**
 * Visita TUTTI i form dell'area admin (nuova partita, modifica partita, risultato, giocatori, badge, stagioni)
 * a ogni larghezza da telefono. Serve una pagina gia' in un contesto con accesso admin (bypass locale).
 * Nella partita 10 (giocata) e 11 (in convocazione) del seed di prova.
 */
export async function visitaModuli(p: Page, base: string, tema: string, cartella?: string) {
  const foglio = (nome: string, w: number) => (cartella ? { cartella, file: `${tema}-${nome}-${w}` } : { cartella: undefined, file: undefined })
  for (const w of LARGHEZZE) {
    await p.setViewportSize({ width: w, height: 844 })
    const passo = async (nome: string, minimo: number) => {
      await p.waitForLoadState('networkidle')
      await p.waitForTimeout(700)
      const f = foglio(nome, w)
      await controllaModuli(p, `${tema} ${nome}`, minimo, f.cartella, f.file)
    }

    await p.goto(`${base}/admin/partite/nuova`)
    await p.locator('.conv-scelta label').first().waitFor()
    await passo('nuova-partita', 2)
    // la navigazione admin ha CINQUE voci (Campi e' la quinta): a ogni larghezza stanno tutte, larghe almeno 44 px e senza testo tagliato
    const voci = await p.locator('nav.nav.adm a').evaluateAll((a) => a.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent?.trim(), w: r.width, h: r.height, taglio: e.scrollWidth > e.clientWidth + 1, dentro: r.left >= 0 && r.right <= innerWidth } }))
    verifica(voci.length === 5 && voci.every((v) => v.w >= 44 && v.h >= 44 && !v.taglio && v.dentro), `${tema} navigazione admin @${w}px: cinque voci dentro lo schermo, larghe almeno 44 px, senza testo tagliato (${voci.map((v) => `${v.t} ${Math.round(v.w)}`).join(', ')})`)

    await p.goto(`${base}/admin/partite/11?sez=partita`)
    await p.getByLabel('Data e ora').waitFor()
    await passo('modifica-partita', 2)

    await p.goto(`${base}/admin/partite/10?sez=risultato`)
    await p.getByLabel(/Cronaca/).waitFor()
    await passo('risultato', 2)

    await p.goto(`${base}/admin/giocatori`)
    await p.locator('.riga-btn').first().waitFor()
    await p.getByRole('button', { name: 'Nuovo giocatore' }).click()
    await p.getByLabel('Cognome', { exact: true }).waitFor()
    await passo('giocatore-nuovo', 3)
    await p.locator('.riga-btn').first().click()
    await p.locator('.lvl').first().waitFor()
    await passo('giocatore-modifica', 3)

    await p.goto(`${base}/admin/badge`)
    await p.locator('.riga-btn').first().waitFor()
    await p.getByRole('button', { name: 'Nuovo badge' }).click()
    await p.getByLabel('Nome del badge').waitFor()
    await passo('badge-nuovo', 2)
    await p.locator('.riga-btn').first().click()
    await passo('badge-modifica', 2)

    await p.goto(`${base}/admin/campi`)
    await p.locator('.riga-btn').first().waitFor()
    await p.getByRole('button', { name: 'Nuovo campo' }).click()
    await p.getByLabel('Link di Google Maps').waitFor()
    await passo('campo-nuovo', 3)
    await p.locator('.riga-btn').first().click()
    await p.getByLabel('Nome del campo').first().waitFor()
    await passo('campo-modifica', 3)

    await p.goto(`${base}/admin/stagioni`)
    await p.getByRole('button', { name: 'Nuova stagione' }).waitFor()
    await p.getByRole('button', { name: 'Nuova stagione' }).click()
    await p.getByLabel('Data di inizio').waitFor()
    await passo('stagione-nuova', 2)
    await p.locator('.stagione').first().getByRole('button', { name: 'Rinomina' }).click()
    await passo('stagione-rinomina', 1)
  }
}
