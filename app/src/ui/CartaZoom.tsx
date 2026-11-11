import { useRef } from 'react'
import { useCarta } from '../lib/carte'
import { CartaGiocatore } from './CartaGiocatore'

/**
 * La carta grande della scheda. Se c'e' la carta, toccandola si apre a tutto schermo in un <dialog> nativo
 * (si chiude con un tocco, col pulsante o con ESC); col segnaposto non c'e' niente da ingrandire.
 */
export function CartaZoom({ id, nome }: { id: number; nome: string }) {
  const dlg = useRef<HTMLDialogElement>(null)
  if (!useCarta(id)) return <CartaGiocatore id={id} nome={nome} eager />
  return (
    <>
      <button type="button" className="zoom-apri" aria-label={`Ingrandisci la carta di ${nome}`} onClick={() => dlg.current?.showModal()}>
        <CartaGiocatore id={id} nome={nome} decorativa eager />
      </button>
      <dialog ref={dlg} className="zoom" aria-label={`Carta di ${nome}`} onClick={() => dlg.current?.close()}>
        <CartaGiocatore id={id} nome={nome} className="grande" />
        <button type="button" className="btn ghost zoom-chiudi" autoFocus>Chiudi</button>
      </dialog>
    </>
  )
}
