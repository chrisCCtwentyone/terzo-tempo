/**
 * Tutte le costanti di dominio, in UN punto.
 */

/**
 * Nomi delle squadre (decisione dell'utente, 30/09/2026: "potra' cambiare,
 * tenerlo in un solo punto"). Nel DB la squadra e' solo 'A' o 'B'.
 */
export const SQUADRE = { A: 'Casaccati', B: 'Smollicati' } as const;
export type CodiceSquadra = keyof typeof SQUADRE;
export const CODICI_SQUADRA = Object.keys(SQUADRE) as CodiceSquadra[];

/** Fuso in cui l'utente intende gli orari delle partite; nel DB sono in UTC. */
export const FUSO_ORARIO = 'Europe/Rome';

/** Votazione MVP: chiusa da sola 24 ore dopo l'ORARIO DELLA PARTITA. */
export const FINESTRA_VOTO_MVP_MS = 24 * 60 * 60 * 1000;

/**
 * Minimo di partite per comparire nelle classifiche "media voto" (partite CON
 * voto) e "% vittorie" (presenze). Vale anche per il generatore di squadre:
 * sotto questa soglia una statistica non conta. Valore provvisorio, da
 * confermare (docs/DOMANDE_APERTE.md).
 */
export const MIN_PARTITE_CLASSIFICA = 3;

/** Quanti marcatori mostra la home. */
export const TOP_MARCATORI_HOME = 5;

/** Nome del cookie del dispositivo (voto MVP). */
export const COOKIE_DISPOSITIVO = 'tt_dispositivo';
export const COOKIE_DISPOSITIVO_DURATA_S = 60 * 60 * 24 * 365;

// ─── Generatore di squadre ───

/** Pesi del punteggio di un giocatore (si rinormalizzano su cio' che c'e'). */
export const PESI_PUNTEGGIO = { voto: 0.35, vittorie: 0.2, gol: 0.15, livello: 0.3 } as const;
/** Punteggio (0-1) di chi non ha ne' statistiche ne' livello. */
export const PUNTEGGIO_NEUTRO = 0.5;
/** Gol a partita che valgono il punteggio massimo (0-1) della componente gol. */
export const GOL_A_PARTITA_MASSIMO = 1;
/** Peso della differenza fra le medie delle squadre e dello sbilanciamento dei badge. */
export const PESO_EQUILIBRIO_PUNTEGGIO = 1;
export const PESO_EQUILIBRIO_BADGE = 0.3;
/** Oltre questo numero di convocati la ricerca esaustiva non e' piu' rapida: si rifiuta. */
export const MAX_CONVOCATI_GENERATORE = 24;
