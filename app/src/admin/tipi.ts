// Forma delle risposte di /api/admin/* (contratto: docs/API.md, sezione "Rotte admin").
import type { Codice, Partita } from '../lib/tipi'

export type GiocatoreAdmin = {
  id: number
  /** "Cognome I." (composto dal server) */
  nome: string
  cognome: string
  /** "S.C." */
  iniziali: string
  attivo: boolean
  /** 1-5 (5 = il piu' forte) o null. MAI nelle API pubbliche: solo qui. */
  livello_segreto: number | null
  badge_ids: number[]
}

export type Proposta = {
  seed: number
  squadre: { codice: Codice; nome: string; media: number; giocatori: { giocatore_id: number; nome: string }[] }[]
}

/** Dettaglio partita; le scritture su convocati e "giocata" aggiungono gli avvisi sui conti. */
export type PartitaAdmin = Partita & { avvisi?: string[] }
