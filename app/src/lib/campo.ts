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

// ---- misura su misura delle carte sul campo ----

/** Proporzioni della pedina intera in unita' di larghezza-carta: larghezza (carta + voto/palloni/bollino ai lati o il cartellino) e altezza (carta + cartellino del nome, sovrapposto). */
export const PEDINA_L = 1.5
export const PEDINA_H = 1.58
/** Rapporto altezza/larghezza del campo: di base 16:9, al massimo 2,6 (solo quando serve). */
export const CAMPO_ASPETTO_BASE = 16 / 9
export const CAMPO_ASPETTO_MAX = 2.6
/** Larghezza della carta in frazione della larghezza del campo: tetto (60 px su un campo largo 354, cioe' un telefono da 390) e minimo di sicurezza se i dati sono sovrapposti. */
export const CARTA_FRAZ_MAX = 0.17
/** Minimo sul sito se le posizioni salvate sono quasi sovrapposte (e' il dato): la carta non scende sotto. */
export const CARTA_FRAZ_MIN = 0.106

export type Punto = { x: number; y: number }

/**
 * La carta piu' grande (frazione della larghezza del campo) per cui nessuna pedina tocca un'altra, con il campo alto `r` volte la sua larghezza.
 * `ph`/`pl`: altezza e larghezza della pedina in carte (l'immagine per WhatsApp ha un cartellino piu' grande). Per ogni coppia basta che siano lontane quanto la pedina in orizzontale OPPURE in verticale. Senza minimo: chi la usa decide cosa fare con posizioni salvate quasi sovrapposte (e' il dato).
 */
export function larghezzaCarta(punti: readonly Punto[], r: number, ph = PEDINA_H, pl = PEDINA_L): number {
  let cw = CARTA_FRAZ_MAX
  for (let i = 0; i < punti.length; i++) {
    for (let j = i + 1; j < punti.length; j++) {
      const dx = Math.abs(punti[i].x - punti[j].x) / 100
      const dy = Math.abs(punti[i].y - punti[j].y) / 100
      cw = Math.min(cw, Math.max(dx / pl, (dy * r) / ph))
    }
  }
  return cw
}

/**
 * Misura del campo di UNA partita: la carta piu' grande che i punti permettono con il campo al massimo di CAMPO_ASPETTO_MAX,
 * e il campo piu' corto (da 16:9 in su) che la ottiene. `cw` e' la frazione della larghezza del campo, `r` altezza/larghezza.
 */
export function misuraCampo(punti: readonly Punto[]): { cw: number; r: number } {
  const cw = (r: number) => Math.max(CARTA_FRAZ_MIN, larghezzaCarta(punti, r))
  const meta = cw(CAMPO_ASPETTO_MAX)
  let r = CAMPO_ASPETTO_BASE
  while (r < CAMPO_ASPETTO_MAX && cw(r) < meta - 1e-9) r += 0.01
  if (r > CAMPO_ASPETTO_BASE) r = Math.min(CAMPO_ASPETTO_MAX, Math.ceil(r * 1000) / 1000)
  return { cw: Math.round(cw(r) * 10000) / 10000, r }
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
