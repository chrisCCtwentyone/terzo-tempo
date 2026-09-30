import { useTitolo } from '../router'
import { Carta, Icona, Intestazione, Sezione } from '../ui'

const PROFILO = 'https://github.com/chrisCCtwentyone'
const CODICE = 'https://github.com/chrisCCtwentyone/terzo-tempo'

/** Link esterno: nuova scheda, senza passare il riferimento (la CSP non ammette nulla di inline). */
const Esterno = ({ verso, children }: { verso: string; children: string }) => (
  <a className="btn" href={verso} target="_blank" rel="noopener noreferrer">
    <span>{children}</span>
    <Icona id="i-arrow" />
  </a>
)

/** Chi ha fatto l'app e con cosa. Solo il nickname. */
export function Info() {
  useTitolo('Info')
  return (
    <>
      <Intestazione kick="Terzo Tempo" titolo="Info" />
      <Carta>
        <p>
          <b>Terzo Tempo</b> tiene il conto delle partite di calcetto del gruppo: convocati, squadre, gol, pagelle, MVP votato
          da tutti e classifiche stagione per stagione.
        </p>
      </Carta>
      <Sezione>Credits</Sezione>
      <Carta>
        <p>Creato da <b>chrisCCtwentyone</b></p>
        <div className="more"><Esterno verso={PROFILO}>Profilo GitHub</Esterno></div>
        <div className="more"><Esterno verso={CODICE}>Codice sorgente</Esterno></div>
      </Carta>
      <p className="coda">React · Cloudflare Pages e D1</p>
    </>
  )
}
