import { useListone } from '../lib/listone'
import { useTitolo, Link } from '../router'
import { Attesa, Badges, Carta, CartaGiocatore, Intestazione } from '../ui'

/** Il listone: carta, presenze e badge di tutti. Tocco = scheda. */
export function Giocatori() {
  useTitolo('Giocatori')
  const carico = useListone()
  return (
    <>
      <Intestazione kick="Terzo Tempo · Il listone" titolo="Giocatori" />
      <Attesa carico={carico} testo="Carico i giocatori…" figli={(d) =>
        d.giocatori.length === 0 ? (
          <Carta className="vuota">Il listone è ancora vuoto.</Carta>
        ) : (
          <ul className="album">
            {d.giocatori.map((g, i) => (
              <li key={g.id} className="it att" style={{ '--i': i } as React.CSSProperties}>
                <Link verso={`/giocatori/${g.id}`} className="albo" aria-label={`${g.nome}, ${g.totali.presenze} presenze${g.badge.length ? `, badge: ${g.badge.map((b) => b.nome).join(', ')}` : ''}. Apri la scheda`}>
                  <CartaGiocatore id={g.id} nome={g.nome} decorativa />
                  <span className="meta">Presenze <b>{g.totali.presenze}</b></span>
                  <Badges badge={g.badge} />
                </Link>
              </li>
            ))}
          </ul>
        )
      } />
    </>
  )
}
