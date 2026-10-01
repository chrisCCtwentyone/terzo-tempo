import { useState } from 'react'
import { ErroreApi } from '../lib/api'
import { indicazioni } from '../../../shared/indicazioni'
import { useApi } from '../lib/useCarica'
import { useTitolo } from '../router'
import { Attesa, Carta, Icona, Intestazione, Pulsante } from '../ui'
import { EsitoScrittura, Fld, IconaAdmin, useEsito } from './comuni'
import { scrivi } from './rete'
import type { CampoAdmin, LinkRisolto } from './tipi'

const MAX_NOME = 80

/** Il messaggio del server ("link: non è un link di Google Maps...") senza il nome del campo davanti, con l'iniziale maiuscola. */
const messaggioLink = (e: ErroreApi) => {
  const t = e.message.replace(/^link:\s*/, '')
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.')
}

/** Campi da gioco: elenco, nuovo (da link di Google Maps), modifica, archivia. */
export function CampiAdmin() {
  useTitolo('Campi · Admin')
  const carico = useApi<{ campi: CampoAdmin[] }>('/api/admin/campi')
  const [aperto, setAperto] = useState<number | 'nuovo' | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  return (
    <>
      <Intestazione kick="Admin · Dove si gioca" titolo="Campi" />
      <Attesa carico={carico} testo="Carico i campi…" figli={({ campi }) => {
        const attivi = campi.filter((c) => !c.archiviato)
        const archiviati = campi.filter((c) => c.archiviato)
        const fatto = (testo: string, chiudi = true) => { setNota(testo); if (chiudi) setAperto(null); carico.ricarica() }
        const riga = (c: CampoAdmin, i: number) => {
          const apri = aperto === c.id
          return (
            <li key={c.id} className="att" style={{ '--i': i } as React.CSSProperties}>
              <button type="button" className={`row semplice badge-riga riga-btn${c.archiviato ? ' archiviato' : ''}`} aria-expanded={apri} onClick={() => setAperto(apri ? null : c.id)}>
                <span className="who">
                  <b>{c.nome}{c.archiviato && <i className="tu chiusa">archiviato</i>}</b>
                  <span className="desc">{c.lat !== null ? 'Posizione salvata' : 'Solo il nome: Google Maps lo cerca per nome'}</span>
                </span>
                <span className="val"><b>{c.partite}</b><small>{c.partite === 1 ? 'partita' : 'partite'}</small></span>
              </button>
              {apri && <Carta className="edit"><ModificaCampo campo={c} onFatto={fatto} /></Carta>}
            </li>
          )
        }
        return (
          <>
            <Pulsante variante="ghost" className="blocco" aria-expanded={aperto === 'nuovo'} onClick={() => setAperto(aperto === 'nuovo' ? null : 'nuovo')}>
              <IconaAdmin id="a-plus" />Nuovo campo
            </Pulsante>
            {nota && <p className="esito ok" role="status"><Icona id="i-check" /><span>{nota}</span></p>}
            {aperto === 'nuovo' && <Carta className="edit"><ModificaCampo campo={null} onFatto={fatto} /></Carta>}
            {campi.length === 0 && <Carta className="vuota">Non c'è ancora nessun campo: aggiungine uno con “Nuovo campo”, incollando il link di Google Maps.</Carta>}
            {attivi.length > 0 && (
              <section aria-label="Campi attivi">
                <h2 className="sec"><i aria-hidden="true" />Campi</h2>
                <ul className="list" style={{ marginTop: 0 }}>{attivi.map(riga)}</ul>
              </section>
            )}
            {archiviati.length > 0 && (
              <section aria-label="Campi archiviati">
                <h2 className="sec"><i aria-hidden="true" />Archiviati</h2>
                <ul className="list" style={{ marginTop: 0 }}>{archiviati.map((c, i) => riga(c, i))}</ul>
              </section>
            )}
            <p className="note">Un campo archiviato resta sulle partite passate ma non si sceglie più per le nuove. I campi non si cancellano.</p>
          </>
        )
      }} />
    </>
  )
}

/**
 * Form di un campo. Nuovo: si incolla il link di Google Maps e si tocca "Ricava nome"; il nome resta sempre modificabile.
 *
 * `incorporato`: il modulo sta DENTRO un altro form (la partita, vedi SceltaCampo). Un <form> dentro un <form> non e' HTML
 * valido, e un Invio o un "Aggiungi" di tipo submit invierebbero la partita: quindi qui niente <form>, pulsante `button` e
 * Invio che salva il campo (mai la partita). `onCreato` riceve il campo appena creato, cosi' chi lo ospita lo seleziona.
 */
export function ModificaCampo({ campo, onFatto, incorporato = false, onCreato }: { campo: CampoAdmin | null; onFatto: (nota: string, chiudi?: boolean) => void; incorporato?: boolean; onCreato?: (c: CampoAdmin) => void }) {
  const [link, setLink] = useState(campo?.link_originale ?? '')
  const [nome, setNome] = useState(campo?.nome ?? '')
  const [pos, setPos] = useState<{ lat: number | null; lng: number | null }>({ lat: campo?.lat ?? null, lng: campo?.lng ?? null })
  const [linkErr, setLinkErr] = useState<string | null>(null)
  const [nomeNota, setNomeNota] = useState<string | null>(null)
  const [ricavando, setRicavando] = useState(false)
  const { esito, esegui, occupato } = useEsito()

  const pulito = nome.trim()
  const ind = indicazioni({ nome: pulito, lat: pos.lat, lng: pos.lng })
  const invariato = campo !== null && pulito === campo.nome && link.trim() === (campo.link_originale ?? '') && pos.lat === campo.lat && pos.lng === campo.lng

  async function ricava() {
    if (!link.trim() || ricavando) return
    setRicavando(true)
    setLinkErr(null)
    setNomeNota(null)
    try {
      const r = await scrivi<LinkRisolto>('POST', '/api/admin/campi/risolvi', { link: link.trim() })
      setPos({ lat: r.lat ?? null, lng: r.lng ?? null })
      if (r.nome) {
        setNome(r.nome)
        setNomeNota(`Nome ricavato dal link: controllalo e correggilo se serve.`)
      } else {
        setNomeNota('Non sono riuscito a ricavare il nome dal link: scrivilo a mano.')
      }
    } catch (e) {
      setLinkErr(e instanceof ErroreApi ? messaggioLink(e) : 'Qualcosa è andato storto. Riprova.')
    } finally {
      setRicavando(false)
    }
  }

  async function salva() {
    if (!pulito || occupato) return
    const corpo = { nome: pulito, link: link.trim() || null, lat: pos.lat, lng: pos.lng }
    const ok = await esegui('Salvataggio', () => (campo ? scrivi('PATCH', `/api/admin/campi/${campo.id}`, corpo) : scrivi<CampoAdmin>('POST', '/api/admin/campi', corpo)), campo ? `Salvato il campo ${pulito}` : `Aggiunto il campo ${pulito}`)
    if (!ok) return
    if (!campo && onCreato) onCreato(ok as CampoAdmin)
    onFatto(campo ? `Salvato il campo ${pulito}` : `Aggiunto il campo ${pulito}`)
  }

  async function archivia(si: boolean) {
    const ok = await esegui(si ? 'Archivio il campo' : 'Riattivo il campo', () => scrivi('PATCH', `/api/admin/campi/${campo!.id}`, { archiviato: si }), si ? `Archiviato il campo ${campo!.nome}` : `Riattivato il campo ${campo!.nome}`)
    if (ok) onFatto(si ? `Archiviato il campo ${campo!.nome}` : `Riattivato il campo ${campo!.nome}`)
  }

  const corpo = (
    <>
      <h2 className="sr">{campo ? `Modifica ${campo.nome}` : 'Nuovo campo'}</h2>
      <div className="ricava">
        <Fld etichetta="Link di Google Maps" errore={linkErr} aiuto='In Google Maps tocca "Condividi", copia il link e incollalo qui (va bene anche con del testo intorno).'>
          {(p) => (
            <input {...p} type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={2000} placeholder="https://maps.app.goo.gl/…"
              value={link} onChange={(e) => { setLink(e.target.value); setLinkErr(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ricava() } }} />
          )}
        </Fld>
        <Pulsante variante="ghost" className="blocco" onClick={() => void ricava()} disabled={!link.trim() || ricavando || occupato} aria-busy={ricavando}>
          {ricavando ? 'Apro il link…' : 'Ricava nome'}
        </Pulsante>
      </div>
      <Fld etichetta="Nome del campo" aiuto={nomeNota ?? 'Obbligatorio. Lo vedono tutti nelle pagine delle partite.'}>
        {(p) => <input {...p} type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={MAX_NOME} autoComplete="off" required />}
      </Fld>
      <div className="indicazioni">
        <p className="etich-campo">Indicazioni</p>
        {ind ? (
          <a className="luogo" href={ind} target="_blank" rel="noopener noreferrer">
            <Icona id="i-pin" />
            <span>Apri le indicazioni per controllare <span aria-hidden="true">→</span></span>
          </a>
        ) : (
          <p className="note" style={{ marginTop: 0 }}>Scrivi il nome (o ricavalo dal link) per vedere le indicazioni.</p>
        )}
        <p className="note" style={{ marginTop: 0 }}>{pos.lat !== null ? 'Usa la posizione presa dal link.' : 'Senza posizione nel link, Google Maps cerca il campo per nome.'}</p>
      </div>
      <div className="azioni-modulo">
        <button type={incorporato ? 'button' : 'submit'} className="btn yes" onClick={incorporato ? () => void salva() : undefined} disabled={!pulito || occupato || ricavando || invariato} aria-busy={occupato}>
          <Icona id="i-check" />{occupato ? 'Attendi…' : campo ? 'Salva le modifiche' : 'Aggiungi il campo'}
        </button>
        {campo && <Pulsante variante={campo.archiviato ? '' : 'no'} onClick={() => void archivia(!campo.archiviato)} disabled={occupato || ricavando}>{campo.archiviato ? 'Riattiva il campo' : 'Archivia il campo'}</Pulsante>}
      </div>
      {!pulito && <p className="note" style={{ marginTop: 0 }}>Senza nome il campo non si salva.</p>}
      <EsitoScrittura esito={esito} />
    </>
  )

  if (!incorporato) return <form className="modulo" onSubmit={(e) => { e.preventDefault(); void salva() }} noValidate>{corpo}</form>
  return (
    <div className="modulo" role="group" aria-label="Nuovo campo" onKeyDown={(e) => {
      // Invio in un campo di testo non deve MAI inviare la partita che sta intorno: nel link ricava il nome (lo fa il campo
      // stesso, che ha gia' bloccato l'evento), altrove salva il campo.
      if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement) || e.defaultPrevented) return
      e.preventDefault()
      void salva()
    }}>{corpo}</div>
  )
}
