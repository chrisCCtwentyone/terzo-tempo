// Logica pura dell'area admin (senza React): testata in test/admin_logica.test.ts.
import { casellaPiuVicina, casellaSu, caselle, deduciModulo, type Casella } from '../../../shared/moduli'
import { LATO_ALTO } from '../lib/campo'
import type { Codice, GiocatoreInPartita } from '../lib/tipi'

export type Riga = GiocatoreInPartita

export const CODICI: Codice[] = ['A', 'B']
export const altro = (c: Codice): Codice => (c === 'A' ? 'B' : 'A')
export const inAlto = (c: Codice) => c === LATO_ALTO

export const squadraDi = (righe: Riga[], c: Codice) => righe.filter((r) => r.squadra === c)
export const senzaSquadra = (righe: Riga[]) => righe.filter((r) => r.squadra === null)

/** Punteggio di una squadra = gol dei suoi giocatori + autogol degli avversari (come il backend, functions/lib/admin.ts). */
export function punteggio(righe: Riga[]): Record<Codice, number> {
  const p: Record<Codice, number> = { A: 0, B: 0 }
  for (const r of righe) {
    if (r.squadra === null) continue
    p[r.squadra] += r.gol
    p[altro(r.squadra)] += r.autogol
  }
  return p
}

/** Che cosa manca perche' la partita si possa segnare "giocata" (vuoto = niente). */
export function mancaPerGiocare(righe: Riga[], nomi: Record<Codice, string>): string[] {
  const m: string[] = []
  const n = senzaSquadra(righe).length
  if (n > 0) m.push(`${n} ${n === 1 ? 'convocato non ha' : 'convocati non hanno'} una squadra: assegnala o toglilo dai convocati`)
  for (const c of CODICI) if (squadraDi(righe, c).length === 0) m.push(`la squadra ${nomi[c]} non ha giocatori`)
  return m
}

const senzaPos = (r: Riga): Riga => ({ ...r, pos_x: null, pos_y: null })
const azzeraSquadre = (righe: Riga[], ...cc: (Codice | null)[]) => righe.map((r) => (cc.includes(r.squadra) ? senzaPos(r) : r))

/** Sposta un giocatore di squadra (o lo toglie con null). Le posizioni delle squadre coinvolte si azzerano: il numero cambia e i moduli con lui. */
export function assegna(righe: Riga[], id: number, verso: Codice | null): Riga[] {
  const r = righe.find((x) => x.giocatore_id === id)
  if (!r || r.squadra === verso) return righe
  return azzeraSquadre(righe, r.squadra, verso).map((x) => (x.giocatore_id === id ? { ...x, squadra: verso } : x))
}

/** Toglie un giocatore dai convocati (e azzera le posizioni della sua squadra). */
export function togli(righe: Riga[], id: number): Riga[] {
  const r = righe.find((x) => x.giocatore_id === id)
  return r ? azzeraSquadre(righe, r.squadra).filter((x) => x.giocatore_id !== id) : righe
}

export const nuovaRiga = (id: number, nome: string): Riga => ({ giocatore_id: id, nome, squadra: null, pos_x: null, pos_y: null, gol: 0, autogol: 0, voto_pagella: null })

/** Applica la proposta del generatore: squadra per ciascuno, posizioni azzerate. */
export function applicaProposta(righe: Riga[], squadre: { codice: Codice; giocatori: { giocatore_id: number }[] }[]): Riga[] {
  const dove = new Map(squadre.flatMap((s) => s.giocatori.map((g) => [g.giocatore_id, s.codice] as const)))
  return righe.map((r) => ({ ...senzaPos(r), squadra: dove.get(r.giocatore_id) ?? null }))
}

// ---- moduli e caselle ----

export const caselleDi = (modulo: string, c: Codice): Casella[] | null => caselle(modulo, inAlto(c))

/** Il modulo di una squadra, dedotto dalle posizioni delle pedine (null = nessuno / automatico). */
export function moduloDi(righe: Riga[], c: Codice): string | null {
  const sq = squadraDi(righe, c)
  if (sq.length === 0 || sq.some((r) => r.pos_x === null || r.pos_y === null)) return null
  return deduciModulo(sq.map((r) => ({ x: r.pos_x!, y: r.pos_y! })), inAlto(c))
}

/** Sceglie un modulo (o null = automatico): i giocatori occupano le caselle nell'ordine in cui sono, il primo e' il portiere. */
export function impostaModulo(righe: Riga[], c: Codice, modulo: string | null): Riga[] {
  const cas = modulo === null ? null : caselleDi(modulo, c)
  const n = squadraDi(righe, c).length
  if (modulo !== null && (cas === null || cas.length !== n)) return righe
  let i = 0
  return righe.map((r) => {
    if (r.squadra !== c) return r
    if (!cas) return senzaPos(r)
    const k = cas[i++]
    return { ...r, pos_x: k.x, pos_y: k.y }
  })
}

/** Chi occupa ciascuna casella (indice = casella; null = vuota). Solo con un modulo valido. */
export function occupanti(righe: Riga[], c: Codice): { modulo: string; caselle: Casella[]; chi: (Riga | null)[] } | null {
  const modulo = moduloDi(righe, c)
  if (!modulo) return null
  const cas = caselleDi(modulo, c)!
  const chi: (Riga | null)[] = cas.map(() => null)
  for (const r of squadraDi(righe, c)) chi[casellaSu(r.pos_x!, r.pos_y!, cas)] = r
  return { modulo, caselle: cas, chi }
}

/** Il giocatore va sulla casella: se e' occupata i due si scambiano. */
export function muoviInCasella(righe: Riga[], c: Codice, id: number, casella: number): Riga[] {
  const o = occupanti(righe, c)
  if (!o || casella < 0 || casella >= o.caselle.length) return righe
  const da = o.chi.findIndex((r) => r?.giocatore_id === id)
  if (da < 0 || da === casella) return righe
  const altroId = o.chi[casella]?.giocatore_id
  const posiz = new Map<number, Casella>([[id, o.caselle[casella]]])
  if (altroId !== undefined) posiz.set(altroId, o.caselle[da])
  return righe.map((r) => {
    const k = posiz.get(r.giocatore_id)
    return k ? { ...r, pos_x: k.x, pos_y: k.y } : r
  })
}

/** La casella piu' vicina a un punto del campo (percentuali), per l'aggancio dopo il trascinamento. */
export const agganciaA = (cas: Casella[], x: number, y: number) => casellaPiuVicina(x, y, cas)

/** Limiti del trascinamento: ogni squadra resta nella sua meta' campo. */
export function limitiMeta(c: Codice): { xMin: number; xMax: number; yMin: number; yMax: number } {
  return inAlto(c) ? { xMin: 4, xMax: 96, yMin: 3, yMax: 50 } : { xMin: 4, xMax: 96, yMin: 50, yMax: 97 }
}
export const dentroMeta = (c: Codice, x: number, y: number) => {
  const l = limitiMeta(c)
  return { x: Math.min(l.xMax, Math.max(l.xMin, x)), y: Math.min(l.yMax, Math.max(l.yMin, y)) }
}

export type Freccia = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

/** Da tastiera: la casella piu' vicina nella direzione della freccia (null se non ce n'e'). */
export function casellaVerso(cas: Casella[], da: number, freccia: Freccia): number | null {
  const [dx, dy] = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[freccia]
  const o = cas[da]
  let best: number | null = null
  let bestD = Infinity
  cas.forEach((k, i) => {
    if (i === da) return
    const vx = (k.x - o.x) * 9
    const vy = (k.y - o.y) * 16
    const avanti = vx * dx + vy * dy
    if (avanti <= 0.5) return
    const lato = Math.abs(vx * dy) + Math.abs(vy * dx) // scarto di traverso
    const d = avanti + lato * 1.5
    if (d < bestD) [best, bestD] = [i, d]
  })
  return best
}

// ---- salvataggio ----

/** Il corpo di PUT /api/admin/partite/:id/convocati. */
export const corpoConvocati = (righe: Riga[]) => ({
  convocati: righe.map((r) => ({ giocatore_id: r.giocatore_id, squadra: r.squadra, pos_x: r.pos_x, pos_y: r.pos_y, gol: r.gol, autogol: r.autogol, voto_pagella: r.voto_pagella })),
})

/** Confronto per sapere se ci sono modifiche non salvate (l'ordine delle righe non conta). */
export const impronta = (righe: Riga[], cronaca: string) =>
  JSON.stringify([[...righe].sort((a, b) => a.giocatore_id - b.giocatore_id).map((r) => [r.giocatore_id, r.squadra, r.pos_x, r.pos_y, r.gol, r.autogol, r.voto_pagella]), cronaca.trim()])

/** I voti in pagella ammessi: da 1 a 10 a mezzi punti. */
export const VOTI = Array.from({ length: 19 }, (_, i) => 1 + i / 2)

/** "2026-10-01T19:00:00Z" -> "2026-10-01T21:00": l'ora di Roma, per <input type="datetime-local">. */
export function isoARomaLocale(iso: string): string {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return f.format(new Date(iso)).replace(' ', 'T')
}
