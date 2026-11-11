import { FACCIA, RAPPORTO_FIGURINA, SAGOMA, SEGNAPOSTO, useCarta } from '../lib/carte'
import type { Badge } from '../lib/tipi'

type Props = {
  id: number
  nome: string
  /** altezza in px (default 40); la larghezza e' 0,78 volte */
  z?: number
  /** badge del giocatore: si mostrano come segni sul bordo (tondo = positivo, rombo = negativo) */
  badge?: Badge[]
  /** true quando un elemento vicino gia' dice chi e' (es. una pedina con la sua etichetta) */
  decorativa?: boolean
  className?: string
}

/** La figurina: un esagonino col volto della carta (o il segnaposto). L'etichetta per gli screen reader e' il nome, non una sigla. */
export function Figurina({ id, nome, z = 40, badge, decorativa, className = '' }: Props) {
  const url = useCarta(id)
  const segni = (badge ?? []).slice(0, 3)
  const etichetta = badge?.length ? `${nome}, badge: ${badge.map((b) => `${b.nome} (${b.tipo})`).join(', ')}` : nome
  const { sfondo, omino, bordo } = SEGNAPOSTO
  return (
    <span
      className={`fig ${className}`}
      style={{ '--z': `${z}px`, width: z * RAPPORTO_FIGURINA, height: z } as React.CSSProperties}
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': etichetta })}
    >
      <span className="in" style={{ clipPath: SAGOMA, background: bordo }}>
        {url ? (
          <i style={{ clipPath: 'inherit', backgroundColor: sfondo, backgroundImage: `url(${url})`, backgroundRepeat: 'no-repeat', backgroundSize: FACCIA.dimensione, backgroundPosition: FACCIA.posizione }} />
        ) : (
          <svg viewBox="0 0 78 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" style={{ clipPath: 'inherit' }}>
            <rect width="78" height="100" fill={sfondo} />
            <circle cx="39" cy="40" r="20" fill={omino} />
            <path d="M4 100c0-26 14-40 35-40s35 14 35 40z" fill={omino} />
            <text x="39" y="50" textAnchor="middle" fontFamily="Anton,Impact,sans-serif" fontSize="27" fill={sfondo}>?</text>
          </svg>
        )}
      </span>
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
