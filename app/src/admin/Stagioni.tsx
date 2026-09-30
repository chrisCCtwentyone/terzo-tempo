import { useState } from 'react'
import { ErroreApi } from '../lib/api'
import { giornoAnno } from '../lib/formato'
import type { Stagione } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useTitolo } from '../router'
import { Attesa, Carta, Icona, Intestazione, Pulsante } from '../ui'
import { EsitoScrittura, Fld, IconaAdmin, useEsito } from './comuni'
import { scrivi } from './rete'

/** Stagioni: crea, apri, chiudi. Ce n'e' una sola aperta alla volta: se il server rifiuta, si spiega. */
export function StagioniAdmin() {
  useTitolo('Stagioni · Admin')
  const carico = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const [nuova, setNuova] = useState(false)
  const { esito, esegui, occupato } = useEsito()
  return (
    <>
      <Intestazione kick="Admin · Il calendario" titolo="Stagioni" />
      <Attesa carico={carico} testo="Carico le stagioni…" figli={({ stagioni }) => {
        const aperta = stagioni.find((s) => s.aperta)
        const spiega = (e: ErroreApi) =>
          e.stato === 409
            ? `Ce n'è una sola stagione aperta alla volta${aperta ? ` (adesso è aperta "${aperta.nome}")` : ''}: chiudi prima quella aperta, poi riprova. Il server dice: ${e.message}`
            : undefined
        const cambia = async (s: Stagione, azione: 'apri' | 'chiudi') => {
          const ok = await esegui(azione === 'apri' ? 'Apro la stagione' : 'Chiudo la stagione', () => scrivi('POST', `/api/admin/stagioni/${s.id}/${azione}`, azione === 'chiudi' ? {} : undefined),
            azione === 'apri' ? `Aperta la stagione ${s.nome}` : `Chiusa la stagione ${s.nome}`, spiega)
          if (ok) carico.ricarica()
        }
        return (
          <>
            <Pulsante variante="ghost" className="blocco" aria-expanded={nuova} onClick={() => setNuova(!nuova)}>
              <IconaAdmin id="a-plus" />Nuova stagione
            </Pulsante>
            {nuova && <Carta className="edit"><NuovaStagione aperta={aperta?.nome ?? null} spiega={spiega} esegui={esegui} occupato={occupato} onFatto={() => { carico.ricarica(); setNuova(false) }} /></Carta>}
            <EsitoScrittura esito={esito} />
            {stagioni.length === 0 && <Carta className="vuota" >Non c'è ancora nessuna stagione: creane una per poter inserire le partite.</Carta>}
            <ul className="list" style={{ marginTop: 14 }}>
              {stagioni.map((s, i) => (
                <li key={s.id} className="att" style={{ '--i': i } as React.CSSProperties}>
                  <Carta className="stagione">
                    <div className="voto-testa">
                      <div>
                        <b>{s.nome}</b>
                        <p className="note" style={{ marginTop: 2 }}>
                          dal {giornoAnno(`${s.data_inizio}T12:00:00Z`)}{s.data_fine ? ` al ${giornoAnno(`${s.data_fine}T12:00:00Z`)}` : ''} · {s.partite_giocate} {s.partite_giocate === 1 ? 'partita giocata' : 'partite giocate'}
                        </p>
                      </div>
                      <i className={`tu${s.aperta ? '' : ' chiusa'}`}>{s.aperta ? 'Aperta' : 'Chiusa'}</i>
                    </div>
                    <div className="azioni-modulo">
                      {s.aperta
                        ? <Pulsante onClick={() => cambia(s, 'chiudi')} disabled={occupato}>Chiudi la stagione</Pulsante>
                        : <Pulsante variante="yes" onClick={() => cambia(s, 'apri')} disabled={occupato}>Apri la stagione</Pulsante>}
                    </div>
                  </Carta>
                </li>
              ))}
            </ul>
            <p className="note">Le date sono quelle di Roma. Chiudere una stagione scrive la data di oggi come fine; riaprirla la toglie.</p>
          </>
        )
      }} />
    </>
  )
}

function NuovaStagione({ aperta, spiega, esegui, occupato, onFatto }: { aperta: string | null; spiega: (e: ErroreApi) => string | undefined; esegui: ReturnType<typeof useEsito>['esegui']; occupato: boolean; onFatto: () => void }) {
  const [nome, setNome] = useState('')
  const [inizio, setInizio] = useState('')
  const [aprila, setAprila] = useState(aperta === null)
  const valido = nome.trim() !== '' && inizio !== ''
  async function crea() {
    if (!valido || occupato) return
    const ok = await esegui('Creo la stagione', () => scrivi('POST', '/api/admin/stagioni', { nome: nome.trim(), data_inizio: inizio, aperta: aprila }), `Creata la stagione ${nome.trim()}`, spiega)
    if (ok) onFatto()
  }
  return (
    <form className="modulo" onSubmit={(e) => { e.preventDefault(); void crea() }} noValidate>
      <h2 className="sr">Nuova stagione</h2>
      <Fld etichetta="Nome della stagione">
        {(p) => <input {...p} type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Stagione 2026-27" autoComplete="off" />}
      </Fld>
      <Fld etichetta="Data di inizio">
        {(p) => <input {...p} type="date" value={inizio} onChange={(e) => setInizio(e.target.value)} />}
      </Fld>
      <button type="button" className="chip scelta" aria-pressed={aprila} onClick={() => setAprila(!aprila)}>
        Aprila subito
      </button>
      <p className="note">
        {aperta ? `Adesso è aperta "${aperta}": ce n'è una sola alla volta. Per aprire questa, chiudi prima l'altra.` : 'Al momento nessuna stagione è aperta.'}
      </p>
      <div className="azioni-modulo">
        <button type="submit" className="btn yes" disabled={!valido || occupato} aria-busy={occupato}><Icona id="i-check" />{occupato ? 'Attendi…' : 'Crea la stagione'}</button>
      </div>
    </form>
  )
}
