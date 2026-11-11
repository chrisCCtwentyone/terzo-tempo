import { useId } from 'react'
import { RAPPORTO_CARTA, SAGOMA, CARTA_H, CARTA_L, SEGNAPOSTO, puntiSagoma, useCarta } from '../lib/carte'

/** Il segnaposto: l'omino grigio con il punto interrogativo, dentro una tela l x a (esagono se `esagono`). */
function Omino({ l, a }: { l: number; a: number }) {
  const { sfondo, omino } = SEGNAPOSTO
  const k = l / 520
  return (
    <g>
      <rect width={l} height={a} fill={sfondo} />
      <circle cx={l / 2} cy={a * 0.376} r={l * 0.202} fill={omino} />
      <path d={`M${l * 0.115} ${a}c0-${a * 0.288} ${l * 0.173}-${a * 0.439} ${l * 0.385}-${a * 0.439}s${l * 0.385} ${a * 0.151} ${l * 0.385} ${a * 0.439}z`} fill={omino} />
      <text x={l / 2} y={a * 0.438} textAnchor="middle" fontFamily="Anton,Impact,sans-serif" fontSize={140 * k} fill={sfondo}>?</text>
    </g>
  )
}

/** Il segnaposto della carta intera (esagono col bordo inchiostro). */
function SegnapostoCarta() {
  const id = `cg${useId().replace(/\W/g, '')}`
  const pt = puntiSagoma(CARTA_L, CARTA_H)
  return (
    <svg viewBox={`0 0 ${CARTA_L} ${CARTA_H}`} aria-hidden="true" focusable="false">
      <clipPath id={id}><polygon points={pt} /></clipPath>
      <g clipPath={`url(#${id})`}><Omino l={CARTA_L} a={CARTA_H} /></g>
      <polygon points={pt} fill="none" stroke={SEGNAPOSTO.bordo} strokeWidth="14" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * La carta esagonale del giocatore. Con la carta caricata e' l'immagine ritagliata sulla sagoma (la sagoma sta in CSS, l'ombra
 * stampata sul contenitore); senza e' il segnaposto, col nome in una fascia gialla se `fascia` (dove il nome non e' scritto altrove).
 * `decorativa`: un testo vicino dice gia' chi e'.
 */
export function CartaGiocatore({ id, nome, fascia = true, decorativa = false, eager = false, className = '' }: {
  id: number
  nome: string
  fascia?: boolean
  decorativa?: boolean
  eager?: boolean
  className?: string
}) {
  const url = useCarta(id)
  return (
    <span className={`esa ${className}`} style={{ aspectRatio: RAPPORTO_CARTA }}>
      {url ? (
        <img src={url} alt={decorativa ? '' : nome} width={CARTA_L} height={CARTA_H} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} style={{ clipPath: SAGOMA }} />
      ) : (
        <span className="seg" {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nome })}>
          <SegnapostoCarta />
          {fascia && <span className="nm" aria-hidden="true">{nome}</span>}
        </span>
      )}
    </span>
  )
}
