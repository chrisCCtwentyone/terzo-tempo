import type { Partita } from '../lib/tipi'

/** Il tabellone: A a sinistra in rosso, B a destra in blu; i nomi arrivano dal backend. gol null = non ancora giocata. */
export function Tabellone({ squadre, stato, piccolo = false }: { squadre: Partita['squadre']; stato: Partita['stato']; piccolo?: boolean }) {
  const a = squadre.find((s) => s.codice === 'A')
  const b = squadre.find((s) => s.codice === 'B')
  const meta = (s: typeof a, cls: string) => (
    <div className={`half ${cls}`}>
      <span className="tn">{s?.nome ?? '?'}</span>
      <b className="sc">{s?.gol ?? '–'}</b>
    </div>
  )
  return (
    <div className={`band${piccolo ? ' sm' : ''}`}>
      {meta(a, 'a')}
      {meta(b, 'b')}
      <span className="fin">{stato === 'giocata' ? 'Fin.' : 'Da giocare'}</span>
    </div>
  )
}

