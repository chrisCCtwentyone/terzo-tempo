import type { ReactNode } from 'react'
import { voto } from '../lib/formato'
import type { Badge, Codice, Partita } from '../lib/tipi'
import { Carta, Figurina, Pulsante, Sezione, Tabellone } from '../ui'
import { Contatore, Fld } from './comuni'
import { CODICI, VOTI, mancaPerGiocare, punteggio, senzaSquadra, squadraDi, type Riga } from './logica'

/**
 * Risultato: gol e autogol per giocatore (contatori grandi), voto in pagella da 1 a 10 a mezzi punti (anche vuoto),
 * cronaca facoltativa. Il punteggio si calcola da gol e autogol; gli avvisi sono quelli del backend.
 */
export function Risultato({ righe, onCambia, p, cronaca, onCronaca, avvisi, occupato, onGiocata, onAggiornaRisultato, badge }: {
  righe: Riga[]
  onCambia: (r: Riga[]) => void
  p: Partita
  cronaca: string
  onCronaca: (t: string) => void
  avvisi: string[]
  occupato: boolean
  onGiocata: () => void
  onAggiornaRisultato: (a: number, b: number) => void
  badge: (id: number) => Badge[]
}) {
  const giocata = p.stato === 'giocata'
  const nomi = Object.fromEntries(p.squadre.map((s) => [s.codice, s.nome])) as Record<Codice, string>
  const sc = punteggio(righe)
  const salvato = { A: p.squadre.find((s) => s.codice === 'A')?.gol ?? null, B: p.squadre.find((s) => s.codice === 'B')?.gol ?? null }
  const diverso = giocata && (salvato.A !== sc.A || salvato.B !== sc.B)
  const manca = giocata ? [] : mancaPerGiocare(righe, nomi)
  const cambia = (id: number, campi: Partial<Riga>) => onCambia(righe.map((r) => (r.giocatore_id === id ? { ...r, ...campi } : r)))
  const senza = senzaSquadra(righe).length

  return (
    <>
      <Carta className="hero">
        <Tabellone squadre={p.squadre.map((s) => ({ ...s, gol: sc[s.codice] }))} stato={p.stato} piccolo />
        <p className="note calcolo">Il punteggio si calcola dai gol e dagli autogol qui sotto: un autogol vale un gol per gli avversari.</p>
      </Carta>

      {avvisi.length > 0 && (
        <div className="avvisi" role="alert">
          <p><strong>I conti non tornano:</strong></p>
          <ul>{avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {diverso && (
        <div className="avvisi" role="status">
          <p>Il risultato salvato è {salvato.A ?? '–'} a {salvato.B ?? '–'}, ma gol e autogol inseriti fanno {sc.A} a {sc.B}.</p>
          <Pulsante onClick={() => onAggiornaRisultato(sc.A, sc.B)} disabled={occupato}>Aggiorna il risultato a {sc.A}-{sc.B}</Pulsante>
        </div>
      )}
      {senza > 0 && <p className="note">{senza} {senza === 1 ? 'convocato senza squadra non compare' : 'convocati senza squadra non compaiono'} qui: assegnali nella sezione Squadre.</p>}

      {CODICI.map((c) => (
        <section key={c} aria-label={`Giocatori ${nomi[c]}`}>
          <h3 className={`ph ${c === 'A' ? 'a' : 'b'} intesta`}>{nomi[c]}</h3>
          {squadraDi(righe, c).length === 0 && <Carta className="vuota">Nessun giocatore in questa squadra.</Carta>}
          <ul className="list" style={{ marginTop: 0 }}>
            {squadraDi(righe, c).map((r) => (
              <li key={r.giocatore_id}>
                <Carta className="rr">
                  <div className="rr-testa">
                    <Figurina id={r.giocatore_id} nome={r.nome} z={36} decorativa badge={badge(r.giocatore_id)} />
                    <b className="nome">{r.nome}</b>
                    <div className="voto-sel">
                      <label htmlFor={`v${r.giocatore_id}`} className="cap">Voto</label>
                      <select id={`v${r.giocatore_id}`} value={r.voto_pagella === null ? '' : String(r.voto_pagella)} onChange={(e) => cambia(r.giocatore_id, { voto_pagella: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">–</option>
                        {VOTI.map((v) => <option key={v} value={String(v)}>{voto(v)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="rr-cnt">
                    <Cap testo="Gol"><Contatore etichetta={`Gol di ${r.nome}`} valore={r.gol} onCambia={(v) => cambia(r.giocatore_id, { gol: v })} /></Cap>
                    <Cap testo="Autogol"><Contatore etichetta={`Autogol di ${r.nome}`} valore={r.autogol} autogol onCambia={(v) => cambia(r.giocatore_id, { autogol: v })} /></Cap>
                  </div>
                </Carta>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sezione>Cronaca</Sezione>
      <Carta>
        <Fld etichetta="Cronaca (facoltativa)" aiuto={`${cronaca.length} su 5000 caratteri. Se la lasci vuota, la pagina della partita sta bene lo stesso.`}>
          {(pr) => <textarea {...pr} value={cronaca} onChange={(e) => onCronaca(e.target.value)} maxLength={5000} rows={5} />}
        </Fld>
      </Carta>

      {!giocata && (
        <>
          <Sezione>A partita finita</Sezione>
          <Carta>
            <p>Il risultato sarà <strong>{nomi.A} {sc.A} – {sc.B} {nomi.B}</strong>. Dopo “Segna come giocata” si apre il voto MVP.</p>
            {manca.length > 0 && <ul className="manca">{manca.map((m) => <li key={m}>{m}</li>)}</ul>}
            <div className="azioni-modulo">
              <Pulsante variante="yes" className="blocco" onClick={onGiocata} disabled={occupato || manca.length > 0} aria-busy={occupato}>Segna come giocata</Pulsante>
            </div>
          </Carta>
        </>
      )}
    </>
  )
}

function Cap({ testo, children }: { testo: string; children: ReactNode }) {
  return <div className="cnt-w"><span className="cap" aria-hidden="true">{testo}</span>{children}</div>
}
