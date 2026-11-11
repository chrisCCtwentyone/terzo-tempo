import { chiama } from '../lib/api'

/** Scrittura JSON verso /api/admin/*. Same-origin: il browser manda da solo Origin e i cookie di Access, come si aspetta il middleware anti-CSRF. */
export const scrivi = <T = unknown>(metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE', percorso: string, corpo?: unknown) =>
  chiama<T>(percorso, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  })

/** PUT di un file (i byte, non JSON) verso /api/admin/*: stessa gestione degli errori di `scrivi`. */
export const scriviFile = <T = unknown>(percorso: string, file: Blob) =>
  chiama<T>(percorso, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
