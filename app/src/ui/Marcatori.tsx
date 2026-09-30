import { marcatori } from '../lib/campo'
import type { Partita } from '../lib/tipi'
import { Pallone } from './Icone'

/** Marcatori delle due squadre: gol e autogol distinti. Un punteggio senza marcatore registrato si dice. */
export function Marcatori({ partita }: { partita: Pick<Partita, 'squadre' | 'giocatori'> }) {
  return (
    <div className="tab2">
      {(['A', 'B'] as const).map((c) => {
        const sq = partita.squadre.find((s) => s.codice === c)
        const { voci, senza } = marcatori(partita.giocatori, c, sq?.gol ?? null)
        return (
          <div key={c}>
            <h3>Marcatori {sq?.nome ?? c}</h3>
            {voci.length === 0 && senza === 0 ? (
              <p>Nessun gol</p>
            ) : (
              <ul>
                {voci.map((v) => (
                  <li key={`${v.nome}${v.autogol}`}>
                    <Pallone autogol={v.autogol} />
                    <span>
                      {v.nome}
                      {v.n > 1 ? ` ×${v.n}` : ''}
                      {v.autogol ? ' (autogol)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {senza > 0 && <p>{senza === 1 ? '1 gol senza marcatore registrato' : `${senza} gol senza marcatore registrato`}</p>}
          </div>
        )
      })}
    </div>
  )
}
