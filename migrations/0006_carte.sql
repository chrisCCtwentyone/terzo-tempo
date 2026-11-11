-- Carte dei giocatori: un'immagine per giocatore (JPEG/WebP/PNG, al massimo 400 KB, controllata dal server
-- sui magic bytes). Si cancella insieme al giocatore. L'immagine la carica un admin, mai nei file del repo.
--
--   tipo      quello RICONOSCIUTO dai byte, mai quello dichiarato dal client.
--   versione  Date.now() al caricamento: il frontend la mette nell'URL (?v=) e cosi' la cache si rinnova.
CREATE TABLE carte (
  giocatore_id INTEGER PRIMARY KEY REFERENCES giocatori (id) ON DELETE CASCADE,
  immagine     BLOB    NOT NULL,
  tipo         TEXT    NOT NULL CHECK (tipo IN ('image/jpeg', 'image/webp', 'image/png')),
  versione     INTEGER NOT NULL
);
