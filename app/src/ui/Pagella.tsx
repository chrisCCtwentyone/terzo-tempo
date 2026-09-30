import type { Badge, Partita } from '../lib/tipi'
import { Figurina } from './Figurina'
import { Voto } from './Voto'

/** La pagella: una colonna per squadra, dal voto piu' alto; chi non ha voto va in fondo con "n.d.". */
export function Pagella({ giocatori, squadre, badge }: { giocatori: Partita['giocatori']; squadre: Partita['squadre']; badge?: (id: number) => Badge[] | undefined }) {
  const colonna = (codice: 'A' | 'B', cls: string) => {
    const gg = giocatori
      .filter((g) => g.squadra === codice)
      .sort((x, y) => (y.voto_pagella ?? -1) - (x.voto_pagella ?? -1))
    return (
      <div className="pcol">
        <h3 className={`ph ${cls}`}>{squadre.find((s) => s.codice === codice)?.nome ?? codice}</h3>
        {gg.map((g) => (
          <div className="pr" key={g.giocatore_id}>
            <Figurina id={g.giocatore_id} nome={g.nome} z={26} decorativa badge={badge?.(g.giocatore_id)} />
            <span className="n">{g.nome}</span>
            <Voto v={g.voto_pagella} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="pag">
      {colonna('A', 'a')}
      {colonna('B', 'b')}
    </div>
  )
}
