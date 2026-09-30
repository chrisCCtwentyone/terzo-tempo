import { useMemo, useState } from 'react'
import { normalizzaCognome, normalizzaInizialiOpz, componiNome, MAX_COGNOME, MAX_INIZIALI } from '../../../shared/nomi'
import { ErroreApi } from '../lib/api'
import type { Badge } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useTitolo } from '../router'
import { Attesa, Badges, Carta, Figurina, Icona, Intestazione, Pulsante } from '../ui'
import { EsitoScrittura, Fld, IconaAdmin, ScalaLivello, useEsito } from './comuni'
import { scrivi } from './rete'
import type { GiocatoreAdmin } from './tipi'

/** Giocatori: elenco (anche archiviati), aggiunta, modifica del nome, livello segreto, archiviazione, badge. */
export function GiocatoriAdmin() {
  useTitolo('Giocatori · Admin')
  const giocatori = useApi<{ giocatori: GiocatoreAdmin[] }>('/api/admin/giocatori')
  const badge = useApi<{ badge: Badge[] }>('/api/admin/badge')
  const [aperto, setAperto] = useState<number | 'nuovo' | null>(null)
  const carico = {
    dati: giocatori.dati && badge.dati ? { g: giocatori.dati.giocatori, b: badge.dati.badge } : null,
    errore: giocatori.errore ?? badge.errore,
    ricarica: () => { giocatori.ricarica(); badge.ricarica() },
  }
  return (
    <>
      <Intestazione kick="Admin · Il listone" titolo="Giocatori" />
      <Attesa carico={carico} testo="Carico i giocatori…" figli={({ g, b }) => (
        <>
          <Pulsante variante="ghost" className="blocco" aria-expanded={aperto === 'nuovo'} onClick={() => setAperto(aperto === 'nuovo' ? null : 'nuovo')}>
            <IconaAdmin id="a-plus" />Nuovo giocatore
          </Pulsante>
          {aperto === 'nuovo' && (
            <Carta className="edit">
              <ModificaGiocatore g={null} badge={b} onFatto={() => giocatori.ricarica()} />
            </Carta>
          )}
          <p className="conv-n">{g.length} giocatori · {g.filter((x) => !x.attivo).length} archiviati</p>
          <ul className="list" style={{ marginTop: 10 }}>
            {g.map((x, i) => {
              const suoi = b.filter((k) => x.badge_ids.includes(k.id))
              const apri = aperto === x.id
              return (
                <li key={x.id} className="att" style={{ '--i': i } as React.CSSProperties}>
                  <button type="button" className={`row semplice riga-btn${x.attivo ? '' : ' archiviato'}`} aria-expanded={apri} onClick={() => setAperto(apri ? null : x.id)}>
                    <Figurina id={x.id} nome={x.nome} z={44} decorativa badge={suoi} />
                    <span className="who">
                      <b>{x.nome}{!x.attivo && <i className="tu" style={{ marginLeft: 6 }}>archiviato</i>}</b>
                      <Badges badge={suoi} />
                    </span>
                    <span className="val"><b>{x.livello_segreto ?? '–'}</b><small>livello</small></span>
                  </button>
                  {apri && (
                    <Carta className="edit">
                      <ModificaGiocatore g={x} badge={b} onFatto={() => giocatori.ricarica()} />
                    </Carta>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )} />
    </>
  )
}

const ERR_COGNOME = `Cognome: solo lettere (anche spazi, apostrofi e trattini), al massimo ${MAX_COGNOME} caratteri.`
const ERR_INIZIALI = `Iniziali del nome: facoltative; se ci sono, da 1 a ${MAX_INIZIALI} lettere (per esempio M oppure S. C.).`

function ModificaGiocatore({ g, badge, onFatto }: { g: GiocatoreAdmin | null; badge: Badge[]; onFatto: () => void }) {
  const [cognome, setCognome] = useState(g?.cognome ?? '')
  const [iniziali, setIniziali] = useState(g?.iniziali ?? '')
  const [livello, setLivello] = useState<number | null>(g?.livello_segreto ?? null)
  const [attivo, setAttivo] = useState(g?.attivo ?? true)
  const [suoi, setSuoi] = useState<number[]>(g?.badge_ids ?? [])
  const { esito, esegui, occupato } = useEsito()
  const [id, setId] = useState(g?.id ?? null)

  const c = normalizzaCognome(cognome)
  const ini = normalizzaInizialiOpz(iniziali) // '' = nessuna iniziale (facoltative), null = non valide
  const errCognome = cognome.trim() !== '' && c === null ? ERR_COGNOME : null
  const errIniziali = ini === null ? ERR_INIZIALI : null
  const valido = c !== null && ini !== null
  const anteprima = c !== null && ini !== null ? componiNome(c, ini) : null
  const stessiBadge = useMemo(() => [...suoi].sort().join() === [...(g?.badge_ids ?? [])].sort().join(), [suoi, g])
  const invariato = g !== null && anteprima === g.nome && livello === g.livello_segreto && attivo === g.attivo && stessiBadge
  const tipoBadge = (t: 'positivo' | 'negativo') => badge.filter((b) => b.tipo === t)

  async function salva() {
    if (!valido || occupato) return
    await esegui('Salvataggio', async () => {
      let idFinale = id
      if (idFinale === null) {
        const nuovo = await scrivi<GiocatoreAdmin>('POST', '/api/admin/giocatori', { cognome: c, iniziali: ini, livello_segreto: livello, attivo })
        idFinale = nuovo.id
        setId(nuovo.id)
      } else if (g && (anteprima !== g.nome || livello !== g.livello_segreto || attivo !== g.attivo)) {
        await scrivi('PATCH', `/api/admin/giocatori/${idFinale}`, { cognome: c, iniziali: ini, livello_segreto: livello, attivo })
      }
      if (g === null ? suoi.length > 0 : !stessiBadge) {
        try {
          await scrivi('PUT', `/api/admin/giocatori/${idFinale}/badge`, { badge_ids: suoi })
        } catch (e) {
          onFatto()
          throw new ErroreApi(e instanceof ErroreApi ? e.stato : 0, `il giocatore è salvato, ma i badge no: ${e instanceof Error ? e.message : 'errore'}`)
        }
      }
      onFatto()
      if (g === null) {
        // form pronto per il prossimo giocatore
        setCognome(''); setIniziali(''); setLivello(null); setAttivo(true); setSuoi([]); setId(null)
      }
      return componiNome(c!, ini!)
    }, (n) => (g === null ? `Aggiunto ${n}` : `Salvato ${n}`))
  }

  return (
    <form className="modulo" onSubmit={(e) => { e.preventDefault(); void salva() }} noValidate>
      <h2 className="sr">{g ? `Modifica ${g.nome}` : 'Nuovo giocatore'}</h2>
      <div className="due">
        <Fld etichetta="Cognome" errore={errCognome}>
          {(p) => <input {...p} type="text" value={cognome} onChange={(e) => setCognome(e.target.value)} autoComplete="off" autoCapitalize="words" maxLength={MAX_COGNOME + 10} />}
        </Fld>
        <Fld etichetta="Iniziali del nome (facoltative)" errore={errIniziali}>
          {(p) => <input {...p} type="text" value={iniziali} onChange={(e) => setIniziali(e.target.value)} autoComplete="off" autoCapitalize="characters" maxLength={12} />}
        </Fld>
      </div>
      <p className="note anteprima" aria-live="polite">{anteprima ? <>Nel sito comparirà come <b>{anteprima}</b></> : 'Il nome compare come "Cognome I." (per esempio Rossi M. o Rossi S.C.); senza iniziali, il solo nome scritto.'}</p>

      <fieldset>
        <legend className="etich-campo">Livello segreto</legend>
        <ScalaLivello valore={livello} onCambia={setLivello} />
      </fieldset>

      <fieldset>
        <legend className="etich-campo">Badge</legend>
        {badge.length === 0 && <p className="note">Non ci sono badge: creali nella sezione Badge.</p>}
        {(['positivo', 'negativo'] as const).map((t) => (
          tipoBadge(t).length > 0 && (
            <div key={t} className="gruppo-chip">
              <p className="note">{t === 'positivo' ? 'Positivi' : 'Negativi'}</p>
              <div className="chips">
                {tipoBadge(t).map((b) => (
                  <button key={b.id} type="button" className={`chip${t === 'negativo' ? ' neg' : ''}`} aria-pressed={suoi.includes(b.id)} onClick={() => setSuoi(suoi.includes(b.id) ? suoi.filter((x) => x !== b.id) : [...suoi, b.id])}>
                    {b.nome}<span className="sr"> (badge {t})</span>
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
      </fieldset>

      {g !== null && (
        <Pulsante className="blocco" aria-pressed={!attivo} onClick={() => setAttivo(!attivo)}>
          {attivo ? 'Archivia il giocatore' : 'Archiviato: tocca per riattivarlo'}
        </Pulsante>
      )}
      {g !== null && !attivo && <p className="note">Un giocatore archiviato sparisce dal listone pubblico e dai convocabili, ma resta nello storico.</p>}

      <div className="azioni-modulo">
        <button type="submit" className="btn yes" disabled={!valido || occupato || invariato} aria-busy={occupato}>
          <Icona id="i-check" />{occupato ? 'Salvataggio…' : g ? 'Salva le modifiche' : 'Aggiungi il giocatore'}
        </button>
        {invariato && <span className="note">Nessuna modifica da salvare</span>}
      </div>
      <EsitoScrittura esito={esito} />
    </form>
  )
}
