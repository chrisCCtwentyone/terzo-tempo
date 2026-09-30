import { Link } from '../router'
import { Fld } from './comuni'
import type { CampoAdmin } from './tipi'

/**
 * La tendina "Campo" di una partita: i campi attivi e "Nessun campo". Se la partita ha un campo poi archiviato, resta
 * scelto e si vede (archiviato): cambiare partita non lo perde. Sotto, la scorciatoia verso la pagina Campi.
 */
export function SceltaCampo({ campi, valore, onCambia }: { campi: CampoAdmin[]; valore: string; onCambia: (v: string) => void }) {
  const visibili = campi.filter((c) => !c.archiviato || String(c.id) === valore)
  return (
    <div className="campo-scelta">
      <Fld etichetta="Campo" aiuto={campi.length === 0 ? 'Non c\'è ancora nessun campo: aggiungilo dalla pagina Campi.' : undefined}>
        {(p) => (
          <select {...p} value={valore} onChange={(e) => onCambia(e.target.value)}>
            <option value="">Nessun campo</option>
            {visibili.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.archiviato ? ' (archiviato)' : ''}</option>)}
          </select>
        )}
      </Fld>
      <Link verso="/admin/campi?nuovo=1" className="nuovo-campo">+ Nuovo campo</Link>
    </div>
  )
}
