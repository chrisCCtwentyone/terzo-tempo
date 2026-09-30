import { giornoOra, giornoAnno, numero, voto } from '../lib/formato'
import { useBadge } from '../lib/listone'
import type { HomeDati, Partita } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useTitolo } from '../router'
import { Attesa, Carta, Cart, Figurina, Icona, Intestazione, Luogo, Podio, PulsanteLink, Riga, Sezione, Tabellone } from '../ui'
import { BollinoMvp, EsitoMvp } from './Mvp'

function UltimaPartita({ p }: { p: Partita }) {
  return (
    <Carta className="hero att">
      <Tabellone squadre={p.squadre} stato={p.stato} />
      <div className="foot">
        <div>
          <p className="dt">{giornoAnno(p.data_ora)}</p>
          <Luogo campo={p.campo} />
          <EsitoMvp partita={p} />
        </div>
        <BollinoMvp mvp={p.mvp} />
      </div>
      <PulsanteLink variante="ghost" className="go" verso={`/partite/${p.id}`}>Vedi la partita</PulsanteLink>
    </Carta>
  )
}

function ProssimaPartita({ p, badge }: { p: Partita; badge: ReturnType<typeof useBadge> }) {
  return (
    <Carta att i={2}>
      <div className="when"><b>{giornoOra(p.data_ora)}</b></div>
      <Luogo campo={p.campo} />
      {p.giocatori.length === 0 ? (
        <p className="note">Convocati non ancora inseriti.</p>
      ) : (
        <>
          <p className="conv-n">Convocati · {p.giocatori.length}</p>
          <ul className="conv" style={{ marginTop: 10 }}>
            {p.giocatori.map((g, k) => (
              <li key={g.giocatore_id} className="att" style={{ '--i': k } as React.CSSProperties}>
                <Figurina id={g.giocatore_id} nome={g.nome} z={44} badge={badge(g.giocatore_id)} />
                <Cart nome={g.nome} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="more"><PulsanteLink verso={`/partite/${p.id}`}>Vedi la partita</PulsanteLink></div>
    </Carta>
  )
}

/** Statistica curiosa ricavata SOLO dai dati che ci sono: il miglior voto dell'ultima partita (se ha una pagella). */
function Curiosita({ p }: { p: Partita }) {
  const voti = p.giocatori.filter((g) => g.voto_pagella !== null)
  if (voti.length === 0) return null
  const max = Math.max(...voti.map((g) => g.voto_pagella!))
  const migliori = voti.filter((g) => g.voto_pagella === max).map((g) => g.nome)
  return (
    <>
      <Sezione>Statistica curiosa</Sezione>
      <Carta className="fx" att i={4}>
        <span className="ic"><Icona id="i-target" /></span>
        <div>
          <small>Miglior voto dell'ultima partita</small>
          <b>{migliori.join(', ')}: {voto(max)}</b>
        </div>
      </Carta>
    </>
  )
}

export function Home() {
  useTitolo('Home')
  const carico = useApi<HomeDati>('/api/home')
  const badge = useBadge()
  return (
    <>
      <Intestazione kick={`Terzo Tempo${carico.dati?.stagione ? ` · ${carico.dati.stagione.nome}` : ''}`} titolo="Home" />
      <Attesa carico={carico} testo="Carico la home…" figli={(d) => (
        <>
          <Sezione>Ultima partita</Sezione>
          {d.ultima_partita ? <UltimaPartita p={d.ultima_partita} /> : <Carta className="vuota">Ancora nessuna partita giocata.</Carta>}

          <Sezione>Prossima partita</Sezione>
          {d.prossima_partita ? <ProssimaPartita p={d.prossima_partita} badge={badge} /> : <Carta className="vuota">Nessuna partita in programma.</Carta>}

          <Sezione>Podio marcatori</Sezione>
          {d.top_marcatori.length === 0 ? (
            <Carta className="vuota">{d.stagione ? 'Ancora nessun gol in questa stagione.' : 'Nessuna stagione aperta: niente classifica marcatori.'}</Carta>
          ) : (
            <Carta att i={3}>
              <Podio righe={d.top_marcatori} unita="gol" badge={badge} />
              {d.top_marcatori.length > 3 && (
                <ol className="list">
                  {d.top_marcatori.slice(3).map((r, k) => (
                    <Riga key={r.giocatore_id} i={k} pos={r.posizione} id={r.giocatore_id} nome={r.nome} badge={badge(r.giocatore_id)} verso={`/giocatori/${r.giocatore_id}`}
                      barra={(r.valore / d.top_marcatori[0].valore) * 100} valore={numero(r.valore)} unita="gol" />
                  ))}
                </ol>
              )}
              <div className="more"><PulsanteLink verso="/classifiche">Classifica completa</PulsanteLink></div>
            </Carta>
          )}

          {d.ultima_partita && <Curiosita p={d.ultima_partita} />}
        </>
      )} />
    </>
  )
}
