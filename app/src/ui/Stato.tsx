import type { ReactNode } from 'react'
import type { ErroreApi } from '../lib/api'
import { Pallone } from './Icone'
import { Pulsante } from './Pulsanti'

/** Attesa testuale (il pallone che rimbalza si ferma con prefers-reduced-motion). */
export const Caricamento = ({ testo }: { testo: string }) => (
  <div className="card stato" role="status">
    <Pallone />
    <span>{testo}</span>
  </div>
)

export const Errore = ({ errore, onRiprova, extra }: { errore: ErroreApi; onRiprova?: () => void; extra?: ReactNode }) => (
  <div className="card stato errore" role="alert">
    <strong>{errore.stato === 404 ? 'Non trovato' : 'Non ci sono riuscito'}</strong>
    <span>{errore.message}</span>
    {onRiprova && errore.stato !== 404 && <Pulsante onClick={onRiprova}>Riprova</Pulsante>}
    {extra}
  </div>
)

/** Mostra attesa o errore finche' i dati non ci sono; poi chiama `figli` con i dati. */
export function Attesa<T>({ carico, testo, figli }: { carico: { dati: T | null; errore: ErroreApi | null; ricarica: () => void }; testo: string; figli: (d: T) => ReactNode }) {
  if (carico.dati) return <>{figli(carico.dati)}</>
  if (carico.errore) return <Errore errore={carico.errore} onRiprova={carico.ricarica} />
  return <Caricamento testo={testo} />
}
