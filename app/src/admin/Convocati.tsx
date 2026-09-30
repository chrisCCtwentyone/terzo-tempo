import { Cart, Figurina } from '../ui'
import type { GiocatoreAdmin } from './tipi'

/** Il listone a figurine: si tocca per convocare (o togliere). Solo giocatori attivi, piu' quelli gia' convocati. */
export function ScegliConvocati({ giocatori, scelti, onCambia, badge }: {
  giocatori: GiocatoreAdmin[]
  scelti: number[]
  onCambia: (id: number, convocato: boolean) => void
  badge: (g: GiocatoreAdmin) => import('../lib/tipi').Badge[]
}) {
  const visibili = giocatori.filter((g) => g.attivo || scelti.includes(g.id))
  return (
    <fieldset>
      <legend className="sr">Scegli i convocati</legend>
      {visibili.length === 0 && <p className="note">Il listone è vuoto: aggiungi i giocatori nella sezione Giocatori.</p>}
      <div className="vota conv-scelta">
        {visibili.map((g) => (
          <label key={g.id}>
            <input type="checkbox" className="sr" checked={scelti.includes(g.id)} onChange={(e) => onCambia(g.id, e.target.checked)} />
            <Figurina id={g.id} nome={g.nome} z={46} decorativa badge={badge(g)} />
            <span className="sr">{g.nome}{g.attivo ? '' : ' (archiviato)'}</span>
            <Cart nome={g.nome} />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
