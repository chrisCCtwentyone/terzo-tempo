import { useMemo } from 'react'
import { leggi } from './api'
import type { Badge, GiocatoreListone } from './tipi'
import { useCarica } from './useCarica'

type Listone = { giocatori: GiocatoreListone[] }

// Il listone serve in piu' schermate (badge sulle figurine): una sola
// richiesta ogni minuto al massimo, condivisa.
let cache: { t: number; p: Promise<Listone> } | null = null
function caricaListone(): Promise<Listone> {
  if (!cache || Date.now() - cache.t > 60_000) {
    const p = leggi<Listone>('/api/giocatori')
    cache = { t: Date.now(), p }
    p.catch(() => {
      if (cache?.p === p) cache = null
    })
  }
  return cache.p
}

export const useListone = () => useCarica<Listone>('listone', () => caricaListone())

/** id -> badge del giocatore, per metterli sulle figurine. Se il listone non arriva, niente badge. */
export function useBadge(): (id: number) => Badge[] | undefined {
  const { dati } = useListone()
  const mappa = useMemo(() => new Map((dati?.giocatori ?? []).map((g) => [g.id, g.badge])), [dati])
  return (id) => mappa.get(id)
}
