/**
 * Moduli di gioco e loro caselle, in UN punto (decisione dell'utente, 30/09/2026).
 *
 * Il portiere e' sempre incluso: "2-2" a 5 giocatori = portiere + 2 + 2.
 * Ogni modulo e' l'elenco dei giocatori per fila, dalla porta verso il centrocampo.
 * Le caselle sono in percentuale del campo (0-100 dall'angolo in alto a sinistra)
 * dentro la meta' della squadra: la meta' alta se `alta`, altrimenti la bassa
 * (chi sta in alto lo decide il frontend: LATO_ALTO in app/src/lib/campo.ts).
 */

export const MODULI: Readonly<Record<number, readonly string[]>> = {
  5: ['1-2-1', '2-2'],
  6: ['2-1-2', '3-2'],
  7: ['3-2-1', '2-3-1', '3-1-2'],
  8: ['3-3-1', '3-2-2'],
};

/** I moduli di una squadra di `n` giocatori (vuoto sotto 5 o sopra 8). */
export const moduliPer = (n: number): readonly string[] => MODULI[n] ?? [];

export const moduloValido = (modulo: string, n: number): boolean => moduliPer(n).includes(modulo);

export type Casella = { x: number; y: number; ruolo: 'portiere' | 'difesa' | 'centrocampo' | 'attacco' };

/** Fila piu' vicina alla porta (portiere) e piu' lontana, come y nella meta' alta. */
const Y_PORTIERE = 9;
const Y_ULTIMA_FILA = 45;

const arrotonda = (n: number) => Math.round(n * 10) / 10;

/** Le caselle del modulo, portiere per primo, poi fila per fila dalla difesa all'attacco. Null se il modulo non esiste. */
export function caselle(modulo: string, alta: boolean): Casella[] | null {
  const file = modulo.split('-').map(Number);
  const n = file.reduce((s, k) => s + k, 0) + 1;
  if (!moduloValido(modulo, n)) return null;
  const linee = file.length + 1;
  const y = (i: number) => arrotonda(Y_PORTIERE + (i * (Y_ULTIMA_FILA - Y_PORTIERE)) / (linee - 1));
  const meta = (v: number) => (alta ? v : arrotonda(100 - v));
  const ruoli = (i: number): Casella['ruolo'] => (file.length === 2 ? (i === 0 ? 'difesa' : 'attacco') : (['difesa', 'centrocampo', 'attacco'] as const)[i]);
  const out: Casella[] = [{ x: 50, y: meta(y(0)), ruolo: 'portiere' }];
  file.forEach((cnt, i) => {
    for (let j = 0; j < cnt; j++) out.push({ x: arrotonda(((j + 1) / (cnt + 1)) * 100), y: meta(y(i + 1)), ruolo: ruoli(i) });
  });
  return out;
}

/** La casella piu' vicina a un punto (il campo e' 9:16: un punto percentuale in verticale vale piu' di uno in orizzontale). */
export function casellaPiuVicina(x: number, y: number, c: readonly Casella[]): number {
  let best = 0;
  let bestD = Infinity;
  c.forEach((k, i) => {
    const d = ((k.x - x) * 9) ** 2 + ((k.y - y) * 16) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** L'indice della casella su cui sta il punto, o -1 se non sta su nessuna (tolleranza di un decimo di punto). */
export const casellaSu = (x: number, y: number, c: readonly Casella[]): number => c.findIndex((k) => Math.abs(k.x - x) < 0.11 && Math.abs(k.y - y) < 0.11);

/**
 * Il modulo di una squadra, DEDOTTO dalle posizioni salvate: quello le cui caselle
 * sono occupate esattamente da tutte le pedine. Null se non c'e' (posizioni mancanti
 * o libere, numero di giocatori senza moduli). Il modulo non ha una colonna sua:
 * le coordinate delle caselle bastano e la pagina pubblica non ha altro da leggere.
 */
export function deduciModulo(posizioni: readonly { x: number; y: number }[], alta: boolean): string | null {
  for (const m of moduliPer(posizioni.length)) {
    const c = caselle(m, alta)!;
    const occupate = new Set(posizioni.map((p) => casellaSu(p.x, p.y, c)));
    if (!occupate.has(-1) && occupate.size === c.length) return m;
  }
  return null;
}
