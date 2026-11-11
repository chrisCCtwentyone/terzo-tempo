// Le carte dei giocatori: geometria, colori e archivio (id -> versione) in UN solo punto. Contratto con il backend:
// GET /api/carte -> { carte: { "<id>": <versione> } }; immagine in /api/carte/<id>?v=<versione>.
import { useSyncExternalStore } from 'react'

/** Larghezza / altezza della carta e misure del JPEG che l'admin carica (il rettangolo che contiene l'esagono). */
export const CARTA_L = 520
export const CARTA_H = 799
export const RAPPORTO_CARTA = CARTA_L / CARTA_H

/** La sagoma esagonale (scudo), in percentuale del riquadro: punta leggera in alto, lati dritti, punta profonda in basso. */
export const PUNTI_SAGOMA: readonly (readonly [number, number])[] = [[0, 5.5], [50, 0], [100, 5.5], [100, 86.2], [50, 100], [0, 86.2]]
export const SAGOMA = `polygon(${PUNTI_SAGOMA.map(([x, y]) => `${x}% ${y}%`).join(',')})`
/** I vertici della sagoma in una tela di l x a. */
export const puntiSagoma = (l: number, a: number, dx = 0, dy = 0) => PUNTI_SAGOMA.map(([x, y]) => `${(dx + (x * l) / 100).toFixed(1)},${(dy + (y * a) / 100).toFixed(1)}`).join(' ')

/** Il volto nelle viste piccole: la stessa immagine come sfondo, ingrandita sulla parte alta. */
export const FACCIA = { dimensione: '230%', posizione: '50% 21%' }
/** Larghezza / altezza dell'esagonino col volto (Figurina). */
export const RAPPORTO_FIGURINA = 0.78

/** Colori del segnaposto (omino grigio su esagono chiaro) e del bordo. */
export const SEGNAPOSTO = { sfondo: '#d6d6d6', omino: '#4a4a4a', bordo: '#1a1712' }

export const urlCarta = (id: number, versione: number) => `/api/carte/${id}?v=${versione}`

// ---- l'archivio: si legge una volta e lo condividono tutti i componenti ----
let carte: Readonly<Record<string, number>> | null = null // null = non ancora letto
let avviata = false
const ascoltatori = new Set<() => void>()

async function leggiArchivio() {
  let nuove: Record<string, number> = {}
  try {
    const r = await fetch('/api/carte')
    const j = r.ok ? ((await r.json()) as { carte?: unknown }) : null
    if (j && typeof j.carte === 'object' && j.carte !== null) nuove = j.carte as Record<string, number>
  } catch {
    // niente carte: ovunque il segnaposto, nessun errore a schermo
  }
  carte = nuove
  ascoltatori.forEach((f) => f())
}

/** Rilegge l'archivio (dopo un caricamento o una rimozione dell'admin). */
export const rileggiCarte = () => leggiArchivio()

function segui(f: () => void) {
  ascoltatori.add(f)
  if (!avviata) {
    avviata = true
    void leggiArchivio()
  }
  return () => ascoltatori.delete(f)
}

/** L'URL della carta del giocatore, o null se non ce l'ha (o l'archivio non e' ancora arrivato / non risponde). */
export function useCarta(id: number): string | null {
  const v = useSyncExternalStore(segui, () => carte?.[String(id)] ?? null, () => null)
  return v === null ? null : urlCarta(id, v)
}
