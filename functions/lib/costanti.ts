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
 * voto) e "% vittorie" (presenze). Vale anche per il generatore di squadre.
 * 0 = nessun minimo (decisione dell'utente, 30/09/2026: compaiono tutti subito).
 */
export const MIN_PARTITE_CLASSIFICA = 0;

/** Quanti marcatori mostra la home. */
export const TOP_MARCATORI_HOME = 5;

/**
 * Freno agli abusi del voto MVP (un voto per dispositivo resta il limite "vero", accettato: si aggira
 * con l'incognito). Qui si limitano gli script: al massimo tanti voti per RETE (intestazione
 * CF-Connecting-IP, che il client non puo' falsificare) per partita. Generoso, cosi' una famiglia o
 * un gruppo sullo stesso wifi vota senza problemi. Senza l'intestazione (solo sviluppo locale) non si limita.
 */
export const LIMITE_VOTI_PER_IP = 10;
/** Quanti caratteri esadecimali dell'hash della rete si conservano (4 = 16 bit: non risale all'indirizzo). */
export const CIFRE_HASH_RETE = 4;

// ─── Limiti degli ingressi (l'admin e' fidato, ma un token rubato o un errore non devono poter tutto) ───

/** Corpo massimo di una richiesta JSON, in byte. */
export const MAX_CORPO_BYTE = 64 * 1024;
/** Convocati (e giocatori di una nuova partita) al massimo: il generatore ne ammette 24, qui c'e' margine. */
export const MAX_CONVOCATI = 60;
/** Nome di un campo da gioco (come gli altri nomi: testo senza caratteri di controllo). */
export const MAX_NOME_CAMPO = 80;
/** Testo incollato dall'admin nel campo "Link di Google Maps" (link + eventuale testo intorno). */
export const MAX_LINK_CAMPO = 2000;
/** Badge assegnabili a un giocatore in una richiesta. */
export const MAX_BADGE_PER_RICHIESTA = 60;

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

// ─── Risoluzione dei link di Google Maps (functions/lib/maps.ts) ───

/** Redirect seguiti a mano, al massimo (il primo indirizzo non conta: e' la richiesta iniziale). */
export const MAX_REDIRECT_MAPS = 5;
/** Tempo totale concesso a Google per rispondere, tutti i passaggi insieme. */
export const TIMEOUT_MAPS_MS = 5000;
