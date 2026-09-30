/** Piccoli attrezzi per le rotte /api/admin/*. */

import { CODICI_SQUADRA, SQUADRE } from './costanti';
import { ErroreApi } from './risposta';

/** Trasforma un errore di vincolo di D1 in un 409 con un messaggio comprensibile. */
export async function conVincoli<T>(p: Promise<T>, doppione: string, riferito = 'e\' collegato ad altri dati'): Promise<T> {
  try {
    return await p;
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.includes('UNIQUE constraint failed')) throw new ErroreApi(409, doppione);
    if (m.includes('FOREIGN KEY constraint failed')) throw new ErroreApi(409, riferito);
    throw e;
  }
}

/** UPDATE dei soli campi presenti nel corpo. 400 se nessuno, 404 se la riga non esiste. */
export async function aggiorna(db: D1Database, tabella: string, id: number, campi: [string, unknown][], nonTrovato: string): Promise<void> {
  if (campi.length === 0) throw new ErroreApi(400, 'nessun campo da aggiornare');
  const r = await db
    .prepare(`UPDATE ${tabella} SET ${campi.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .bind(...campi.map(([, v]) => v), id)
    .run();
  if (r.meta.changes === 0) throw new ErroreApi(404, nonTrovato);
}

export type Convocato = {
  giocatore_id: number;
  squadra: 'A' | 'B' | null;
  pos_x: number | null;
  pos_y: number | null;
  gol: number;
  autogol: number;
  voto_pagella: number | null;
};

/**
 * Incoerenze fra il risultato e i gol dei giocatori. Sono AVVISI, non errori:
 * un gol puo' non essere attribuito (l'admin lo vedra' e decidera'), e il
 * server non inventa mai un dato per far tornare i conti.
 * Il punteggio di una squadra = gol dei suoi giocatori + autogol degli avversari.
 */
export function avvisiCoerenza(golA: number, golB: number, righe: Pick<Convocato, 'squadra' | 'gol' | 'autogol'>[]): string[] {
  const avvisi: string[] = [];
  for (const c of CODICI_SQUADRA) {
    const registrati = righe.reduce((s, r) => s + (r.squadra === c ? r.gol : r.squadra !== null ? r.autogol : 0), 0);
    const risultato = c === 'A' ? golA : golB;
    if (registrati !== risultato) avvisi.push(`${SQUADRE[c]}: il risultato e' ${risultato}, i gol registrati (autogol avversari compresi) sono ${registrati}`);
  }
  return avvisi;
}

/** Per segnare una partita "giocata": tutti in una squadra, e due squadre non vuote. */
export function controllaGiocabile(righe: Pick<Convocato, 'squadra'>[]): void {
  if (righe.some((r) => r.squadra === null)) throw new ErroreApi(409, 'ogni convocato deve avere una squadra (o va tolto dai convocati)');
  for (const c of CODICI_SQUADRA) {
    if (!righe.some((r) => r.squadra === c)) throw new ErroreApi(409, `la squadra ${SQUADRE[c]} non ha giocatori`);
  }
}

/** Il giocatore come lo vede l'admin: CON livello_segreto e id dei badge. */
export const SELECT_ADMIN = `SELECT g.id, g.nome, g.attivo, g.livello_segreto,
  (SELECT json_group_array(gb.badge_id) FROM giocatore_badge gb WHERE gb.giocatore_id = g.id) AS badge_ids
  FROM giocatori g`;

export const perAdmin = (g: { attivo: number; badge_ids: string | null }) => ({
  ...g,
  attivo: g.attivo === 1,
  badge_ids: JSON.parse(g.badge_ids ?? '[]') as number[],
});

