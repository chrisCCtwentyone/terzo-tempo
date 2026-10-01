import { useSalto } from '../lib/useSalto'
import type { Diretta, DirettaCorrente } from '../lib/tipi'
import { Pallone, Tabellone } from '../ui'

/** L'intestazione della carta in diretta: pallino rosso che pulsa + "IN DIRETTA", oppure "Risultato da confermare" (dopo le 2 ore o a fine diretta). */
export function TestaDiretta({ stato }: { stato: 'in_diretta' | 'da_confermare' }) {
  return (
    <p className="diretta-testa" data-stato={stato}>
      {stato === 'in_diretta' ? (
        <>
          <span className="live-dot" aria-hidden="true" />
          <b>IN DIRETTA</b>
        </>
      ) : (
        <b>Risultato da confermare</b>
      )}
    </p>
  )
}

/** Il tabellone di una diretta: il punteggio "salta" quando arriva un gol. */
function TabelloneLive({ squadre, stato }: { squadre: Diretta['squadre']; stato: 'in_diretta' | 'da_confermare' }) {
  const a = useSalto(squadre.find((s) => s.codice === 'A')?.gol ?? 0)
  const b = useSalto(squadre.find((s) => s.codice === 'B')?.gol ?? 0)
  return <Tabellone squadre={squadre} stato="convocazione" piccolo etichetta={stato === 'in_diretta' ? 'Live' : 'Da confermare'} salta={{ A: a, B: b }} />
}

/** La carta in cima alla Home: la partita in diretta con il punteggio (poi un tocco porta alla pagina della partita). */
export function CartaDirettaHome({ d }: { d: DirettaCorrente }) {
  return (
    <>
      <TestaDiretta stato={d.stato} />
      <TabelloneLive squadre={d.squadre} stato={d.stato} />
    </>
  )
}

/** Dentro il dettaglio della partita: punteggio e marcatori IN ORDINE; i gol nuovi si accendono un attimo. */
export function BloccoDiretta({ d, nuovi }: { d: Diretta & { stato: 'in_diretta' | 'da_confermare' }; nuovi: number[] }) {
  const nomi = Object.fromEntries(d.squadre.map((s) => [s.codice, s.nome]))
  return (
    <div data-diretta={d.stato}>
      <TestaDiretta stato={d.stato} />
      <TabelloneLive squadre={d.squadre} stato={d.stato} />
      <div className="live-marcatori">
        <h3>Marcatori, in ordine</h3>
        {d.eventi.length === 0 ? (
          <p className="vuoto">Ancora nessun gol.</p>
        ) : (
          <ol>
            {d.eventi.map((e, i) => (
              <li key={e.id} className={nuovi.includes(e.id) ? 'gol-nuovo' : undefined}>
                <span className="n" aria-hidden="true">{i + 1}</span>
                <Pallone autogol={e.autogol} />
                <span className="chi">
                  <b>{e.nome}{e.autogol ? ' (autogol)' : ''}</b>
                  <small>{e.autogol ? `punto per ${nomi[e.squadra]}` : nomi[e.squadra]}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="nota-live">
          {d.stato === 'in_diretta' ? 'Si aggiorna da solo, ogni pochi secondi.' : 'Il risultato è provvisorio: l\'admin deve ancora confermarlo.'}
        </p>
      </div>
    </div>
  )
}
