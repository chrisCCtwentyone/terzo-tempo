import { dataBreve, giornoAnno, iniziali, media, numero, plurale, tinta } from '../lib/formato'
import { useApi } from '../lib/useCarica'
import type { Scheda as Dati, Stagione, Totali } from '../lib/tipi'
import { Link, useTitolo } from '../router'
import { Attesa, Badges, Bollino, Carta, GraficoVoti, Icona, Sezione } from '../ui'

const STATISTICHE: { et: string; cls: string; val: (t: Totali) => string | null }[] = [
  { et: 'Gol', cls: 'st0', val: (t) => numero(t.gol) },
  { et: 'Presenze', cls: 'st1', val: (t) => numero(t.presenze) },
  { et: 'Media voto', cls: 'st2', val: (t) => (t.media_voto === null ? null : media(t.media_voto)) },
  { et: 'MVP', cls: 'st3', val: (t) => numero(t.mvp) },
  { et: '% vittorie', cls: 'st4', val: (t) => (t.pct_vittorie === null ? null : `${numero(t.pct_vittorie, 1)}%`) },
]

const ESITO = { V: 'Vittoria', P: 'Pareggio', S: 'Sconfitta' } as const
const ULTIMI_VOTI = 10

function Statistiche({ stagione, sempre }: { stagione: Dati | null; sempre: Dati }) {
  return (
    <div className="stats">
      {STATISTICHE.map((s, i) => {
        const principale = s.val((stagione ?? sempre).totali)
        const tot = s.val(sempre.totali)
        return (
          <div key={s.et} className={`stat ${s.cls} att`} style={{ '--i': i } as React.CSSProperties}>
            {principale === null ? <b className="nd" aria-label="non disponibile">n.d.</b> : <b>{principale}</b>}
            <span>{s.et}</span>
            {stagione && <small>sempre {tot ?? 'n.d.'}</small>}
          </div>
        )
      })}
    </div>
  )
}

function Contenuto({ sempre, stagione }: { sempre: Dati; stagione: Dati | null }) {
  const g = sempre.giocatore
  const t = sempre.totali
  const ultime = [...sempre.ultime_5].reverse() // dalla meno recente
  const voti = sempre.voti_per_partita.slice(-ULTIMI_VOTI)
  return (
    <>
      <div className="big att">
        <div className={`foto k${tinta(g.id)}`}>
          <b aria-hidden="true">{iniziali(g.nome)}</b>
          {t.mvp > 0 && <Bollino sotto={t.mvp > 1 ? `x${t.mvp}` : undefined} />}
        </div>
        <h2 className="ban">{g.nome}</h2>
        <p className="sub">
          {t.presenze} {plurale(t.presenze, 'partita', 'partite')} nell'album · {t.mvp} {plurale(t.mvp, 'volta MVP', 'volte MVP')} in tutto
          {!g.attivo && ' · non piu\' nel listone'}
        </p>
      </div>

      <Sezione>{stagione?.stagione?.nome ?? 'Statistiche'}</Sezione>
      <Statistiche stagione={stagione} sempre={sempre} />
      {!stagione && <p className="note">Nessuna stagione aperta: qui ci sono i numeri di sempre.</p>}

      <Sezione>Ultime 5 partite</Sezione>
      <Carta>
        {ultime.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>Nessuna presenza registrata.</p>
        ) : (
          <>
            <div className="last5">
              {ultime.map((u, i) => (
                <Link key={u.partita_id} verso={`/partite/${u.partita_id}`} className="lp att" style={{ '--i': i } as React.CSSProperties} aria-label={`${ESITO[u.esito]} del ${giornoAnno(u.data_ora)}. Apri la partita`}>
                  <span className={`dot d${u.esito}`} aria-hidden="true">{u.esito}</span>
                  <span className="d" aria-hidden="true">{dataBreve(u.data_ora)}</span>
                </Link>
              ))}
            </div>
            <div className="axis"><span>Meno recente</span><span>Ultima</span></div>
          </>
        )}
      </Carta>

      <Sezione>Andamento dei voti</Sezione>
      <Carta att i={2}>
        {voti.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>Nessun voto in pagella per ora.</p>
        ) : (
          <>
            <GraficoVoti voti={voti.map((v) => v.voto)} mediaGenerale={t.media_voto} />
            <div className="axis"><span>{voti.length === 1 ? 'Unica pagella' : `${voti.length} pagelle fa`}</span><span>Ultima</span></div>
          </>
        )}
      </Carta>

      <Sezione>Badge</Sezione>
      {g.badge.length === 0 ? (
        <Carta className="vuota">Nessun badge assegnato.</Carta>
      ) : (
        <Carta>
          <ul className="bdg-elenco">
            {g.badge.map((b) => (
              <li key={b.id}>
                <Badges badge={[b]} />
                {b.descrizione && <p>{b.descrizione}</p>}
              </li>
            ))}
          </ul>
        </Carta>
      )}
    </>
  )
}

export function Scheda({ id }: { id: string }) {
  const sid = encodeURIComponent(id)
  const stagioni = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const aperta = stagioni.dati?.stagioni.find((s) => s.aperta)
  const sempre = useApi<Dati>(`/api/giocatori/${sid}?stagione=sempre`)
  const stag = useApi<Dati>(aperta ? `/api/giocatori/${sid}?stagione=${aperta.id}` : null)
  useTitolo(sempre.dati?.giocatore.nome ?? 'Giocatore')
  // Si aspetta anche la stagione (se c'e'), per non far "saltare" i numeri; se le stagioni non arrivano restano quelli di sempre.
  const attesa = stagioni.caricando || (aperta !== undefined && stag.caricando)
  const carico = {
    dati: sempre.dati && !attesa ? sempre.dati : null,
    errore: sempre.errore ?? stag.errore,
    ricarica: () => {
      sempre.ricarica()
      stagioni.ricarica()
      stag.ricarica()
    },
  }
  return (
    <>
      <Link verso="/giocatori" className="indietro"><Icona id="i-arrow" />Tutti i giocatori</Link>
      <div className="hd"><p className="kick">Terzo Tempo · Scheda</p><h1>Giocatore</h1></div>
      <Attesa carico={carico} testo="Carico la scheda…" figli={(d) => <Contenuto sempre={d} stagione={stag.dati} />} />
    </>
  )
}
