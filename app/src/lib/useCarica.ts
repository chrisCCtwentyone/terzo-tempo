import { useCallback, useEffect, useState } from 'react'
import { ErroreApi, leggi } from './api'

export type Carico<T> = { dati: T | null; errore: ErroreApi | null; caricando: boolean; ricarica: () => void }

/**
 * Esegue `carica` quando cambia `chiave` (null = niente da fare). Mentre si
 * ricarica la stessa chiave i dati vecchi restano visibili (niente lampeggio).
 */
export function useCarica<T>(chiave: string | null, carica: (signal: AbortSignal) => Promise<T>): Carico<T> {
  const [giro, setGiro] = useState(0)
  const [ris, setRis] = useState<{ chiave: string; dati?: T; errore?: ErroreApi } | null>(null)
  useEffect(() => {
    if (chiave === null) return
    const ac = new AbortController()
    carica(ac.signal).then(
      (dati) => setRis({ chiave, dati }),
      (e) => {
        if (!ac.signal.aborted) setRis({ chiave, errore: e instanceof ErroreApi ? e : new ErroreApi(0, 'Qualcosa è andato storto. Riprova.') })
      },
    )
    return () => ac.abort()
    // `carica` dipende solo da `chiave` (chi chiama la costruisce da li')
  }, [chiave, giro])
  const mio = ris && ris.chiave === chiave ? ris : null
  const ricarica = useCallback(() => setGiro((g) => g + 1), [])
  return { dati: mio?.dati ?? null, errore: mio?.errore ?? null, caricando: chiave !== null && !mio, ricarica }
}

/** GET di un percorso /api/... (null = non ancora). */
export const useApi = <T>(percorso: string | null) => useCarica<T>(percorso, (s) => leggi<T>(percorso!, s))
