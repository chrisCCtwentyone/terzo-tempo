-- Partita in diretta (decisioni dell'utente, 01/10/2026): un admin segna i gol MENTRE si gioca.
--
-- STATO. Non c'e' una colonna "stato diretta": si calcola alla lettura (come la chiusura del voto MVP, senza cron) da
--   partite.stato, diretta_iniziata_il, diretta_finita_il, data_ora, dalle squadre assegnate e dagli eventi
--   (functions/lib/diretta.ts). Le due colonne dicono solo cio' che un admin ha FATTO:
--     diretta_iniziata_il  "Inizia diretta" premuto (ISO UTC). NULL = nessuno l'ha premuto: se la partita ha le squadre
--                          assegnate parte da sola all'orario (data_ora).
--     diretta_finita_il    "Fine partita" premuto (ISO UTC). Da quel momento gli eventi non si toccano piu'.
--
-- EVENTI. Tipo di evento: tabella `tipi_evento` + chiave esterna, NON un CHECK con l'elenco: un CHECK di SQLite non si
-- puo' modificare senza ricostruire la tabella; qui, per aggiungere 'assist' o 'tiro', basta una INSERT in una migrazione
-- (piu' il codice che li conta: functions/lib/diretta.ts).
--
--   squadra       la squadra BENEFICIARIA del punto ('A' o 'B'): per un gol e' la squadra del marcatore, per un
--                 AUTOGOL e' quella AVVERSARIA (stessa regola di tutto il resto: un autogol vale un gol per gli avversari).
--   id_client     UUID generato dal telefono: UNIQUE, rende l'invio idempotente (un invio ripetuto non crea doppioni).
--   annullato     cancellazione LOGICA, non vera: tiene la "pietra tombale" dell'id_client, cosi' un invio in ritardo
--                 (telefono senza rete che ritenta) non puo' far risorgere un gol gia' annullato.
--   annullato_da  id_client dell'azione "Annulla ultimo" che l'ha annullato: rende idempotente anche quella.
--   Nessuna email e nessun nome di chi segna: l'ordine dei gol e' l'ordine di `id` (AUTOINCREMENT, mai riusato).

ALTER TABLE partite ADD COLUMN diretta_iniziata_il TEXT;
ALTER TABLE partite ADD COLUMN diretta_finita_il TEXT;

CREATE TABLE tipi_evento (
  tipo TEXT PRIMARY KEY CHECK (length(tipo) BETWEEN 1 AND 20)
);
INSERT INTO tipi_evento (tipo) VALUES ('gol'), ('autogol');

CREATE TABLE eventi_partita (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  partita_id   INTEGER NOT NULL REFERENCES partite (id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL REFERENCES tipi_evento (tipo),
  squadra      TEXT NOT NULL CHECK (squadra IN ('A', 'B')),
  giocatore_id INTEGER NOT NULL REFERENCES giocatori (id),
  id_client    TEXT NOT NULL UNIQUE CHECK (length(id_client) BETWEEN 8 AND 64),
  annullato    INTEGER NOT NULL DEFAULT 0 CHECK (annullato IN (0, 1)),
  annullato_da TEXT UNIQUE CHECK (annullato_da IS NULL OR length(annullato_da) BETWEEN 8 AND 64),
  creato_il    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX eventi_per_partita ON eventi_partita (partita_id, id);
CREATE INDEX eventi_per_giocatore ON eventi_partita (giocatore_id);
