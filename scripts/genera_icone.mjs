#!/usr/bin/env node
/**
 * Rigenera le icone del sito da docs/logo/logo-figurina.svg (l'unica sorgente). Uso: `npm run icone`
 *
 * Scrive in app/public (Vite la serve alla radice del sito):
 *   favicon.svg            lo stesso SVG, senza titolo, ruoli e spazi inutili
 *   favicon-32.png         32x32
 *   favicon.ico            16, 32 e 48 px (PNG dentro l'ICO); senza, il browser chiederebbe /favicon.ico e riceverebbe la pagina dell'app
 *   apple-touch-icon.png   180x180, sfondo pieno, senza trasparenza e senza angoli arrotondati (li ritaglia iOS)
 *   icon-192.png, icon-512.png
 *   icon-maskable-512.png  disegno ridotto dentro la zona sicura (cerchio di diametro 80%), giallo come sfondo
 *
 * Nessuna dipendenza nuova: rasterizza con il Chromium di Playwright (playwright-core e' gia' fra le devDependencies;
 * serve un Chromium gia' installato, PLAYWRIGHT_BROWSERS_PATH o E2E_CHROMIUM: MAI `playwright install`). I PNG di Chromium
 * possono avere il canale alfa: qui si garantisce un PNG RGB opaco (un pixel non opaco fa fallire lo script), cosi' iOS non puo' riempire di nero nessun pixel.
 * Uscita: dove scrivere puo' essere cambiato con ICONE_USCITA (default app/public).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { chromium } from 'playwright-core'

const RADICE = resolve(import.meta.dirname, '..')
const SORGENTE = join(RADICE, 'docs/logo/logo-figurina.svg')
const USCITA = resolve(process.env.ICONE_USCITA ?? join(RADICE, 'app/public'))
const GIALLO = '#ffc629'
const ZONA_SICURA = 0.8 // diametro del cerchio sicuro, in frazione del lato (specifica delle maskable icon)

const svg = readFileSync(SORGENTE, 'utf8')

// ---- favicon.svg: stesso disegno, meno byte ----
const favicon = svg
  .replace(/\s+role="img"\s+aria-label="[^"]*"/, '')
  .replace(/\s+width="512"\s+height="512"/, '')
  .replace(/<title>[\s\S]*?<\/title>\s*/, '')
  .replace(/>\s+</g, '><')
  .trim()

// ---- maskable: il disegno (tutto tranne lo sfondo) rimpicciolito attorno al centro ----
const SFONDO = `<rect width="512" height="512" fill="${GIALLO}"/>`
if (!svg.includes(SFONDO)) throw new Error('lo sfondo giallo a pieno riquadro non e\' dove me l\'aspetto nell\'SVG sorgente')
/** Distanza massima dal centro di tutto cio' che e' disegnato sopra lo sfondo: la figurina col suo bordo (8 px fuori) e la sua ombra (18 px di scarto). */
function raggioDisegno() {
  const a = (-6 * Math.PI) / 180
  const ruota = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
  const angoli = (mx, my) => [[mx, my], [-mx, my], [mx, -my], [-mx, -my]]
  const carta = angoli(150 + 8, 200 + 8).map(ruota)
  const ombra = angoli(150, 200).map(ruota).map(([x, y]) => [x + 18, y + 18])
  return Math.max(...[...carta, ...ombra].map(([x, y]) => Math.hypot(x, y)))
}
const scala = (ZONA_SICURA * 512) / 2 / raggioDisegno()
const maskable = svg
  .replace(SFONDO, `${SFONDO}<g transform="translate(256 256) scale(${scala.toFixed(4)}) translate(-256 -256)">`)
  .replace('</svg>', '</g></svg>')

// ---- PNG: garantire RGB opaco (Chromium scrive RGBA se c'e' trasparenza, RGB altrimenti) ----
function senzaAlfa(png) {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('non e\' un PNG')
  let larg = 0, alt = 0, canali = 0
  const dati = []
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i), tipo = png.toString('latin1', i + 4, i + 8), corpo = png.subarray(i + 8, i + 8 + len)
    if (tipo === 'IHDR') {
      larg = corpo.readUInt32BE(0); alt = corpo.readUInt32BE(4)
      canali = corpo[9] === 6 ? 4 : corpo[9] === 2 ? 3 : 0
      if (corpo[8] !== 8 || !canali || corpo[12] !== 0) throw new Error('atteso un PNG RGB o RGBA a 8 bit non interlacciato')
    } else if (tipo === 'IDAT') dati.push(corpo)
    i += 12 + len
  }
  const grezzo = inflateSync(Buffer.concat(dati))
  const riga = larg * canali
  const px = Buffer.alloc(alt * riga)
  for (let y = 0; y < alt; y++) { // toglie i filtri PNG riga per riga
    const f = grezzo[y * (riga + 1)], src = grezzo.subarray(y * (riga + 1) + 1, (y + 1) * (riga + 1))
    for (let x = 0; x < riga; x++) {
      const a = x >= canali ? px[y * riga + x - canali] : 0, b = y ? px[(y - 1) * riga + x] : 0, c = x >= canali && y ? px[(y - 1) * riga + x - canali] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      px[y * riga + x] = (src[x] + pred) & 255
    }
  }
  const rgb = Buffer.alloc(alt * (larg * 3 + 1)) // filtro 0 su ogni riga
  for (let y = 0; y < alt; y++)
    for (let x = 0; x < larg; x++) {
      if (canali === 4 && px[y * riga + x * 4 + 3] !== 255) throw new Error(`pixel non opaco in ${x},${y}: il logo deve coprire tutto il riquadro`)
      px.copy(rgb, y * (larg * 3 + 1) + 1 + x * 3, y * riga + x * canali, y * riga + x * canali + 3)
    }
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const blocco = (tipo, corpo) => {
    const t = Buffer.concat([Buffer.from(tipo, 'latin1'), corpo]), out = Buffer.alloc(t.length + 8)
    out.writeUInt32BE(corpo.length, 0); t.copy(out, 4); out.writeUInt32BE(crc(t), t.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(larg, 0); ihdr.writeUInt32BE(alt, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([png.subarray(0, 8), blocco('IHDR', ihdr), blocco('IDAT', deflateSync(rgb, { level: 9 })), blocco('IEND', Buffer.alloc(0))])
}

/** ICO con un PNG per misura (formato accettato da tutti i browser moderni). */
function ico(voci) {
  const testa = Buffer.alloc(6 + 16 * voci.length)
  testa.writeUInt16LE(1, 2); testa.writeUInt16LE(voci.length, 4)
  let offset = testa.length
  voci.forEach(({ lato, png }, i) => {
    const e = 6 + 16 * i
    testa[e] = lato; testa[e + 1] = lato; testa.writeUInt16LE(1, e + 4); testa.writeUInt16LE(32, e + 6)
    testa.writeUInt32LE(png.length, e + 8); testa.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([testa, ...voci.map((v) => v.png)])
}

mkdirSync(USCITA, { recursive: true })
const scrivi = (nome, dati) => { writeFileSync(join(USCITA, nome), dati); console.log(`  ${nome} (${dati.length} byte)`) }

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined })
try {
  const pagina = await browser.newPage({ deviceScaleFactor: 1 })
  /** L'SVG reso a `lato` x `lato` pixel: vettoriale, quindi nitido a ogni misura. */
  const raster = async (sorgente, lato) => {
    await pagina.setViewportSize({ width: lato, height: lato })
    await pagina.setContent(`<!doctype html><body style="margin:0;background:${GIALLO}"><img width="${lato}" height="${lato}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(sorgente).toString('base64')}">`)
    await pagina.locator('img').evaluate((i) => i.decode())
    return senzaAlfa(await pagina.screenshot({ clip: { x: 0, y: 0, width: lato, height: lato }, type: 'png' }))
  }
  scrivi('favicon.svg', favicon)
  scrivi('apple-touch-icon.png', await raster(svg, 180))
  scrivi('icon-192.png', await raster(svg, 192))
  scrivi('icon-512.png', await raster(svg, 512))
  scrivi('icon-maskable-512.png', await raster(maskable, 512))
  const f32 = await raster(svg, 32)
  scrivi('favicon-32.png', f32)
  scrivi('favicon.ico', ico([{ lato: 16, png: await raster(svg, 16) }, { lato: 32, png: f32 }, { lato: 48, png: await raster(svg, 48) }]))
  console.log(`maskable: disegno scalato a ${(scala * 100).toFixed(1)}% (raggio massimo ${raggioDisegno().toFixed(1)} px su 512, zona sicura ${(ZONA_SICURA * 256).toFixed(1)} px)`)
} finally {
  await browser.close()
}
