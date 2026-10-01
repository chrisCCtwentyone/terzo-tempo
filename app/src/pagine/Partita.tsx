import { useEffect } from 'react'
import { giornoAnno } from '../lib/formato'
import { useBadge } from '../lib/listone'
import type { Partita as Dati } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useDiretta } from '../lib/useDiretta'
import { Link, useTitolo } from '../router'
import { Attesa, Campo, Carta, Cart, Figurina, Icona, Intestazione, Luogo, Marcatori, Pagella, Sezione, Tabellone } from '../ui'
import { BloccoDiretta } from './Diretta'
import { BloccoMvp, BollinoMvp, EsitoMvp } from './Mvp'

function Dettaglio({ p, ricarica, dir }: { p: Dati; ricarica: () => void; dir: ReturnType<typeof useDiretta> }) {
  const badge = useBadge()
  const giocata = p.stato === 'giocata'
  const inCampo = p.giocatori.filter((g) => g.squadra !== null)
  const mvpId = p.mvp.stato === 'assegnato' ? (p.mvp.vincitore?.giocatore_id ?? null) : null
  // la diretta: solo per una partita non ancora giocata; si aggiorna da sola finche' e' IN DIRETTA (la legge Partita, qui sopra)
  const d = dir.dati
  const inDiretta = !giocata && d && (d.stato === 'in_diretta' || d.stato === 'da_confermare') ? { ...d, stato: d.stato } : null
  // se nel frattempo l'admin l'ha segnata giocata, si rilegge il dettaglio (punteggio ufficiale, marcatori, pagelle)
  const rileggi = d?.stato === 'finita' && !giocata
  useEffect(() => {
    if (rileggi) ricarica()
  }, [rileggi, ricarica])
  return (
    <>
      <Carta className={`hero att${inDiretta ? ' diretta' : ''}`}>
        {inDiretta ? <BloccoDiretta d={inDiretta} nuovi={dir.nuovi} /> : <Tabellone squadre={p.squadre} stato={p.stato} piccolo />}
        {giocata && <Marcatori partita={p} />}
        <div className="foot" style={{ borderTop: '2px solid var(--edge)' }}>
          <div>
            <p className="dt">{giornoAnno(p.data_ora)}</p>
            <Luogo campo={p.campo} />
            <EsitoMvp partita={p} dentro />
          </div>
          <BollinoMvp mvp={p.mvp} />
        </div>
      </Carta>

      {!giocata && (
        <>
          <Sezione>Convocati</Sezione>
          {p.giocatori.length === 0 ? (
            <Carta className="vuota">Convocati non ancora inseriti.</Carta>
          ) : (
            <Carta>
              <ul className="conv" style={{ marginTop: 0 }}>
                {p.giocatori.map((g, k) => (
                  <li key={g.giocatore_id} className="att" style={{ '--i': k } as React.CSSProperties}>
                    <Figurina id={g.giocatore_id} nome={g.nome} z={44} badge={badge(g.giocatore_id)} />
                    <Cart nome={g.nome} />
                  </li>
                ))}
              </ul>
            </Carta>
          )}
        </>
      )}

      {inCampo.length > 0 && (
        <>
          <Sezione>Formazioni</Sezione>
          <Campo giocatori={inCampo} squadre={p.squadre} conVoti={giocata} mvpId={mvpId} badge={badge} />
        </>
      )}

      {giocata && inCampo.length > 0 && (
        <>
          <Sezione>Pagella</Sezione>
          <Carta><Pagella giocatori={inCampo} squadre={p.squadre} badge={badge} /></Carta>
        </>
      )}

      {p.cronaca && (
        <>
          <Sezione>Cronaca</Sezione>
          <Carta className="cron"><p>{p.cronaca}</p><small>Scritta dall'admin</small></Carta>
        </>
      )}

      <BloccoMvp partita={p} ricarica={ricarica} badge={badge} />
    </>
  )
}

export function Partita({ id }: { id: string }) {
  const carico = useApi<Dati>(`/api/partite/${encodeURIComponent(id)}`)
  const p = carico.dati
  // la diretta: solo per una partita non ancora giocata; si aggiorna da sola finche' e' IN DIRETTA
  const dir = useDiretta(Number(id), p !== null && p.stato === 'convocazione')
  const statoDir = dir.dati?.stato
  const kick = !p ? 'Terzo Tempo'
    : p.stato === 'giocata' ? `Partita giocata · ${giornoAnno(p.data_ora)}`
    : statoDir === 'in_diretta' ? `In diretta · ${giornoAnno(p.data_ora)}`
    : statoDir === 'da_confermare' ? `Risultato da confermare · ${giornoAnno(p.data_ora)}`
    : `Prossima partita · ${giornoAnno(p.data_ora)}`
  useTitolo(p ? p.squadre.map((s) => s.nome).join(' – ') : 'Partita')
  return (
    <>
      <Link verso="/partite" className="indietro"><Icona id="i-arrow" />Tutte le partite</Link>
      <Intestazione kick={kick} titolo="Partita" />
      <Attesa carico={carico} testo="Carico la partita…" figli={(d) => <Dettaglio p={d} ricarica={carico.ricarica} dir={dir} />} />
    </>
  )
}

