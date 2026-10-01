// La coda locale della schermata LIVE (senza React: testata in test/coda_live.test.ts).
//
// Ogni azione dell'admin (segna un gol, cambia marcatore, elimina) si scrive SUBITO in una coda sul telefono, con un identificativo
// generato qui (`id_client`, un UUID): l'interfaccia la mostra subito come "in invio" e la spedisce appena puo', una alla volta e in
// ordine. L'id_client rende l'invio idempotente (il server non crea doppioni se un invio viene ripetuto) e permette di indicare un
// gol anche quando il server non lo conosce ancora (offline): PATCH e DELETE accettano l'id_client al posto dell'id numerico.
import type { Codice, EventoDiretta, TipoEvento } from '../lib/tipi'

export type Azione =
  | { k: 'segna'; id_client: string; tipo: TipoEvento; giocatore_id: number }
  | { k: 'cambia'; id_client: string; tipo?: TipoEvento; giocatore_id?: number }
  | { k: 'elimina'; id_client: string }

export type VoceCoda = Azione & {
  /** identificativo della voce di coda (non e' quello del gol: un gol puo' avere piu' voci) */
  aid: string
  creata: number
  /** quante volte l'invio e' fallito per la rete o per un guasto del server */
  tentativi: number
  /** non prima di quando riprovare (ms, Date.now()) */
  prossimo: number
  /** rifiutata dal server: non si ritenta, si mostra l'errore finche' l'admin non la scarta */
  errore?: string
}

export const chiaveCoda = (partitaId: number) => `tt_live_coda_${partitaId}`

/** UUID v4 (crypto.randomUUID se c'e', altrimenti da getRandomValues). Contiene sempre dei trattini: non e' mai "di sole cifre". */
export function nuovoId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const altra = (c: Codice): Codice => (c === 'A' ? 'B' : 'A')
/** La squadra che incassa il punto: del marcatore per un gol, degli avversari per un autogol (come il server). */
export const beneficiaria = (tipo: TipoEvento, squadraDelGiocatore: Codice): Codice => (tipo === 'gol' ? squadraDelGiocatore : altra(squadraDelGiocatore))

export function nuovaVoce(a: Azione, adesso = Date.now()): VoceCoda {
  return { ...a, aid: nuovoId(), creata: adesso, tentativi: 0, prossimo: 0 }
}

// ---- che cosa vede l'admin: lo stato del server + la coda ----

export type EventoVista = { chiave: string; id: number | null; tipo: TipoEvento; squadra: Codice; giocatore_id: number; nome: string; inInvio: boolean }

export type Giocatori = { squadraDi: (id: number) => Codice | null; nomeDi: (id: number) => string }

/**
 * Lo stato che l'admin vede: i gol del server (senza gli annullati) con sopra le azioni in coda, nell'ordine in cui sono state fatte.
 * Un gol gia' arrivato al server E ancora in coda (la risposta non e' ancora tornata) compare UNA volta sola, riconosciuto dall'id_client.
 * Le voci rifiutate non si applicano. Con la coda vuota il risultato e' esattamente lo stato del server.
 */
export function applicaCoda(server: EventoDiretta[], voci: VoceCoda[], g: Giocatori): EventoVista[] {
  const lista: EventoVista[] = server.map((e) => ({ chiave: e.id_client ?? `s${e.id}`, id: e.id, tipo: e.tipo, squadra: e.squadra, giocatore_id: e.giocatore_id, nome: e.nome, inInvio: false }))
  for (const v of voci) {
    if (v.errore) continue
    const i = lista.findIndex((e) => e.chiave === v.id_client)
    if (v.k === 'segna') {
      const sq = g.squadraDi(v.giocatore_id)
      if (i < 0 && sq) lista.push({ chiave: v.id_client, id: null, tipo: v.tipo, squadra: beneficiaria(v.tipo, sq), giocatore_id: v.giocatore_id, nome: g.nomeDi(v.giocatore_id), inInvio: true })
    } else if (v.k === 'elimina') {
      if (i >= 0) lista.splice(i, 1)
    } else if (i >= 0) {
      const e = lista[i]
      const tipo = v.tipo ?? e.tipo
      const gid = v.giocatore_id ?? e.giocatore_id
      const sq = g.squadraDi(gid)
      if (sq) lista[i] = { ...e, tipo, giocatore_id: gid, nome: g.nomeDi(gid), squadra: beneficiaria(tipo, sq), inInvio: true }
    }
  }
  return lista
}

export function punteggio(vista: { squadra: Codice }[]): Record<Codice, number> {
  const p: Record<Codice, number> = { A: 0, B: 0 }
  for (const e of vista) p[e.squadra]++
  return p
}

// ---- esito di un invio ----

export type Esito = 'fatto' | 'riprova' | 'accesso' | 'rifiutata'

/**
 * Che fare dopo la risposta (o la mancanza di risposta) del server:
 *  - fatto: tolta dalla coda (un DELETE su un gol che non c'e' piu' e' gia' "fatto");
 *  - riprova: rete assente o guasto momentaneo (stato 0, 408, 425, 429, 5xx): resta in coda, con attesa crescente;
 *  - accesso: la sessione di Cloudflare Access e' scaduta (401/403/rinvio al login): resta in coda, serve ricaricare la pagina;
 *  - rifiutata: il server ha detto no (partita chiusa, giocatore non in campo...): NON si ritenta, si mostra l'errore.
 */
export function esitoInvio(k: Azione['k'], stato: number, accesso: boolean): Esito {
  if (accesso || stato === 401 || stato === 403) return 'accesso'
  if (stato === 0 || stato === 408 || stato === 425 || stato === 429 || stato >= 500) return 'riprova'
  if (k === 'elimina' && stato === 404) return 'fatto'
  return 'rifiutata'
}

/** Attesa prima di riprovare dopo `tentativi` fallimenti: 1,5 s, 3 s, 6 s... fino a 30 s. */
export const attesaMs = (tentativi: number) => Math.min(30_000, 1500 * 2 ** Math.max(0, tentativi - 1))

/** Se un `segna` e' rifiutato, le altre voci sullo stesso gol non hanno piu' senso: si tolgono (resta il solo errore). */
export function togliDipendenti(voci: VoceCoda[], rifiutata: VoceCoda): VoceCoda[] {
  return rifiutata.k === 'segna' ? voci.filter((v) => v.aid === rifiutata.aid || v.id_client !== rifiutata.id_client) : voci
}

/** La richiesta HTTP di una voce. */
export function richiesta(partitaId: number, v: Azione): { metodo: 'POST' | 'PATCH' | 'DELETE'; percorso: string; corpo?: unknown } {
  const base = `/api/admin/partite/${partitaId}/diretta/eventi`
  if (v.k === 'segna') return { metodo: 'POST', percorso: base, corpo: { id_client: v.id_client, tipo: v.tipo, giocatore_id: v.giocatore_id } }
  if (v.k === 'elimina') return { metodo: 'DELETE', percorso: `${base}/${encodeURIComponent(v.id_client)}` }
  return { metodo: 'PATCH', percorso: `${base}/${encodeURIComponent(v.id_client)}`, corpo: { ...(v.tipo ? { tipo: v.tipo } : {}), ...(v.giocatore_id ? { giocatore_id: v.giocatore_id } : {}) } }
}

// ---- persistenza (localStorage, sempre in try/catch: puo' mancare o lanciare) ----

type Deposito = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function deposito(): Deposito | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

const tipoOk = (t: unknown) => t === 'gol' || t === 'autogol'
const idOk = (x: unknown): x is string => typeof x === 'string' && x.length >= 8 && x.length <= 64
const intOk = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0

/** Legge e controlla la coda salvata: una voce che non ha la forma giusta si scarta (mai un crash all'apertura della pagina). */
export function leggiCoda(d: Deposito | null, chiave: string): VoceCoda[] {
  if (!d) return []
  let grezzo: unknown
  try {
    const t = d.getItem(chiave)
    grezzo = t ? JSON.parse(t) : []
  } catch {
    return []
  }
  if (!Array.isArray(grezzo)) return []
  const out: VoceCoda[] = []
  for (const x of grezzo as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || !idOk(x.aid) || !idOk(x.id_client) || typeof x.creata !== 'number') continue
    const comuni = { aid: x.aid, creata: x.creata, tentativi: typeof x.tentativi === 'number' ? x.tentativi : 0, prossimo: 0, ...(typeof x.errore === 'string' ? { errore: x.errore } : {}) }
    if (x.k === 'segna' && tipoOk(x.tipo) && intOk(x.giocatore_id)) out.push({ ...comuni, k: 'segna', id_client: x.id_client, tipo: x.tipo as TipoEvento, giocatore_id: x.giocatore_id })
    else if (x.k === 'elimina') out.push({ ...comuni, k: 'elimina', id_client: x.id_client })
    else if (x.k === 'cambia' && (x.tipo === undefined || tipoOk(x.tipo)) && (x.giocatore_id === undefined || intOk(x.giocatore_id)) && (x.tipo !== undefined || x.giocatore_id !== undefined)) {
      out.push({ ...comuni, k: 'cambia', id_client: x.id_client, ...(x.tipo !== undefined ? { tipo: x.tipo as TipoEvento } : {}), ...(x.giocatore_id !== undefined ? { giocatore_id: x.giocatore_id as number } : {}) })
    }
  }
  return out
}

/** Scrive la coda; vuota = toglie la chiave. Ritorna false se il telefono non ha lasciato scrivere (la coda resta solo in memoria). */
export function scriviCoda(d: Deposito | null, chiave: string, voci: VoceCoda[]): boolean {
  if (!d) return false
  try {
    if (voci.length === 0) d.removeItem(chiave)
    else d.setItem(chiave, JSON.stringify(voci))
    return true
  } catch {
    return false
  }
}

// ---- copia sul telefono di cio' che serve a disegnare la schermata (giocatori in campo e ultimo stato del server) ----
// Cosi', se la pagina si ricarica quando il segnale e' debole (la pagina si carica, le chiamate no), la schermata si disegna lo stesso
// e si puo' continuare a segnare. Sono nomi pubblici e gol: nessun dato riservato.

export type GiocatoreLive = { giocatore_id: number; nome: string; squadra: Codice | null }
export type PartitaLive = { id: number; squadre: { codice: Codice; nome: string; gol: number | null }[]; giocatori: GiocatoreLive[] }

export const chiaveCopiaPartita = (partitaId: number) => `tt_live_partita_${partitaId}`
export const chiaveCopiaStato = (partitaId: number) => `tt_live_stato_${partitaId}`

export function scriviCopia(d: Deposito | null, chiave: string, valore: unknown): void {
  if (!d) return
  try {
    d.setItem(chiave, JSON.stringify(valore))
  } catch {
    // niente deposito: la copia serve solo al caso peggiore
  }
}

export function leggiCopia<T>(d: Deposito | null, chiave: string, valida: (x: unknown) => x is T): T | null {
  if (!d) return null
  try {
    const t = d.getItem(chiave)
    const v: unknown = t ? JSON.parse(t) : null
    return valida(v) ? v : null
  } catch {
    return null
  }
}

const oggetto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

export const partitaLiveValida = (x: unknown): x is PartitaLive =>
  oggetto(x) && typeof x.id === 'number' && Array.isArray(x.squadre) && Array.isArray(x.giocatori) &&
  (x.giocatori as unknown[]).every((g) => oggetto(g) && typeof g.giocatore_id === 'number' && typeof g.nome === 'string' && (g.squadra === 'A' || g.squadra === 'B' || g.squadra === null))

export const statoLiveValido = (x: unknown): x is import('../lib/tipi').Diretta =>
  oggetto(x) && typeof x.stato === 'string' && Array.isArray(x.eventi) && Array.isArray(x.squadre)

/** Dalla partita intera alla copia: solo cio' che serve alla schermata. */
export const comePartitaLive = (p: { id: number; squadre: PartitaLive['squadre']; giocatori: GiocatoreLive[] }): PartitaLive => ({
  id: p.id,
  squadre: p.squadre,
  giocatori: p.giocatori.map((g) => ({ giocatore_id: g.giocatore_id, nome: g.nome, squadra: g.squadra })),
})
