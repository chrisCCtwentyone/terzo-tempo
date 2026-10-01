import { useMemo, useState } from 'react'
import { leggi } from '../lib/api'
import { giornoOra, plurale } from '../lib/formato'
import type { Badge, Diretta, Mvp, Stagione } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { Link, useRotta, useTitolo, vai } from '../router'
import { Attesa, Badges, Carta, Figurina, Icona, Intestazione, Pulsante, PulsanteLink, Scelta, Sezione } from '../ui'
import { CampoModuli } from './CampoModuli'
import { Conferma, EsitoScrittura, Fld, useEsito } from './comuni'
import { ScegliConvocati } from './Convocati'
import { CODICI, applicaProposta, assegna, corpoConvocati, impronta, isoARomaLocale, nuovaRiga, senzaSquadra, squadraDi, togli, type Riga } from './logica'
import { MvpAdmin } from './MvpAdmin'
import { scrivi } from './rete'
import { Risultato } from './Risultato'
import { SceltaCampo } from './SceltaCampo'
import type { CampoAdmin, GiocatoreAdmin, PartitaAdmin as Dati, Proposta } from './tipi'

const SEZIONI = [
  { valore: 'convocati', etichetta: 'Convocati' },
  { valore: 'squadre', etichetta: 'Squadre' },
  { valore: 'campo', etichetta: 'Campo' },
  { valore: 'risultato', etichetta: 'Risultato' },
  { valore: 'mvp', etichetta: 'MVP' },
  { valore: 'partita', etichetta: 'Partita' },
] as const
type Sez = (typeof SEZIONI)[number]['valore']
const CON_SALVATAGGIO: Sez[] = ['convocati', 'squadre', 'campo', 'risultato']

/** Gestione di una partita: convocati, squadre (generatore e ritocco), campo, risultato, MVP, modifica ed eliminazione. */
export function PartitaAdmin({ id }: { id: number }) {
  useTitolo('Partita · Admin')
  const partita = useApi<Dati>(`/api/partite/${id}`)
  const giocatori = useApi<{ giocatori: GiocatoreAdmin[] }>('/api/admin/giocatori')
  const badge = useApi<{ badge: Badge[] }>('/api/admin/badge')
  const stagioni = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const campi = useApi<{ campi: CampoAdmin[] }>('/api/admin/campi')
  // il pubblico vede il campo ma non il suo id: per la tendina serve quello dell'admin
  const admin = useApi<{ campo_id: number | null }>(`/api/admin/partite/${id}`)
  const diretta = useApi<Diretta>(`/api/admin/partite/${id}/diretta`)
  const carico = {
    dati: partita.dati && giocatori.dati && badge.dati && stagioni.dati && campi.dati && admin.dati && diretta.dati
      ? { p: partita.dati, g: giocatori.dati.giocatori, b: badge.dati.badge, s: stagioni.dati.stagioni, c: campi.dati.campi, campoId: admin.dati.campo_id, d: diretta.dati }
      : null,
    errore: partita.errore ?? giocatori.errore ?? badge.errore ?? stagioni.errore ?? campi.errore ?? admin.errore ?? diretta.errore,
    ricarica: () => { partita.ricarica(); giocatori.ricarica(); badge.ricarica(); stagioni.ricarica(); campi.ricarica(); admin.ricarica(); diretta.ricarica() },
  }
  return (
    <>
      <Link verso="/admin/partite" className="indietro"><Icona id="i-arrow" />Tutte le partite</Link>
      <Attesa carico={carico} testo="Carico la partita…" figli={({ p, g, b, s, c, campoId, d }) => <Editor iniziale={p} giocatori={g} badge={b} stagioni={s} campi={c} campoId={campoId} direttaIniziale={d} />} />
    </>
  )
}

function Editor({ iniziale, giocatori, badge, stagioni, campi, campoId, direttaIniziale }: { iniziale: Dati; giocatori: GiocatoreAdmin[]; badge: Badge[]; stagioni: Stagione[]; campi: CampoAdmin[]; campoId: number | null; direttaIniziale: Diretta }) {
  const id = iniziale.id
  const { parametri } = useRotta()
  const [p, setP] = useState<Dati>(iniziale)
  const [righe, setRighe] = useState<Riga[]>(iniziale.giocatori)
  const [cronaca, setCronaca] = useState(iniziale.cronaca ?? '')
  const [avvisi, setAvvisi] = useState<string[]>([])
  const inizio = parametri.get('sez')
  const [sez, setSez] = useState<Sez>(SEZIONI.some((s) => s.valore === inizio) ? (inizio as Sez) : iniziale.stato === 'giocata' ? 'risultato' : 'squadre')
  const { esito, esegui, occupato } = useEsito()

  const badgeDi = useMemo(() => new Map(giocatori.map((g) => [g.id, badge.filter((b) => g.badge_ids.includes(b.id))])), [giocatori, badge])
  const badgeId = (gid: number) => badgeDi.get(gid) ?? []
  const nomi = Object.fromEntries(p.squadre.map((s) => [s.codice, s.nome])) as Record<'A' | 'B', string>
  const giocata = p.stato === 'giocata'
  const sporche = impronta(righe, cronaca) !== impronta(p.giocatori, p.cronaca ?? '')
  const righeSporche = impronta(righe, '') !== impronta(p.giocatori, '')

  const rileggi = async () => setP(await leggi<Dati>(`/api/partite/${id}`))

  /** Scrive tutto quello che e' cambiato (convocati, squadre, posizioni, gol, voti; cronaca). Se fallisce nulla va perso: la bozza resta. */
  async function scriviTutto(): Promise<Dati> {
    let ultimo = p
    if (righeSporche) {
      ultimo = await scrivi<Dati>('PUT', `/api/admin/partite/${id}/convocati`, corpoConvocati(righe))
      setAvvisi(ultimo.avvisi ?? [])
    }
    if (cronaca.trim() !== (p.cronaca ?? '').trim()) {
      await scrivi('PATCH', `/api/admin/partite/${id}`, { cronaca: cronaca.trim() || null })
      ultimo = await leggi<Dati>(`/api/partite/${id}`)
    }
    setP(ultimo)
    return ultimo
  }

  const salva = () => esegui('Salvataggio', scriviTutto, 'Salvato')

  async function genera() {
    const r = await esegui('Genero le squadre', async () => {
      if (righeSporche) await scriviTutto() // il generatore parte dai convocati SALVATI
      return scrivi<Proposta>('POST', `/api/admin/partite/${id}/genera-squadre`, {})
    }, 'Proposta pronta: ritoccala a mano e poi salva')
    if (r) setRighe((prima) => applicaProposta(prima, r.squadre))
  }

  async function segnaGiocata() {
    const r = await esegui('Segno la partita come giocata', async () => {
      if (sporche) await scriviTutto()
      const punti = { A: 0, B: 0 }
      for (const x of righe) if (x.squadra) { punti[x.squadra] += x.gol; punti[x.squadra === 'A' ? 'B' : 'A'] += x.autogol }
      const ris = await scrivi<Dati>('POST', `/api/admin/partite/${id}/giocata`, { gol_a: punti.A, gol_b: punti.B })
      setP(ris)
      setAvvisi(ris.avvisi ?? [])
      return ris
    }, 'Partita segnata come giocata: il voto MVP è aperto')
    if (r) setSez('mvp')
  }

  async function aggiornaRisultato(a: number, b: number) {
    const ok = await esegui('Aggiorno il risultato', async () => {
      await scrivi('PATCH', `/api/admin/partite/${id}`, { gol_a: a, gol_b: b })
      await rileggi()
      setAvvisi([])
    }, `Risultato aggiornato: ${a}-${b}`)
    return ok
  }

  return (
    <>
      <Intestazione kick={`Admin · ${giornoOra(p.data_ora)}`} titolo="Partita" />
      <p className="stato-partita">
        <i className={`tu${giocata ? '' : ' chiusa'}`}>{giocata ? 'Giocata' : 'In convocazione'}</i>
        <Link verso={`/partite/${id}`} className="indietro">Vedi la pagina pubblica</Link>
      </p>
      {!giocata && <CartaDiretta id={id} iniziale={direttaIniziale} salvata={p.giocatori} sporche={righeSporche} onSquadre={() => setSez('squadre')} />}
      <Scelta tipo="pillole" etichetta="Sezioni della partita" voci={[...SEZIONI]} valore={sez} onScegli={setSez} />

      {sez === 'convocati' && (
        <>
          <Sezione>Convocati</Sezione>
          {giocata ? (
            <Carta className="vuota">La partita è già stata giocata: i convocati non si cambiano qui. Per correggere gol e voti usa la sezione Risultato.</Carta>
          ) : (
            <Carta>
              <p className="note" style={{ marginTop: 0 }} aria-live="polite">{righe.length} {plurale(righe.length, 'convocato', 'convocati')}. Tocca una figurina per convocare o togliere.</p>
              <ScegliConvocati
                giocatori={giocatori}
                scelti={righe.map((r) => r.giocatore_id)}
                onCambia={(gid, si) => setRighe(si ? [...righe, nuovaRiga(gid, giocatori.find((g) => g.id === gid)!.nome)] : togli(righe, gid))}
                badge={(g) => badgeId(g.id)}
              />
            </Carta>
          )}
        </>
      )}

      {sez === 'squadre' && (
        <>
          <Sezione>Squadre</Sezione>
          <Carta>
            <p>Il generatore propone due squadre bilanciate dai convocati. Poi le ritocchi a mano con un tocco e salvi.</p>
            <div className="azioni-modulo">
              <Pulsante variante="ghost" onClick={genera} disabled={occupato || righe.length < 2} aria-busy={occupato}>{righe.some((r) => r.squadra) ? 'Rigenera le squadre' : 'Genera squadre'}</Pulsante>
            </div>
            {righe.length < 2 && <p className="note">Servono almeno 2 convocati.</p>}
          </Carta>
          {CODICI.map((c) => (
            <section key={c} aria-label={`Squadra ${nomi[c]}`}>
              <h3 className={`ph ${c === 'A' ? 'a' : 'b'} intesta`}>{nomi[c]} · {squadraDi(righe, c).length}</h3>
              {squadraDi(righe, c).length === 0 && <Carta className="vuota">Nessun giocatore: genera le squadre o assegnali dall'elenco qui sotto.</Carta>}
              <ul className="list" style={{ marginTop: 0 }}>
                {squadraDi(righe, c).map((r) => (
                  <RigaSquadra key={r.giocatore_id} r={r} badge={badgeId(r.giocatore_id)} azioni={[{ verso: c === 'A' ? 'B' : 'A', nome: nomi[c === 'A' ? 'B' : 'A'] }]} onSposta={(v) => setRighe(assegna(righe, r.giocatore_id, v))} />
                ))}
              </ul>
            </section>
          ))}
          {senzaSquadra(righe).length > 0 && (
            <section aria-label="Senza squadra">
              <h3 className="ph intesta neutra">Senza squadra · {senzaSquadra(righe).length}</h3>
              <ul className="list" style={{ marginTop: 0 }}>
                {senzaSquadra(righe).map((r) => (
                  <RigaSquadra key={r.giocatore_id} r={r} badge={badgeId(r.giocatore_id)} azioni={[{ verso: 'A', nome: nomi.A }, { verso: 'B', nome: nomi.B }]} onSposta={(v) => setRighe(assegna(righe, r.giocatore_id, v))} />
                ))}
              </ul>
            </section>
          )}
          {Math.abs(squadraDi(righe, 'A').length - squadraDi(righe, 'B').length) > 1 && <p className="note">Le squadre hanno numeri diversi ({squadraDi(righe, 'A').length} contro {squadraDi(righe, 'B').length}).</p>}
          <p className="note">Spostare un giocatore azzera le posizioni sul campo delle squadre coinvolte: le sistemi nella sezione Campo.</p>
        </>
      )}

      {sez === 'campo' && (
        <>
          <Sezione>Campo</Sezione>
          <CampoModuli righe={righe} squadre={p.squadre} onCambia={setRighe} badge={badgeId} />
        </>
      )}

      {sez === 'risultato' && (
        <>
          <Sezione>Risultato</Sezione>
          <Risultato righe={righe} onCambia={setRighe} p={p} cronaca={cronaca} onCronaca={setCronaca} avvisi={avvisi} occupato={occupato} onGiocata={segnaGiocata} onAggiornaRisultato={aggiornaRisultato} badge={badgeId} />
        </>
      )}

      {sez === 'mvp' && (
        <>
          <Sezione>Voto MVP</Sezione>
          <MvpAdmin p={p} onMvp={(m: Mvp) => setP({ ...p, mvp: m })} rileggi={rileggi} badge={badgeId} />
        </>
      )}

      {sez === 'partita' && <ModificaPartita p={p} stagioni={stagioni} campi={campi} campoIniziale={campoId} onFatto={rileggi} />}

      {CON_SALVATAGGIO.includes(sez) && (
        <div className="barra-salva" role="region" aria-label="Salvataggio">
          <span className={`stato-mod${sporche ? ' sporco' : ''}`} role="status">{sporche ? 'Modifiche non salvate' : 'Tutto salvato'}</span>
          <Pulsante variante={sporche ? 'yes' : ''} onClick={salva} disabled={occupato || !sporche} aria-busy={occupato}>{occupato ? 'Salvataggio…' : 'Salva'}</Pulsante>
        </div>
      )}
      <EsitoScrittura esito={esito} />
    </>
  )
}

/**
 * La diretta della partita: "Inizia diretta" (solo con le squadre assegnate E salvate: il server controlla quelle salvate), poi LIVE.
 * Se nessuno la preme, parte da sola all'orario della partita (se ci sono le squadre).
 */
function CartaDiretta({ id, iniziale, salvata, sporche, onSquadre }: { id: number; iniziale: Diretta; salvata: Riga[]; sporche: boolean; onSquadre: () => void }) {
  const [d, setD] = useState<Diretta>(iniziale)
  const { esito, esegui, occupato } = useEsito()
  const squadreOk = CODICI.every((c) => salvata.some((r) => r.squadra === c))

  async function inizia() {
    const r = await esegui('Avvio la diretta', () => scrivi<{ diretta: Diretta }>('POST', `/api/admin/partite/${id}/diretta/inizia`, {}), 'Diretta avviata')
    if (r) {
      setD(r.diretta)
      vai(`/admin/partite/${id}/live`)
    }
  }

  return (
    <Carta className="carta-diretta">
      {d.stato === 'in_diretta' ? (
        <>
          <p className="stato-diretta"><span className="live-dot" aria-hidden="true" /> <b>In diretta adesso</b></p>
          <div className="azioni-modulo"><PulsanteLink variante="ghost" className="blocco lg" verso={`/admin/partite/${id}/live`}>Apri LIVE</PulsanteLink></div>
        </>
      ) : d.stato === 'da_confermare' ? (
        <>
          <p className="stato-diretta"><b>Diretta finita</b>: il risultato aspetta la tua conferma.</p>
          <div className="azioni-modulo"><PulsanteLink variante="ghost" className="blocco lg" verso={`/admin/partite/${id}/live`}>Vedi i gol della diretta</PulsanteLink></div>
          <p className="note">I voti in pagella e “Segna come giocata” sono nella sezione Risultato.</p>
        </>
      ) : (
        <>
          <p className="stato-diretta"><b>Diretta</b>: segna i gol mentre si gioca, anche con poco segnale.</p>
          {squadreOk ? (
            <div className="azioni-modulo">
              <Pulsante variante="yes" className="blocco lg" onClick={inizia} disabled={occupato || sporche} aria-busy={occupato}>Inizia diretta</Pulsante>
            </div>
          ) : (
            <>
              <p className="note">Per iniziare servono le squadre: assegna almeno un giocatore a ciascuna e salva.</p>
              <div className="azioni-modulo"><Pulsante className="blocco lg" onClick={onSquadre}>Vai alle Squadre</Pulsante></div>
            </>
          )}
          {squadreOk && sporche && <p className="note">Salva prima le modifiche: la diretta usa le squadre salvate.</p>}
          <p className="note">Se non la inizi tu, parte da sola all'orario della partita.</p>
        </>
      )}
      <EsitoScrittura esito={esito} />
    </Carta>
  )
}

function RigaSquadra({ r, badge, azioni, onSposta }: { r: Riga; badge: Badge[]; azioni: { verso: 'A' | 'B'; nome: string }[]; onSposta: (v: 'A' | 'B') => void }) {
  return (
    <li>
      <Carta className="rsq">
        <Figurina id={r.giocatore_id} nome={r.nome} z={40} decorativa badge={badge} />
        <span className="who"><b>{r.nome}</b><Badges badge={badge} /></span>
        <span className="sposta">
          {azioni.map((a) => (
            <button key={a.verso} type="button" className={`btn sp ${a.verso === 'A' ? 'no' : 'blu'}`} aria-label={`Sposta ${r.nome} in ${a.nome}`} onClick={() => onSposta(a.verso)}>
              <span aria-hidden="true">{r.squadra ? 'Sposta' : ''} {a.nome}</span>
              <Icona id="i-arrow" />
            </button>
          ))}
        </span>
      </Carta>
    </li>
  )
}

function ModificaPartita({ p, stagioni, campi, campoIniziale, onFatto }: { p: Dati; stagioni: Stagione[]; campi: CampoAdmin[]; campoIniziale: number | null; onFatto: () => Promise<void> }) {
  const [dataOra, setDataOra] = useState(isoARomaLocale(p.data_ora))
  const [stagione, setStagione] = useState(String(p.stagione_id))
  // il campo salvato sul server ('' = nessuno); si aggiorna dopo ogni salvataggio
  const [campoSalvato, setCampoSalvato] = useState(campoIniziale === null ? '' : String(campoIniziale))
  const [campo, setCampo] = useState(campoSalvato)
  const [chiedi, setChiedi] = useState(false)
  const { esito, esegui, occupato } = useEsito()
  const cambiata = dataOra !== isoARomaLocale(p.data_ora) || Number(stagione) !== p.stagione_id || campo !== campoSalvato

  async function salva() {
    const corpo: Record<string, unknown> = {}
    if (dataOra !== isoARomaLocale(p.data_ora)) corpo.data_ora = dataOra
    if (Number(stagione) !== p.stagione_id) corpo.stagione_id = Number(stagione)
    if (campo !== campoSalvato) corpo.campo_id = campo === '' ? null : Number(campo)
    const ok = await esegui('Salvataggio', async () => { await scrivi('PATCH', `/api/admin/partite/${p.id}`, corpo); setCampoSalvato(campo); await onFatto() }, 'Partita modificata')
    return ok
  }
  async function elimina() {
    const ok = await esegui('Eliminazione', () => scrivi('DELETE', `/api/admin/partite/${p.id}`), 'Partita eliminata')
    if (ok) vai('/admin/partite')
    else setChiedi(false)
  }

  return (
    <>
      <Sezione>Data, stagione e campo</Sezione>
      <Carta>
        <form className="modulo" onSubmit={(e) => { e.preventDefault(); void salva() }} noValidate>
          <Fld etichetta="Data e ora" aiuto={p.stato === 'giocata' ? 'Cambiare l\'orario sposta anche la chiusura automatica del voto MVP.' : 'Ora di Roma.'}>
            {(pr) => <input {...pr} type="datetime-local" value={dataOra} onChange={(e) => setDataOra(e.target.value)} required />}
          </Fld>
          <Fld etichetta="Stagione">
            {(pr) => <select {...pr} value={stagione} onChange={(e) => setStagione(e.target.value)}>{stagioni.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.aperta ? ' (aperta)' : ''}</option>)}</select>}
          </Fld>
          <SceltaCampo campi={campi} valore={campo} onCambia={setCampo} />
          <div className="azioni-modulo">
            <button type="submit" className="btn yes" disabled={!cambiata || dataOra === '' || occupato} aria-busy={occupato}><Icona id="i-check" />Salva le modifiche</button>
          </div>
        </form>
      </Carta>
      <Sezione>Elimina</Sezione>
      <Carta>
        {p.stato === 'giocata' ? (
          <p className="note" style={{ marginTop: 0 }}>Una partita già giocata non si può eliminare: il server lo vieta per non perdere gol, voti e MVP.</p>
        ) : !chiedi ? (
          <>
            <p style={{ marginTop: 0 }}>Elimina la partita e i suoi convocati. Non si può annullare.</p>
            <div className="azioni-modulo"><Pulsante variante="no" onClick={() => setChiedi(true)} disabled={occupato}>Elimina la partita</Pulsante></div>
          </>
        ) : (
          <Conferma pericolo domanda={<>Eliminare la partita del {giornoOra(p.data_ora)} con i suoi convocati? Non si può annullare.</>} conferma="Sì, elimina" onConferma={elimina} onAnnulla={() => setChiedi(false)} occupato={occupato} />
        )}
      </Carta>
      <EsitoScrittura esito={esito} />
    </>
  )
}
