import { useListone } from '../lib/listone'
import { useTitolo, Link } from '../router'
import { Attesa, Badges, Carta, Figurina, Intestazione } from '../ui'

/** Il listone: figurina, nome e badge di tutti. Tocco = scheda. */
export function Giocatori() {
  useTitolo('Giocatori')
  const carico = useListone()
  return (
    <>
      <Intestazione kick="Terzo Tempo · Il listone" titolo="Giocatori" />
      <Attesa carico={carico} testo="Carico i giocatori…" figli={(d) =>
        d.giocatori.length === 0 ? (
          <Carta className="vuota">Il listone e' ancora vuoto.</Carta>
        ) : (
          <ul className="list" style={{ marginTop: 0 }}>
            {d.giocatori.map((g, i) => (
              <li key={g.id} className="att" style={{ '--i': i } as React.CSSProperties}>
                <Link verso={`/giocatori/${g.id}`} className="row semplice" aria-label={`${g.nome}${g.badge.length ? `, badge: ${g.badge.map((b) => b.nome).join(', ')}` : ''}. Apri la scheda`}>
                  <Figurina id={g.id} nome={g.nome} z={44} decorativa badge={g.badge} />
                  <span className="who">
                    <b>{g.nome}</b>
                    <Badges badge={g.badge} />
                  </span>
                  <span className="val"><b>{g.totali.presenze}</b><small>presenze</small></span>
                </Link>
              </li>
            ))}
          </ul>
        )
      } />
    </>
  )
}
