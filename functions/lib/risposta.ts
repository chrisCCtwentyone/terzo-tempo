/**
 * Risposte HTTP uniformi e piccolo dispatcher per metodo.
 * Regole: nessun corpo di richiesta nei log; un errore interno non racconta
 * come e' fatto il backend.
 */

import type { Ambiente } from './access';
import { MAX_CORPO_BYTE } from './costanti';

export type Env = Ambiente & { DB: D1Database };

const INTESTAZIONI_BASE: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // Le risposte dipendono dal dispositivo (voto MVP) e dall'ora (chiusura
  // lazy): niente cache, ne' del browser ne' della rete.
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function json(dati: unknown, stato = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(dati), { status: stato, headers: { ...INTESTAZIONI_BASE, ...extra } });
}

export function errore(stato: number, messaggio: string): Response {
  return json({ errore: messaggio }, stato);
}

/** Si lancia da qualunque punto di un handler: perMetodo la trasforma in risposta. */
export class ErroreApi extends Error {
  stato: number;
  constructor(stato: number, messaggio: string) {
    super(messaggio);
    this.stato = stato;
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Contesto = EventContext<Env, string, Record<string, unknown>>;

/** Un handler per metodo; gli altri metodi ricevono 405 con `Allow`. */
export function perMetodo(gestori: Partial<Record<Metodo, (c: Contesto) => Promise<Response>>>): PagesFunction<Env> {
  return async (contesto) => {
    const g = gestori[contesto.request.method.toUpperCase() as Metodo];
    if (!g) return json({ errore: 'metodo non ammesso' }, 405, { Allow: Object.keys(gestori).join(', ') });
    try {
      return await g(contesto as Contesto);
    } catch (e) {
      if (e instanceof ErroreApi) return errore(e.stato, e.message);
      throw e; // il middleware lo trasforma in un 500 senza dettagli
    }
  };
}

/**
 * Legge il corpo fermandosi a MAX_CORPO_BYTE: un corpo enorme non deve riempire la memoria del Worker
 * (ne' con Content-Length dichiarato, ne' a pezzi senza dichiararlo).
 */
async function leggiCorpoLimitato(request: Request): Promise<string> {
  const dichiarato = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(dichiarato) && dichiarato > MAX_CORPO_BYTE) throw new ErroreApi(413, 'corpo della richiesta troppo grande');
  if (!request.body) return '';
  const lettore = request.body.getReader();
  const pezzi: Uint8Array[] = [];
  let totale = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    totale += value.byteLength;
    if (totale > MAX_CORPO_BYTE) {
      await lettore.cancel().catch(() => undefined);
      throw new ErroreApi(413, 'corpo della richiesta troppo grande');
    }
    pezzi.push(value);
  }
  const tutto = new Uint8Array(totale);
  let i = 0;
  for (const p of pezzi) {
    tutto.set(p, i);
    i += p.byteLength;
  }
  return new TextDecoder().decode(tutto);
}

/** Corpo JSON (deve essere un oggetto, al massimo MAX_CORPO_BYTE). Il Content-Type deve essere application/json. */
export async function leggiOggetto(request: Request): Promise<Record<string, unknown>> {
  // "Contiene" accettava "text/plain;application/json", che un altro sito puo'
  // inviare senza controllo preventivo (CORS): serve il tipo esatto.
  const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (tipo !== 'application/json') throw new ErroreApi(415, 'serve Content-Type: application/json');
  let v: unknown;
  try {
    v = JSON.parse(await leggiCorpoLimitato(request));
  } catch (e) {
    if (e instanceof ErroreApi) throw e;
    throw new ErroreApi(400, 'JSON non valido');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ErroreApi(400, 'il corpo deve essere un oggetto JSON');
  return v as Record<string, unknown>;
}

/** Id numerico dal percorso; un id malformato e' "non trovato". */
export function idDa(valore: unknown): number {
  const n = Number(valore);
  if (!/^\d+$/.test(String(valore)) || !Number.isSafeInteger(n) || n < 1) throw new ErroreApi(404, 'non trovato');
  return n;
}
