import type { Codice, GiocatoreInPartita } from './tipi'

/**
 * Orientamento del campo, deciso QUI (docs/API.md: "lo decide il frontend"):
 * la squadra A gioca nella meta' alta, la B in quella bassa. pos_x/pos_y sono
 * percentuali dall'angolo in alto a sinistra. L'admin dovra' usare lo stesso verso.
 */
export const LATO_ALTO: Codice = 'A'

export type Pedina = { g: GiocatoreInPartita; x: number; y: number }

const ha = (g: GiocatoreInPartita) => g.pos_x !== null && g.pos_y !== null
const dentro = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Righe di 4 al massimo, ripartite in modo uniforme (6 -> 3+3, 7 -> 4+3, 9 -> 3+3+3). */
export function righe(n: number): number[] {
  const r = Math.max(1, Math.ceil(n / 4))
  return Array.from({ length: r }, (_, i) => Math.floor(n / r) + (i < n % r ? 1 : 0))
}

/**
 * Le pedine di UNA squadra. Se l'admin ha posizionato tutti, si usano le sue
 * posizioni (tenute dentro il campo). Se ne manca anche uno, disposizione
 * automatica per tutta la squadra: mescolarle darebbe pedine sovrapposte.
 */
export function pedine(giocatori: GiocatoreInPartita[], codice: Codice): Pedina[] {
  const sq = giocatori.filter((g) => g.squadra === codice)
  if (sq.length > 0 && sq.every(ha)) {
    return sq.map((g) => ({ g, x: dentro(g.pos_x!, 8, 92), y: dentro(g.pos_y!, 6, 94) }))
  }
  const alto = codice === LATO_ALTO
  const rr = righe(sq.length)
  const ys = rr.length === 1 ? [26] : rr.map((_, i) => 14 + (i * 26) / (rr.length - 1))
  const out: Pedina[] = []
  let k = 0
  rr.forEach((cnt, ri) => {
    for (let j = 0; j < cnt; j++, k++) out.push({ g: sq[k], x: ((j + 1) / (cnt + 1)) * 100, y: alto ? ys[ri] : 100 - ys[ri] })
  })
  return out
}

export type Voce = { nome: string; n: number; autogol: boolean }

/**
 * Marcatori di una squadra: i suoi gol, piu' gli autogol degli AVVERSARI (che
 * valgono a suo favore) segnati come tali. `senza` = gol del punteggio senza
 * un marcatore registrato (dato mancante: si mostra, non si nasconde).
 */
export function marcatori(giocatori: GiocatoreInPartita[], codice: Codice, gol: number | null): { voci: Voce[]; senza: number } {
  const voci: Voce[] = [
    ...giocatori.filter((g) => g.squadra === codice && g.gol > 0).map((g) => ({ nome: g.nome, n: g.gol, autogol: false })),
    ...giocatori.filter((g) => g.squadra !== null && g.squadra !== codice && g.autogol > 0).map((g) => ({ nome: g.nome, n: g.autogol, autogol: true })),
  ]
  const attribuiti = voci.reduce((s, v) => s + v.n, 0)
  return { voci, senza: gol === null ? 0 : Math.max(0, gol - attribuiti) }
}
