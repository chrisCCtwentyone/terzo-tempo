import { useTitolo } from '../router'
import { Carta, Intestazione, PulsanteLink } from '../ui'

export function NonTrovata() {
  useTitolo('Pagina non trovata')
  return (
    <>
      <Intestazione kick="Terzo Tempo" titolo="Non trovata" />
      <Carta>
        <p>Questa pagina non esiste (o il link è sbagliato).</p>
        <div className="more"><PulsanteLink verso="/">Torna alla home</PulsanteLink></div>
      </Carta>
    </>
  )
}
