import { useEffect, useState } from 'react'
import { votaMvp, type ErroreApi } from '../lib/api'
import { brevi, cognome, conto, giornoOra, plurale } from '../lib/formato'
import { useListone } from '../lib/listone'
import type { Badge, Mvp, Partita } from '../lib/tipi'
import { Link } from '../router'
import { Bollino, Carta, Errore, Figurina, Icona, Pulsante, Sezione } from '../ui'

type ConBadge = (id: number) => Badge[] | undefined

/** MVP assegnato senza nessun voto = l'ha scelto l'admin (con voti, l'assegnato viene sempre dal voto o dalla parita'). */
const SCELTO_DALL_ADMIN = 'Scelto dall\'admin: nessun voto ricevuto'

/** Con #voto-mvp nell'URL (es. da "Vota ora" in home) porta il blocco in cima alla schermata. */
const vaiAlBlocco = () => {
  if (location.hash === '#voto-mvp') document.getElementById('voto-mvp')?.scrollIntoView()
}

/** Riga "MVP" del piede del tabellone (home e dettaglio): il vincitore, o lo stato del voto. `dentro` = si e' gia' nella pagina della partita. */
export function EsitoMvp({ partita, dentro = false }: { partita: Partita; dentro?: boolean }) {
  const m = partita.mvp
  if (m.stato === 'non_aperto') return null
  if (m.stato === 'aperto') {
    const vota = 'Vota ora'
    return (
      <div className="mvprow">
        <div>
          <small>Voto MVP aperto</small>
          <strong>{m.voti_totali === 0 ? 'Nessun voto per ora' : `${m.voti_totali} ${plurale(m.voti_totali, 'voto', 'voti')}`}</strong>
        </div>
        {dentro ? <a className="btn ghost" href="#voto-mvp">{vota}</a> : <Link className="btn ghost" verso={`/partite/${partita.id}#voto-mvp`}>{vota}</Link>}
      </div>
    )
  }
  if (m.stato === 'assegnato' && m.vincitore) {
    return (
      <div className="mvprow">
        <Figurina id={m.vincitore.giocatore_id} nome={m.vincitore.nome} z={44} />
        <div>
          <small>MVP della partita</small>
          <strong>{m.vincitore.nome}</strong>
          {m.voti_totali === 0 && <small>{SCELTO_DALL_ADMIN}</small>}
        </div>
      </div>
    )
  }
  return (
    <div className="mvprow">
      <div>
        <small>MVP della partita</small>
        <strong>{m.stato === 'parita_da_decidere' ? 'Parita\': decide l\'admin' : 'Nessun voto'}</strong>
      </div>
    </div>
  )
}

/** Il bollino accanto al vincitore, nel piede del tabellone. */
export const BollinoMvp = ({ mvp }: { mvp: Mvp }) => (mvp.stato === 'assegnato' && mvp.vincitore ? <Bollino /> : null)

function ContoAllaRovescia({ fine, onScaduto }: { fine: string; onScaduto: () => void }) {
  const [ora, setOra] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setOra(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const resto = Date.parse(fine) - ora
  const scaduto = resto <= 0
  // A tempo scaduto si rilegge la partita: la chiusura del server e' immediata alla prima lettura.
  // Se l'orologio del telefono anticipa quello del server si riprova ogni 5 secondi.
  useEffect(() => {
    if (!scaduto) return
    onScaduto()
    const t = setInterval(onScaduto, 5000)
    return () => clearInterval(t)
  }, [scaduto, onScaduto])
  return (
    <div className="conto" role="timer">
      {scaduto ? 'Chiusura in corso…' : conto(resto)}
      <small>{scaduto ? 'un attimo' : 'alla chiusura del voto'}</small>
    </div>
  )
}

type Votabile = { id: number; nome: string; badge: Badge[] }

function Aperto({ partita, mvp, haVotato, onVotato, ricarica, avvisa, badge }: {
  partita: Partita
  mvp: Extract<Mvp, { stato: 'aperto' }>
  haVotato: boolean
  onVotato: () => void
  ricarica: () => void
  avvisa: (testo: string, ok: boolean) => void
  badge: ConBadge
}) {
  const lista = useListone()
  const [scelto, setScelto] = useState<number | null>(null)
  const [invio, setInvio] = useState(false)
  const gg: Votabile[] = lista.dati?.giocatori ?? []
  const nomi = brevi(gg.map((g) => g.nome))
  const chi = gg.find((g) => g.id === scelto)
  // l'elenco allunga la pagina: solo quando c'e' il blocco puo' stare in cima
  const pronta = gg.length > 0
  useEffect(() => {
    if (pronta) vaiAlBlocco()
  }, [pronta])

  async function conferma() {
    if (scelto === null || invio) return
    setInvio(true)
    try {
      await votaMvp(partita.id, scelto)
      onVotato()
      setScelto(null)
      avvisa('Voto registrato: grazie! Il risultato esce alla chiusura del voto.', true)
    } catch (e) {
      const er = e as ErroreApi
      // 409: "hai gia' votato per questa partita" oppure "votazione chiusa" (il testo lo scrive il server)
      if (er.stato === 409) setScelto(null)
      if (er.stato === 409 && /votato/.test(er.message)) onVotato()
      avvisa(er.message.charAt(0).toUpperCase() + er.message.slice(1) + (/[.!?]$/.test(er.message) ? '' : '.'), false)
    } finally {
      setInvio(false)
      ricarica()
    }
  }

  return (
    <Carta>
      <div className="voto-testa">
        <div>
          <b>Voto aperto</b>
          <p className="note" style={{ marginTop: 2 }}>
            {mvp.voti_totali === 0 ? 'Nessuno ha ancora votato' : `${mvp.voti_totali} ${plurale(mvp.voti_totali, 'ha votato', 'hanno votato')}`}
            {' · '}chiude {giornoOra(mvp.chiude_il)}
          </p>
        </div>
        <ContoAllaRovescia fine={mvp.chiude_il} onScaduto={ricarica} />
      </div>
      {haVotato ? (
        <p className="esito-voto">
          <Icona id="i-check" />
          <span>Hai gia' votato da questo telefono. Il risultato esce alla chiusura del voto.</span>
        </p>
      ) : (
        <>
          <p className="note">Vota chi e' stato l'MVP: un voto per telefono, senza accedere. Puoi votare chiunque, anche te stesso.</p>
          {lista.caricando && <p className="note" role="status">Carico l'elenco dei giocatori…</p>}
          {lista.errore && <Errore errore={lista.errore} onRiprova={lista.ricarica} />}
          {gg.length > 0 && (
            <fieldset>
              <legend className="sr">Scegli chi votare come MVP</legend>
              <div className="vota">
                {gg.map((g, k) => (
                  <label key={g.id}>
                    <input type="radio" className="sr" name="mvp" value={g.id} checked={scelto === g.id} onChange={() => setScelto(g.id)} />
                    <Figurina id={g.id} nome={g.nome} z={46} decorativa badge={badge(g.id)} />
                    <span className="sr">{g.nome}</span>
                    <span className="cart" aria-hidden="true">{nomi[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {chi && (
            <div className="conferma" role="group" aria-label="Conferma del voto">
              <p>Voti <strong>{chi.nome}</strong> come MVP? Poi non puoi cambiarlo.</p>
              <div className="azioni">
                <Pulsante variante="yes" onClick={conferma} disabled={invio} aria-busy={invio}>{invio ? 'Invio…' : 'Conferma il voto'}</Pulsante>
                <Pulsante onClick={() => setScelto(null)} disabled={invio}>Annulla</Pulsante>
              </div>
            </div>
          )}
        </>
      )}
    </Carta>
  )
}

function Risultati({ mvp }: { mvp: Extract<Mvp, { risultati: unknown }> }) {
  if (mvp.risultati.length === 0) return null
  const max = Math.max(...mvp.risultati.map((r) => r.voti))
  return (
    <>
      <p className="note">Voti ricevuti · {mvp.voti_totali} in tutto</p>
      <ul className="ris">
        {mvp.risultati.map((r) => (
          <li key={r.giocatore_id}>
            <span>{r.nome}</span>
            <span className="bar"><i style={{ width: `${(r.voti / max) * 100}%`, ['--bc' as string]: 'var(--yellow)' }} /></span>
            <b>{r.voti}</b>
          </li>
        ))}
      </ul>
    </>
  )
}

function Chiuso({ mvp, badge }: { mvp: Extract<Mvp, { risultati: unknown }>; badge: ConBadge }) {
  if (mvp.stato === 'nessun_voto') return <Carta className="vuota">Nessun voto: per questa partita non c'e' un MVP.</Carta>
  if (mvp.stato === 'parita_da_decidere') {
    return (
      <Carta>
        <p><strong>Parita': decide l'admin.</strong> Sono a pari merito:</p>
        <ul className="conv">
          {mvp.candidati.map((c) => (
            <li key={c.giocatore_id}>
              <Figurina id={c.giocatore_id} nome={c.nome} z={48} badge={badge(c.giocatore_id)} />
              <span className="cart">{cognome(c.nome)}</span>
            </li>
          ))}
        </ul>
        <Risultati mvp={mvp} />
      </Carta>
    )
  }
  return (
    <Carta>
      {mvp.vincitore && (
        <div className="vincitore">
          <Figurina id={mvp.vincitore.giocatore_id} nome={mvp.vincitore.nome} z={64} badge={badge(mvp.vincitore.giocatore_id)} />
          <div>
            <small>MVP della partita</small>
            <strong>{mvp.vincitore.nome}</strong>
            {mvp.voti_totali === 0 && <small>{SCELTO_DALL_ADMIN}</small>}
          </div>
          <Bollino />
        </div>
      )}
      <Risultati mvp={mvp} />
    </Carta>
  )
}

/** Il blocco "Voto MVP" del dettaglio partita: voto aperto (elenco, conferma, conto alla rovescia) o esito. */
export function BloccoMvp({ partita, ricarica, badge }: { partita: Partita; ricarica: () => void; badge: ConBadge }) {
  const mvp = partita.mvp
  const [votato, setVotato] = useState(false)
  const [avviso, setAvviso] = useState<{ testo: string; ok: boolean } | null>(null)
  useEffect(vaiAlBlocco, [])
  if (mvp.stato === 'non_aperto') return null
  return (
    <section id="voto-mvp" aria-labelledby="t-mvp">
      <Sezione id="t-mvp">Voto MVP</Sezione>
      {avviso && <p className={avviso.ok ? 'avviso ok' : 'avviso'} role={avviso.ok ? 'status' : 'alert'} style={{ margin: '0 0 12px' }}>{avviso.testo}</p>}
      {mvp.stato === 'aperto' ? (
        <Aperto partita={partita} mvp={mvp} haVotato={votato || mvp.ha_votato} onVotato={() => setVotato(true)} ricarica={ricarica} avvisa={(testo, ok) => setAvviso({ testo, ok })} badge={badge} />
      ) : (
        <Chiuso mvp={mvp} badge={badge} />
      )}
    </section>
  )
}
