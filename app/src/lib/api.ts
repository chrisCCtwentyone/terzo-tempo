import type { Mvp } from './tipi'

/** Errore del backend (`{ "errore": "..." }`) o di rete (stato 0). Il messaggio si puo' mostrare com'e'. */
export class ErroreApi extends Error {
  stato: number
  /** true = Cloudflare Access ha rimandato al login: serve un accesso (navigazione di pagina vera), non e' un guasto di rete */
  accesso: boolean
  constructor(stato: number, messaggio: string, accesso = false) {
    super(messaggio)
    this.stato = stato
    this.accesso = accesso
  }
}

const rottaAdmin = (percorso: string) => percorso.startsWith('/api/admin/')

/** Una chiamata JSON (anche scritture, per l'area admin): errori come ErroreApi, testi gia' leggibili. */
export async function chiama<T>(percorso: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    // Sulle rotte admin il redirect NON si segue: Access risponde 302 verso il login (un altro sito). Seguirlo
    // e' bloccato da CORS/CSP e diventava "Non riesco a raggiungere il server". Con `manual` la risposta e' un
    // opaqueredirect, che significa "serve l'accesso".
    r = await fetch(percorso, rottaAdmin(percorso) ? { ...init, redirect: 'manual' } : init)
  } catch (e) {
    if (init?.signal?.aborted) throw e
    throw new ErroreApi(0, 'Non riesco a raggiungere il server. Controlla la connessione e riprova.')
  }
  if (rottaAdmin(percorso) && (r.type === 'opaqueredirect' || r.status === 0)) {
    throw new ErroreApi(401, 'Serve l\'accesso: la sessione manca o è scaduta. Ricarica la pagina per accedere con il codice via email.', true)
  }
  let corpo: unknown = null
  try {
    corpo = await r.json()
  } catch {
    // corpo assente o non JSON: si usa il codice di stato
  }
  // una risposta 200 che non e' JSON, da una rotta admin, non e' la nostra API: e' la pagina di login di Access
  if (rottaAdmin(percorso) && r.ok && corpo === null) {
    throw new ErroreApi(401, 'Serve l\'accesso: la sessione manca o è scaduta. Ricarica la pagina per accedere con il codice via email.', true)
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
