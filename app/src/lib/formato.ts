// Formattazione di date, numeri e nomi. Funzioni pure (testate in test/frontend.test.ts).
import { dividiNome } from '../../../shared/nomi'

/** Gli orari che gli utenti hanno in mente sono di Roma; il backend li da in UTC (docs/API.md). */
const FUSO = 'Europe/Rome'
const it = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, ...o })
const fGiorno = it({ weekday: 'short', day: 'numeric', month: 'short' })
const fGiornoAnno = it({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fOra = it({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const fBreve = it({ day: 'numeric', month: 'short' })
const fGiornoNum = it({ day: 'numeric' })
const fMese = it({ month: 'short' })

export const giorno = (iso: string) => fGiorno.format(new Date(iso))
export const giornoAnno = (iso: string) => fGiornoAnno.format(new Date(iso))
export const giornoOra = (iso: string) => `${fGiorno.format(new Date(iso))} · ${fOra.format(new Date(iso))}`
export const dataBreve = (iso: string) => fBreve.format(new Date(iso))
export const giornoNumero = (iso: string) => fGiornoNum.format(new Date(iso))
export const meseBreve = (iso: string) => fMese.format(new Date(iso))
export const ora = (iso: string) => fOra.format(new Date(iso))

/** Numero all'italiana ("8,33"), al massimo `dec` decimali e senza zeri inutili. */
export const numero = (n: number, dec = 0) => n.toLocaleString('it-IT', { maximumFractionDigits: dec })
/** Voto in pagella a un decimale ("7,0", "8,5"); `null` = nessuna pagella: "n.d.", mai un ripiego. */
export const voto = (v: number | null) => (v === null ? 'n.d.' : v.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
/** Media a due decimali; `null` = non calcolabile. */
export const media = (v: number | null) => (v === null ? 'n.d.' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
export const classeVoto = (v: number | null) => (v === null ? 'nd' : v >= 7 ? 'hi' : v >= 6 ? 'mid' : 'lo')

/** "Rossi S.C." -> "Rossi"; "De Luca V." -> "De Luca" (il nome e' sempre "Cognome I.": shared/nomi.ts). */
export const cognome = (nome: string) => dividiNome(nome).cognome
/**
 * Le iniziali della figurina. Con le iniziali del nome: la prima + quella del cognome
 * ("Verdi A.G." -> "AV"). Senza (giocatori con il solo nome, "Gianni", "Amico Gianni"):
 * la prima lettera delle prime due parole se sono due o piu' ("Amico Gianni" -> "AG"),
 * altrimenti le prime due lettere ("Gianni" -> "GI").
 */
export const iniziali = (nome: string) => {
  const d = dividiNome(nome)
  if (d.iniziali) return `${d.iniziali.charAt(0)}${d.cognome.charAt(0)}`.toUpperCase()
  const parole = d.cognome.split(/\s+/).filter(Boolean)
  const lettere = parole.length >= 2 ? `${parole[0].charAt(0)}${parole[1].charAt(0)}` : [...(parole[0] ?? '')].slice(0, 2).join('')
  return lettere.toUpperCase()
}
/** Colore stabile della figurina (6 tinte), dall'id del giocatore. */
export const tinta = (id: number) => Math.abs(id) % 6

export const plurale = (n: number, uno: string, molti: string) => (n === 1 ? uno : molti)

/** Secondi rimasti -> "HH:MM:SS" (le ore possono superare 24). */
export function conto(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
