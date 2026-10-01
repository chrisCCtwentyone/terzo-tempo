// Tipi di scripts/verifiche_mirate.mjs (serve a test/verifiche_mirate.test.ts: tsc -b non legge il JavaScript).
export type Prove = { e2e: boolean; admin: boolean }
export type Gruppo = { regola: string; e2e: boolean; admin: boolean; file: string[] }
export const REGOLE: { nome: string; percorsi: string[]; prove: Prove }[]
export function classificaFile(percorso: string): { file: string; regola: string } & Prove
export function verificheMirate(files: string[], opzioni?: { completo?: boolean }): { e2e: boolean; e2eAdmin: boolean; motivo: string; gruppi: Gruppo[] }
export function riassuntoFile(gruppi: Gruppo[]): string[]
