import { useTitolo } from '../router'
import { Carta, Intestazione, PulsanteLink } from '../ui'

// SEGNAPOSTO: la sezione admin la costruisce un altro agente. App.tsx la carica con React.lazy,
// quindi il suo codice non pesa sul bundle pubblico. Serve un accesso via Cloudflare Access
// (GET /api/admin/me: 401/403 = non sei admin). Riusare i componenti di app/src/ui.
export default function Admin() {
  useTitolo('Area admin')
  return (
    <>
      <Intestazione kick="Terzo Tempo" titolo="Area admin" />
      <Carta className="vuota">
        <p>L'area admin non e' ancora pronta.</p>
        <div className="more"><PulsanteLink verso="/">Torna alla home</PulsanteLink></div>
      </Carta>
    </>
  )
}
