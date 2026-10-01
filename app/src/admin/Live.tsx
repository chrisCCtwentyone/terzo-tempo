import { useEffect, useMemo, useState } from 'react'
import type { Codice, Partita, TipoEvento } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useSalto } from '../lib/useSalto'
import { Link, useTitolo, vai } from '../router'
import { Attesa, Carta, Figurina, Icona, Intestazione, Pallone, Pulsante, PulsanteLink, Sezione } from '../ui'
import { chiaveCopiaPartita, comePartitaLive, deposito, leggiCopia, partitaLiveValida, scriviCopia, type EventoVista, type GiocatoreLive, type PartitaLive } from './coda_live'
import { Conferma, EsitoScrittura, useEsito } from './comuni'
import { scrivi } from './rete'
import { useLive, type Live as StatoLive } from './useLive'

/**
 * LIVE: l'admin in panchina segna i gol mentre si gioca. Pensata per un dito solo, in piedi, al campo: pulsanti grandi (56 px),
 * nessun form, nessun confirm() (le conferme sono pannelli nella pagina) e nessun gol perso se manca la rete: ogni tocco finisce SUBITO
 * in una coda sul telefono (app/src/admin/coda_live.ts) e parte appena si puo'. Specifica: CLAUDE.md, "Partita in diretta".
 */
export function Live({ id }: { id: number }) {
  useTitolo('LIVE · Admin')
  const partita = useApi<Partita>(`/api/partite/${id}`)
  // la partita (giocatori in campo) resta sul telefono: se la pagina si ricarica con poco segnale la schermata si disegna lo stesso
  useEffect(() => {
    if (partita.dati) scriviCopia(deposito(), chiaveCopiaPartita(id), comePartitaLive(partita.dati))
  }, [id, partita.dati])
  const copia = useMemo(() => (partita.errore?.stato === 0 ? leggiCopia(deposito(), chiaveCopiaPartita(id), partitaLiveValida) : null), [id, partita.errore])
  const carico = { dati: partita.dati ? comePartitaLive(partita.dati) : copia, errore: partita.errore, ricarica: partita.ricarica }
  return (
    <>
      <Link verso={`/admin/partite/${id}`} className="indietro"><Icona id="i-arrow" />Torna alla partita</Link>
      <Intestazione kick="Admin · LIVE" titolo="In diretta" />
      <Attesa carico={carico} testo="Carico la partita…" figli={(p) => <Schermata p={p} />} />
    </>
  )
}

function Schermata({ p }: { p: PartitaLive }) {
  const inCampo = useMemo(() => p.giocatori.filter((x) => x.squadra !== null), [p.giocatori])
  const gioc = useMemo(() => {
    const m = new Map(inCampo.map((x) => [x.giocatore_id, x]))
    return { squadraDi: (id: number) => m.get(id)?.squadra ?? null, nomeDi: (id: number) => m.get(id)?.nome ?? '?' }
  }, [inCampo])
  const live = useLive(p.id, gioc)
  const { server } = live

  if (!server) {
    if (live.erroreServer) {
      return <Carta className="stato errore" ><strong>Non ci sono riuscito</strong><span>{live.erroreServer.message}</span><Pulsante onClick={() => void live.ricarica()}>Riprova</Pulsante></Carta>
    }
    return <Carta className="vuota">Carico la diretta…</Carta>
  }
  return <Corpo p={p} inCampo={inCampo} live={live} stato={server.stato} />
}

const nomiSquadre = (p: PartitaLive) => Object.fromEntries(p.squadre.map((s) => [s.codice, s.nome])) as Record<Codice, string>

function Corpo({ p, inCampo, live, stato }: { p: PartitaLive; inCampo: GiocatoreLive[]; live: StatoLive; stato: string }) {
  const nomi = nomiSquadre(p)
  const apertaOra = stato === 'in_diretta'
  const [scelto, setScelto] = useState<number | null>(null)
  const [cambiando, setCambiando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [chiediFine, setChiediFine] = useState(false)
  const { esito, esegui, occupato } = useEsito()
  const saltaA = useSalto(live.punti.A)
  const saltaB = useSalto(live.punti.B)

  const tocca = (gid: number) => {
    setCambiando(null)
    setEliminando(null)
    setScelto(scelto === gid ? null : gid)
  }
  const conferma = (tipo: TipoEvento) => {
    if (scelto === null) return
    live.segna(tipo, scelto)
    setScelto(null)
  }
  const ultimo = live.vista[live.vista.length - 1]
  const annullaUltimo = () => {
    if (!ultimo) return
    setScelto(null)
    setCambiando(null)
    setEliminando(null)
    live.elimina(ultimo.chiave)
  }
  const nomeScelto = inCampo.find((x) => x.giocatore_id === scelto)?.nome

  async function fine() {
    const r = await esegui('Chiudo la partita', () => scrivi('POST', `/api/admin/partite/${p.id}/diretta/fine`, {}), 'Diretta chiusa: ora i voti')
    if (r) vai(`/admin/partite/${p.id}?sez=risultato`)
    else setChiediFine(false)
  }
  async function inizia() {
    const r = await esegui('Avvio la diretta', () => scrivi('POST', `/api/admin/partite/${p.id}/diretta/inizia`, {}), 'Diretta avviata')
    if (r) void live.ricarica()
  }

  return (
    <>
      <StatoInvio live={live} />
      <Rifiutate live={live} />

      <Carta className="hero live-tabellone">
        <div className="band">
          {(['A', 'B'] as const).map((c) => (
            <div key={c} className={`half ${c === 'A' ? 'a' : 'b'}`}>
              <span className="tn">{nomi[c]}</span>
              <b className={`sc${(c === 'A' ? saltaA : saltaB) ? ' salta' : ''}`} aria-label={`${nomi[c]}: ${live.punti[c]}`}>{live.punti[c]}</b>
            </div>
          ))}
          <span className="fin">{apertaOra ? 'Live' : stato === 'non_iniziata' ? 'Da giocare' : 'Finita'}</span>
        </div>
      </Carta>

      {stato === 'non_iniziata' && (
        <Carta>
          <p><strong>La diretta non è ancora iniziata.</strong> Parte da sola all'orario della partita (se le squadre sono assegnate), oppure la avvii adesso.</p>
          <div className="azioni-modulo"><Pulsante variante="yes" className="blocco lg" onClick={inizia} disabled={occupato} aria-busy={occupato}>Inizia diretta</Pulsante></div>
        </Carta>
      )}
      {(stato === 'da_confermare' || stato === 'finita') && (
        <Carta>
          <p><strong>{stato === 'finita' ? 'La partita è già stata giocata.' : 'La diretta è finita: il risultato aspetta la tua conferma.'}</strong> {stato === 'finita' ? 'Per correggere gol e voti usa la sezione Risultato.' : 'Controlla i gol, metti i voti in pagella e segna la partita come giocata.'}</p>
          <div className="azioni-modulo">
            {stato === 'da_confermare' ? (
              <Pulsante variante="yes" className="blocco lg" onClick={fine} disabled={occupato || live.pendenti > 0} aria-busy={occupato}>Porta il risultato nella partita</Pulsante>
            ) : (
              <PulsanteLink variante="ghost" className="blocco lg" verso={`/admin/partite/${p.id}?sez=risultato`}>Vai al risultato</PulsanteLink>
            )}
          </div>
          {stato === 'da_confermare' && live.pendenti > 0 && <p className="note">Aspetta che tutti i gol siano inviati.</p>}
        </Carta>
      )}

      {apertaOra && (
        <>
          <Sezione>Chi ha segnato?</Sezione>
          <p className="note" style={{ marginTop: 0 }}>Tocca la figurina di chi ha segnato, poi conferma.</p>
          <div className="live-squadre">
            {(['A', 'B'] as const).map((c) => (
              <section key={c} aria-label={`Giocatori ${nomi[c]}`}>
                <h3 className={`ph ${c === 'A' ? 'a' : 'b'}`}>{nomi[c]}</h3>
                <ul>
                  {inCampo.filter((x) => x.squadra === c).map((x) => (
                    <li key={x.giocatore_id}><Tessera g={x} scelto={scelto === x.giocatore_id} onTocca={() => tocca(x.giocatore_id)} /></li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {scelto !== null && nomeScelto && (
            <div className="live-conferma" role="group" aria-label="Conferma del gol">
              <p>Gol di <b>{nomeScelto}</b>?</p>
              <div className="live-az">
                <button type="button" className="btn yes lg" onClick={() => conferma('gol')}>Gol</button>
                <button type="button" className="btn no lg" onClick={() => conferma('autogol')}>Autogol</button>
                <button type="button" className="btn lg" onClick={() => setScelto(null)}>Annulla</button>
              </div>
            </div>
          )}
          <button type="button" className="btn lg blocco live-annulla" onClick={annullaUltimo} disabled={!ultimo}>
            <Icona id="i-arrow" />Annulla ultimo{ultimo ? `: ${ultimo.nome}` : ''}
          </button>
        </>
      )}

      <Sezione>I gol, in ordine</Sezione>
      {live.vista.length === 0 ? (
        <Carta className="vuota">Ancora nessun gol.</Carta>
      ) : (
        <ol className="list live-gol" style={{ marginTop: 0 }}>
          {live.vista.map((e, i) => (
            <li key={e.chiave}>
              <RigaGol e={e} n={i + 1} nomi={nomi} modificabile={apertaOra} aperta={cambiando === e.chiave} inElimina={eliminando === e.chiave}
                onCambia={() => { setScelto(null); setEliminando(null); setCambiando(cambiando === e.chiave ? null : e.chiave) }}
                onElimina={() => { setScelto(null); setCambiando(null); setEliminando(eliminando === e.chiave ? null : e.chiave) }}
                onConfermaElimina={() => { live.elimina(e.chiave); setEliminando(null) }}
                onScegli={(campi) => { live.cambia(e.chiave, campi); setCambiando(null) }}
                inCampo={inCampo} />
            </li>
          ))}
        </ol>
      )}

      {apertaOra && (
        <>
          <Sezione>Fine partita</Sezione>
          <Carta>
            {!chiediFine ? (
              <>
                <p style={{ marginTop: 0 }}>Quando l'arbitro fischia la fine. Poi metti i voti in pagella e segni la partita come giocata.</p>
                <div className="azioni-modulo"><Pulsante variante="no" className="blocco lg" onClick={() => setChiediFine(true)} disabled={occupato}>Fine partita</Pulsante></div>
              </>
            ) : (
              <Conferma pericolo domanda={<>Finire la partita sul <b>{nomi.A} {live.punti.A} – {live.punti.B} {nomi.B}</b>? Poi non si segnano più gol da qui.</>}
                conferma="Sì, fine partita" onConferma={fine} onAnnulla={() => setChiediFine(false)} occupato={occupato || live.pendenti > 0} />
            )}
            {live.pendenti > 0 && <p className="note">Aspetta che {live.pendenti === 1 ? 'il gol sia inviato' : `i ${live.pendenti} gol siano inviati`}: poi puoi chiudere.</p>}
          </Carta>
        </>
      )}
      <p className="note">Tieni aperta questa pagina: i gol si salvano sul telefono e partono appena torna il segnale, senza doppioni. Se la chiudi, riaprila quando c'è campo: quelli da inviare restano qui.</p>
      <EsitoScrittura esito={esito} />
    </>
  )
}

function Tessera({ g, scelto, onTocca }: { g: GiocatoreLive; scelto: boolean; onTocca: () => void }) {
  return (
    <button type="button" className={`live-tessera${scelto ? ' sel' : ''}`} aria-pressed={scelto} onClick={onTocca}>
      <Figurina id={g.giocatore_id} nome={g.nome} z={40} decorativa />
      <span className="nm">{g.nome}</span>
    </button>
  )
}

function RigaGol({ e, n, nomi, modificabile, aperta, inElimina, onCambia, onElimina, onConfermaElimina, onScegli, inCampo }: {
  e: EventoVista
  n: number
  nomi: Record<Codice, string>
  modificabile: boolean
  aperta: boolean
  inElimina: boolean
  onCambia: () => void
  onElimina: () => void
  onConfermaElimina: () => void
  onScegli: (campi: { tipo?: TipoEvento; giocatore_id?: number }) => void
  inCampo: GiocatoreLive[]
}) {
  const autogol = e.tipo === 'autogol'
  return (
    <Carta className="live-riga">
      <div className="live-riga-testa">
        <span className="n" aria-hidden="true">{n}</span>
        <Pallone autogol={autogol} size={22} />
        <span className="chi">
          <b>{e.nome}</b>
          <small>{autogol ? `Autogol · punto ${nomi[e.squadra]}` : nomi[e.squadra]}</small>
        </span>
        {e.inInvio && <i className="tu in-invio">in invio</i>}
      </div>
      {modificabile && (
        <div className="live-riga-az">
          <button type="button" className="btn" aria-expanded={aperta} onClick={onCambia} aria-label={`Cambia marcatore del gol ${n}: ${e.nome}`}>Cambia</button>
          <button type="button" className="btn no" aria-expanded={inElimina} onClick={onElimina} aria-label={`Elimina il gol ${n}: ${e.nome}`}>Elimina</button>
        </div>
      )}
      {aperta && (
        <div className="live-cambia" role="group" aria-label={`Cambia il gol ${n}`}>
          <p className="note" style={{ marginTop: 0 }}>Chi l'ha segnato davvero? Oppure cambia il tipo.</p>
          <div className="seg" role="group" aria-label="Tipo">
            <button type="button" aria-pressed={!autogol} onClick={() => autogol && onScegli({ tipo: 'gol' })}>Gol</button>
            <button type="button" aria-pressed={autogol} onClick={() => !autogol && onScegli({ tipo: 'autogol' })}>Autogol</button>
          </div>
          <div className="live-squadre">
            {(['A', 'B'] as const).map((c) => (
              <ul key={c} aria-label={`Giocatori ${nomi[c]}`}>
                {inCampo.filter((x) => x.squadra === c).map((x) => (
                  <li key={x.giocatore_id}>
                    <button type="button" className={`live-tessera${x.giocatore_id === e.giocatore_id ? ' sel' : ''}`} aria-pressed={x.giocatore_id === e.giocatore_id}
                      onClick={() => (x.giocatore_id === e.giocatore_id ? onScegli({}) : onScegli({ giocatore_id: x.giocatore_id }))}>
                      <Figurina id={x.giocatore_id} nome={x.nome} z={36} decorativa />
                      <span className="nm">{x.nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}
      {inElimina && (
        <Conferma pericolo domanda={<>Eliminare il gol di <b>{e.nome}</b>?</>} conferma="Sì, elimina" onConferma={onConfermaElimina} onAnnulla={onElimina} />
      )}
    </Carta>
  )
}

/** "N da inviare" / "tutto inviato" / "senza rete": sempre visibile in cima, per sapere a che punto sono i gol. */
function StatoInvio({ live }: { live: StatoLive }) {
  const senzaRete = !live.online || live.reteKo
  let testo: string
  let classe: string
  if (live.accessoKo) {
    testo = live.pendenti > 0 ? `${live.pendenti} da inviare · sessione scaduta` : 'Sessione scaduta'
    classe = 'ko'
  } else if (live.pendenti > 0) {
    testo = `${live.pendenti} da inviare${senzaRete ? ' · senza rete' : ''}`
    classe = senzaRete ? 'ko' : 'coda'
  } else if (senzaRete) {
    testo = 'Senza rete · tutto inviato'
    classe = 'ko'
  } else {
    testo = 'Tutto inviato'
    classe = 'ok'
  }
  return (
    <>
      <p className={`live-invio ${classe}`} role="status" aria-live="polite" data-pendenti={live.pendenti}>
        <i className="dot" aria-hidden="true" />
        <span>{testo}</span>
      </p>
      {live.accessoKo && (
        <div className="avvisi" role="alert">
          <p>La sessione di accesso è scaduta: i gol restano sul telefono. Ricarica la pagina per accedere di nuovo con il codice via email.</p>
          <Pulsante onClick={() => location.reload()}>Ricarica la pagina</Pulsante>
        </div>
      )}
      {live.salvataggioKo && <p className="note" role="status">Attenzione: questo telefono non lascia salvare i gol in attesa. Tieni aperta la pagina finché non sono tutti inviati.</p>}
    </>
  )
}

/** Le voci che il server ha rifiutato (partita chiusa, giocatore non in campo...): non si ritentano, si leggono e si scartano. */
function Rifiutate({ live }: { live: StatoLive }) {
  if (live.rifiutate.length === 0) return null
  return (
    <div className="avvisi live-rifiutate" role="alert">
      <p><strong>{live.rifiutate.length === 1 ? 'Un invio è stato rifiutato dal server:' : `${live.rifiutate.length} invii sono stati rifiutati dal server:`}</strong></p>
      <ul>
        {live.rifiutate.map((v) => (
          <li key={v.aid}>
            <span>{v.k === 'segna' ? 'Gol non registrato' : v.k === 'elimina' ? 'Gol non eliminato' : 'Gol non modificato'}: {v.errore}</span>{' '}
            <button type="button" className="btn" onClick={() => live.scarta(v.aid)}>Scarta</button>
          </li>
        ))}
      </ul>
      <p className="note">Non si riprova da soli. Dopo averli letti, scartali.</p>
    </div>
  )
}
