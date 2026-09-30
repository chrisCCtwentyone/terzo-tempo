import { giornoNumero, meseBreve, giorno, ora } from '../lib/formato'
import type { PartitaRiga, Stagione } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { Link, useTitolo } from '../router'
import { Attesa, Carta, Intestazione, LuogoRiga, Sezione } from '../ui'

function Riga({ p, i }: { p: PartitaRiga; i: number }) {
  const [a, b] = ['A', 'B'].map((c) => p.squadre.find((s) => s.codice === c))
  const giocata = p.stato === 'giocata' && a?.gol != null && b?.gol != null
  const vinceA = giocata && a!.gol! > b!.gol!
  const vinceB = giocata && b!.gol! > a!.gol!
  const doveSi = p.campo ? `, al campo ${p.campo.nome}` : ''
  const etichetta = giocata
    ? `${giorno(p.data_ora)}: ${a!.nome} ${a!.gol}, ${b!.nome} ${b!.gol}${doveSi}`
    : `${giorno(p.data_ora)}, ${ora(p.data_ora)}: ${a?.nome} contro ${b?.nome}, da giocare${doveSi}`
  return (
    <li className="att" style={{ '--i': i } as React.CSSProperties}>
      <Link verso={`/partite/${p.id}`} className="row match" aria-label={etichetta}>
        <span className="quando" aria-hidden="true"><b>{giornoNumero(p.data_ora)}</b>{meseBreve(p.data_ora)}</span>
        <span aria-hidden="true">
          <span className={`sq ${vinceA ? 'vinta' : ''}`}><span>{a?.nome}</span><b>{a?.gol ?? '–'}</b></span>
          <span className={`sq ${vinceB ? 'vinta' : ''}`}><span>{b?.nome}</span><b>{b?.gol ?? '–'}</b></span>
          <LuogoRiga campo={p.campo} />
        </span>
        {!giocata && <span className="tag2" aria-hidden="true">{ora(p.data_ora)} · da giocare</span>}
      </Link>
    </li>
  )
}

export function Partite() {
  useTitolo('Partite')
  const stagioni = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const partite = useApi<{ partite: PartitaRiga[] }>('/api/partite')
  // si aspettano anche le stagioni (i titoli dei gruppi); se non arrivano si mostra lo stesso l'elenco
  const carico = {
    dati: partite.dati && (stagioni.dati || stagioni.errore) ? partite.dati : null,
    errore: partite.errore,
    ricarica: () => {
      partite.ricarica()
      stagioni.ricarica()
    },
  }
  return (
    <>
      <Intestazione kick="Terzo Tempo · Archivio" titolo="Partite" />
      <Attesa carico={carico} testo="Carico le partite…" figli={(d) => {
        if (d.partite.length === 0) return <Carta className="vuota">Ancora nessuna partita.</Carta>
        const elenco = stagioni.dati?.stagioni ?? []
        // una sezione per stagione (nell'ordine dell'API), poi eventuali partite di stagioni sconosciute
        const gruppi = elenco.map((s) => ({ nome: s.nome, id: s.id, righe: d.partite.filter((p) => p.stagione_id === s.id) }))
        const noti = new Set(elenco.map((s) => s.id))
        const altre = d.partite.filter((p) => !noti.has(p.stagione_id))
        if (altre.length > 0) gruppi.push({ nome: 'Altre partite', id: -1, righe: altre })
        return (
          <>
            {gruppi.filter((g) => g.righe.length > 0).map((g) => (
              <section key={g.id} aria-label={g.nome}>
                <Sezione>{g.nome}</Sezione>
                <ol className="list" style={{ marginTop: 0 }}>
                  {g.righe.map((p, i) => <Riga key={p.id} p={p} i={i} />)}
                </ol>
              </section>
            ))}
          </>
        )
      }} />
    </>
  )
}
