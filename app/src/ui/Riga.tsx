import type { ReactNode } from 'react'
import { Link } from '../router'
import type { Badge } from '../lib/tipi'
import { Figurina } from './Figurina'

/** Riga a figurina di una classifica: posizione, figurina, nome con barra, valore. Se `verso` c'e', e' un link. */
export function Riga({ i, pos, id, nome, badge, verso, barra, valore, unita, nota }: {
  i: number
  pos: number
  id: number
  nome: string
  badge?: Badge[]
  verso: string
  /** riempimento della barra, 0-100 */
  barra: number
  valore: string
  unita: string
  nota?: ReactNode
}) {
  return (
    <li className="att" style={{ '--i': i } as React.CSSProperties}>
      <Link verso={verso} className="row" aria-label={`${pos}. ${nome}: ${valore} ${unita}. Apri la scheda`}>
        <span className={`pos p${pos <= 3 ? pos : 0}`}>{pos}</span>
        <Figurina id={id} nome={nome} decorativa badge={badge} />
        <span className="who">
          <b>
            {nome}
            {nota}
          </b>
          <span className="bar"><i style={{ width: `${Math.max(4, Math.min(100, barra))}%` }} /></span>
        </span>
        <span className="val">
          <b>{valore}</b>
          <small>{unita}</small>
        </span>
      </Link>
    </li>
  )
}
