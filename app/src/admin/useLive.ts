import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErroreApi, leggi } from '../lib/api'
import type { Codice, Diretta, TipoEvento } from '../lib/tipi'
import { applicaCoda, attesaMs, chiaveCoda, chiaveCopiaStato, deposito, esitoInvio, leggiCoda, leggiCopia, nuovaVoce, nuovoId, punteggio, richiesta, scriviCoda, scriviCopia, statoLiveValido, togliDipendenti, type Esito, type Giocatori, type VoceCoda } from './coda_live'
import { scrivi } from './rete'

/** Ogni quanto si rilegge lo stato dal server mentre la pagina e' visibile (gli altri admin possono aver segnato). */
const SONDAGGIO_MS = 10_000
/** Ogni quanto si controlla se c'e' qualcosa da inviare (le attese dopo un errore stanno nelle voci). */
const CONTROLLO_CODA_MS = 2_000
/** Con la sessione di Access scaduta non ha senso martellare il server: si riprova a questa distanza. */
const ATTESA_ACCESSO_MS = 15_000

export function vibra(ms = 40) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // niente vibrazione (iPhone, desktop): il punteggio che salta basta
  }
}

/**
 * La diretta lato admin: lo stato del server (riletto ogni ~10 s e dopo ogni invio), la coda locale delle azioni (sopravvive alla
 * ricarica e alla chiusura dell'app) e l'invio, che ritenta da solo: ritorno della rete, ritorno in primo piano, intervallo con attesa
 * crescente. Una voce rifiutata dal server NON si ritenta: resta in `rifiutate` con il suo errore finche' non si scarta.
 */
export function useLive(partitaId: number, g: Giocatori) {
  const chiave = chiaveCoda(partitaId)
  // l'ultimo stato letto resta anche sul telefono: ricaricando la pagina con poco segnale la schermata si disegna lo stesso
  const [server, setServer] = useState<Diretta | null>(() => leggiCopia(deposito(), chiaveCopiaStato(partitaId), statoLiveValido))
  const [daCopia, setDaCopia] = useState(() => server !== null)
  const [erroreServer, setErroreServer] = useState<ErroreApi | null>(null)
  const [voci, setVoci] = useState<VoceCoda[]>(() => leggiCoda(deposito(), chiave))
  const vociRef = useRef(voci)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [reteKo, setReteKo] = useState(false)
  const [accessoKo, setAccessoKo] = useState(false)
  const [salvataggioKo, setSalvataggioKo] = useState(false)
  const versione = useRef(0)
  const occupato = useRef(false)
  const statoRef = useRef<Diretta['stato'] | null>(server?.stato ?? null)

  const modifica = useCallback(
    (f: (v: VoceCoda[]) => VoceCoda[]) => {
      const nuove = f(vociRef.current)
      vociRef.current = nuove
      setVoci(nuove)
      const scritta = scriviCoda(deposito(), chiave, nuove) // anche vuota: toglie la chiave
      setSalvataggioKo(nuove.length > 0 && !scritta)
    },
    [chiave],
  )

  const applicaServer = useCallback((d: Diretta) => {
    statoRef.current = d.stato
    setServer(d)
    setDaCopia(false)
    setErroreServer(null)
    scriviCopia(deposito(), chiaveCopiaStato(partitaId), d)
  }, [partitaId])

  const carica = useCallback(async () => {
    for (let giro = 0; giro < 3; giro++) {
      const v = versione.current
      try {
        const d = await leggi<Diretta>(`/api/admin/partite/${partitaId}/diretta`)
        if (v !== versione.current) continue // nel frattempo e' partito un invio: questa fotografia e' vecchia, si rilegge
        applicaServer(d)
        setReteKo(false)
        setAccessoKo(false)
        return
      } catch (e) {
        const er = e instanceof ErroreApi ? e : new ErroreApi(0, 'Qualcosa è andato storto.')
        setErroreServer(er)
        if (er.accesso || er.stato === 401 || er.stato === 403) setAccessoKo(true)
        else if (er.stato === 0) setReteKo(true)
        return
      }
    }
  }, [partitaId, applicaServer])

  const svuota = useCallback(async () => {
    if (occupato.current) return
    occupato.current = true
    let inviati = 0
    try {
      for (;;) {
        const v = vociRef.current.find((x) => !x.errore)
        if (!v || v.prossimo > Date.now()) break
        let esito: Esito = 'fatto'
        let messaggio = ''
        try {
          const r = richiesta(partitaId, v)
          const ris = await scrivi<{ diretta?: Diretta }>(r.metodo, r.percorso, r.corpo)
          if (ris?.diretta) applicaServer(ris.diretta)
        } catch (e) {
          const er = e instanceof ErroreApi ? e : new ErroreApi(0, 'Qualcosa è andato storto.')
          esito = esitoInvio(v.k, er.stato, er.accesso)
          messaggio = er.message
        }
        if (esito === 'fatto') {
          versione.current++
          inviati++
          setReteKo(false)
          setAccessoKo(false)
          modifica((vs) => vs.filter((x) => x.aid !== v.aid))
        } else if (esito === 'riprova') {
          setReteKo(true)
          modifica((vs) => vs.map((x) => (x.aid === v.aid ? { ...x, tentativi: x.tentativi + 1, prossimo: Date.now() + attesaMs(x.tentativi + 1) } : x)))
          break
        } else if (esito === 'accesso') {
          setAccessoKo(true)
          modifica((vs) => vs.map((x) => (x.aid === v.aid ? { ...x, prossimo: Date.now() + ATTESA_ACCESSO_MS } : x)))
          break
        } else {
          modifica((vs) => togliDipendenti(vs, v).map((x) => (x.aid === v.aid ? { ...x, errore: messaggio } : x)))
        }
      }
    } finally {
      occupato.current = false
    }
    // coda vuota: lo stato mostrato torna a essere quello del server
    if (inviati > 0 && !vociRef.current.some((x) => !x.errore)) void carica()
  }, [partitaId, applicaServer, modifica, carica])

  // al caricamento: stato dal server, e subito l'invio di cio' che era rimasto in coda dall'ultima volta
  useEffect(() => {
    void carica()
    void svuota()
  }, [carica, svuota])

  useEffect(() => {
    const riprova = () => {
      // ritorno della rete o della pagina in primo piano: si riparte da zero (niente attese accumulate)
      modifica((vs) => vs.map((x) => (x.errore ? x : { ...x, prossimo: 0, tentativi: 0 })))
      void svuota()
      void carica()
    }
    const su = () => {
      setOnline(true)
      riprova()
    }
    const giu = () => setOnline(false)
    const visibile = () => {
      if (document.visibilityState === 'visible') riprova()
    }
    // un'altra scheda dello stesso telefono ha cambiato la coda
    const altraScheda = (e: StorageEvent) => {
      if (e.key !== chiave) return
      const nuove = leggiCoda(deposito(), chiave)
      vociRef.current = nuove
      setVoci(nuove)
    }
    addEventListener('online', su)
    addEventListener('offline', giu)
    addEventListener('storage', altraScheda)
    document.addEventListener('visibilitychange', visibile)
    const coda = setInterval(() => void svuota(), CONTROLLO_CODA_MS)
    const sondaggio = setInterval(() => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return
      if (statoRef.current === null || statoRef.current === 'in_diretta') void carica()
    }, SONDAGGIO_MS)
    return () => {
      removeEventListener('online', su)
      removeEventListener('offline', giu)
      removeEventListener('storage', altraScheda)
      document.removeEventListener('visibilitychange', visibile)
      clearInterval(coda)
      clearInterval(sondaggio)
    }
  }, [chiave, modifica, svuota, carica])

  const vista = useMemo(() => applicaCoda(server?.eventi ?? [], voci, g), [server, voci, g])
  const punti = useMemo(() => punteggio(vista), [vista])
  const pendenti = voci.filter((v) => !v.errore).length
  const rifiutate = voci.filter((v) => v.errore)

  const accoda = useCallback(
    (a: Parameters<typeof nuovaVoce>[0]) => {
      modifica((vs) => [...vs, nuovaVoce(a)])
      vibra()
      void svuota()
    },
    [modifica, svuota],
  )

  return {
    server,
    daCopia,
    erroreServer,
    vista,
    punti,
    pendenti,
    rifiutate,
    online,
    reteKo,
    accessoKo,
    salvataggioKo,
    ricarica: carica,
    segna: (tipo: TipoEvento, giocatoreId: number) => accoda({ k: 'segna', id_client: nuovoId(), tipo, giocatore_id: giocatoreId }),
    cambia: (idClient: string, campi: { tipo?: TipoEvento; giocatore_id?: number }) => accoda({ k: 'cambia', id_client: idClient, ...campi }),
    elimina: (idClient: string) => accoda({ k: 'elimina', id_client: idClient }),
    scarta: (aid: string) => modifica((vs) => vs.filter((x) => x.aid !== aid)),
  }
}

export type Live = ReturnType<typeof useLive>
export type { Codice }
