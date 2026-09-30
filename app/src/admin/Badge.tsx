import { useState } from 'react'
import type { Badge } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useTitolo } from '../router'
import { Attesa, Carta, Icona, Intestazione, Pulsante, Scelta } from '../ui'
import { Conferma, EsitoScrittura, Fld, IconaAdmin, useEsito } from './comuni'
import { scrivi } from './rete'
import type { GiocatoreAdmin } from './tipi'

const TIPI = [
  { valore: 'positivo', etichetta: 'Positivo' },
  { valore: 'negativo', etichetta: 'Negativo' },
] as const

/** Badge: elenco, crea, modifica, elimina (con conferma nella pagina se e' assegnato). */
export function BadgeAdmin() {
  useTitolo('Badge · Admin')
  const badge = useApi<{ badge: Badge[] }>('/api/admin/badge')
  const giocatori = useApi<{ giocatori: GiocatoreAdmin[] }>('/api/admin/giocatori')
  const [aperto, setAperto] = useState<number | 'nuovo' | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const carico = {
    dati: badge.dati && giocatori.dati ? { b: badge.dati.badge, g: giocatori.dati.giocatori } : null,
    errore: badge.errore ?? giocatori.errore,
    ricarica: () => { badge.ricarica(); giocatori.ricarica() },
  }
  const rileggi = () => { badge.ricarica(); giocatori.ricarica() }
  return (
    <>
      <Intestazione kick="Admin · Caratteristiche" titolo="Badge" />
      <Attesa carico={carico} testo="Carico i badge…" figli={({ b, g }) => (
        <>
          <Pulsante variante="ghost" className="blocco" aria-expanded={aperto === 'nuovo'} onClick={() => setAperto(aperto === 'nuovo' ? null : 'nuovo')}>
            <IconaAdmin id="a-plus" />Nuovo badge
          </Pulsante>
          {nota && <p className="esito ok" role="status"><Icona id="i-check" /><span>{nota}</span></p>}
          {aperto === 'nuovo' && <Carta className="edit"><ModificaBadge b={null} assegnato={0} onFatto={rileggi} onElimina={() => {}} /></Carta>}
          {(['positivo', 'negativo'] as const).map((t) => {
            const elenco = b.filter((x) => x.tipo === t)
            return (
              <section key={t} aria-label={t === 'positivo' ? 'Badge positivi' : 'Badge negativi'}>
                <h2 className="sec"><i aria-hidden="true" />{t === 'positivo' ? 'Positivi' : 'Negativi'}</h2>
                {elenco.length === 0 && <Carta className="vuota">Nessun badge {t}.</Carta>}
                <ul className="list" style={{ marginTop: 0 }}>
                  {elenco.map((x, i) => {
                    const quanti = g.filter((p) => p.badge_ids.includes(x.id)).length
                    const apri = aperto === x.id
                    return (
                      <li key={x.id} className="att" style={{ '--i': i } as React.CSSProperties}>
                        <button type="button" className="row semplice badge-riga riga-btn" aria-expanded={apri} onClick={() => setAperto(apri ? null : x.id)}>
                          <span className="who">
                            <span className={`bdg${t === 'negativo' ? ' neg' : ''}`}>{x.nome}<span className="sr"> (badge {t})</span></span>
                            <span className="desc">{x.descrizione ?? 'Nessuna descrizione'}</span>
                          </span>
                          <span className="val"><b>{quanti}</b><small>{quanti === 1 ? 'giocatore' : 'giocatori'}</small></span>
                        </button>
                        {apri && <Carta className="edit"><ModificaBadge b={x} assegnato={quanti} onFatto={rileggi} onElimina={(nome) => { setAperto(null); setNota(`Eliminato il badge ${nome}`); rileggi() }} /></Carta>}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )} />
    </>
  )
}

function ModificaBadge({ b, assegnato, onFatto, onElimina }: { b: Badge | null; assegnato: number; onFatto: () => void; onElimina: (nome: string) => void }) {
  const [nome, setNome] = useState(b?.nome ?? '')
  const [descrizione, setDescrizione] = useState(b?.descrizione ?? '')
  const [tipo, setTipo] = useState<'positivo' | 'negativo'>(b?.tipo ?? 'positivo')
  const [chiedi, setChiedi] = useState(false)
  const { esito, esegui, occupato } = useEsito()
  const pulito = nome.trim()
  const invariato = b !== null && pulito === b.nome && descrizione.trim() === (b.descrizione ?? '') && tipo === b.tipo

  async function salva() {
    if (!pulito || occupato) return
    const corpo = { nome: pulito, descrizione: descrizione.trim() || null, tipo }
    const ok = await esegui('Salvataggio', () => (b ? scrivi('PATCH', `/api/admin/badge/${b.id}`, corpo) : scrivi('POST', '/api/admin/badge', corpo)), b ? `Salvato il badge ${pulito}` : `Creato il badge ${pulito}`)
    if (ok) {
      onFatto()
      if (!b) { setNome(''); setDescrizione(''); setTipo('positivo') }
    }
  }
  async function elimina() {
    const ok = await esegui('Eliminazione', () => scrivi('DELETE', `/api/admin/badge/${b!.id}`), `Eliminato il badge ${b!.nome}`)
    if (ok) onElimina(b!.nome)
    else setChiedi(false)
  }

  return (
    <form className="modulo" onSubmit={(e) => { e.preventDefault(); void salva() }} noValidate>
      <h2 className="sr">{b ? `Modifica ${b.nome}` : 'Nuovo badge'}</h2>
      <Fld etichetta="Nome del badge" errore={null}>
        {(p) => <input {...p} type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} autoComplete="off" />}
      </Fld>
      <Fld etichetta="Descrizione (facoltativa)" aiuto="Una frase breve, visibile a tutti (massimo 120 caratteri).">
        {(p) => <input {...p} type="text" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} maxLength={120} autoComplete="off" />}
      </Fld>
      <div>
        <p className="etich-campo">Tipo</p>
        <Scelta tipo="seg" etichetta="Tipo di badge" voci={[...TIPI]} valore={tipo} onScegli={setTipo} />
        <p className="note">{tipo === 'positivo' ? 'Positivo: un pregio (verde, tondo).' : 'Negativo: un difetto scherzoso (rosso, rombo).'}</p>
      </div>
      <div className="azioni-modulo">
        <button type="submit" className="btn yes" disabled={!pulito || occupato || invariato} aria-busy={occupato}>
          <Icona id="i-check" />{occupato ? 'Attendi…' : b ? 'Salva le modifiche' : 'Crea il badge'}
        </button>
        {b && <Pulsante variante="no" onClick={() => setChiedi(true)} disabled={occupato || chiedi}>Elimina</Pulsante>}
      </div>
      {chiedi && b && (
        <Conferma
          pericolo
          domanda={assegnato > 0
            ? <>Il badge <strong>{b.nome}</strong> è assegnato a {assegnato} {assegnato === 1 ? 'giocatore' : 'giocatori'}: eliminandolo lo perdono tutti. Eliminarlo?</>
            : <>Eliminare il badge <strong>{b.nome}</strong>? Non è assegnato a nessuno.</>}
          conferma="Sì, elimina"
          onConferma={elimina}
          onAnnulla={() => setChiedi(false)}
          occupato={occupato}
        />
      )}
      <EsitoScrittura esito={esito} />
    </form>
  )
}
