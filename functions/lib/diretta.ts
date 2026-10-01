/**
 * Partita in diretta (decisioni dell'utente, 01/10/2026; schema: migrations/0005_diretta.sql).
 *
 * STATO (calcolato alla lettura, senza cron, come la chiusura del voto MVP):
 *   finita         la partita e' "giocata";
 *   da_confermare  "Fine partita" premuto, OPPURE passate DUE ORE dall'inizio senza che nessuno chiudesse (e c'e' stata
 *                  davvero una diretta: inizio manuale o almeno un gol). Il risultato aspetta il voto in pagella e
 *                  "Segna come giocata" dell'admin;
 *   in_diretta     iniziata (a mano con "Inizia diretta", oppure da sola all'ORARIO della partita, ma solo se le squadre
 *                  sono assegnate) e non ancora chiusa ne' scaduta;
 *   non_iniziata   tutto il resto (anche una partita senza squadre all'ora dell'inizio: niente "IN DIRETTA 0-0" falso).
 *
 * Gol e autogol hanno la stessa semantica di tutto il resto del codice: l'evento ha la squadra BENEFICIARIA del punto.
 * Un gol vale per la squadra del marcatore, un AUTOGOL per quella avversaria.
 *
 * Nessuna email e nessun nome di chi segna nel database. Nessun livello segreto in nessuna di queste risposte.
 */

import { CODICI_SQUADRA, DURATA_MASSIMA_DIRETTA_MS, FORMA_ID_CLIENT, MAX_EVENTI_DIRETTA, SQUADRE, type CodiceSquadra } from './costanti';
import { caricaPartita, type PartitaDb } from './mvp';
import { ErroreApi, idDa } from './risposta';

export type StatoDiretta = 'non_iniziata' | 'in_diretta' | 'da_confermare' | 'finita';
export const TIPI_EVENTO = ['gol', 'autogol'] as const;
export type TipoEvento = (typeof TIPI_EVENTO)[number];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';

export const altra = (c: CodiceSquadra): CodiceSquadra => (c === 'A' ? 'B' : 'A');
/** La squadra che incassa il punto: del marcatore per un gol, degli avversari per un autogol. */
export const beneficiaria = (tipo: TipoEvento, squadraDelGiocatore: CodiceSquadra): CodiceSquadra => (tipo === 'gol' ? squadraDelGiocatore : altra(squadraDelGiocatore));

// ─── validazione ───

const KO = (campo: string, cosa: string): never => {
  throw new ErroreApi(400, `${campo}: ${cosa}`);
};

/** Un UUID del telefono (o simile): 8-64 caratteri, e NON solo cifre (altrimenti nel percorso sembrerebbe un id numerico). */
export function idClient(v: unknown, campo = 'id_client'): string {
  if (typeof v !== 'string' || !FORMA_ID_CLIENT.test(v) || /^\d+$/.test(v)) KO(campo, 'identificativo di 8-64 caratteri (lettere, cifre, - e _), non di sole cifre');
  return v as string;
}

export function tipoEvento(v: unknown, campo = 'tipo'): TipoEvento {
  if (typeof v !== 'string' || !(TIPI_EVENTO as readonly string[]).includes(v)) KO(campo, `${TIPI_EVENTO.join(' o ')}`);
  return v as TipoEvento;
}

// ─── lettura ───

export type EventoDb = { id: number; partita_id: number; id_client: string; tipo: TipoEvento; squadra: CodiceSquadra; giocatore_id: number; annullato: number; nome: string };

// Ogni SQL e' scritto per intero, senza interpolazioni: la guardia di test/sicurezza_sql.test.ts le vieta.
const Q_ATTIVI = `SELECT e.id, e.partita_id, e.id_client, e.tipo, e.squadra, e.giocatore_id, e.annullato, g.nome
                    FROM eventi_partita e JOIN giocatori g ON g.id = e.giocatore_id
                   WHERE e.partita_id = ? AND e.annullato = 0 ORDER BY e.id`;
const Q_PER_ID = `SELECT e.id, e.partita_id, e.id_client, e.tipo, e.squadra, e.giocatore_id, e.annullato, g.nome
                    FROM eventi_partita e JOIN giocatori g ON g.id = e.giocatore_id
                   WHERE e.partita_id = ? AND e.id = ?`;
const Q_PER_ID_CLIENT = `SELECT e.id, e.partita_id, e.id_client, e.tipo, e.squadra, e.giocatore_id, e.annullato, g.nome
                           FROM eventi_partita e JOIN giocatori g ON g.id = e.giocatore_id
                          WHERE e.id_client = ?`;
const Q_ANNULLATO_DA = `SELECT e.id, e.partita_id, e.id_client, e.tipo, e.squadra, e.giocatore_id, e.annullato, g.nome
                          FROM eventi_partita e JOIN giocatori g ON g.id = e.giocatore_id
                         WHERE e.annullato_da = ? AND e.partita_id = ?`;

/** Gli eventi non annullati, nell'ordine in cui sono arrivati. Al massimo MAX_EVENTI_DIRETTA righe, tutte per chiave: niente di pesante. */
export async function eventiAttivi(db: D1Database, partitaId: number): Promise<EventoDb[]> {
  return (await db.prepare(Q_ATTIVI).bind(partitaId).all<EventoDb>()).results;
}

/** Un evento della partita, dall'id numerico OPPURE dall'id_client (il telefono non conosce l'id del server finche' non e' partito). */
export async function trovaEvento(db: D1Database, partitaId: number, chiave: unknown): Promise<EventoDb> {
  const testo = String(chiave);
  let r: EventoDb | null = null;
  if (/^\d+$/.test(testo)) r = await db.prepare(Q_PER_ID).bind(partitaId, idDa(testo)).first<EventoDb>();
  else if (FORMA_ID_CLIENT.test(testo)) r = await db.prepare(Q_PER_ID_CLIENT).bind(testo).first<EventoDb>();
  if (r && r.partita_id !== partitaId) r = null; // un gol di un'altra partita non si tocca
  if (!r) throw new ErroreApi(404, 'gol non trovato');
  return r;
}

async function squadreAssegnate(db: D1Database, partitaId: number): Promise<boolean> {
  const r = await db
    .prepare('SELECT COUNT(DISTINCT squadra) AS n FROM partecipazioni WHERE partita_id = ? AND squadra IS NOT NULL')
    .bind(partitaId)
    .first<{ n: number }>();
  return (r?.n ?? 0) === CODICI_SQUADRA.length;
}

async function contaEventi(db: D1Database, partitaId: number, anchePassati: boolean): Promise<number> {
  const r = await db
    .prepare(anchePassati ? 'SELECT COUNT(*) AS n FROM eventi_partita WHERE partita_id = ?' : 'SELECT COUNT(*) AS n FROM eventi_partita WHERE partita_id = ? AND annullato = 0')
    .bind(partitaId)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export type Esito = { stato: StatoDiretta; /** l'inizio effettivo (ISO UTC), solo se la diretta e' partita */ inizio: string | null };

/** Lo stato della diretta. Legge dal database solo quello che gli serve (squadre, numero di gol). */
export async function statoDiretta(db: D1Database, p: PartitaDb, adesso: number): Promise<Esito> {
  if (p.stato === 'giocata') return { stato: 'finita', inizio: p.diretta_iniziata_il };
  if (p.diretta_finita_il !== null) return { stato: 'da_confermare', inizio: p.diretta_iniziata_il ?? p.data_ora };
  const manuale = p.diretta_iniziata_il !== null;
  let inizio = p.diretta_iniziata_il;
  if (inizio === null) {
    // partenza automatica: all'orario della partita, ma solo se ci sono le squadre
    if (Date.parse(p.data_ora) > adesso || !(await squadreAssegnate(db, p.id))) return { stato: 'non_iniziata', inizio: null };
    inizio = p.data_ora;
  }
  const t = Date.parse(inizio);
  if (adesso < t) return { stato: 'non_iniziata', inizio: null };
  if (adesso < t + DURATA_MASSIMA_DIRETTA_MS) return { stato: 'in_diretta', inizio };
  // scaduta e mai chiusa: c'e' qualcosa da confermare solo se la diretta c'e' stata davvero
  return manuale || (await contaEventi(db, p.id, true)) > 0 ? { stato: 'da_confermare', inizio } : { stato: 'non_iniziata', inizio: null };
}

export const scadenzaDiretta = (inizio: string): string => iso(Date.parse(inizio) + DURATA_MASSIMA_DIRETTA_MS);

/** Punteggio dagli eventi (per squadra BENEFICIARIA). */
export function punteggioDa(eventi: { squadra: CodiceSquadra }[]): Record<CodiceSquadra, number> {
  const p: Record<CodiceSquadra, number> = { A: 0, B: 0 };
  for (const e of eventi) p[e.squadra]++;
  return p;
}

const squadreConGol = (gol: Record<CodiceSquadra, number> | { gol_a: number | null; gol_b: number | null }) => {
  const [a, b] = 'A' in gol ? [gol.A, gol.B] : [gol.gol_a, gol.gol_b];
  return CODICI_SQUADRA.map((codice) => ({ codice, nome: SQUADRE[codice], gol: codice === 'A' ? a : b }));
};

/**
 * La risposta della diretta. `admin` aggiunge l'id_client di ogni gol (serve al telefono dell'admin per riconoscere i
 * propri gol gia' arrivati): al pubblico non esce. A partita giocata la fonte e' il dettaglio della partita: qui il
 * punteggio e' quello ufficiale e l'elenco dei gol e' vuoto.
 */
export async function vistaDiretta(db: D1Database, p: PartitaDb, adesso: number, admin: boolean) {
  const { stato, inizio } = await statoDiretta(db, p, adesso);
  const eventi = stato === 'finita' ? [] : await eventiAttivi(db, p.id);
  return {
    partita_id: p.id,
    stato,
    inizio,
    scade_il: stato === 'in_diretta' && inizio ? scadenzaDiretta(inizio) : null,
    squadre: stato === 'finita' ? squadreConGol(p) : squadreConGol(punteggioDa(eventi)),
    max_eventi: MAX_EVENTI_DIRETTA,
    eventi: eventi.map((e) => ({
      id: e.id,
      ...(admin ? { id_client: e.id_client } : {}),
      tipo: e.tipo,
      autogol: e.tipo === 'autogol',
      squadra: e.squadra,
      giocatore_id: e.giocatore_id,
      nome: e.nome,
    })),
  };
}
export type VistaDiretta = Awaited<ReturnType<typeof vistaDiretta>>;

/** Partita (404 se non c'e'). */
export async function partitaODa404(db: D1Database, id: number): Promise<PartitaDb> {
  const p = await caricaPartita(db, id);
  if (!p) throw new ErroreApi(404, 'partita non trovata');
  return p;
}

// ─── la diretta "in corso" per la home e per la scorciatoia LIVE (leggerissima: nessun nome, nessuna lista) ───

export type DirettaCorrente = { partita_id: number; stato: 'in_diretta' | 'da_confermare'; data_ora: string; squadre: ReturnType<typeof squadreConGol> };

/**
 * La partita in diretta adesso (o, in mancanza, quella da confermare piu' recente). Candidate: partite in convocazione con una
 * diretta partita a mano, nella finestra delle due ore dall'orario, o con almeno un gol. Una convocazione vecchia, senza
 * diretta, non compare mai.
 */
export async function direttaCorrente(db: D1Database, adesso: number): Promise<DirettaCorrente | null> {
  const r = await db
    .prepare(
      `SELECT id, stagione_id, data_ora, stato, gol_a, gol_b, cronaca, mvp_stato, mvp_chiuso_il, campo_id, diretta_iniziata_il, diretta_finita_il
         FROM partite p
        WHERE stato = 'convocazione'
          AND (diretta_iniziata_il IS NOT NULL
               OR (data_ora <= ?1 AND data_ora > ?2)
               OR EXISTS (SELECT 1 FROM eventi_partita e WHERE e.partita_id = p.id))
        ORDER BY data_ora DESC, id DESC LIMIT 10`,
    )
    .bind(iso(adesso), iso(adesso - DURATA_MASSIMA_DIRETTA_MS))
    .all<PartitaDb>();
  let daConfermare: PartitaDb | null = null;
  for (const p of r.results) {
    const { stato } = await statoDiretta(db, p, adesso);
    if (stato === 'in_diretta') return corrente(db, p, 'in_diretta');
    if (stato === 'da_confermare' && !daConfermare) daConfermare = p;
  }
  return daConfermare ? corrente(db, daConfermare, 'da_confermare') : null;
}

async function corrente(db: D1Database, p: PartitaDb, stato: 'in_diretta' | 'da_confermare'): Promise<DirettaCorrente> {
  const r = await db
    .prepare('SELECT squadra, COUNT(*) AS n FROM eventi_partita WHERE partita_id = ? AND annullato = 0 GROUP BY squadra')
    .bind(p.id)
    .all<{ squadra: CodiceSquadra; n: number }>();
  const gol: Record<CodiceSquadra, number> = { A: 0, B: 0 };
  for (const x of r.results) gol[x.squadra] = x.n;
  return { partita_id: p.id, stato, data_ora: p.data_ora, squadre: squadreConGol(gol) };
}

// ─── scritture ───

function nonInDiretta(stato: StatoDiretta): never {
  throw new ErroreApi(409, stato === 'non_iniziata' ? 'la diretta non è iniziata' : stato === 'finita' ? 'la partita è già giocata: i gol non si cambiano qui' : 'la diretta è finita: il risultato aspetta la conferma');
}

export async function richiediInDiretta(db: D1Database, p: PartitaDb, adesso: number): Promise<void> {
  const { stato } = await statoDiretta(db, p, adesso);
  if (stato !== 'in_diretta') nonInDiretta(stato);
}

/** "Inizia diretta". Idempotente. Serve almeno un giocatore per squadra. */
export async function iniziaDiretta(db: D1Database, p: PartitaDb, adesso: number): Promise<void> {
  const { stato } = await statoDiretta(db, p, adesso);
  if (stato === 'in_diretta') {
    // gia' in corso (anche da sola): se nessuno l'aveva premuto, si fissa l'inizio effettivo
    if (p.diretta_iniziata_il === null) {
      await db.prepare("UPDATE partite SET diretta_iniziata_il = ? WHERE id = ? AND diretta_iniziata_il IS NULL AND diretta_finita_il IS NULL AND stato = 'convocazione'").bind(p.data_ora, p.id).run();
    }
    return;
  }
  if (stato !== 'non_iniziata') nonInDiretta(stato);
  if (!(await squadreAssegnate(db, p.id))) throw new ErroreApi(409, 'assegna prima le squadre (sezione Squadre): serve almeno un giocatore per squadra');
  await db
    .prepare("UPDATE partite SET diretta_iniziata_il = ?1 WHERE id = ?2 AND stato = 'convocazione' AND diretta_iniziata_il IS NULL AND diretta_finita_il IS NULL")
    .bind(iso(adesso), p.id)
    .run();
}

async function squadraInCampo(db: D1Database, partitaId: number, giocatoreId: number): Promise<CodiceSquadra> {
  const r = await db.prepare('SELECT squadra FROM partecipazioni WHERE partita_id = ? AND giocatore_id = ?').bind(partitaId, giocatoreId).first<{ squadra: CodiceSquadra | null }>();
  if (!r || r.squadra === null) throw new ErroreApi(400, 'giocatore_id: non è in campo in questa partita');
  return r.squadra;
}

/** Registra un gol o un autogol. Con un id_client gia' visto restituisce l'evento che c'e' (nuovo = false), senza duplicare. */
export async function registraEvento(db: D1Database, p: PartitaDb, adesso: number, idCl: string, tipo: TipoEvento, giocatoreId: number): Promise<{ evento: EventoDb; nuovo: boolean }> {
  const esistente = await db.prepare(Q_PER_ID_CLIENT).bind(idCl).first<EventoDb>();
  if (esistente) {
    if (esistente.partita_id !== p.id) throw new ErroreApi(409, 'id_client: già usato per un\'altra partita');
    return { evento: esistente, nuovo: false }; // un invio ripetuto: stesso evento, anche se e' stato annullato o la partita e' finita
  }
  await richiediInDiretta(db, p, adesso);
  const squadra = beneficiaria(tipo, await squadraInCampo(db, p.id, giocatoreId));
  try {
    const r = await db
      .prepare(
        `INSERT INTO eventi_partita (partita_id, tipo, squadra, giocatore_id, id_client)
         SELECT ?1, ?2, ?3, ?4, ?5
          WHERE EXISTS (SELECT 1 FROM partite WHERE id = ?1 AND stato = 'convocazione' AND diretta_finita_il IS NULL)
            AND (SELECT COUNT(*) FROM eventi_partita WHERE partita_id = ?1) < ?6`,
      )
      .bind(p.id, tipo, squadra, giocatoreId, idCl, MAX_EVENTI_DIRETTA)
      .run();
    if (r.meta.changes === 0) {
      if ((await contaEventi(db, p.id, true)) >= MAX_EVENTI_DIRETTA) throw new ErroreApi(409, `troppi gol registrati in questa partita (al massimo ${MAX_EVENTI_DIRETTA})`);
      throw new ErroreApi(409, 'la diretta è finita: il risultato aspetta la conferma');
    }
  } catch (e) {
    // due invii dello stesso id_client in contemporanea: vince il primo, il secondo restituisce lo stesso evento
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      const gia = await db.prepare(Q_PER_ID_CLIENT).bind(idCl).first<EventoDb>();
      if (gia && gia.partita_id === p.id) return { evento: gia, nuovo: false };
    }
    throw e;
  }
  return { evento: await trovaEvento(db, p.id, idCl), nuovo: true };
}

/** Cambia marcatore e/o tipo. Con gli stessi valori che ci sono gia' non fa niente e riesce (un invio ripetuto). */
export async function cambiaEvento(db: D1Database, p: PartitaDb, adesso: number, chiave: unknown, tipo: TipoEvento | undefined, giocatoreId: number | undefined): Promise<EventoDb> {
  const ev = await trovaEvento(db, p.id, chiave);
  if (ev.annullato === 1) throw new ErroreApi(409, 'questo gol è stato annullato');
  const nuovoTipo = tipo ?? ev.tipo;
  const nuovoGiocatore = giocatoreId ?? ev.giocatore_id;
  if (nuovoTipo === ev.tipo && nuovoGiocatore === ev.giocatore_id) return ev;
  await richiediInDiretta(db, p, adesso);
  const squadra = beneficiaria(nuovoTipo, await squadraInCampo(db, p.id, nuovoGiocatore));
  const r = await db
    // la stessa condizione "la diretta e' ancora aperta" sta dentro ogni scrittura, in SQL: nessuna corsa con "Fine partita"
    .prepare("UPDATE eventi_partita SET tipo = ?1, squadra = ?2, giocatore_id = ?3 WHERE id = ?4 AND annullato = 0 AND EXISTS (SELECT 1 FROM partite WHERE id = ?5 AND stato = 'convocazione' AND diretta_finita_il IS NULL)")
    .bind(nuovoTipo, squadra, nuovoGiocatore, ev.id, p.id)
    .run();
  if (r.meta.changes === 0) throw new ErroreApi(409, 'la diretta è finita o il gol è stato annullato nel frattempo');
  return trovaEvento(db, p.id, ev.id);
}

/** Elimina (annulla) un gol. Idempotente: se e' gia' annullato riesce. */
export async function eliminaEvento(db: D1Database, p: PartitaDb, adesso: number, chiave: unknown): Promise<EventoDb> {
  const ev = await trovaEvento(db, p.id, chiave);
  if (ev.annullato === 1) return ev;
  await richiediInDiretta(db, p, adesso);
  const r = await db
    .prepare("UPDATE eventi_partita SET annullato = 1 WHERE id = ?1 AND annullato = 0 AND EXISTS (SELECT 1 FROM partite WHERE id = ?2 AND stato = 'convocazione' AND diretta_finita_il IS NULL)")
    .bind(ev.id, p.id)
    .run();
  const dopo = await trovaEvento(db, p.id, ev.id);
  if (r.meta.changes === 0 && dopo.annullato === 0) throw new ErroreApi(409, 'la diretta è finita: il risultato aspetta la conferma');
  return dopo;
}

/** Annulla l'ultimo gol non annullato. Idempotente rispetto all'id_client dell'AZIONE: una ripetizione restituisce lo stesso gol. */
export async function annullaUltimo(db: D1Database, p: PartitaDb, adesso: number, idAzione: string): Promise<EventoDb> {
  const fatto = await db.prepare(Q_ANNULLATO_DA).bind(idAzione, p.id).first<EventoDb>();
  if (fatto) return fatto;
  await richiediInDiretta(db, p, adesso);
  try {
    const r = await db
      .prepare(
        `UPDATE eventi_partita SET annullato = 1, annullato_da = ?1
          WHERE id = (SELECT id FROM eventi_partita WHERE partita_id = ?2 AND annullato = 0 ORDER BY id DESC LIMIT 1)
            AND EXISTS (SELECT 1 FROM partite WHERE id = ?2 AND stato = 'convocazione' AND diretta_finita_il IS NULL)`,
      )
      .bind(idAzione, p.id)
      .run();
    if (r.meta.changes === 0) throw new ErroreApi(409, 'non c\'è nessun gol da annullare');
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint failed')) {
      const gia = await db.prepare(Q_ANNULLATO_DA).bind(idAzione, p.id).first<EventoDb>();
      if (gia) return gia;
    }
    throw e;
  }
  return (await db.prepare(Q_ANNULLATO_DA).bind(idAzione, p.id).first<EventoDb>())!;
}

/**
 * "Fine partita": i gol e gli autogol per giocatore, calcolati DAGLI EVENTI dentro la stessa transazione, vanno negli stessi
 * campi che riempie la schermata Risultato (partecipazioni.gol e .autogol); il punteggio si ricava da quelli, come sempre.
 * La partita resta "in convocazione": l'admin mette i voti e preme "Segna come giocata". Idempotente: una seconda
 * pressione non ricalcola niente (altrimenti cancellerebbe le correzioni fatte a mano nel frattempo).
 */
export async function fineDiretta(db: D1Database, p: PartitaDb, adesso: number): Promise<void> {
  if (p.stato === 'giocata') throw new ErroreApi(409, 'la partita è già giocata');
  if (p.diretta_finita_il !== null) return;
  const { stato } = await statoDiretta(db, p, adesso);
  if (stato === 'non_iniziata') nonInDiretta(stato);
  const ora = iso(adesso);
  await db.batch([
    db.prepare("UPDATE partite SET diretta_finita_il = ?1 WHERE id = ?2 AND stato = 'convocazione' AND diretta_finita_il IS NULL").bind(ora, p.id),
    db
      .prepare(
        `UPDATE partecipazioni SET
           gol = (SELECT COUNT(*) FROM eventi_partita e WHERE e.partita_id = partecipazioni.partita_id AND e.giocatore_id = partecipazioni.giocatore_id AND e.tipo = 'gol' AND e.annullato = 0),
           autogol = (SELECT COUNT(*) FROM eventi_partita e WHERE e.partita_id = partecipazioni.partita_id AND e.giocatore_id = partecipazioni.giocatore_id AND e.tipo = 'autogol' AND e.annullato = 0)
         WHERE partita_id = ?1 AND EXISTS (SELECT 1 FROM partite WHERE id = ?1 AND diretta_finita_il = ?2)`,
      )
      .bind(p.id, ora),
  ]);
}

/**
 * Durante la diretta (non chiusa) i convocati con un gol non si possono spostare di squadra ne' togliere: il gol registrato
 * resterebbe attribuito alla squadra sbagliata. Dopo "Fine partita" la schermata Risultato torna libera.
 */
export async function controllaConvocatiConDiretta(db: D1Database, p: PartitaDb, righe: { giocatore_id: number; squadra: CodiceSquadra | null }[]): Promise<void> {
  if (p.stato !== 'convocazione' || p.diretta_finita_il !== null) return;
  for (const e of await eventiAttivi(db, p.id)) {
    const r = righe.find((x) => x.giocatore_id === e.giocatore_id);
    if (!r || r.squadra === null || beneficiaria(e.tipo, r.squadra) !== e.squadra) {
      throw new ErroreApi(409, `diretta in corso: ${e.nome} ha un ${e.tipo} registrato, non si può togliere né spostare di squadra. Cambia prima il gol dalla schermata LIVE`);
    }
  }
}
