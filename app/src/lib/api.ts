import type { Mvp } from './tipi'

/** Errore del backend (`{ "errore": "..." }`) o di rete (stato 0). Il messaggio si puo' mostrare com'e'. */
export class ErroreApi extends Error {
  stato: number
  constructor(stato: number, messaggio: string) {
    super(messaggio)
    this.stato = stato
  }
}

async function chiama<T>(percorso: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(percorso, init)
  } catch (e) {
    if (init?.signal?.aborted) throw e
    throw new ErroreApi(0, 'Non riesco a raggiungere il server. Controlla la connessione e riprova.')
  }
  let corpo: unknown = null
  try {
    corpo = await r.json()
  } catch {
    // corpo assente o non JSON: si usa il codice di stato
  }
  if (!r.ok) {
    const msg = (corpo as { errore?: unknown } | null)?.errore
    throw new ErroreApi(r.status, typeof msg === 'string' && msg ? msg : `Errore del server (${r.status}).`)
  }
  return corpo as T
}

export const leggi = <T>(percorso: string, signal?: AbortSignal) => chiama<T>(percorso, { signal })

/** Un voto MVP. Il cookie del dispositivo lo gestisce il browser (fetch same-origin). */
export const votaMvp = (partitaId: number, giocatoreId: number) =>
  chiama<{ ok: true; mvp: Mvp }>(`/api/partite/${partitaId}/mvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giocatore_id: giocatoreId }),
  })
