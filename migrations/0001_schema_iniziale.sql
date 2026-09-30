-- Terzo Tempo: schema iniziale.
--
-- I nomi delle squadre NON stanno qui: nel DB la squadra e' 'A' o 'B'
-- (functions/lib/costanti.ts la traduce in nome).
-- Le date/ore sono ISO 8601 in UTC ("2026-10-01T19:00:00Z"); l'orario che
-- l'utente ha in mente e' Europe/Rome.

CREATE TABLE giocatori (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL UNIQUE COLLATE NOCASE,          -- "Iniziale. Cognome"
  attivo          INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0, 1)),  -- 0 = archiviato
  -- MAI in nessuna risposta pubblica (vedi test/livello_pubblico.test.ts)
  livello_segreto INTEGER CHECK (livello_segreto IS NULL OR livello_segreto BETWEEN 1 AND 5),
  creato_il       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE badge (
  id          INTEGER PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  descrizione TEXT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('positivo', 'negativo'))
);

CREATE TABLE giocatore_badge (
  giocatore_id INTEGER NOT NULL REFERENCES giocatori (id) ON DELETE CASCADE,
  badge_id     INTEGER NOT NULL REFERENCES badge (id) ON DELETE CASCADE,
  PRIMARY KEY (giocatore_id, badge_id)
);

CREATE TABLE stagioni (
  id          INTEGER PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  aperta      INTEGER NOT NULL DEFAULT 1 CHECK (aperta IN (0, 1)),
  data_inizio TEXT NOT NULL,   -- YYYY-MM-DD
  data_fine   TEXT             -- YYYY-MM-DD, valorizzata alla chiusura
);
-- Al massimo una stagione aperta alla volta.
CREATE UNIQUE INDEX una_sola_stagione_aperta ON stagioni (aperta) WHERE aperta = 1;

CREATE TABLE partite (
  id              INTEGER PRIMARY KEY,
  stagione_id     INTEGER NOT NULL REFERENCES stagioni (id),
  data_ora        TEXT NOT NULL,   -- ISO UTC
  stato           TEXT NOT NULL DEFAULT 'convocazione' CHECK (stato IN ('convocazione', 'giocata')),
  gol_a           INTEGER CHECK (gol_a IS NULL OR gol_a >= 0),
  gol_b           INTEGER CHECK (gol_b IS NULL OR gol_b >= 0),
  cronaca         TEXT,
  -- Votazione MVP. 'aperto' vale anche per una partita ancora in convocazione:
  -- la votazione e' davvero aperta solo se stato = 'giocata', mvp_chiuso_il e'
  -- NULL e non sono passate 24 ore (functions/lib/mvp.ts).
  mvp_stato       TEXT NOT NULL DEFAULT 'aperto'
                  CHECK (mvp_stato IN ('aperto', 'parita_da_decidere', 'assegnato', 'nessun_voto')),
  mvp_chiuso_il   TEXT,
  CHECK (stato = 'convocazione' OR (gol_a IS NOT NULL AND gol_b IS NOT NULL)),
  CHECK (mvp_stato = 'aperto' OR mvp_chiuso_il IS NOT NULL)
);
CREATE INDEX partite_per_stagione ON partite (stagione_id, data_ora);

-- Convocati / partecipazioni. Una riga per giocatore convocato.
CREATE TABLE partecipazioni (
  partita_id   INTEGER NOT NULL REFERENCES partite (id) ON DELETE CASCADE,
  giocatore_id INTEGER NOT NULL REFERENCES giocatori (id),
  squadra      TEXT CHECK (squadra IS NULL OR squadra IN ('A', 'B')),  -- NULL = non ancora assegnato
  pos_x        REAL CHECK (pos_x IS NULL OR pos_x BETWEEN 0 AND 100),
  pos_y        REAL CHECK (pos_y IS NULL OR pos_y BETWEEN 0 AND 100),
  gol          INTEGER NOT NULL DEFAULT 0 CHECK (gol >= 0),
  autogol      INTEGER NOT NULL DEFAULT 0 CHECK (autogol >= 0),
  -- pagella da 1 a 10, a mezzi punti
  voto_pagella REAL CHECK (voto_pagella IS NULL
                           OR (voto_pagella BETWEEN 1 AND 10 AND voto_pagella * 2 = CAST(voto_pagella * 2 AS INTEGER))),
  PRIMARY KEY (partita_id, giocatore_id)
);
CREATE INDEX partecipazioni_per_giocatore ON partecipazioni (giocatore_id);

-- Un voto per dispositivo per partita. Del token si salva SOLO l'hash SHA-256.
CREATE TABLE voti_mvp (
  id           INTEGER PRIMARY KEY,
  partita_id   INTEGER NOT NULL REFERENCES partite (id) ON DELETE CASCADE,
  hash_token   TEXT NOT NULL,
  giocatore_id INTEGER NOT NULL REFERENCES giocatori (id),
  creato_il    TEXT NOT NULL,
  UNIQUE (partita_id, hash_token)
);

-- Il vincitore e' UNO (PRIMARY KEY su partita_id). La parita' non e' una riga
-- qui: e' mvp_stato = 'parita_da_decidere' finche' l'admin non sceglie.
CREATE TABLE mvp_vincitori (
  partita_id   INTEGER PRIMARY KEY REFERENCES partite (id) ON DELETE CASCADE,
  giocatore_id INTEGER NOT NULL REFERENCES giocatori (id)
);

-- Badge iniziali (dati di configurazione, non personali). Le descrizioni sono
-- solo quelle scritte nel CLAUDE.md; le altre restano vuote finche' l'admin
-- non le compila (docs/DOMANDE_APERTE.md).
INSERT INTO badge (nome, descrizione, tipo) VALUES
  ('Corridore',     NULL, 'positivo'),
  ('Cecchino',      NULL, 'positivo'),
  ('Instancabile',  NULL, 'positivo'),
  ('Muro',          NULL, 'positivo'),
  ('Regista',       NULL, 'positivo'),
  ('Saracinesca',   'Portiere', 'positivo'),
  ('Dribblomane',   NULL, 'positivo'),
  ('Turista',       'Non torna in difesa', 'negativo'),
  ('Egoista',       'Non passa mai', 'negativo'),
  ('Polemico',      NULL, 'negativo'),
  ('Ritardatario',  NULL, 'negativo'),
  ('Fragile',       NULL, 'negativo');
