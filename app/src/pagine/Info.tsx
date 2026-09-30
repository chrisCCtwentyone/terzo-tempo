import { useTitolo } from '../router'
import { Carta, Icona, Intestazione, Marchio, Sezione } from '../ui'

const PROFILO = 'https://github.com/chrisCCtwentyone'
const CODICE = 'https://github.com/chrisCCtwentyone/terzo-tempo'
const LICENZA = 'https://github.com/chrisCCtwentyone/terzo-tempo/blob/main/LICENSE'

/** Link esterno: nuova scheda, senza passare il riferimento (la CSP non ammette nulla di inline). */
const Esterno = ({ verso, children }: { verso: string; children: string }) => (
  <a className="btn" href={verso} target="_blank" rel="noopener noreferrer">
    <span>{children}</span>
    <Icona id="i-arrow" />
  </a>
)

/** I dati del progetto: solo cose vere e ricavabili dal repository. Solo il nickname, mai il nome vero. */
export function Info() {
  useTitolo('Info')
  return (
    <>
      <Intestazione kick="Terzo Tempo" titolo="Info" />
      <Carta className="info-hero">
        <Marchio grande />
        <div>
          <p className="info-nome">Terzo Tempo</p>
          <p>
            Tiene il conto delle partite di calcetto del gruppo: convocati, squadre, gol, pagelle, MVP votato da tutti e
            classifiche stagione per stagione.
          </p>
        </div>
      </Carta>
      <Sezione>Credits</Sezione>
      <Carta>
        <p>Creato da <b>chrisCCtwentyone</b></p>
        <div className="more"><Esterno verso={PROFILO}>Profilo GitHub</Esterno></div>
        <div className="more"><Esterno verso={CODICE}>Codice sorgente</Esterno></div>
        <p className="info-nota">Licenza MIT: il testo completo è nel file <a href={LICENZA} target="_blank" rel="noopener noreferrer">LICENSE</a> del repository.</p>
      </Carta>
      <Sezione>Com'è fatto</Sezione>
      <Carta>
        <ul className="info-stack">
          {['Cloudflare Pages', 'Pages Functions', 'D1', 'React + Vite', 'TypeScript'].map((t) => <li key={t}>{t}</li>)}
        </ul>
      </Carta>
      <Sezione>Accesso e privacy</Sezione>
      <Carta>
        <p><b>Area admin:</b> protetta da Cloudflare Access, si entra con un codice ricevuto via email.</p>
        <p className="info-nota"><b>Privacy:</b> il voto MVP è anonimo e il livello dei giocatori non è pubblico.</p>
      </Carta>
    </>
  )
}
