import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CARTA_H, CARTA_L, PUNTI_SAGOMA, RAPPORTO_CARTA, rileggiCarte, useCarta } from '../lib/carte'
import { CartaGiocatore, Pulsante } from '../ui'
import { Conferma, EsitoScrittura, useEsito } from './comuni'
import { scrivi, scriviFile } from './rete'

// Il quadro dell'editor: la sagoma e' FISSA al centro, si muove l'immagine. Misure in unita' del quadro (poi in scala sullo schermo).
const Q_L = 1008
const Q_H = 1070
const ES_H = 1024
const ES_L = ES_H * RAPPORTO_CARTA
const ES_X = (Q_L - ES_L) / 2
const ES_Y = (Q_H - ES_H) / 2
const LATO_MAX = 2000 // le foto del telefono sono enormi: si riducono subito
const MAX_BYTE = 400 * 1024 // il limite del server
const OBIETTIVO_BYTE = 150 * 1024 // la stessa immagine va anche nelle viste piccole: si tiene leggera

type Sorgente = CanvasImageSource & { width: number; height: number }
type Posa = { cx: number; cy: number; s: number } // centro dell'immagine nel quadro e scala

const sagoma = PUNTI_SAGOMA.map(([x, y]) => `${(ES_X + (x * ES_L) / 100).toFixed(1)},${(ES_Y + (y * ES_H) / 100).toFixed(1)}`).join(' ')
const velo = `M0 0H${Q_L}V${Q_H}H0Z M${sagoma.replace(/ /g, ' L')}Z`

/** Decodifica la foto e la riduce a 2000 px sul lato lungo (una foto da 12 megapixel non deve bloccare il telefono). */
async function leggiImmagine(file: File): Promise<Sorgente> {
  let img: Sorgente
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const i = new Image()
      i.src = url
      await i.decode()
      img = Object.assign(i, { width: i.naturalWidth, height: i.naturalHeight })
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const k = Math.min(1, LATO_MAX / Math.max(img.width, img.height))
  if (k === 1) return img
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k)
  c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  if ('close' in img) (img as ImageBitmap).close()
  return c
}

/** Disegna l'immagine nel quadro (o, con k, nel ritaglio finale: l'esagono diventa CARTA_L x CARTA_H). */
function disegna(ctx: CanvasRenderingContext2D, img: Sorgente, p: Posa, k: number, dx: number, dy: number) {
  ctx.drawImage(img, (p.cx - (img.width * p.s) / 2 + dx) * k, (p.cy - (img.height * p.s) / 2 + dy) * k, img.width * p.s * k, img.height * p.s * k)
}

const iniziale = (img: Sorgente): Posa => ({ cx: Q_L / 2, cy: Q_H / 2, s: Math.max(ES_L / img.width, ES_H / img.height) })

/** Sezione "Carta" del pannello di un giocatore: anteprima, carica, togli. */
export function SezioneCarta({ id, nome }: { id: number; nome: string }) {
  const haCarta = useCarta(id) !== null
  const [file, setFile] = useState<File | null>(null)
  const [conferma, setConferma] = useState(false)
  const { esito, esegui, occupato } = useEsito()

  async function togli() {
    setConferma(false)
    const r = await esegui('Rimozione', async () => {
      await scrivi('DELETE', `/api/admin/giocatori/${id}/carta`)
      await rileggiCarte()
      return true
    }, 'Carta tolta')
    return r
  }

  return (
    <fieldset className="sez-carta">
      <legend className="etich-campo">Carta</legend>
      {file ? (
        <EditorCarta
          file={file}
          nome={nome}
          annulla={() => setFile(null)}
          salva={async (blob) => {
            const ok = await esegui('Salvataggio della carta', async () => {
              await scriviFile(`/api/admin/giocatori/${id}/carta`, blob)
              await rileggiCarte()
              return true
            }, 'Carta salvata')
            if (ok) setFile(null)
          }}
          occupato={occupato}
          esito={esito}
        />
      ) : (
        <>
          <div className="carta-prev"><CartaGiocatore id={id} nome={nome} decorativa /></div>
          <p className="note">{haCarta ? 'Questa è la carta di ' + nome + '.' : 'Nessuna carta: nel sito compare il segnaposto col nome.'}</p>
          <div className="azioni-carta">
            <label className="btn ghost">
              {haCarta ? 'Cambia carta' : 'Carica carta'}
              <input type="file" accept="image/*" className="sr" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFile(f); } }} />
            </label>
            {haCarta && <Pulsante variante="no" onClick={() => setConferma(true)} disabled={occupato}>Togli carta</Pulsante>}
          </div>
          {conferma && <Conferma pericolo domanda={<>Togliere la carta di <strong>{nome}</strong>? Tornerà il segnaposto.</>} conferma="Sì, togli la carta" onConferma={() => void togli()} onAnnulla={() => setConferma(false)} occupato={occupato} />}
          <EsitoScrittura esito={esito} />
        </>
      )}
    </fieldset>
  )
}

function EditorCarta({ file, nome, annulla, salva, occupato, esito }: {
  file: File
  nome: string
  annulla: () => void
  salva: (blob: Blob) => Promise<void>
  occupato: boolean
  esito: ReturnType<typeof useEsito>['esito']
}) {
  const tela = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<Sorgente | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [posa, setPosa] = useState<Posa | null>(null)
  const punti = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    let vivo = true
    leggiImmagine(file).then(
      (i) => { if (vivo) { setImg(i); setPosa(iniziale(i)) } },
      () => { if (vivo) setErrore('Non riesco a leggere questa immagine. Prova con una foto in formato JPEG o PNG.') },
    )
    return () => { vivo = false }
  }, [file])

  useEffect(() => {
    const c = tela.current
    if (!c || !img || !posa) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, Q_L, Q_H)
    disegna(ctx, img, posa, 1, 0, 0)
  }, [img, posa])

  const sMin = img ? iniziale(img).s * 0.5 : 1
  const sMax = img ? iniziale(img).s * 4 : 4
  const centro = { x: Q_L / 2, y: Q_H / 2 }
  /** Cambia la scala tenendo fermo il punto `fermo` (coordinate del quadro). */
  const zoom = (p: Posa, s: number, fermo: { x: number; y: number }): Posa => {
    const s2 = Math.min(sMax, Math.max(sMin, s))
    const k = s2 / p.s
    return { s: s2, cx: fermo.x - (fermo.x - p.cx) * k, cy: fermo.y - (fermo.y - p.cy) * k }
  }
  const unita = () => Q_L / tela.current!.getBoundingClientRect().width

  function giu(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    punti.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  function muovi(e: PointerEvent<HTMLCanvasElement>) {
    const m = punti.current
    const prima = m.get(e.pointerId)
    if (!prima || !posa) return
    const u = unita()
    if (m.size === 1) {
      const dx = (e.clientX - prima.x) * u
      const dy = (e.clientY - prima.y) * u
      setPosa((p) => p && { ...p, cx: p.cx + dx, cy: p.cy + dy })
    } else if (m.size === 2) {
      const altro = [...m.entries()].find(([k]) => k !== e.pointerId)![1]
      const r = tela.current!.getBoundingClientRect()
      const prima2 = Math.hypot(prima.x - altro.x, prima.y - altro.y) || 1
      const dopo = Math.hypot(e.clientX - altro.x, e.clientY - altro.y)
      const mx = ((e.clientX + altro.x) / 2 - r.left) * u
      const my = ((e.clientY + altro.y) / 2 - r.top) * u
      setPosa((p) => p && zoom(p, (p.s * dopo) / prima2, { x: mx, y: my }))
    }
    m.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const su = (e: PointerEvent) => punti.current.delete(e.pointerId)

  async function conferma() {
    if (!img || !posa) return
    const c = document.createElement('canvas')
    c.width = CARTA_L
    c.height = CARTA_H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CARTA_L, CARTA_H)
    ctx.imageSmoothingQuality = 'high'
    disegna(ctx, img, posa, CARTA_L / ES_L, -ES_X, -ES_Y)
    const toBlob = (q: number) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q))
    let blob = await toBlob(0.82)
    if (blob && blob.size > OBIETTIVO_BYTE) blob = await toBlob(0.65)
    if (!blob || blob.size > MAX_BYTE) {
      setErrore('Non riesco a ridurre abbastanza il file: prova con un\'altra immagine.')
      return
    }
    setErrore(null)
    await salva(blob)
  }

  return (
    <div className="editor-carta">
      <p className="note">Trascina l'immagine col dito e ingrandiscila (cursore o pizzico a due dita) finché la carta combacia con la sagoma tratteggiata. Quello che sta fuori dalla sagoma viene tagliato.</p>
      <div className="crop" role="group" aria-label={`Ritaglio della carta di ${nome}`}>
        <canvas ref={tela} width={Q_L} height={Q_H} onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su} aria-label="Immagine da posizionare" />
        <svg viewBox={`0 0 ${Q_L} ${Q_H}`} aria-hidden="true" focusable="false">
          <path fill="rgba(0,0,0,.55)" fillRule="evenodd" d={velo} />
          <polygon points={sagoma} fill="none" stroke="#fff" strokeWidth="6" strokeDasharray="18 12" />
        </svg>
        {!img && !errore && <p className="crop-attesa">Preparo l'immagine…</p>}
      </div>
      <label className="zoom-cursore">
        <span>Zoom</span>
        <input type="range" min={sMin} max={sMax} step={(sMax - sMin) / 200} value={posa?.s ?? sMin} disabled={!img || occupato} onChange={(e) => posa && setPosa(zoom(posa, Number(e.target.value), centro))} aria-label="Ingrandimento dell'immagine" />
      </label>
      {errore && <p className="esito errore" role="alert">{errore}</p>}
      <EsitoScrittura esito={esito} />
      <div className="azioni-carta">
        <Pulsante variante="yes" onClick={() => void conferma()} disabled={!img || occupato} aria-busy={occupato}>{occupato ? 'Salvo…' : 'Salva carta'}</Pulsante>
        <Pulsante onClick={annulla} disabled={occupato}>Annulla</Pulsante>
      </div>
    </div>
  )
}
