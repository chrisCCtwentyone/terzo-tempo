// L'immagine delle formazioni da mandare su WhatsApp: PNG 1080x1920 disegnato su canvas 2D, stile "Figurine" (tema chiaro, sempre).
// Posizioni dal campo del sito (lib/campo.ts). Niente risultato, voti o marcatori; i dati mancanti (campo, modulo) non si scrivono.
import { deduciModulo } from '../../../shared/moduli'
import { LATO_ALTO, larghezzaCarta, pedine } from './campo'
import { CARTA_H, CARTA_L, PUNTI_SAGOMA, SEGNAPOSTO, archivioCarte, urlCarta } from './carte'
import { giornoAnno, ora } from './formato'
import type { Codice, Partita } from './tipi'

const L = 1080
const A = 1920
const INCHIOSTRO = '#1c1915'
const CAMPO = { x: 60, y: 285, l: 960, a: 1560 }
// pedina intera in larghezze di carta: altezza = carta + 11 px (a BASE) di cartellino che sporge; larghezza = il cartellino col nome (fino a ~2 carte)
const PED_H = CARTA_H / CARTA_L + 11 / 84
const PED_L = 2
const BASE = 84 // larghezza di carta per cui sono scritte le misure fisse qui sotto (ombra, bordo, cartellino): tutto si scala con la carta
const ANTON = 'Anton, Impact, sans-serif'
const NUNITO = '"Nunito Sans", system-ui, sans-serif'
const LINEE = new Path2D('M4 4h82v152H4zM4 80h82M56 80a11 11 0 1 0-22 0a11 11 0 1 0 22 0M24 4h42v18H24zM34 4h22v7H34zM24 138h42v18H24zM34 149h22v7H34zM37 22a9 9 0 0 0 16 0M37 138a9 9 0 0 1 16 0')

const carica = (url: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => ok(null)
    setTimeout(() => ok(null), 8000) // una richiesta appesa non blocca il pulsante: segnaposto
    i.src = url
  })

const sagoma = (c: CanvasRenderingContext2D, x: number, y: number, l: number, a: number) => {
  c.beginPath()
  PUNTI_SAGOMA.forEach(([px, py], k) => (k ? c.lineTo(x + (px * l) / 100, y + (py * a) / 100) : c.moveTo(x + (px * l) / 100, y + (py * a) / 100)))
  c.closePath()
}

/** Segnaposto: esagono chiaro, omino scuro, "?" sulla testa (stesse proporzioni di CartaGiocatore). */
function segnaposto(c: CanvasRenderingContext2D, x: number, y: number, l: number, a: number) {
  c.fillStyle = SEGNAPOSTO.sfondo
  c.fillRect(x, y, l, a)
  c.fillStyle = SEGNAPOSTO.omino
  c.beginPath()
  c.arc(x + l / 2, y + a * 0.376, l * 0.202, 0, Math.PI * 2)
  c.fill()
  c.save()
  c.translate(x, y)
  c.fill(new Path2D(`M${l * 0.115} ${a}c0-${a * 0.288} ${l * 0.173}-${a * 0.439} ${l * 0.385}-${a * 0.439}s${l * 0.385} ${a * 0.151} ${l * 0.385} ${a * 0.439}z`))
  c.restore()
  c.fillStyle = SEGNAPOSTO.sfondo
  c.font = `${l * 0.27}px ${ANTON}`
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  c.fillText('?', x + l / 2, y + a * 0.438)
}

/** Una pedina di larghezza-carta `CW`: ombra, bordo, font e cartellino in proporzione (k = CW / 84). */
function pedina(c: CanvasRenderingContext2D, cx: number, cy: number, nome: string, img: HTMLImageElement | null, CW: number) {
  const k = CW / BASE
  const CH = (CW * CARTA_H) / CARTA_L
  const x = cx - CW / 2
  const y = cy - (CH + 11 * k) / 2
  c.save()
  c.translate(7 * k, 7 * k) // ombra stampata piena
  sagoma(c, x, y, CW, CH)
  c.fillStyle = INCHIOSTRO
  c.fill()
  c.restore()
  c.save()
  sagoma(c, x, y, CW, CH)
  c.clip()
  if (img) c.drawImage(img, x, y, CW, CH)
  else segnaposto(c, x, y, CW, CH)
  c.restore()
  sagoma(c, x, y, CW, CH)
  c.lineJoin = 'round'
  c.lineWidth = 5 * k
  c.strokeStyle = INCHIOSTRO
  c.stroke()
  // il cartellino col nome, sovrapposto al fondo della carta; il font si riduce se il nome e' lungo
  let f = Math.round(25 * k)
  c.font = `800 ${f}px ${NUNITO}`
  while (c.measureText(nome).width > 196 * k && f > 16 * k) c.font = `800 ${--f}px ${NUNITO}`
  const w = c.measureText(nome).width + 20 * k
  const h = f + 12 * k
  const ty = y + CH + 11 * k - h
  c.fillStyle = '#fffaf0'
  c.strokeStyle = INCHIOSTRO
  c.lineWidth = 3 * k
  c.beginPath()
  if (c.roundRect) c.roundRect(cx - w / 2, ty, w, h, 6 * k)
  else c.rect(cx - w / 2, ty, w, h)
  c.fill()
  c.stroke()
  c.fillStyle = INCHIOSTRO
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(nome, cx, ty + h / 2 + 1)
}

/** La targhetta della squadra a cavallo del bordo del campo: "CASACCATI · 3-3-1" (senza modulo, solo il nome). */
function targhetta(c: CanvasRenderingContext2D, testo: string, colore: string, y: number) {
  c.font = `46px ${ANTON}`
  c.textBaseline = 'middle'
  const w = Math.min(c.measureText(testo.toUpperCase()).width + 70, CAMPO.l - 40)
  const x = L / 2 - w / 2
  c.fillStyle = INCHIOSTRO
  c.fillRect(x + 6, y - 32 + 6, w, 64)
  c.fillStyle = colore
  c.fillRect(x, y - 32, w, 64)
  c.strokeStyle = INCHIOSTRO
  c.lineWidth = 4
  c.strokeRect(x, y - 32, w, 64)
  c.fillStyle = '#fff'
  c.textAlign = 'center'
  c.fillText(testo.toUpperCase(), L / 2, y + 3, w - 30)
}

export async function creaImmagineFormazioni(p: Pick<Partita, 'data_ora' | 'campo' | 'squadre' | 'giocatori'>): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`96px ${ANTON}`, 'Terzo Tempo 0123456789?'),
    document.fonts.load(`700 30px ${NUNITO}`, 'Aa'),
    document.fonts.load(`800 30px ${NUNITO}`, 'Aa'),
  ])
  const archivio = await archivioCarte()
  const inCampo = p.giocatori.filter((g) => g.squadra !== null)
  const tutte = (['A', 'B'] as Codice[]).flatMap((cod) => pedine(inCampo, cod))
  const [logo, ...immagini] = await Promise.all([
    carica('/favicon.svg'),
    ...tutte.map(({ g }) => {
      const v = archivio[String(g.giocatore_id)]
      return v === undefined ? Promise.resolve(null) : carica(urlCarta(g.giocatore_id, v))
    }),
  ])

  const tela = document.createElement('canvas')
  tela.width = L
  tela.height = A
  const c = tela.getContext('2d')
  if (!c) throw new Error('Il telefono non riesce a disegnare l’immagine.')

  // carta avorio
  c.fillStyle = '#f2e9d0'
  c.fillRect(0, 0, L, A)

  // intestazione: logo, titolo, data e ora, campo (se c'e')
  if (logo) {
    c.save()
    c.translate(5, 5)
    c.fillStyle = INCHIOSTRO
    c.fillRect(60, 40, 150, 150)
    c.restore()
    c.drawImage(logo, 60, 40, 150, 150)
    c.strokeStyle = INCHIOSTRO
    c.lineWidth = 5
    c.strokeRect(60, 40, 150, 150)
  }
  c.fillStyle = INCHIOSTRO
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  c.font = `104px ${ANTON}`
  c.fillText('TERZO TEMPO', 244, 130)
  c.font = `800 42px ${NUNITO}`
  const quando = `${giornoAnno(p.data_ora)} · ${ora(p.data_ora)}`
  c.fillText(quando.charAt(0).toUpperCase() + quando.slice(1), 246, 186, L - 306)
  if (p.campo) {
    c.fillStyle = '#5b5346'
    c.font = `700 34px ${NUNITO}`
    c.fillText(p.campo.nome, 246, 230, L - 306)
  }

  // campo
  const { x, y, l, a } = CAMPO
  c.save()
  c.translate(8, 8)
  c.fillStyle = INCHIOSTRO
  c.fillRect(x, y, l, a)
  c.restore()
  c.save()
  c.beginPath()
  c.rect(x, y, l, a)
  c.clip()
  for (let i = 0; i < 12; i++) {
    c.fillStyle = i % 2 ? '#279039' : '#2e9a44'
    c.fillRect(x, y + (i * a) / 12, l, a / 12 + 1)
  }
  c.translate(x, y)
  c.scale(l / 90, a / 160)
  c.strokeStyle = 'rgba(255,255,255,.88)'
  c.lineWidth = 0.7
  c.stroke(LINEE)
  c.restore()
  c.strokeStyle = INCHIOSTRO
  c.lineWidth = 5
  c.strokeRect(x, y, l, a)

  // carta su misura: la piu' grande che non fa toccare nessuna pedina nel campo dell'immagine (1080x1920 resta cosi')
  const cw = Math.max(0.08, larghezzaCarta(tutte, a / l, PED_H, PED_L)) * l
  tutte.forEach(({ g, x: px, y: py }, i) => pedina(c, x + (px * l) / 100, y + (py * a) / 100, g.nome, immagini[i], cw))

  // targhette con nome e modulo (dedotto dalle posizioni; se non c'e', solo il nome)
  ;(['A', 'B'] as Codice[]).forEach((cod) => {
    const sq = inCampo.filter((g) => g.squadra === cod)
    const modulo = sq.length > 0 && sq.every((g) => g.pos_x !== null && g.pos_y !== null) ? deduciModulo(sq.map((g) => ({ x: g.pos_x!, y: g.pos_y! })), cod === LATO_ALTO) : null
    const nome = p.squadre.find((s) => s.codice === cod)?.nome ?? cod
    const alto = cod === LATO_ALTO
    targhetta(c, modulo ? `${nome} · ${modulo}` : nome, alto ? '#d42a20' : '#1f4fd1', alto ? y : y + a)
  })

  return new Promise((ok, no) => tela.toBlob((b) => (b ? ok(b) : no(new Error('Immagine non riuscita.'))), 'image/png'))
}
