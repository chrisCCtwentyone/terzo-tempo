# API di Terzo Tempo

Contratto per il frontend. Tutto e' JSON, in italiano, dietro `/api/*` (Cloudflare Pages Functions).
Gli esempi vengono dai dati di prova (`scripts/seed_prova.sql`: nomi inventati).

## Convenzioni

- **Errori**: sempre `{ "errore": "messaggio" }` con lo stato HTTP giusto. Il messaggio dei 400 inizia con il
  nome del campo (`"voto_pagella: a mezzi punti (7, 7.5, ...)"`) e si puo' mostrare cosi' com'e'.
  `404` id inesistente o malformato, `405` metodo non ammesso (con `Allow`), `409` conflitto (gia' votato,
  votazione chiusa, doppione...), `415` manca `Content-Type: application/json`, `500` errore interno (senza dettagli).
- **Date e ore**: `data_ora` e' sempre ISO UTC `"2026-10-01T19:00:00Z"`. L'orario che gli utenti hanno in mente
  e' **Europe/Rome**: il frontend lo mostra con `timeZone: 'Europe/Rome'`. In scrittura `data_ora` accetta
  `"2026-10-01T21:00"` **senza fuso = ora di Roma** (va bene l'`<input type="datetime-local">`), oppure un
  istante preciso con `Z` / `+02:00`. Le date senza ora (`data_inizio`, `data_fine`) sono `YYYY-MM-DD`.
- **Squadre**: nel DB sono `"A"` e `"B"`; i nomi ("Casaccati", "Smollicati") arrivano dall'API in
  `squadre[].nome` e stanno in un solo punto (`functions/lib/costanti.ts`). Il frontend non li scrive.
  Il punteggio di una squadra = gol dei suoi giocatori + **autogol degli avversari**.
- **Nomi giocatore**: `"Iniziale. Cognome"`, anche con piu' iniziali (`"A. G. Verdi"`); unici (senza distinguere maiuscole).
- **Posizioni pedine**: `pos_x`, `pos_y` in percentuale 0-100 del campo (`null` = non posizionata). Vanno sempre in coppia.
  L'orientamento del campo (quale lato e' la porta di A) lo decide il frontend.
- **Pagelle**: `voto_pagella` da 1 a 10 a mezzi punti, oppure `null` (nessuna pagella: si mostra "n.d.", mai un ripiego).
- **Statistiche non calcolabili**: `null`, non `0`.
- **Livello segreto**: non esce mai dalle rotte pubbliche (nemmeno come campo nullo; un test lo garantisce). Esiste
  solo in `/api/admin/giocatori*`.
- **Cache**: tutte le risposte sono `no-store`. **CSP**: il sito puo' caricare solo risorse proprie (font self-hosted,
  es. `@fontsource`; niente Google Fonts, niente CDN). Si allarga in `functions/_middleware.ts` se serve.
- Le scritture (POST/PUT/PATCH/DELETE) dal browser devono partire dallo stesso sito (altrimenti 403).

## Autenticazione

- **Pubbliche** (`/api/*` tranne `/api/admin/*`): nessun login.
- **Admin** (`/api/admin/*`): Cloudflare Access. Il backend verifica da solo `Cf-Access-Jwt-Assertion` contro
  `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` (in `wrangler.toml`, ora `DA_COMPILARE`) e l'email contro il secret
  `EMAIL_AUTORIZZATE`. Il browser di un admin loggato manda tutto da solo.
  Senza token `401`; token non valido, email non autorizzata o configurazione mancante `403`; chiavi di Access
  irraggiungibili `503`. **Mai aperto.** Non esistono ruoli: tutti gli admin possono tutto.
- **Sviluppo locale**: in `.dev.vars` (copiare `.dev.vars.example`) `DEV_ADMIN_BYPASS=1` apre l'admin, ma solo se
  la richiesta arriva da `localhost` / `127.0.0.1` / `[::1]`.

`GET /api/admin/me` -> `{ "email": "admin@example.org" }` (in locale col bypass: `"sviluppo@locale"`). Il frontend lo
usa per sapere se mostrare l'area admin (401/403 = non sono admin).

---

# Rotte pubbliche

## `GET /api/home`

Ultima partita giocata, prossima partita, top marcatori della stagione aperta.

```json
{
  "stagione": { "id": 2, "nome": "Stagione 2026-27" },
  "ultima_partita": { "...dettaglio partita, vedi GET /api/partite/:id..." },
  "prossima_partita": {
    "id": 11, "stagione_id": 2, "data_ora": "2026-10-01T19:00:00Z", "stato": "convocazione",
    "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": null }, { "codice": "B", "nome": "Smollicati", "gol": null } ],
    "cronaca": null,
    "giocatori": [ { "giocatore_id": 2, "nome": "L. Bianchi", "squadra": null, "pos_x": null, "pos_y": null, "gol": 0, "autogol": 0, "voto_pagella": null } ],
    "mvp": { "stato": "non_aperto", "voti_totali": 0, "ha_votato": false, "chiude_il": null }
  },
  "top_marcatori": [
    { "posizione": 1, "giocatore_id": 11, "nome": "T. Bruno", "attivo": true, "valore": 8, "presenze": 7 }
  ]
}
```

- `stagione` e `top_marcatori` (`[]`) sono vuoti se nessuna stagione e' aperta. `ultima_partita` / `prossima_partita`
  sono `null` se non ce ne sono.
- `ultima_partita` = la giocata piu' recente (di qualunque stagione). `prossima_partita` = la partita **in convocazione**
  con la data piu' vicina (anche se la data e' gia' passata e l'admin non l'ha ancora segnata giocata).
- `top_marcatori`: massimo 5 posizioni; chi e' a pari merito nell'ultima posizione entra tutto (quindi possono essere di piu').

## `GET /api/stagioni`

```json
{ "stagioni": [
  { "id": 2, "nome": "Stagione 2026-27", "aperta": true,  "data_inizio": "2026-07-01", "data_fine": null,         "partite_giocate": 9 },
  { "id": 1, "nome": "Stagione 2025-26", "aperta": false, "data_inizio": "2025-09-01", "data_fine": "2026-06-30", "partite_giocate": 2 }
] }
```

## `GET /api/classifiche?stagione=<id>|sempre`

`stagione` assente = `sempre`. Id inesistente = 404.

```json
{
  "stagione": { "id": 2, "nome": "Stagione 2026-27", "aperta": true },
  "minimo_partite": 3,
  "gol":          [ { "posizione": 1, "giocatore_id": 11, "nome": "T. Bruno", "attivo": true, "valore": 8, "presenze": 7 } ],
  "presenze":     [ { "posizione": 1, "giocatore_id": 11, "nome": "T. Bruno", "attivo": true, "valore": 7, "presenze": 7 } ],
  "media_voto":   [ { "posizione": 1, "giocatore_id": 1,  "nome": "M. Rossi", "attivo": true, "valore": 8.33, "presenze": 7 } ],
  "mvp":          [ { "posizione": 1, "giocatore_id": 1,  "nome": "M. Rossi", "attivo": true, "valore": 2, "presenze": 7 } ],
  "pct_vittorie": [ { "posizione": 1, "giocatore_id": 14, "nome": "V. De Luca", "attivo": true, "valore": 100, "presenze": 5 } ]
}
```

- `stagione` e' `null` per "sempre".
- Ordine per `valore` decrescente, poi per cognome. A pari valore stessa `posizione` (1, 1, 3).
- `gol` e `mvp` non elencano chi ha 0. `media_voto` (partite **con pagella**) e `pct_vittorie` (presenze) elencano solo
  chi ha almeno `minimo_partite` partite: costante `MIN_PARTITE_CLASSIFICA` in `functions/lib/costanti.ts`.
- `media_voto` a 2 decimali; `pct_vittorie` a 1 decimale (0-100); una vittoria = piu' gol della squadra avversaria (il pareggio non e' vittoria).
- `mvp` conta solo le votazioni chiuse con un vincitore (una parita' non ancora decisa non da' MVP a nessuno).

## `GET /api/partite?stagione=<id>|sempre`

Elenco riepilogativo, dalla piu' recente (comprese le convocazioni). `stagione` assente = `sempre`.

```json
{ "stagione": null, "partite": [
  { "id": 11, "stagione_id": 2, "data_ora": "2026-10-01T19:00:00Z", "stato": "convocazione",
    "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": null }, { "codice": "B", "nome": "Smollicati", "gol": null } ] }
] }
```

## `GET /api/partite/:id`

Dettaglio: squadre, posizioni, gol, pagelle, cronaca, stato MVP. Questa chiamata puo' chiudere la votazione MVP se e' scaduta.

```json
{
  "id": 10, "stagione_id": 2, "data_ora": "2026-09-24T19:00:00Z", "stato": "giocata",
  "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": 6 }, { "codice": "B", "nome": "Smollicati", "gol": 3 } ],
  "cronaca": "Cronaca di prova, breve come spesso succede.",
  "giocatori": [
    { "giocatore_id": 1, "nome": "M. Rossi", "squadra": "A", "pos_x": 32.5, "pos_y": 21.4, "gol": 2, "autogol": 0, "voto_pagella": 8.5 }
  ],
  "mvp": { "stato": "assegnato", "voti_totali": 12, "ha_votato": false, "chiude_il": null,
           "chiuso_il": "2026-09-25T19:00:00Z", "risultati": [ { "giocatore_id": 1, "nome": "M. Rossi", "voti": 5 } ],
           "vincitore": { "giocatore_id": 1, "nome": "M. Rossi" }, "candidati": [] }
}
```

- `stato`: `"convocazione"` | `"giocata"`. In convocazione `gol` delle squadre e' `null`.
- `giocatori` ordinati per squadra (A, B, poi chi non e' assegnato, `squadra: null`) e per cognome.
  `gol` / `autogol` sono del giocatore (l'autogol e' un gol a favore degli avversari).
- `cronaca` e' `null` se non scritta: la pagina deve stare bene anche cosi'.
- Il blocco `mvp` e' descritto sotto.

## `GET /api/partite/:id/mvp`

Stato della votazione. Stesso oggetto del campo `mvp` del dettaglio.

| `stato` | Quando | Campi |
|---|---|---|
| `non_aperto` | partita ancora in convocazione | `voti_totali` (0), `ha_votato` (false), `chiude_il` (null) |
| `aperto` | giocata, non chiusa dall'admin e adesso < `data_ora` + 24 h | `voti_totali`, `ha_votato`, `chiude_il` |
| `assegnato` | chiusa, un vincitore | + `chiuso_il`, `risultati`, `vincitore`, `candidati: []` |
| `parita_da_decidere` | chiusa, pari merito: decide l'admin | + `chiuso_il`, `risultati`, `vincitore: null`, `candidati: [{giocatore_id, nome}, ...]` |
| `nessun_voto` | chiusa senza nessun voto | + `chiuso_il`, `risultati: []`, `vincitore: null`, `candidati: []` |

**Mentre e' `aperto` non c'e' nessun conteggio per giocatore**: solo `voti_totali` e `ha_votato` (questo dispositivo ha
gia' votato). `risultati` = `[{ giocatore_id, nome, voti }]` dal piu' votato. `chiude_il` e' l'ora della chiusura automatica
(per un conto alla rovescia); l'admin puo' chiudere prima. La chiusura automatica avviene alla prima lettura dopo la scadenza
(nessun cron): il passaggio a `assegnato` / `parita_da_decidere` / `nessun_voto` e' immediato.

## `POST /api/partite/:id/mvp`

Vota. Corpo: `{ "giocatore_id": 2 }`. Un voto per dispositivo per partita.

```
POST /api/partite/12/mvp   Content-Type: application/json   { "giocatore_id": 2 }

201  Set-Cookie: tt_dispositivo=<64 hex>; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax
{ "ok": true, "mvp": { "stato": "aperto", "voti_totali": 1, "ha_votato": true, "chiude_il": "2026-10-01T19:00:00Z" } }
```

- Il dispositivo e' riconosciuto da un cookie con un token casuale assegnato dal server al primo voto (il frontend non
  deve fare niente: basta che il browser mandi i cookie, `fetch` same-origin lo fa da solo). Nel DB c'e' solo l'hash SHA-256.
  Incognito o un altro browser = un altro dispositivo (limite accettato).
- Si puo' votare **chiunque sia nel listone** (giocatori attivi), anche se stessi e anche chi non ha giocato.
- Errori: `409` `"hai gia' votato per questa partita"`; `409` `"votazione chiusa"`; `409` `"la partita non e' ancora stata giocata"`;
  `400` `"giocatore_id: non e' nel listone"`; `404` partita inesistente.

## `GET /api/giocatori[?tutti=1]`

Il listone, con badge e totali (su tutte le stagioni), per cognome. Di default solo gli attivi; `?tutti=1` include gli archiviati.

```json
{ "giocatori": [
  { "id": 2, "nome": "L. Bianchi", "attivo": true,
    "badge": [ { "id": 7, "nome": "Dribblomane", "descrizione": null, "tipo": "positivo" } ],
    "totali": { "presenze": 6, "gol": 4, "media_voto": 7.6, "mvp": 0 } }
] }
```

`badge[].descrizione` puo' essere `null` (vedi `docs/DOMANDE_APERTE.md`). `media_voto` e' `null` senza pagelle.

## `GET /api/giocatori/:id[?stagione=<id>|sempre]`

Scheda giocatore (funziona anche per gli archiviati). `stagione` assente = `sempre`.

```json
{
  "giocatore": { "id": 1, "nome": "M. Rossi", "attivo": true,
                 "badge": [ { "id": 2, "nome": "Cecchino", "descrizione": null, "tipo": "positivo" } ] },
  "stagione": null,
  "totali": { "presenze": 8, "gol": 8, "autogol": 0, "gol_a_partita": 1, "partite_con_voto": 7, "media_voto": 8.43,
              "vittorie": 6, "pareggi": 0, "sconfitte": 2, "pct_vittorie": 75, "mvp": 3 },
  "ultime_5": [ { "partita_id": 12, "data_ora": "2026-09-30T19:00:00Z", "esito": "V" } ],
  "voti_per_partita": [ { "partita_id": 2, "data_ora": "2026-05-28T19:00:00Z", "voto": 9, "gol": 1, "autogol": 0 } ]
}
```

- `ultime_5`: le ultime 5 presenze, dalla piu' recente; `esito` = `"V"` vittoria, `"P"` pareggio, `"S"` sconfitta.
- `voti_per_partita`: solo le partite con pagella, in ordine cronologico (per un grafico).
- Senza presenze: numeri a 0 e `media_voto`, `pct_vittorie`, `gol_a_partita` a `null`.
- Presenza = convocato con squadra assegnata in una partita **giocata**.

---

# Rotte admin (`/api/admin/*`)

Tutte richiedono l'accesso (sopra). Corpo JSON con `Content-Type: application/json`. Nei `PATCH` si mandano solo i campi da cambiare.

## Giocatori

- `GET /api/admin/giocatori` -> `{ "giocatori": [ { "id": 2, "nome": "L. Bianchi", "attivo": true, "livello_segreto": 4, "badge_ids": [5, 7] } ] }`
  (tutti, archiviati compresi; **e' l'unico posto col livello**).
- `POST /api/admin/giocatori` `{ "nome": "A. G. Verdi", "livello_segreto": 4, "attivo": true }` -> `201` con il giocatore.
  `livello_segreto` (intero 1-5) e `attivo` sono facoltativi. `409` se il nome esiste.
- `GET /api/admin/giocatori/:id`
- `PATCH /api/admin/giocatori/:id` `{ "nome"?, "attivo"?, "livello_segreto"? }` (`livello_segreto: null` lo toglie).
- `DELETE /api/admin/giocatori/:id` solo se non ha partite ne' voti, altrimenti `409` (si archivia con `attivo: false`).
- `PUT /api/admin/giocatori/:id/badge` `{ "badge_ids": [1, 7] }` sostituisce i badge del giocatore -> `{ "giocatore_id": 14, "badge_ids": [1, 7] }`.

## Badge

- `GET /api/admin/badge` -> `{ "badge": [ { "id": 1, "nome": "Corridore", "descrizione": null, "tipo": "positivo" } ] }`
- `POST /api/admin/badge` `{ "nome": "Jolly", "descrizione": "Gioca ovunque", "tipo": "positivo" | "negativo" }` -> `201`. `descrizione` facoltativa.
- `PATCH /api/admin/badge/:id` `{ "nome"?, "descrizione"? (null la toglie), "tipo"? }`
- `DELETE /api/admin/badge/:id` lo toglie anche a chi lo ha.

## Stagioni

L'elenco e' pubblico (`GET /api/stagioni`). **Una sola stagione alla volta puo' essere aperta** (409 altrimenti).

- `POST /api/admin/stagioni` `{ "nome": "Stagione 2026-27", "data_inizio": "2026-07-01", "data_fine"?: "...", "aperta"?: true }` -> `201`.
  `aperta` vale `true` se omesso: se ce n'e' gia' un'altra aperta, `409` (chiudila prima, o manda `"aperta": false`).
- `POST /api/admin/stagioni/:id/apri` -> `{ "id": 2, "aperta": true }`. `409` se un'altra e' aperta.
- `POST /api/admin/stagioni/:id/chiudi` `{ "data_fine"?: "2026-06-30" }` (corpo facoltativo; default: oggi a Roma) -> `{ "id", "aperta": false, "data_fine" }`.

## Partite

Flusso: **crea la convocazione** -> **salva squadre e pedine** (ripetibile) -> a partita finita **inserisci gol, autogol e pagelle**
-> **segna giocata** col risultato -> eventuale cronaca / correzioni. Il generatore e' un aiuto alla fase "squadre".

- `POST /api/admin/partite` `{ "data_ora": "2026-10-08T21:00", "giocatori": [1, 2, 3], "stagione_id"?: 2 }` -> `201`
  `{ "id": 12, "stagione_id": 2, "data_ora": "2026-10-08T19:00:00Z", "stato": "convocazione" }`.
  Senza `stagione_id` usa la stagione aperta (`409` se non ce n'e'). `giocatori` puo' essere `[]`.
- `PUT /api/admin/partite/:id/convocati` **sostituisce tutto l'elenco**, quindi si manda sempre per intero:

  ```json
  { "convocati": [
    { "giocatore_id": 1, "squadra": "A", "pos_x": 50, "pos_y": 90, "gol": 2, "autogol": 0, "voto_pagella": 8.5 },
    { "giocatore_id": 4, "squadra": "B" },
    { "giocatore_id": 9 }
  ] }
  ```

  `squadra` `"A"` | `"B"` | `null` (non assegnato); `pos_x`/`pos_y` in coppia; `gol`, `autogol` (default 0); `voto_pagella` (default `null`).
  Risposta: il dettaglio partita (come `GET /api/partite/:id`) piu' `avvisi` (vedi sotto). Se la partita e' gia' giocata, ogni
  convocato deve avere una squadra e le due squadre non possono essere vuote (`409`). Togliere qualcuno dall'elenco = non ha giocato.
- `POST /api/admin/partite/:id/giocata` `{ "gol_a": 3, "gol_b": 1 }` segna la partita giocata col risultato. `409` se qualche
  convocato non ha una squadra, se una squadra e' vuota, o se e' gia' giocata. Risposta: dettaglio + `avvisi`.
- `PATCH /api/admin/partite/:id` `{ "data_ora"?, "stagione_id"?, "cronaca"? (null o "" la toglie, max 5000 caratteri), "gol_a"?, "gol_b"? }`
  I gol solo per partite gia' giocate (correzione del risultato). Cambiare `data_ora` sposta anche la scadenza del voto MVP.
- `DELETE /api/admin/partite/:id` solo se in convocazione.

**`avvisi`** (`string[]`): se i gol dei giocatori (autogol avversari compresi) non tornano col risultato, per ogni squadra
un messaggio, es. `"Smollicati: il risultato e' 2, i gol registrati (autogol avversari compresi) sono 1"`. Sono avvisi, non errori:
il server non inventa mai un gol per far tornare i conti; si mostrano all'admin. Vuoto se tutto torna (o se la partita non e' ancora giocata).

## Generatore di squadre

`POST /api/admin/partite/:id/genera-squadre` `{ "seed"?: 3 }` (intero 0 .. 4294967295, facoltativo).

```json
{ "seed": 3, "squadre": [
  { "codice": "A", "nome": "Casaccati",  "media": 0.616, "giocatori": [ { "giocatore_id": 1, "nome": "M. Rossi" } ] },
  { "codice": "B", "nome": "Smollicati", "media": 0.616, "giocatori": [ { "giocatore_id": 2, "nome": "L. Bianchi" } ] }
] }
```

- Parte dai **convocati gia' salvati** della partita. **Non salva niente**: l'admin ritocca a mano e salva con `PUT .../convocati`.
- Due squadre di dimensione uguale o con differenza 1. Stesso seed = stessa proposta; senza seed ne sceglie uno a caso e lo
  restituisce (per "rigenera" basta richiamare senza seed). `media` e' il punteggio medio (0-1) della squadra.
- Bilancia un punteggio che mescola media voto, % vittorie, gol a partita e livello segreto, e cerca di non mettere lo stesso badge
  tutto da una parte. Pesi e regole: `functions/lib/costanti.ts` e `functions/lib/generatore.ts`. Il livello non compare nella risposta.
- `400` con meno di 2 convocati o piu' di 24.

## Voto MVP (admin)

- `POST /api/admin/partite/:id/mvp/chiudi` chiude subito la votazione e calcola vincitore o parita' -> il blocco `mvp` con i risultati.
  `409` se la partita non e' giocata o la votazione e' gia' chiusa (anche in automatico).
- `POST /api/admin/partite/:id/mvp/decidi` `{ "giocatore_id": 13 }` sceglie il vincitore fra i pari merito
  (`mvp.stato === "parita_da_decidere"`, candidati in `mvp.candidati`) -> il blocco `mvp` (`assegnato`).
  `400` se non e' fra i pari merito, `409` se non c'e' nessuna parita' da decidere. Il vincitore e' sempre uno solo.

---

# Sviluppo

```bash
npm install
npm run typecheck        # tsc -b (con "references": `tsc --noEmit` NON controllerebbe niente)
npm test                 # vitest, le Functions girano su un D1 finto con le migrazioni vere
npm run build            # tsc -b && vite build -> app/dist
cp .dev.vars.example .dev.vars
npm run db:migra && npm run db:seed    # D1 locale con i dati di prova (MAI --remote)
npm run dev:api          # Pages + D1 locale su http://localhost:8788 (serve la build in app/dist)
npm run dev              # Vite su :5173, proxy /api -> :8788
```
