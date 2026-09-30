import { Link } from '../router'
import { cognome, numero } from '../lib/formato'
import type { Badge, RigaClassifica } from '../lib/tipi'
import { Figurina } from './Figurina'

/** Podio dei primi (fino a 3: con 3 il primo sta al centro; a pari merito il gradino e' lo stesso). */
export function Podio({ righe, unita, badge }: { righe: RigaClassifica[]; unita: string; badge?: (id: number) => Badge[] | undefined }) {
  const p = righe.slice(0, 3)
  const ordine = p.length === 3 ? [p[1], p[0], p[2]] : p
  return (
    <div className="podio">
      {ordine.map((r, k) => (
        <Link key={r.giocatore_id} verso={`/giocatori/${r.giocatore_id}`} className="pc att" style={{ '--i': k } as React.CSSProperties} aria-label={`${r.posizione}. ${r.nome}, ${numero(r.valore)} ${unita}. Apri la scheda`}>
          <Figurina id={r.giocatore_id} nome={r.nome} decorativa z={r.posizione === 1 ? 64 : 52} badge={badge?.(r.giocatore_id)} />
          <span className="nm">{cognome(r.nome)}</span>
          <span className="g"><b>{numero(r.valore)}</b>{unita}</span>
          <div className={`blk b${Math.min(3, r.posizione)}`}>{r.posizione}</div>
        </Link>
      ))}
    </div>
  )
}
