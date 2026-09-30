/**
 * Generatore di squadre: modulo PURO (niente D1, niente rete), deterministico
 * dato il seed.
 *
 * Divide i convocati in due squadre di dimensione uguale o con differenza 1,
 * minimizzando   PESO_EQUILIBRIO_PUNTEGGIO * |media A - media B|
 *              + PESO_EQUILIBRIO_BADGE * (badge dello stesso tipo tutti da una parte)
 * con una ricerca ESAUSTIVA (C(20,10)/2 = 92.378 divisioni per 20 giocatori:
 * pochi millisecondi). Il seed decide l'ordine di ricerca e quindi quale fra
 * le divisioni di pari costo esce, e quale squadra e' la 'A'.
 * Tutti i pesi sono in costanti.ts.
 */

import {
  GOL_A_PARTITA_MASSIMO, MAX_CONVOCATI_GENERATORE, PESI_PUNTEGGIO, PESO_EQUILIBRIO_BADGE,
  PESO_EQUILIBRIO_PUNTEGGIO, PUNTEGGIO_NEUTRO,
} from './costanti';

export type Candidato = {
  id: number;
  /** livello segreto 1-5, se dato */
  livello: number | null;
  /** statistiche gia' filtrate dal minimo di partite: null = non disponibile */
  media_voto: number | null;
  pct_vittorie: number | null;
  gol_a_partita: number | null;
  badge: number[];
};

export type Squadre = { A: number[]; B: number[]; media_A: number; media_B: number; costo: number };

/** Punteggio 0-1: media pesata delle componenti disponibili; se non ce n'e' nessuna, il valore neutro. */
export function punteggio(c: Candidato): number {
  const parti: [number, number][] = [];
  if (c.media_voto !== null) parti.push([PESI_PUNTEGGIO.voto, (c.media_voto - 1) / 9]);
  if (c.pct_vittorie !== null) parti.push([PESI_PUNTEGGIO.vittorie, c.pct_vittorie / 100]);
  if (c.gol_a_partita !== null) parti.push([PESI_PUNTEGGIO.gol, Math.min(1, c.gol_a_partita / GOL_A_PARTITA_MASSIMO)]);
  if (c.livello !== null) parti.push([PESI_PUNTEGGIO.livello, (c.livello - 1) / 4]);
  const peso = parti.reduce((s, [p]) => s + p, 0);
  return peso === 0 ? PUNTEGGIO_NEUTRO : parti.reduce((s, [p, v]) => s + p * v, 0) / peso;
}

/** PRNG deterministico (mulberry32). */
function generatore(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generaSquadre(candidati: Candidato[], seed: number): Squadre {
  const n = candidati.length;
  if (n < 2) throw new RangeError('servono almeno 2 convocati');
  if (n > MAX_CONVOCATI_GENERATORE) throw new RangeError(`al massimo ${MAX_CONVOCATI_GENERATORE} convocati`);
  const casuale = generatore(seed);

  // Ordine di ricerca deciso dal seed (Fisher-Yates).
  const ordine = [...candidati];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(casuale() * (i + 1));
    [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  }
  const scambia = casuale() < 0.5;

  const punti = ordine.map(punteggio);
  const idBadge = [...new Set(ordine.flatMap((c) => c.badge))];
  const badge = ordine.map((c) => c.badge.map((b) => idBadge.indexOf(b)));
  const totBadge = idBadge.map((b) => ordine.filter((c) => c.badge.includes(b)).length);
  const totAssegnazioni = Math.max(1, totBadge.reduce((s, x) => s + x, 0));
  const somma = punti.reduce((s, x) => s + x, 0);

  const k = Math.floor(n / 2); // la squadra piccola (o meta')
  const pari = n % 2 === 0; // n pari: la squadra e' simmetrica, il primo sta sempre nella piccola
  const nelGruppo = new Array<number>(idBadge.length).fill(0);
  const scelti: number[] = [];
  let migliore: number[] = [];
  let costoMigliore = Infinity;

  const costo = (sommaPiccola: number): number => {
    const differenza = Math.abs(sommaPiccola / k - (somma - sommaPiccola) / (n - k));
    let sbilanciamento = 0;
    for (let b = 0; b < totBadge.length; b++) {
      sbilanciamento += Math.max(0, Math.abs(2 * nelGruppo[b] - totBadge[b]) - (totBadge[b] % 2));
    }
    return PESO_EQUILIBRIO_PUNTEGGIO * differenza + (PESO_EQUILIBRIO_BADGE * sbilanciamento) / totAssegnazioni;
  };

  const cerca = (i: number, sommaPiccola: number): void => {
    if (scelti.length === k) {
      const c = costo(sommaPiccola);
      if (c < costoMigliore - 1e-12) {
        costoMigliore = c;
        migliore = [...scelti];
      }
      return;
    }
    if (n - i < k - scelti.length) return;
    scelti.push(i);
    for (const b of badge[i]) nelGruppo[b]++;
    cerca(i + 1, sommaPiccola + punti[i]);
    for (const b of badge[i]) nelGruppo[b]--;
    scelti.pop();
    if (!(pari && i === 0)) cerca(i + 1, sommaPiccola);
  };
  cerca(0, 0);

  const piccola = new Set(migliore);
  const idPiccola = ordine.filter((_, i) => piccola.has(i)).map((c) => c.id).sort((a, b) => a - b);
  const idGrande = ordine.filter((_, i) => !piccola.has(i)).map((c) => c.id).sort((a, b) => a - b);
  const mediaPiccola = migliore.reduce((s, i) => s + punti[i], 0) / k;
  const mediaGrande = (somma - mediaPiccola * k) / (n - k);
  return scambia
    ? { A: idGrande, B: idPiccola, media_A: mediaGrande, media_B: mediaPiccola, costo: costoMigliore }
    : { A: idPiccola, B: idGrande, media_A: mediaPiccola, media_B: mediaGrande, costo: costoMigliore };
}
