// Tipi di scripts/verifiche_mirate.mjs (serve a test/verifiche_mirate.test.ts: tsc -b non legge il JavaScript).
export type Prove = { e2e: boolean; admin: boolean }
export type Gruppo = { regola: string; e2e: boolean; admin: boolean; file: string[] }
export const REGOLE: { nome: string; percorsi: string[]; prove: Prove; schermate: 'tutte' | 'per-file' | never[] }[]
export type Schermate = 'tutte' | string[]
export const GRUPPI_TRABOCCHI: { pubblico: string[]; admin: string[] }
export const TUTTI_I_GRUPPI: string[]
export const SCHERMATE_PER_FILE: { percorsi: string[]; gruppi: string[] }[]
export function classificaFile(percorso: string): { file: string; regola: string; schermate: Schermate } & Prove
export type Verifiche = { e2e: boolean; e2eAdmin: boolean; motivo: string; gruppi: Gruppo[]; trabocchi: 'tutte' | 'nessuna' | string[]; trabocchiPerche: Record<string, string[]> }
export function verificheMirate(files: string[], opzioni?: { completo?: boolean }): Verifiche
export function valoreTrabocchi(t: Verifiche['trabocchi']): string
export function riassuntoTrabocchi(r: Verifiche, opzioni?: { completo?: boolean }): string[]
export function riassuntoFile(gruppi: Gruppo[]): string[]
