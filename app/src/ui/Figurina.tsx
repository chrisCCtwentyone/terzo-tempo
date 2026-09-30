import { iniziali, tinta } from '../lib/formato'
import type { Badge } from '../lib/tipi'

type Props = {
  id: number
  nome: string
  /** lato in px (default 40) */
  z?: number
  /** badge del giocatore: si mostrano come segni sul bordo (tondo = positivo, rombo = negativo) */
  badge?: Badge[]
  /** true quando un elemento vicino gia' dice chi e' (es. una pedina con la sua etichetta) */
  decorativa?: boolean
  className?: string
}

/** La figurina: iniziali su fondo colorato. L'etichetta per gli screen reader e' il nome, non le sole iniziali. */
export function Figurina({ id, nome, z = 40, badge, decorativa, className = '' }: Props) {
  const segni = (badge ?? []).slice(0, 3)
  const etichetta = badge?.length ? `${nome}, badge: ${badge.map((b) => `${b.nome} (${b.tipo})`).join(', ')}` : nome
  return (
    <span
      className={`fig k${tinta(id)} ${className}`}
      style={{ '--z': `${z}px` } as React.CSSProperties}
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': etichetta })}
    >
      {iniziali(nome)}
      {segni.length > 0 && (
        <span className="mks" aria-hidden="true">
          {segni.map((b) => (
            <i key={b.id} className={b.tipo === 'negativo' ? 'mk neg' : 'mk'} />
          ))}
        </span>
      )}
    </span>
  )
}
