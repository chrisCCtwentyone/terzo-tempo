import { useId, useState } from 'react'
import { Icona } from '../ui'
import { ModificaCampo } from './Campi'
import { Fld } from './comuni'
import type { CampoAdmin } from './tipi'

/**
 * La tendina "Campo" di una partita: i campi attivi e "Nessun campo". Se la partita ha un campo poi archiviato, resta
 * scelto e si vede (archiviato): cambiare partita non lo perde.
 *
 * "+ Nuovo campo" apre qui sotto, SULLA STESSA pagina, lo stesso modulo della pagina Campi (link di Google Maps, "Ricava
 * nome", nome): chi sta compilando la partita non la lascia e non perde niente. Alla creazione il campo entra nella tendina
 * ed e' gia' scelto. I campi appena creati si tengono qui (`creati`): la lista `campi` arriva dal server a pagina aperta.
 */
export function SceltaCampo({ campi, valore, onCambia }: { campi: CampoAdmin[]; valore: string; onCambia: (v: string) => void }) {
  const [aperto, setAperto] = useState(false)
  const [creati, setCreati] = useState<CampoAdmin[]>([])
  const [nota, setNota] = useState<string | null>(null)
  const idPannello = useId()
  const tutti = [...campi, ...creati.filter((c) => !campi.some((x) => x.id === c.id))]
    .sort((a, b) => Number(a.archiviato) - Number(b.archiviato) || a.nome.localeCompare(b.nome, 'it'))
  const visibili = tutti.filter((c) => !c.archiviato || String(c.id) === valore)
  return (
    <div className="campo-scelta">
      <Fld etichetta="Campo" aiuto={tutti.length === 0 ? 'Non c\'è ancora nessun campo: aggiungilo con “Nuovo campo”.' : undefined}>
        {(p) => (
          <select {...p} value={valore} onChange={(e) => onCambia(e.target.value)}>
            <option value="">Nessun campo</option>
            {visibili.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.archiviato ? ' (archiviato)' : ''}</option>)}
          </select>
        )}
      </Fld>
      <button type="button" className="nuovo-campo" aria-expanded={aperto} aria-controls={aperto ? idPannello : undefined} onClick={() => { setAperto(!aperto); setNota(null) }}>+ Nuovo campo</button>
      {nota && <p className="esito ok" role="status"><Icona id="i-check" /><span>{nota}</span></p>}
      {aperto && (
        <div className="campo-nuovo" id={idPannello}>
          <ModificaCampo
            campo={null}
            incorporato
            onCreato={(c) => { setCreati((x) => [...x, c]); onCambia(String(c.id)) }}
            onFatto={(testo) => { setAperto(false); setNota(`${testo}: lo trovi scelto qui sopra.`) }}
          />
        </div>
      )}
    </div>
  )
}
