// Tipi di scripts/gruppo.mjs (serve a test/gruppo.test.ts: tsc -b non legge il JavaScript).
export const PROGETTO_ORIGINALE: string
export const CHIAVI_GRUPPO: string[]
export function nomeValido(nome: string): boolean
export function normalizzaTeamDomain(testo: string): string | null
export function normalizzaAud(testo: string): string | null
export function elencoEmail(testo: string): { email: string[]; errore?: undefined } | { errore: string; email?: undefined }
export function leggiValore(toml: string, chiave: string): string | null
export function impostaValore(toml: string, chiave: string, valore: string): string
export function indirizzoPagesDev(uscita: string): string | null
export function databaseDaJson(uscita: string): { uuid: string; name: string }[] | null
export function sitoOriginaleSuQuestoAccount(toml: string, database: { uuid: string; name: string }[]): boolean
