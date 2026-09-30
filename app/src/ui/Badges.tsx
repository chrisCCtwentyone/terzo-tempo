import type { Badge } from '../lib/tipi'

/** Le etichette dei badge (positivi in verde col tondo, negativi in rosso col rombo). */
export const Badges = ({ badge }: { badge: Badge[] }) =>
  badge.length === 0 ? null : (
    <ul className="bdgs" aria-label="Badge">
      {badge.map((b) => (
        <li key={b.id} className={b.tipo === 'negativo' ? 'bdg neg' : 'bdg'}>
          {b.nome}
          <span className="sr"> (badge {b.tipo})</span>
        </li>
      ))}
    </ul>
  )
