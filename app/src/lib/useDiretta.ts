import { useCallback, useEffect, useRef, useState } from 'react'
import { leggi } from './api'
import type { Diretta } from './tipi'

/** Ogni quanto la pagina pubblica rilegge la diretta, solo mentre e' visibile e solo se la partita e' IN DIRETTA. */
export const SONDAGGIO_PUBBLICO_MS = 10_000

/**
 * La diretta di una partita per la pagina pubblica: la legge una volta e poi, finche' lo stato e' `in_diretta`, la rilegge ogni ~10 secondi
 * mentre la pagina e' visibile (visibilitychange: tornando in primo piano si rilegge subito). Quando lo stato non e' piu' `in_diretta`
 * (fine partita, due ore passate) smette. `nuovi` = gli id dei gol arrivati con l'ultima lettura (per l'animazione leggera); mai al primo caricamento.
 */
export function useDiretta(partitaId: number, attiva: boolean) {
  const [dati, setDati] = useState<Diretta | null>(null)
  const [nuovi, setNuovi] = useState<number[]>([])
  const visti = useRef<Set<number> | null>(null)
  const stato = useRef<Diretta['stato'] | null>(null)

  const carica = useCallback(async () => {
    try {
      const d = await leggi<Diretta>(`/api/partite/${partitaId}/diretta`)
      stato.current = d.stato
      const ids = d.eventi.map((e) => e.id)
      if (visti.current) {
        const prima = visti.current
        const arrivati = ids.filter((id) => !prima.has(id))
        if (arrivati.length > 0) setNuovi(arrivati)
      }
      visti.current = new Set(ids)
      setDati(d)
    } catch {
      // niente rete o errore passeggero: resta l'ultima lettura, si riprova al prossimo giro
    }
  }, [partitaId])

  useEffect(() => {
    if (!attiva) return
    void carica()
    const giro = setInterval(() => {
      if (document.visibilityState === 'visible' && stato.current === 'in_diretta') void carica()
    }, SONDAGGIO_PUBBLICO_MS)
    const visibile = () => {
      if (document.visibilityState === 'visible' && stato.current === 'in_diretta') void carica()
    }
    document.addEventListener('visibilitychange', visibile)
    return () => {
      clearInterval(giro)
      document.removeEventListener('visibilitychange', visibile)
    }
  }, [attiva, carica])

  useEffect(() => {
    if (nuovi.length === 0) return
    const t = setTimeout(() => setNuovi([]), 1800)
    return () => clearTimeout(t)
  }, [nuovi])

  return { dati, nuovi }
}
