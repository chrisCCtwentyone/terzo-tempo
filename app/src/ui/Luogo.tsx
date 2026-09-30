import type { Campo } from '../lib/tipi'
import { Icona } from './Icone'

/** Le indicazioni si aprono solo se l'indirizzo e' di Google Maps: il server lo garantisce, qui lo si ricontrolla prima di farne un link. */
const INDICAZIONI_SICURE = 'https://www.google.com/maps/'

/**
 * Il campo da gioco come link alle indicazioni stradali: "Centro Sportivo Esempio →" con il segnaposto (icona SVG).
 * Si apre in una scheda nuova (app di Google Maps sul telefono, se c'e'). Senza campo non mostra niente.
 */
export function Luogo({ campo }: { campo: Campo | null }) {
  if (!campo) return null
  if (!campo.url_indicazioni.startsWith(INDICAZIONI_SICURE)) {
    return <span className="luogo senza-link"><Icona id="i-pin" /><span>{campo.nome}</span></span>
  }
  return (
    <a className="luogo" href={campo.url_indicazioni} target="_blank" rel="noopener noreferrer" aria-label={`Campo: ${campo.nome}. Apri le indicazioni stradali in Google Maps`}>
      <Icona id="i-pin" />
      <span>{campo.nome} <span aria-hidden="true">→</span></span>
    </a>
  )
}

/** Nell'elenco delle partite, in piccolo. Non e' un link: la riga intera e' gia' un link alla partita (un link dentro un link non e' valido). */
export function LuogoRiga({ campo }: { campo: Campo | null }) {
  if (!campo) return null
  return (
    <span className="luogo-riga">
      <Icona id="i-pin" />
      <span>{campo.nome}</span>
    </span>
  )
}
