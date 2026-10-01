import type { Partita } from '../lib/tipi'

/** Il tabellone: A a sinistra in rosso, B a destra in blu; i nomi arrivano dal backend. gol null = non ancora giocata. */
export function Tabellone({ squadre, stato, piccolo = false, etichetta, salta }: { squadre: Partita['squadre']; stato: Partita['stato']; piccolo?: boolean; /** al posto di "Da giocare" / "Fin." (es. "Live") */ etichetta?: string; /** quale squadra ha appena segnato: il suo punteggio "salta" (classe punto-nuovo) */ salta?: Partial<Record<'A' | 'B', boolean>> }) {
  const a = squadre.find((s) => s.codice === 'A')
  const b = squadre.find((s) => s.codice === 'B')
  const meta = (s: typeof a, cls: string) => (
    <div className={`half ${cls}`}>
      <span className="tn">{s?.nome ?? '?'}</span>
      <b className={`sc${s && salta?.[s.codice] ? ' punto-nuovo' : ''}`}>{s?.gol ?? '–'}</b>
    </div>
  )
  return (
    <div className={`band${piccolo ? ' sm' : ''}`}>
      {meta(a, 'a')}
      {meta(b, 'b')}
      <span className="fin">{etichetta ?? (stato === 'giocata' ? 'Fin.' : 'Da giocare')}</span>
    </div>
  )
}

