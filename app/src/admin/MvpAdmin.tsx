import { useState } from 'react'
import { giornoOra, plurale } from '../lib/formato'
import type { Badge, Mvp, Partita } from '../lib/tipi'
import { Bollino, Carta, Cart, Figurina, Pulsante } from '../ui'
import { Conferma, EsitoScrittura, useEsito } from './comuni'
import { scrivi } from './rete'

type Scelta = { id: number; nome: string }

/** MVP: stato e numero dei voti, "Chiudi voto ora", scelta fra i pari merito o (senza voti) fra i giocatori della partita. */
export function MvpAdmin({ p, onMvp, rileggi, badge }: { p: Partita; onMvp: (m: Mvp) => void; rileggi: () => void; badge: (id: number) => Badge[] }) {
  const m = p.mvp
  const { esito, esegui, occupato } = useEsito()
  const [chiudi, setChiudi] = useState(false)
  const [scelto, setScelto] = useState<number | null>(null)

  const chiudiOra = async () => {
    const r = await esegui('Chiudo il voto', () => scrivi<Mvp>('POST', `/api/admin/partite/${p.id}/mvp/chiudi`), 'Voto chiuso')
    setChiudi(false)
    if (r) onMvp(r)
  }
  const decidi = async () => {
    if (scelto === null) return
    const r = await esegui('Assegno l\'MVP', () => scrivi<Mvp>('POST', `/api/admin/partite/${p.id}/mvp/decidi`, { giocatore_id: scelto }), 'MVP assegnato')
    if (r) { onMvp(r); setScelto(null) }
  }

  const candidati: Scelta[] = m.stato === 'parita_da_decidere'
    ? m.candidati.map((c) => ({ id: c.giocatore_id, nome: c.nome }))
    : m.stato === 'nessun_voto'
      ? p.giocatori.filter((g) => g.squadra !== null).map((g) => ({ id: g.giocatore_id, nome: g.nome }))
      : []
  const chi = candidati.find((c) => c.id === scelto)

  return (
    <>
      {m.stato === 'non_aperto' && <Carta className="vuota">La partita non è ancora stata giocata: il voto MVP si apre quando la segni come giocata.</Carta>}

      {m.stato === 'aperto' && (
        <Carta>
          <div className="voto-testa">
            <div>
              <b>Voto aperto</b>
              <p className="note" style={{ marginTop: 2 }}>chiude {giornoOra(m.chiude_il)}, o quando lo chiudi tu</p>
            </div>
            <div className="conto" aria-label={`${m.voti_totali} ${plurale(m.voti_totali, 'voto', 'voti')}`}>{m.voti_totali}<small>{plurale(m.voti_totali, 'voto', 'voti')}</small></div>
          </div>
          <p className="note">Finché il voto è aperto si vede solo quanti hanno votato: il risultato esce alla chiusura.</p>
          {!chiudi && (
            <div className="azioni-modulo">
              <Pulsante variante="no" onClick={() => setChiudi(true)} disabled={occupato}>Chiudi voto ora</Pulsante>
              <Pulsante onClick={rileggi} disabled={occupato}>Aggiorna il conteggio</Pulsante>
            </div>
          )}
          {chiudi && (
            <Conferma pericolo domanda={<>Chiudere il voto adesso? Nessuno potrà più votare{m.voti_totali === 0 ? ' e non ha votato nessuno' : ` (finora ${m.voti_totali} ${plurale(m.voti_totali, 'voto', 'voti')})`}.</>} conferma="Sì, chiudi il voto" onConferma={chiudiOra} onAnnulla={() => setChiudi(false)} occupato={occupato} />
          )}
        </Carta>
      )}

      {m.stato === 'assegnato' && (
        <Carta>
          <div className="vincitore">
            <div>
              <small>{m.voti_totali === 0 ? 'MVP scelto dall\'admin' : 'MVP della partita'}</small>
              <strong>{m.vincitore?.nome ?? '—'}</strong>
            </div>
            <Bollino />
          </div>
          <p className="note">{m.voti_totali === 0 ? 'Nessun voto ricevuto: l\'MVP è stato scelto da un admin.' : `Voti ricevuti: ${m.voti_totali} in tutto.`}</p>
          {m.risultati.length > 0 && <ul className="ris">{m.risultati.map((r) => <li key={r.giocatore_id}><span>{r.nome}</span><b>{r.voti}</b></li>)}</ul>}
        </Carta>
      )}

      {(m.stato === 'parita_da_decidere' || m.stato === 'nessun_voto') && (
        <Carta>
          <p>
            <strong>{m.stato === 'parita_da_decidere' ? 'Parità: scegli l\'MVP fra i pari merito.' : 'Nessuno ha votato: scegli tu l\'MVP fra i giocatori della partita.'}</strong>
          </p>
          {m.stato === 'parita_da_decidere' && m.risultati.length > 0 && <p className="note">Hanno preso {m.risultati[0].voti} {plurale(m.risultati[0].voti, 'voto', 'voti')} ciascuno.</p>}
          <fieldset>
            <legend className="sr">Scegli l'MVP</legend>
            <div className="vota conv-scelta">
              {candidati.map((c) => (
                <label key={c.id}>
                  <input type="radio" className="sr" name="mvp-admin" value={c.id} checked={scelto === c.id} onChange={() => setScelto(c.id)} />
                  <Figurina id={c.id} nome={c.nome} z={46} decorativa badge={badge(c.id)} />
                  <span className="sr">{c.nome}</span>
                  <Cart nome={c.nome} />
                </label>
              ))}
            </div>
          </fieldset>
          {chi && <Conferma domanda={<>Assegnare l'MVP a <strong>{chi.nome}</strong>? Poi non si cambia.</>} conferma="Conferma l'MVP" onConferma={decidi} onAnnulla={() => setScelto(null)} occupato={occupato} />}
        </Carta>
      )}
      <EsitoScrittura esito={esito} />
    </>
  )
}
