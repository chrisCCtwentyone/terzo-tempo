import type { ButtonHTMLAttributes, ComponentProps } from 'react'
import { Link } from '../router'
import { Icona } from './Icone'

type Variante = 'yes' | 'no' | 'ghost' | ''

/** Pulsante a bottone (azioni). */
export const Pulsante = ({ variante = '', className = '', ...resto }: { variante?: Variante } & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" className={`btn ${variante} ${className}`} {...resto} />
)

/** Pulsante a link interno (navigazione), con la freccia. */
export const PulsanteLink = ({ variante = '', className = '', children, ...resto }: { variante?: Variante } & ComponentProps<typeof Link>) => (
  <Link className={`btn ${variante} ${className}`} {...resto}>
    <span>{children}</span>
    <Icona id="i-arrow" />
  </Link>
)

export type Voce<V extends string> = { valore: V; etichetta: string }

/** Gruppo di pulsanti a scelta singola: `pillole` (piu' voci, vanno a capo) o `seg` (barra unica). */
export function Scelta<V extends string>({ voci, valore, onScegli, etichetta, tipo = 'pillole', scorri = false }: {
  voci: Voce<V>[]
  valore: V | null
  onScegli: (v: V) => void
  etichetta: string
  tipo?: 'pillole' | 'seg'
  /** pillole su una riga sola, che scorre di lato (le stagioni: poche, ma di nome lungo) */
  scorri?: boolean
}) {
  return (
    <div className={tipo === 'seg' ? 'seg' : scorri ? 'pills scorri' : 'pills'} role="group" aria-label={etichetta}>
      {voci.map((v) => (
        <button key={v.valore} type="button" className={tipo === 'seg' ? undefined : 'pill'} aria-pressed={v.valore === valore} onClick={() => onScegli(v.valore)}>
          {v.etichetta}
        </button>
      ))}
    </div>
  )
}
