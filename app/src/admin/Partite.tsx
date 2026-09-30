import { useState } from 'react'
import { giorno, giornoNumero, meseBreve, ora, plurale } from '../lib/formato'
import type { Badge, PartitaRiga, Stagione } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { Link, useTitolo, vai } from '../router'
import { Attesa, Carta, Icona, Intestazione, PulsanteLink, Sezione } from '../ui'
import { ScegliConvocati } from './Convocati'
import { EsitoScrittura, Fld, useEsito } from './comuni'
import { scrivi } from './rete'
import { SceltaCampo } from './SceltaCampo'
import type { CampoAdmin, GiocatoreAdmin } from './tipi'

/** L'elenco delle partite (tutte le stagioni), con "Nuova partita". */
export function ElencoPartite() {
  useTitolo('Partite · Admin')
  const partite = useApi<{ partite: PartitaRiga[] }>('/api/partite')
  return (
    <>
      <Intestazione kick="Admin · Il calendario" titolo="Partite" />
      <PulsanteLink variante="ghost" className="blocco" verso="/admin/partite/nuova">Nuova partita</PulsanteLink>
      <Attesa carico={partite} testo="Carico le partite…" figli={({ partite: elenco }) => (
        elenco.length === 0 ? (
          <Carta className="vuota" >Non c'è ancora nessuna partita: creane una con “Nuova partita”.</Carta>
        ) : (
          <>
            <Sezione>Tutte le partite</Sezione>
            <ol className="list" style={{ marginTop: 0 }}>
              {elenco.map((p, i) => {
                const [a, b] = ['A', 'B'].map((c) => p.squadre.find((s) => s.codice === c))
                const giocata = p.stato === 'giocata'
                return (
                  <li key={p.id} className="att" style={{ '--i': i } as React.CSSProperties}>
                    <Link verso={`/admin/partite/${p.id}`} className="row match" aria-label={`${giorno(p.data_ora)} alle ${ora(p.data_ora)}: ${a?.nome} contro ${b?.nome}, ${giocata ? `finita ${a?.gol} a ${b?.gol}` : 'da giocare'}. Apri la gestione`}>
                      <span className="quando" aria-hidden="true"><b>{giornoNumero(p.data_ora)}</b>{meseBreve(p.data_ora)}</span>
                      <span aria-hidden="true">
                        <span className="sq"><span>{a?.nome}</span><b>{a?.gol ?? '–'}</b></span>
                        <span className="sq"><span>{b?.nome}</span><b>{b?.gol ?? '–'}</b></span>
                      </span>
                      {!giocata && <span className="tag2" aria-hidden="true">{ora(p.data_ora)} · da giocare</span>}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </>
        )
      )} />
    </>
  )
}

/** Nuova partita: data e ora (input nativi), stagione (quella aperta di default), convocati dal listone. */
export function NuovaPartita() {
  useTitolo('Nuova partita · Admin')
  const giocatori = useApi<{ giocatori: GiocatoreAdmin[] }>('/api/admin/giocatori')
  const badge = useApi<{ badge: Badge[] }>('/api/admin/badge')
  const stagioni = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const campi = useApi<{ campi: CampoAdmin[] }>('/api/admin/campi')
  const carico = {
    dati: giocatori.dati && badge.dati && stagioni.dati && campi.dati ? { g: giocatori.dati.giocatori, b: badge.dati.badge, s: stagioni.dati.stagioni, c: campi.dati.campi } : null,
    errore: giocatori.errore ?? badge.errore ?? stagioni.errore ?? campi.errore,
    ricarica: () => { giocatori.ricarica(); badge.ricarica(); stagioni.ricarica(); campi.ricarica() },
  }
  return (
    <>
      <Link verso="/admin/partite" className="indietro"><Icona id="i-arrow" />Tutte le partite</Link>
      <Intestazione kick="Admin · Convocazione" titolo="Nuova partita" />
      <Attesa carico={carico} testo="Carico il listone…" figli={({ g, b, s, c }) => <Modulo giocatori={g} badge={b} stagioni={s} campi={c} />} />
    </>
  )
}

function Modulo({ giocatori, badge, stagioni, campi }: { giocatori: GiocatoreAdmin[]; badge: Badge[]; stagioni: Stagione[]; campi: CampoAdmin[] }) {
  const aperta = stagioni.find((s) => s.aperta)
  const [dataOra, setDataOra] = useState('')
  const [stagione, setStagione] = useState<string>(aperta ? String(aperta.id) : '')
  const [campo, setCampo] = useState('')
  const [scelti, setScelti] = useState<number[]>([])
  const { esito, esegui, occupato } = useEsito()
  const valido = dataOra !== '' && stagione !== '' && scelti.length > 0

  async function crea() {
    if (!valido || occupato) return
    const r = await esegui('Creo la partita', () => scrivi<{ id: number }>('POST', '/api/admin/partite', { data_ora: dataOra, stagione_id: Number(stagione), giocatori: scelti, ...(campo ? { campo_id: Number(campo) } : {}) }), 'Partita creata')
    if (r) vai(`/admin/partite/${r.id}?sez=squadre`)
  }

  return (
    <form className="modulo" onSubmit={(e) => { e.preventDefault(); void crea() }} noValidate>
      <Carta>
        <div className="due impila">
          <Fld etichetta="Data e ora" aiuto="Ora di Roma.">
            {(p) => <input {...p} type="datetime-local" value={dataOra} onChange={(e) => setDataOra(e.target.value)} required />}
          </Fld>
          <Fld etichetta="Stagione" aiuto={aperta ? undefined : 'Nessuna stagione è aperta: scegline una o aprila nella sezione Stagioni.'}>
            {(p) => (
              <select {...p} value={stagione} onChange={(e) => setStagione(e.target.value)}>
                {!aperta && <option value="">Scegli la stagione…</option>}
                {stagioni.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.aperta ? ' (aperta)' : ''}</option>)}
              </select>
            )}
          </Fld>
        </div>
        <SceltaCampo campi={campi} valore={campo} onCambia={setCampo} />
      </Carta>
      <Sezione>Convocati</Sezione>
      <Carta>
        <p className="note" style={{ marginTop: 0 }} aria-live="polite">
          {scelti.length === 0 ? 'Tocca le figurine dei giocatori convocati.' : `${scelti.length} ${plurale(scelti.length, 'convocato', 'convocati')}`}
        </p>
        <ScegliConvocati giocatori={giocatori} scelti={scelti} onCambia={(id, si) => setScelti(si ? [...scelti, id] : scelti.filter((x) => x !== id))} badge={(g) => badge.filter((k) => g.badge_ids.includes(k.id))} />
      </Carta>
      <div className="azioni-modulo">
        <button type="submit" className="btn yes blocco" disabled={!valido || occupato} aria-busy={occupato}><Icona id="i-check" />{occupato ? 'Creazione…' : 'Crea la partita'}</button>
      </div>
      {!valido && <p className="note">Servono la data, la stagione e almeno un convocato.</p>}
      <EsitoScrittura esito={esito} />
    </form>
  )
}
