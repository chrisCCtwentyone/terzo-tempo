import type { Badge } from '../lib/tipi'
import { Cart } from './Cart'
import { CartaGiocatore } from './CartaGiocatore'
import { Pallone } from './Icone'
import { Bollino } from './Bollino'
import { Voto } from './Voto'

/**
 * La pedina del campo: una mini-carta esagonale stile FUT (voto in pagella in alto a sinistra, palloni dei gol in alto a destra,
 * bollino MVP sul lato destro, badge in basso a sinistra) con il nome appena sotto, sovrapposto di qualche px.
 * La larghezza della carta (--cw) la decide il campo (.pitch): si restringe insieme a lui.
 */
export function PedinaCarta({ id, nome, voto, conVoto = false, gol = 0, autogol = 0, mvp = false, portiere = false, badge }: {
  id: number
  nome: string
  voto?: number | null
  /** mostra il voto, solo se c'e': sul campo un "n.d." coprirebbe la carta (decisione dell'utente, 12/11/2026); il dato mancante resta visibile in pagella */
  conVoto?: boolean
  gol?: number
  autogol?: number
  mvp?: boolean
  portiere?: boolean
  badge?: Badge[]
}) {
  const segni = (badge ?? []).slice(0, 3)
  return (
    <div className="pin">
      <span className="figw">
        <CartaGiocatore id={id} nome={nome} fascia={false} decorativa className="mini" />
        {conVoto && voto != null && <span className="pv"><Voto v={voto} /></span>}
        {(gol > 0 || autogol > 0) && (
          <span className="balls" aria-hidden="true">
            {Array.from({ length: gol }, (_, k) => <Pallone key={`g${k}`} />)}
            {Array.from({ length: autogol }, (_, k) => <Pallone key={`o${k}`} autogol />)}
          </span>
        )}
        {mvp && <Bollino z={24} />}
        {portiere && <span className="pt" aria-hidden="true">P</span>}
        {segni.length > 0 && (
          <span className="mks" aria-hidden="true">
            {segni.map((b) => <i key={b.id} className={b.tipo === 'negativo' ? 'mk neg' : 'mk'} />)}
          </span>
        )}
      </span>
      <Cart nome={nome} />
    </div>
  )
}
