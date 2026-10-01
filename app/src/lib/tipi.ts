// Forma delle risposte di /api/* (contratto: docs/API.md). Solo tipi, nessun codice.

export type Codice = 'A' | 'B'
export type Tipo = 'positivo' | 'negativo'

export type Badge = { id: number; nome: string; descrizione: string | null; tipo: Tipo }
export type SquadraPunteggio = { codice: Codice; nome: string; gol: number | null }

export type GiocatoreInPartita = {
  giocatore_id: number
  nome: string
  squadra: Codice | null
  pos_x: number | null
  pos_y: number | null
  gol: number
  autogol: number
  voto_pagella: number | null
}

type MvpBase = { voti_totali: number; ha_votato: boolean }
export type Mvp =
  | (MvpBase & { stato: 'non_aperto'; chiude_il: null })
  | (MvpBase & { stato: 'aperto'; chiude_il: string })
  | (MvpBase & {
      stato: 'assegnato' | 'parita_da_decidere' | 'nessun_voto'
      chiude_il: null
      chiuso_il: string | null
      risultati: { giocatore_id: number; nome: string; voti: number }[]
      vincitore: { giocatore_id: number; nome: string } | null
      candidati: { giocatore_id: number; nome: string }[]
    })

/** Il campo da gioco di una partita: l'indirizzo e' sempre https://www.google.com/maps/... costruito dal server. */
export type Campo = { nome: string; url_indicazioni: string }

export type Partita = {
  id: number
  stagione_id: number
  data_ora: string
  stato: 'convocazione' | 'giocata'
  squadre: SquadraPunteggio[]
  campo: Campo | null
  cronaca: string | null
  giocatori: GiocatoreInPartita[]
  mvp: Mvp
}
export type PartitaRiga = Pick<Partita, 'id' | 'stagione_id' | 'data_ora' | 'stato' | 'squadre' | 'campo'>

export type Stagione = { id: number; nome: string; aperta: boolean; data_inizio: string; data_fine: string | null; partite_giocate: number }

export type RigaClassifica = { posizione: number; giocatore_id: number; nome: string; attivo: boolean; valore: number; presenze: number }
export const CATEGORIE = ['gol', 'presenze', 'media_voto', 'mvp', 'pct_vittorie'] as const
export type Categoria = (typeof CATEGORIE)[number]
export type Classifiche = { stagione: { id: number; nome: string; aperta: boolean } | null; minimo_partite: number } & Record<Categoria, RigaClassifica[]>

/**
 * La partita in diretta (GET /api/partite/:id/diretta e, con l'id_client, /api/admin/partite/:id/diretta). `squadra` di un evento e' la
 * squadra che INCASSA il punto: per un autogol e' quella avversaria del giocatore.
 */
export type StatoDiretta = 'non_iniziata' | 'in_diretta' | 'da_confermare' | 'finita'
export type TipoEvento = 'gol' | 'autogol'
export type EventoDiretta = { id: number; id_client?: string; tipo: TipoEvento; autogol: boolean; squadra: Codice; giocatore_id: number; nome: string }
export type Diretta = {
  partita_id: number
  stato: StatoDiretta
  inizio: string | null
  scade_il: string | null
  squadre: SquadraPunteggio[]
  max_eventi: number
  eventi: EventoDiretta[]
}
/** La partita in diretta (o da confermare) per la home e per la scorciatoia LIVE: GET /api/diretta. */
export type DirettaCorrente = { partita_id: number; stato: 'in_diretta' | 'da_confermare'; data_ora: string; squadre: SquadraPunteggio[] }

export type HomeDati = {
  stagione: { id: number; nome: string } | null
  ultima_partita: Partita | null
  prossima_partita: Partita | null
  top_marcatori: RigaClassifica[]
  diretta: DirettaCorrente | null
}

export type GiocatoreListone = {
  id: number
  nome: string
  attivo: boolean
  badge: Badge[]
  totali: { presenze: number; gol: number; media_voto: number | null; mvp: number }
}

export type Totali = {
  presenze: number
  gol: number
  autogol: number
  gol_a_partita: number | null
  partite_con_voto: number
  media_voto: number | null
  vittorie: number
  pareggi: number
  sconfitte: number
  pct_vittorie: number | null
  mvp: number
}
export type Scheda = {
  giocatore: { id: number; nome: string; attivo: boolean; badge: Badge[] }
  stagione: { id: number; nome: string } | null
  totali: Totali
  ultime_5: { partita_id: number; data_ora: string; esito: 'V' | 'P' | 'S' }[]
  voti_per_partita: { partita_id: number; data_ora: string; voto: number; gol: number; autogol: number }[]
}
