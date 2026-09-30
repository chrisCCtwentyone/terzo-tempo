-- Campo da gioco (luogo della partita).
--
-- L'admin incolla il link "Condividi" di Google Maps (https://maps.app.goo.gl/...): il server lo
-- segue (functions/lib/maps.ts, con le difese anti-SSRF) e ricava nome e posizione; il nome si puo'
-- sempre correggere. Nessun dato in questa migrazione: i campi li inserisce l'admin.
--
--   link_originale  il testo incollato (l'URL), com'e': serve a ritrovare da dove viene il campo;
--                   NON esce mai da nessuna API pubblica.
--   lat, lng        coordinate del posto, NULL se il link non le contiene (vanno in coppia).
--   url_indicazioni "https://www.google.com/maps/dir/?api=1&destination=..." calcolato dal server;
--                   le API pubbliche lo RICOSTRUISCONO comunque da lat/lng/nome, senza fidarsi di
--                   questa colonna (vedi functions/lib/campi.ts).
--   archiviato      1 = non si sceglie piu' per le nuove partite, resta su quelle passate.
CREATE TABLE campi (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) BETWEEN 1 AND 80),
  link_originale  TEXT,
  lat             REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng             REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  url_indicazioni TEXT,
  creato_il       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  archiviato      INTEGER NOT NULL DEFAULT 0 CHECK (archiviato IN (0, 1)),
  CHECK ((lat IS NULL) = (lng IS NULL))
);

-- Il campo di una partita: facoltativo. Un campo usato non si cancella (si archivia).
ALTER TABLE partite ADD COLUMN campo_id INTEGER REFERENCES campi (id);
CREATE INDEX partite_per_campo ON partite (campo_id);
