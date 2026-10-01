# API di Terzo Tempo

Contratto per il frontend. Tutto e' JSON, in italiano, dietro `/api/*` (Cloudflare Pages Functions).
Gli esempi vengono dai dati di prova (`scripts/seed_prova.sql`: nomi inventati).

## Convenzioni

- **Errori**: sempre `{ "errore": "messaggio" }` con lo stato HTTP giusto. Il messaggio dei 400 inizia con il
  nome del campo (`"voto_pagella: a mezzi punti (7, 7.5, ...)"`) e si puo' mostrare cosi' com'e'.
  `404` id inesistente o malformato, `405` metodo non ammesso (con `Allow`), `409` conflitto (gia' votato,
  votazione chiusa, doppione...), `413` corpo oltre 64 KB, `415` manca `Content-Type: application/json`,
  `429` troppi voti dalla stessa rete per la stessa partita (solo il voto MVP), `500` errore interno (senza dettagli).
- **Date e ore**: `data_ora` e' sempre ISO UTC `"2026-10-01T19:00:00Z"`. L'orario che gli utenti hanno in mente
  e' **Europe/Rome**: il frontend lo mostra con `timeZone: 'Europe/Rome'`. In scrittura `data_ora` accetta
  `"2026-10-01T21:00"` **senza fuso = ora di Roma** (va bene l'`<input type="datetime-local">`), oppure un
  istante preciso con `Z` / `+02:00`. Le date senza ora (`data_inizio`, `data_fine`) sono `YYYY-MM-DD`.
- **Squadre**: nel DB sono `"A"` e `"B"`; i nomi ("Casaccati", "Smollicati") arrivano dall'API in
  `squadre[].nome` e stanno in un solo punto (`functions/lib/costanti.ts`). Il frontend non li scrive.
  Il punteggio di una squadra = gol dei suoi giocatori + **autogol degli avversari**.
- **Nomi giocatore**: `"Cognome I."`, iniziali attaccate col punto: `"Rossi M."`, `"Rossi S.C."`, `"De Luca V."` (decisione dell'utente,
  30/09/2026). E' la forma di `nome` in TUTTE le risposte, ordinate per cognome; unici (senza distinguere maiuscole). L'admin li inserisce in
  due campi, `cognome` e `iniziali`, e il server compone il nome (`shared/nomi.ts`, usato anche dal frontend).
  Le `iniziali` sono **facoltative**: senza, il nome e' il solo testo scritto (`"Giorgio"`, `"Amico Giorgio"`) e `iniziali` vale `""`.
- **Posizioni pedine**: `pos_x`, `pos_y` in percentuale 0-100 del campo (`null` = non posizionata). Vanno sempre in coppia.
  Dall'admin sono le coordinate delle CASELLE del modulo scelto (`shared/moduli.ts`: a 5 `1-2-1`, `2-2`; a 6 `2-1-2`, `3-2`; a 7 `3-2-1`, `2-3-1`,
  `3-1-2`; a 8 `3-3-1`, `3-2-2`; portiere sempre incluso). Il modulo NON ha una colonna: si deduce dalle posizioni (`deduciModulo`), quindi la pagina
  pubblica mostra le pedine sulle caselle senza leggere altro; senza posizioni usa la disposizione automatica.
  L'orientamento del campo (quale lato e' la porta di A) lo decide il frontend.
- **Pagelle**: `voto_pagella` da 1 a 10 a mezzi punti, oppure `null` (nessuna pagella: si mostra "n.d.", mai un ripiego).
- **Statistiche non calcolabili**: `null`, non `0`.
- **Livello segreto**: non esce mai dalle rotte pubbliche (nemmeno come campo nullo; un test lo garantisce). Esiste
  solo in `/api/admin/giocatori*`.
- **Cache**: tutte le risposte sono `no-store` (compresa la diretta, che cambia ogni minuto). **CSP**: il sito puo' caricare solo risorse proprie (font self-hosted,
  es. `@fontsource`; niente Google Fonts, niente CDN), senza `unsafe-inline` ne' `unsafe-eval`
  (`script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`...).
  Si allarga in `functions/_middleware.ts` se serve, e si dice perche'. Ogni risposta porta anche HSTS,
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy` (`same-origin`).
- Le scritture (POST/PUT/PATCH/DELETE) dal browser devono partire dallo stesso sito (altrimenti 403): il middleware
  controlla `Origin` e `Sec-Fetch-Site` su tutte le scritture di `/api`, voto MVP compreso.
- **Limiti degli ingressi** (`functions/lib/costanti.ts`, `functions/lib/valida.ts`): corpo JSON al massimo 64 KB (`413`);
  id_client 8-64 caratteri, eventi della diretta 200 per partita, nome badge 40, descrizione badge 120, nome stagione 60, nome campo 80, link di Google Maps 2000, cognome 40, iniziali 3, cronaca 5000 caratteri; elenchi
  (convocati, giocatori di una partita, badge di un giocatore) al massimo 60 elementi (`400` col nome del campo);
  nei testi sono vietati i caratteri di controllo e quelli invisibili che ribaltano il verso di scrittura
  (i soli a capo e tabulazioni ammessi sono quelli della cronaca).

## Autenticazione

- **Pubbliche** (`/api/*` tranne `/api/admin/*`): nessun login.
- **Admin** (`/api/admin/*`): Cloudflare Access. Il backend verifica da solo `Cf-Access-Jwt-Assertion` contro
  `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` (in `wrangler.toml`, ora `DA_COMPILARE`) e l'email contro il secret
  `EMAIL_AUTORIZZATE`. Il browser di un admin loggato manda tutto da solo.
  Senza token `401` (`"accesso richiesto"`); token non valido, email non autorizzata o configurazione mancante `403`
  (`"accesso negato"`, sempre lo stesso messaggio: il motivo resta nei log del server, non arriva a chi bussa); chiavi di
  Access irraggiungibili `503`. **Mai aperto.** Non esistono ruoli: tutti gli admin possono tutto.
  Il controllo vale per QUALSIASI percorso che contenga i segmenti `api` e `admin`, comunque scritti (maiuscole,
  `%`-codifiche anche doppie o malformate, doppi slash, `;`, `\`).
- **Sviluppo locale**: in `.dev.vars` (copiare `.dev.vars.example`) `DEV_ADMIN_BYPASS=1` apre l'admin, ma solo se
  TUTTE queste condizioni valgono: la richiesta arriva da `localhost` / `127.0.0.1` / `[::1]`, Access NON e' configurato
  (l'esempio azzera `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`, che altrimenti verrebbero da `wrangler.toml`) e la richiesta non
  porta `Cf-Ray` (lo mette l'edge di Cloudflare su ogni richiesta vera). In produzione il bypass non si apre mai, nemmeno
  se la variabile ci finisse per errore: Access li' e' configurato.

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
    "campo": { "nome": "Centro Sportivo Esempio", "url_indicazioni": "https://www.google.com/maps/dir/?api=1&destination=44.123456,10.654321" },
    "cronaca": null,
    "giocatori": [ { "giocatore_id": 2, "nome": "Bianchi L.", "squadra": null, "pos_x": null, "pos_y": null, "gol": 0, "autogol": 0, "voto_pagella": null } ],
    "mvp": { "stato": "non_aperto", "voti_totali": 0, "ha_votato": false, "chiude_il": null }
  },
  "top_marcatori": [
    { "posizione": 1, "giocatore_id": 11, "nome": "Bruno T.", "attivo": true, "valore": 8, "presenze": 7 }
  ],
  "diretta": { "partita_id": 12, "stato": "in_diretta", "data_ora": "2026-10-08T19:00:00Z",
               "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": 2 }, { "codice": "B", "nome": "Smollicati", "gol": 1 } ] }
}
```

- `diretta` e' la partita **in diretta adesso** (`stato: "in_diretta"`) oppure, se non ce n'e', quella **"da confermare"** piu' recente, oppure `null`.
  Leggerissima (nessun nome, nessuna lista di gol): vedi "Partita in diretta (pubblico)" sotto.
- `stagione` e `top_marcatori` (`[]`) sono vuoti se nessuna stagione e' aperta. `ultima_partita` / `prossima_partita`
  sono `null` se non ce ne sono.
- `ultima_partita` = la giocata piu' recente (di qualunque stagione). `prossima_partita` = la partita **in convocazione**
  con la data piu' vicina (anche se la data e' gia' passata e l'admin non l'ha ancora segnata giocata).
- `ultima_partita` e `prossima_partita` hanno anche `campo` (vedi "Il campo" sotto).
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
  "minimo_partite": 0,
  "gol":          [ { "posizione": 1, "giocatore_id": 11, "nome": "Bruno T.", "attivo": true, "valore": 8, "presenze": 7 } ],
  "presenze":     [ { "posizione": 1, "giocatore_id": 11, "nome": "Bruno T.", "attivo": true, "valore": 7, "presenze": 7 } ],
  "media_voto":   [ { "posizione": 1, "giocatore_id": 1,  "nome": "Rossi M.", "attivo": true, "valore": 8.33, "presenze": 7 } ],
  "mvp":          [ { "posizione": 1, "giocatore_id": 1,  "nome": "Rossi M.", "attivo": true, "valore": 2, "presenze": 7 } ],
  "pct_vittorie": [ { "posizione": 1, "giocatore_id": 14, "nome": "De Luca V.", "attivo": true, "valore": 100, "presenze": 5 } ]
}
```

- `stagione` e' `null` per "sempre" (nell'interfaccia la voce si chiama "Tutte le stagioni": "sempre" resta solo il valore del parametro).
- Ordine per `valore` decrescente, poi per cognome. A pari valore stessa `posizione` (1, 1, 3).
- `gol` e `mvp` non elencano chi ha 0. `media_voto` (partite **con pagella**) e `pct_vittorie` (presenze): **nessun minimo di partite**
  (decisione dell'utente, 30/09/2026), compaiono tutti subito; `media_voto` solo chi ha almeno una pagella. `minimo_partite` e' `0`
  (costante `MIN_PARTITE_CLASSIFICA` in `functions/lib/costanti.ts`; se un giorno torna un minimo, il frontend lo spiega solo se e' > 0).
- `media_voto` a 2 decimali; `pct_vittorie` a 1 decimale (0-100); una vittoria = piu' gol della squadra avversaria (il pareggio non e' vittoria).
- `mvp` conta solo le votazioni chiuse con un vincitore (una parita' non ancora decisa non da' MVP a nessuno); conta anche l'MVP assegnato a mano dall'admin dopo zero voti.

## `GET /api/partite?stagione=<id>|sempre`

Elenco riepilogativo, dalla piu' recente (comprese le convocazioni). `stagione` assente = `sempre`.

```json
{ "stagione": null, "partite": [
  { "id": 11, "stagione_id": 2, "data_ora": "2026-10-01T19:00:00Z", "stato": "convocazione",
    "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": null }, { "codice": "B", "nome": "Smollicati", "gol": null } ],
    "campo": { "nome": "Centro Sportivo Esempio", "url_indicazioni": "https://www.google.com/maps/dir/?api=1&destination=44.123456,10.654321" } }
] }
```

Ogni partita ha `campo` (oggetto o `null`).

## `GET /api/partite/:id`

Dettaglio: squadre, posizioni, gol, pagelle, cronaca, stato MVP. Questa chiamata puo' chiudere la votazione MVP se e' scaduta.

```json
{
  "id": 10, "stagione_id": 2, "data_ora": "2026-09-24T19:00:00Z", "stato": "giocata",
  "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": 6 }, { "codice": "B", "nome": "Smollicati", "gol": 3 } ],
  "campo": { "nome": "Palestra di Prova", "url_indicazioni": "https://www.google.com/maps/dir/?api=1&destination=Palestra%20di%20Prova" },
  "cronaca": "Cronaca di prova, breve come spesso succede.",
  "giocatori": [
    { "giocatore_id": 1, "nome": "Rossi M.", "squadra": "A", "pos_x": 32.5, "pos_y": 21.4, "gol": 2, "autogol": 0, "voto_pagella": 8.5 }
  ],
  "mvp": { "stato": "assegnato", "voti_totali": 12, "ha_votato": false, "chiude_il": null,
           "chiuso_il": "2026-09-25T19:00:00Z", "risultati": [ { "giocatore_id": 1, "nome": "Rossi M.", "voti": 5 } ],
           "vincitore": { "giocatore_id": 1, "nome": "Rossi M." }, "candidati": [] }
}
```

- `stato`: `"convocazione"` | `"giocata"`. In convocazione `gol` delle squadre e' `null`.
- `giocatori` ordinati per squadra (A, B, poi chi non e' assegnato, `squadra: null`) e per cognome.
  `gol` / `autogol` sono del giocatore (l'autogol e' un gol a favore degli avversari).
- `cronaca` e' `null` se non scritta: la pagina deve stare bene anche cosi'.
- Il blocco `mvp` e' descritto sotto.

### Il campo

`campo` e' `{ "nome": "...", "url_indicazioni": "..." }` oppure `null` (nessun campo scelto: la pagina non mostra nulla). Sta nella home
(`ultima_partita`, `prossima_partita`), nell'elenco e nel dettaglio delle partite, e non ha altri campi: l'id del campo, il link incollato
dall'admin e lo stato "archiviato" non escono mai dalle rotte pubbliche.

- **`url_indicazioni` e' SEMPRE `https://www.google.com/maps/dir/?api=1&destination=...`, costruito dal server** (`shared/indicazioni.ts`)
  da `lat,lng` se il campo le ha (`destination=44.123456,10.654321`), altrimenti dal nome codificato (`destination=Palestra%20di%20Prova`).
  Mai il link incollato, mai il testo della colonna `campi.url_indicazioni`: se nel database ci fosse un valore non di Google
  (`javascript:...`, un altro sito) l'API pubblica non lo restituirebbe, perche' non lo legge (un test lo prova).
  Il formato apre l'app di Google Maps sul telefono, se c'e', altrimenti il sito, direttamente sulle indicazioni.
- Un campo **archiviato** resta sulle partite che lo avevano.

## `GET /api/partite/:id/mvp`

Stato della votazione. Stesso oggetto del campo `mvp` del dettaglio.

| `stato` | Quando | Campi |
|---|---|---|
| `non_aperto` | partita ancora in convocazione | `voti_totali` (0), `ha_votato` (false), `chiude_il` (null) |
| `aperto` | giocata, non chiusa dall'admin e adesso < `data_ora` + 24 h | `voti_totali`, `ha_votato`, `chiude_il` |
| `assegnato` | chiusa, un vincitore (dal voto, dalla scelta fra i pari merito, o scelto dall'admin dopo zero voti) | + `chiuso_il`, `risultati`, `vincitore`, `candidati: []` |
| `parita_da_decidere` | chiusa, pari merito: decide l'admin | + `chiuso_il`, `risultati`, `vincitore: null`, `candidati: [{giocatore_id, nome}, ...]` |
| `nessun_voto` | chiusa senza nessun voto: l'admin puo' scegliere l'MVP a mano (`mvp/decidi`) | + `chiuso_il`, `risultati: []`, `vincitore: null`, `candidati: []` |

**MVP scelto dall'admin dopo zero voti**: diventa `assegnato` con `voti_totali: 0` e `risultati: []`. Un `assegnato` dal voto ha sempre
almeno un voto, quindi `stato === "assegnato" && voti_totali === 0` significa "scelto dall'admin": il frontend lo dice ("Scelto
dall'admin: nessun voto ricevuto") senza mostrare un risultato di voto.

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
  `400` `"giocatore_id: non e' nel listone"` (inesistente o archiviato); `404` partita inesistente;
  `429` `"troppi voti da questa rete per questa partita..."`.
- **Freno agli script**: al massimo `LIMITE_VOTI_PER_IP` (10) voti per rete e per partita, cosi' una famiglia sullo stesso
  wifi vota senza problemi. La rete e' l'intestazione `CF-Connecting-IP` (la mette Cloudflare, il client non la puo'
  falsificare); un IPv6 vale per il suo prefisso /64. Nel DB (`voti_mvp.hash_ip`, migrazione `0003`) non c'e' l'indirizzo:
  ci sono 4 caratteri di un hash SHA-256 di partita+rete (16 bit, ~65 mila indirizzi per valore: non si risale a nessuno).
  Chi ha gia' votato dal suo telefono riceve `409`, non `429`. Senza l'intestazione (solo sviluppo locale) il limite non si applica.

## Partita in diretta (pubblico)

Un admin segna i gol **mentre si gioca** (CLAUDE.md, "Partita in diretta"). Qui sotto cio' che vede il pubblico; le scritture sono nelle rotte admin.

**Stato** (`stato`), calcolato alla lettura, senza cron (come la chiusura del voto MVP):

| `stato` | Quando |
|---|---|
| `non_iniziata` | nessuno l'ha iniziata e non e' ancora l'orario; **oppure** l'orario e' passato ma le squadre non sono assegnate (non parte da sola: niente "IN DIRETTA 0-0" su una partita senza squadre); oppure e' passata la finestra di 2 ore senza che ci sia stato nessun gol e nessuno l'abbia iniziata |
| `in_diretta` | l'admin ha premuto "Inizia diretta" (e non e' passato piu' di 2 ore), **oppure** e' l'orario della partita (`data_ora`) e le due squadre hanno almeno un giocatore ciascuna: parte da sola, dura 2 ore dall'orario |
| `da_confermare` | "Fine partita" premuto, **oppure** passate le 2 ore (`DURATA_MASSIMA_DIRETTA_MS` in `functions/lib/costanti.ts`) senza che nessuno chiudesse: il risultato aspetta voti in pagella e "Segna come giocata" |
| `finita` | la partita e' `giocata` |

### `GET /api/partite/:id/diretta`

```json
{
  "partita_id": 12, "stato": "in_diretta", "inizio": "2026-10-08T19:00:00Z", "scade_il": "2026-10-08T21:00:00Z", "max_eventi": 200,
  "squadre": [ { "codice": "A", "nome": "Casaccati", "gol": 2 }, { "codice": "B", "nome": "Smollicati", "gol": 1 } ],
  "eventi": [
    { "id": 41, "tipo": "gol",     "autogol": false, "squadra": "A", "giocatore_id": 1, "nome": "Rossi M." },
    { "id": 42, "tipo": "gol",     "autogol": false, "squadra": "B", "giocatore_id": 5, "nome": "Russo D." },
    { "id": 43, "tipo": "autogol", "autogol": true,  "squadra": "A", "giocatore_id": 6, "nome": "Romano G." }
  ]
}
```

- `eventi` in **ordine di arrivo** (niente minuto: la scelta dell'utente, il cronometro e' in `docs/DA_FARE.md`), gli annullati non compaiono.
- `squadra` e' la squadra che **incassa il punto**: per un gol quella del marcatore, per un **autogol quella avversaria** (qui Romano G. e' di B: il punto e' di A).
  Stessa regola di tutto il resto: "il punteggio di una squadra = gol dei suoi giocatori + autogol degli avversari".
- `inizio` e `scade_il` (inizio + 2 ore) servono solo se `in_diretta`; altrimenti `scade_il` e' `null` (e `inizio` e' `null` se non e' iniziata).
- A partita `finita` il punteggio e' quello ufficiale (`gol_a`/`gol_b`) e `eventi` e' **vuoto**: la fonte e' `GET /api/partite/:id`.
- Niente `id_client`, niente livello. `404` partita inesistente. **Cache-Control: no-store**. La pagina pubblica lo rilegge ogni ~10 secondi, solo
  mentre e' visibile (`visibilitychange`) e solo se `in_diretta`.
- In `GET /api/partite/:id` una partita in diretta o da confermare e' ancora `"stato": "convocazione"` con `gol: null`: il punteggio sta qui. Dopo "Segna come giocata" tutto torna come sempre.

### `GET /api/diretta`

`{ "diretta": null }` oppure `{ "diretta": { "partita_id", "stato": "in_diretta" | "da_confermare", "data_ora", "squadre": [{ codice, nome, gol }] } }`: la stessa
forma di `home.diretta`. La usa la scorciatoia "LIVE" dell'area admin. Se ce n'e' piu' di una, vince quella `in_diretta`, poi la "da confermare" piu' recente.
Una convocazione vecchia, senza diretta e senza gol, non compare mai.

## `GET /api/giocatori[?tutti=1]`

Il listone, con badge e totali (su tutte le stagioni), per cognome. Di default solo gli attivi; `?tutti=1` include gli archiviati.

```json
{ "giocatori": [
  { "id": 2, "nome": "Bianchi L.", "attivo": true,
    "badge": [ { "id": 7, "nome": "Dribblomane", "descrizione": "Non rinuncia mai al dribbling", "tipo": "positivo" } ],
    "totali": { "presenze": 6, "gol": 4, "media_voto": 7.6, "mvp": 0 } }
] }
```

`badge[].descrizione` e' valorizzata per i 12 badge iniziali (migrazione `0002_descrizioni_badge.sql`); per quelli creati dagli admin puo' essere `null`. `media_voto` e' `null` senza pagelle.

## `GET /api/giocatori/:id[?stagione=<id>|sempre]`

Scheda giocatore (funziona anche per gli archiviati). `stagione` assente = `sempre`.

```json
{
  "giocatore": { "id": 1, "nome": "Rossi M.", "attivo": true,
                 "badge": [ { "id": 2, "nome": "Cecchino", "descrizione": "Tiro preciso e potente", "tipo": "positivo" } ] },
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

- `GET /api/admin/giocatori` -> `{ "giocatori": [ { "id": 2, "nome": "Bianchi L.", "cognome": "Bianchi", "iniziali": "L.", "attivo": true, "livello_segreto": 4, "badge_ids": [5, 7] } ] }`
  (tutti, archiviati compresi; **e' l'unico posto col livello**).
- `POST /api/admin/giocatori` `{ "cognome": "Verdi", "iniziali"?: "A.G.", "livello_segreto": 4, "attivo": true }` -> `201` con il giocatore (`nome: "Verdi A.G."`).
  Form tollerante, risultato sempre canonico: `cognome` `"de  luca"` -> `"De Luca"`, `"ROSSI"` -> `"Rossi"`; `iniziali` `"s c"`, `"S.C."`, `"sc"` -> `"S.C."` (da 1 a 3 lettere; assenti, `null` o vuote = nessuna iniziale).
  Un campo non valido = `400` (`"cognome: ..."`, `"iniziali: ..."`); il vecchio campo `nome` non si accetta piu'.
  `livello_segreto` (intero 1-5) e `attivo` sono facoltativi. `409` se il nome esiste.
- `GET /api/admin/giocatori/:id`
- `PATCH /api/admin/giocatori/:id` `{ "cognome"?, "iniziali"? (`null` o `""` le toglie), "attivo"?, "livello_segreto"? }` (`livello_segreto: null` lo toglie; cambiando solo una delle due parti del nome, l'altra resta).
- `DELETE /api/admin/giocatori/:id` solo se non ha partite ne' voti, altrimenti `409` (si archivia con `attivo: false`).
- `PUT /api/admin/giocatori/:id/badge` `{ "badge_ids": [1, 7] }` sostituisce i badge del giocatore -> `{ "giocatore_id": 14, "badge_ids": [1, 7] }`.

## Badge

- `GET /api/admin/badge` -> `{ "badge": [ { "id": 1, "nome": "Corridore", "descrizione": "Brucia tutti in velocità", "tipo": "positivo" } ] }`
- `POST /api/admin/badge` `{ "nome": "Jolly", "descrizione": "Gioca ovunque", "tipo": "positivo" | "negativo" }` -> `201`. `descrizione` facoltativa.
- `PATCH /api/admin/badge/:id` `{ "nome"?, "descrizione"? (null la toglie), "tipo"? }`
- `DELETE /api/admin/badge/:id` lo toglie anche a chi lo ha.

## Campi

Il luogo della partita. Flusso: incolla il link di Google Maps -> `risolvi` -> correggi il nome se serve -> crea il campo -> sceglilo nella partita (`campo_id`).
Nome **obbligatorio** (testo, al massimo 80 caratteri, stesse regole degli altri nomi), unico senza distinguere maiuscole (`409`).
Un campo **non si cancella**: si archivia (`archiviato: true`), cosi' resta sulle partite passate e non si sceglie piu' per le nuove.

- `GET /api/admin/campi` -> `{ "campi": [ { "id": 1, "nome": "Centro Sportivo Esempio", "link_originale": "https://maps.app.goo.gl/AbC", "lat": 44.123456, "lng": 10.654321, "url_indicazioni": "https://www.google.com/maps/dir/?api=1&destination=44.123456,10.654321", "archiviato": false, "partite": 3 } ] }`
  (attivi prima, poi archiviati; `partite` = quante partite lo usano; `lat`/`lng`/`link_originale` possono essere `null`).
- `POST /api/admin/campi` `{ "nome": "Centro Sportivo Esempio", "link"?: "https://maps.app.goo.gl/AbC", "lat"?: 44.1, "lng"?: 10.6 }` -> `201` col campo.
  `nome` obbligatorio (`400 "nome: ..."`). `link` facoltativo: dev'essere un indirizzo https con host nella lista di Google Maps (come per `risolvi`, ma
  qui **senza nessuna richiesta di rete**); se c'e' del testo intorno si salva solo il primo indirizzo. `lat` e `lng` vanno **in coppia** (`400` se ne arriva una sola), nei limiti
  della Terra. `url_indicazioni` lo calcola il server: se il client ne manda uno, viene ignorato.
- `PATCH /api/admin/campi/:id` `{ "nome"?, "link"? (null lo toglie), "lat"?, "lng"? (in coppia; null, null le toglie), "archiviato"? }` -> il campo. Cambiando nome o posizione
  `url_indicazioni` si ricalcola. `404` id inesistente, `409` nome gia' usato, `400` corpo senza campi.
- `POST /api/admin/campi/risolvi` `{ "link": "Guarda questo posto: https://maps.app.goo.gl/AbC" }` -> `{ "nome"?, "lat"?, "lng"?, "url_indicazioni", "link_finale" }`.
  **Non scrive niente.** `nome`, `lat` e `lng` mancano se non si ricavano (in particolare: se manca `nome`, l'admin lo scrive a mano; non si inventa).

### Come si risolve un link (`functions/lib/maps.ts`)

Il link "Condividi" dell'app (`https://maps.app.goo.gl/XXXX`) **non contiene il nome**: il server lo apre e segue i redirect. Da `link_finale` ricava:

- **nome**: dal percorso `/maps/place/<Nome+Del+Campo>/...` (`+` -> spazio, `%xx` decodificati); se manca, dal testo di `?q=<Nome, indirizzo>` fino alla prima virgola
  (e' la forma vera dei link "Condividi" dell'app: `https://maps.google.com?q=Nome+Via+...&ftid=...`, osservata dalla rete il 30/09/2026). Mai se e' vuoto, piu' lungo di 80 caratteri, con
  caratteri di controllo o fatto di sole coordinate;
- **coordinate**: `!3d<lat>!4d<lng>` (quelle del posto, da preferire), poi `@lat,lng` (il centro della mappa), poi `?q=lat,lng` (anche `query=`, `ll=`); mai fuori da -90..90 / -180..180;
- **`url_indicazioni`**: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; senza coordinate `destination=<nome codificato>`; senza nessuno dei due, il `link_finale` validato.

Quando ci si ferma: un indirizzo di Google che dice gia' nome o coordinate non si apre (nessuna richiesta, e niente giri con il consenso); `maps.app.goo.gl` e `goo.gl/maps` si aprono
sempre; uno che non dice niente si apre per vedere se rimanda altrove. La pagina `/sorry/...` di Google (controllo anti-robot) non si segue: ci si ferma con quello che c'e'.

**Difese anti-SSRF** (provate in `test/maps.test.ts` e nell'e2e admin):

| Difesa | Come |
|---|---|
| Solo https | `http:`, `intent:`, `javascript:`, `data:`... rifiutati, anche come `Location` |
| Host in lista **esatta** | `maps.app.goo.gl`, `goo.gl` (solo percorso `/maps...`), `www.google.com`, `google.com`, `maps.google.com`, `www.google.it`, `google.it`, `consent.google.com`. Niente sottodomini, suffissi, porte, utente/password, host con il punto finale |
| Niente IP | qualunque forma (decimale, esadecimale, ottale, IPv6) e' rifiutata |
| Ogni passaggio, il primo compreso | il `Location` di ogni risposta e' ri-validato come un link nuovo prima di essere richiesto; si richiede sempre l'`href` normalizzato dell'URL controllato |
| Redirect a mano | `redirect: 'manual'`, al massimo **5** (conta anche il passaggio da `consent`); il sesto = `400` |
| Timeout | circa **5 s in tutto** (non per passaggio); poi `502` |
| Nessuna credenziale | niente cookie ne' intestazioni del client: si manda solo `User-Agent` e `Accept-Language` |
| Corpo mai letto | serve solo l'intestazione `Location`; il corpo si scarta (`cancel`). Non e' emerso nessun caso che lo richieda: le risposte di Google ai link corti sono `302` con corpo vuoto |
| `consent.google.com` | non si apre: si usa `?continue=<url>`, validato con la stessa lista |
| Solo admin | la rotta sta sotto `/api/admin`: senza Access (o col CSRF) non parte nessuna richiesta verso Google |

Errori di `risolvi`: `400 "link: ..."` (nessun indirizzo, non https, host fuori lista, IP, troppi reindirizzamenti, "Google non riconosce questo link"), `502` se Google non risponde
in tempo o con un errore (`"link: Google non ha risposto in tempo. Riprova fra poco, o scrivi il nome a mano"`). Il messaggio non contiene mai dettagli interni.

**Prove nel browser**: `npm run e2e:admin` avvia il server con `--binding GOOGLE_MAPS_PROVA=http://127.0.0.1:<porta>` e un finto Google (`e2e/google_simulato.ts`). La variabile
vale **solo** alle condizioni del bypass di sviluppo (`DEV_ADMIN_BYPASS=1`, richiesta da localhost, Access non configurato, niente `Cf-Ray`) e solo se punta a localhost: in produzione
e' ignorata anche se ci finisse per errore (un test lo prova). Cambia solo DOVE si spedisce la richiesta: lista degli host e redirect restano validati sugli indirizzi veri di Google.

## Stagioni

L'elenco e' pubblico (`GET /api/stagioni`). **Una sola stagione alla volta puo' essere aperta** (409 altrimenti).

- `POST /api/admin/stagioni` `{ "nome": "Stagione 2026-27", "data_inizio": "2026-07-01", "data_fine"?: "...", "aperta"?: true }` -> `201`.
  `aperta` vale `true` se omesso: se ce n'e' gia' un'altra aperta, `409` (chiudila prima, o manda `"aperta": false`).
- `PATCH /api/admin/stagioni/:id` `{ "nome": "Stagione 2026/2027" }` -> la stagione `{ id, nome, aperta, data_inizio, data_fine }`. Rinomina soltanto: date e stato
  non si toccano da qui. `400` nome vuoto o corpo senza campi, `404` id inesistente, `409` nome gia' usato (senza distinguere maiuscole).
- `POST /api/admin/stagioni/:id/apri` -> `{ "id": 2, "aperta": true }`. `409` se un'altra e' aperta.
- `POST /api/admin/stagioni/:id/chiudi` `{ "data_fine"?: "2026-06-30" }` (corpo facoltativo; default: oggi a Roma) -> `{ "id", "aperta": false, "data_fine" }`.

## Partite

Flusso: **crea la convocazione** -> **salva squadre e pedine** (ripetibile) -> a partita finita **inserisci gol, autogol e pagelle**
-> **segna giocata** col risultato -> eventuale cronaca / correzioni. Il generatore e' un aiuto alla fase "squadre". In alternativa ai gol inseriti a
mano, la **diretta** (sezione piu' sotto) li registra durante la partita e "Fine partita" li porta nella stessa schermata Risultato.

- `POST /api/admin/partite` `{ "data_ora": "2026-10-08T21:00", "giocatori": [1, 2, 3], "stagione_id"?: 2, "campo_id"?: 1 }` -> `201`
  `{ "id": 12, "stagione_id": 2, "data_ora": "2026-10-08T19:00:00Z", "stato": "convocazione", "campo_id": 1 }`.
  Senza `stagione_id` usa la stagione aperta (`409` se non ce n'e'). `giocatori` puo' essere `[]`. `campo_id` facoltativo (assente o `null` = nessun campo):
  il campo deve esistere e **non essere archiviato**, altrimenti `400 "campo_id: il campo non esiste o è archiviato"`.
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
- `GET /api/admin/partite/:id` -> la partita com'e' nel database, **con `campo_id`** (il pubblico vede il campo, non il suo id): serve alla tendina "Campo" dell'admin.
- `PATCH /api/admin/partite/:id` `{ "data_ora"?, "stagione_id"?, "cronaca"? (null o "" la toglie, max 5000 caratteri), "campo_id"? (null = nessun campo), "gol_a"?, "gol_b"? }`
  `campo_id` come nel `POST` (un campo archiviato DOPO essere stato assegnato a questa partita resta valido per lei). I gol solo per partite gia' giocate (correzione del risultato). Cambiare `data_ora` sposta anche la scadenza del voto MVP.
- `DELETE /api/admin/partite/:id` solo se in convocazione.

**`avvisi`** (`string[]`): se i gol dei giocatori (autogol avversari compresi) non tornano col risultato, per ogni squadra
un messaggio, es. `"Smollicati: il risultato e' 2, i gol registrati (autogol avversari compresi) sono 1"`. Sono avvisi, non errori:
il server non inventa mai un gol per far tornare i conti; si mostrano all'admin. Vuoto se tutto torna (o se la partita non e' ancora giocata).

## Partita in diretta (admin)

Flusso: **"Inizia diretta"** (a mano, oppure parte da sola all'orario se ci sono le squadre) -> si segnano **gol e autogol** (tocco sulla figurina, poi conferma) ->
**"Fine partita"** porta i gol per giocatore nei campi della schermata Risultato (`partecipazioni.gol` / `.autogol`) -> l'admin mette i voti e preme **"Segna come
giocata"** (`POST .../giocata`, come sempre; solo allora si apre il voto MVP). Modello dati: `migrations/0005_diretta.sql`; logica: `functions/lib/diretta.ts`.

**Identificativi.** Ogni gol e ogni azione "annulla ultimo" ha un `id_client`: un UUID generato dal telefono (8-64 caratteri, lettere/cifre/`-`/`_`, **non di sole cifre**).
E' `UNIQUE` nel database, e rende ogni invio **idempotente**: se il telefono non ha visto la risposta e ripete la richiesta, il server restituisce lo stesso gol senza
duplicarlo. Per lo stesso motivo `PATCH` e `DELETE` accettano come `:eid` sia l'**id numerico** del server sia l'**id_client**: offline il telefono conosce solo il secondo.
L'annullamento e' **logico** (`annullato = 1`, la riga resta): cosi' un invio in ritardo con l'id_client di un gol gia' annullato non lo fa risorgere. Nessuna email e nessun
dato di chi segna nel database. Al massimo `MAX_EVENTI_DIRETTA` (200, annullati compresi) eventi per partita: oltre, `409`.

Risposta di ogni scrittura: `{ "evento": { id, id_client, tipo, squadra, giocatore_id, nome, annullato }, "diretta": <come GET .../diretta, con id_client> }`.

- `GET /api/admin/partite/:id/diretta` -> lo stato come sopra, **con l'`id_client`** di ogni gol (serve al telefono per riconoscere i propri gol gia' arrivati).
- `POST /api/admin/partite/:id/diretta/inizia` -> `{ diretta }`. Idempotente. `409` senza le squadre (serve almeno un giocatore per squadra; il messaggio manda alla sezione
  Squadre) o se la diretta e' gia' finita / la partita e' giocata. Se la diretta era gia' partita da sola ne fissa l'inizio effettivo (l'orario della partita).
- `POST /api/admin/partite/:id/diretta/eventi` `{ "id_client", "tipo": "gol" | "autogol", "giocatore_id" }` -> `201` col gol nuovo, **`200` col gol che c'e' gia'** se l'`id_client`
  era gia' stato visto (anche se nel frattempo e' stato annullato o la partita e' finita: un invio ripetuto riesce sempre). La squadra si deduce dal giocatore, che deve avere una
  squadra **in quella partita**: `400 "giocatore_id: non è in campo in questa partita"` altrimenti. `400` campi non validi (col nome del campo), `404` partita inesistente,
  `409` se la partita non e' in diretta (non iniziata / finita / giocata) o se si supera il limite, `409` se l'`id_client` e' di un'altra partita.
- `PATCH /api/admin/partite/:id/diretta/eventi/:eid` `{ "tipo"?, "giocatore_id"? }` cambia il marcatore o il tipo (gol <-> autogol: il punto passa agli avversari). Idempotente
  (stessi valori = `200`). `404` gol inesistente (o di un'altra partita), `409` se il gol e' annullato o la diretta non e' aperta, `400` corpo vuoto o giocatore non in campo.
- `DELETE /api/admin/partite/:id/diretta/eventi/:eid` elimina (annulla) un gol. Idempotente (gia' annullato = `200`). `404` / `409` come sopra.
- `POST /api/admin/partite/:id/diretta/annulla-ultimo` `{ "id_client" }` annulla l'**ultimo gol non annullato**. L'`id_client` e' quello dell'**azione**: ripetuta con lo stesso, restituisce
  lo stesso gol senza annullarne un altro. `409` se non c'e' niente da annullare o la diretta non e' aperta. (L'interfaccia LIVE non la usa: indica il gol da togliere per `id_client`
  con `DELETE`, cosi' una vista non aggiornata non fa annullare il gol di un altro admin; la rotta resta per chi vuole "annulla l'ultimo" dal server.)
- `POST /api/admin/partite/:id/diretta/fine` -> `{ diretta, risultato: { A, B } }`. Calcola dagli eventi i gol e gli autogol **per giocatore** e li scrive in `partecipazioni.gol` / `.autogol`
  (dentro la stessa transazione che segna `diretta_finita_il`); la partita **resta in convocazione**. **Idempotente e senza ricalcolo**: una seconda pressione non tocca niente
  (altrimenti cancellerebbe le correzioni fatte a mano nella schermata Risultato). Ammesso anche se le 2 ore sono scadute senza chiusura. `409` se non e' iniziata o e' gia' giocata.
- **Concorrenza**: ogni scrittura controlla "la diretta e' ancora aperta" **dentro la stessa istruzione SQL**, quindi un gol che arriva mentre un altro admin preme "Fine partita" o
  viene registrato e contato, o viene rifiutato (`409`): mai perso in silenzio. Due admin che segnano insieme: entrambi gli eventi sono registrati, l'ordine e' quello di arrivo.
- Durante la diretta (finche' non e' premuto "Fine partita") `PUT .../convocati` rifiuta (`409`) di **togliere o spostare di squadra** chi ha un gol registrato.

### La schermata LIVE e la rete (`app/src/admin/Live.tsx`, `coda_live.ts`, `useLive.ts`)

Al campo il segnale e' scarso: ogni tocco finisce **subito** in una coda sul telefono (`localStorage`, chiave `tt_live_coda_<id partita>`, sempre in `try/catch`) con il suo `id_client`,
il tabellone e l'elenco mostrano il gol "in invio", e la coda si svuota da sola, **una voce alla volta e in ordine**.

| Cosa | Come |
|---|---|
| Quando riprova | ritorno della rete (`online`), ritorno in primo piano (`visibilitychange`), controllo ogni 2 s; dopo un guasto attese crescenti 1,5 / 3 / 6 / 12 / 24 / 30 s (massimo); rete e primo piano azzerano l'attesa |
| Cosa riprova | rete assente, 408, 425, 429, 5xx |
| Cosa NON riprova | un rifiuto del server (400, 404, 409...): la voce resta in un riquadro rosso con la ragione ("la diretta è finita"...), l'admin la legge e la **scarta**. Una voce rifiutata toglie anche quelle che dipendevano da lei |
| Sessione di Access scaduta | 401/403/rinvio al login: i gol restano sul telefono, l'indicatore lo dice, "Ricarica la pagina" porta al login; nessun martellamento |
| Indicatore | "**N da inviare**" (con "· senza rete" se manca), "**tutto inviato**", "**senza rete**", "sessione scaduta" |
| Stato mostrato | stato del server + coda applicata in ordine; **a coda vuota e' esattamente quello del server** (riletto dopo l'ultimo invio e ogni ~10 s) |
| Ricarica della pagina / app chiusa e riaperta | la coda resta e riparte. Giocatori in campo e ultimo stato del server sono copiati sul telefono (`tt_live_partita_*`, `tt_live_stato_*`): ricaricando con le chiamate in errore la schermata si disegna lo stesso |
| Piu' schede dello stesso telefono | si sincronizzano (`storage`); un invio doppio e' innocuo (stesso `id_client`) |

**Limite documentato: nessun service worker.** La pagina LIVE deve essere **gia' aperta** o riaperta **con un po' di rete**: senza segnale il browser non puo' caricare `/admin`
(Access sta davanti, e l'app e' una pagina servita dalla rete). I gol segnati restano sul telefono e partono alla prima apertura con rete. Un service worker minimo per lo shell
`/admin` e' stato valutato e **rimandato** (`docs/DOMANDE_APERTE.md`): `worker-src` nella CSP e' ancora `'none'`.

## Generatore di squadre

`POST /api/admin/partite/:id/genera-squadre` `{ "seed"?: 3 }` (intero 0 .. 4294967295, facoltativo).

```json
{ "seed": 3, "squadre": [
  { "codice": "A", "nome": "Casaccati",  "media": 0.616, "giocatori": [ { "giocatore_id": 1, "nome": "Rossi M." } ] },
  { "codice": "B", "nome": "Smollicati", "media": 0.616, "giocatori": [ { "giocatore_id": 2, "nome": "Bianchi L." } ] }
] }
```

- Parte dai **convocati gia' salvati** della partita. **Non salva niente**: l'admin ritocca a mano e salva con `PUT .../convocati`.
- Due squadre di dimensione uguale o con differenza 1. Stesso seed = stessa proposta; senza seed ne sceglie uno a caso e lo
  restituisce (per "rigenera" basta richiamare senza seed). `media` e' il punteggio medio (0-1) della squadra.
- Bilancia un punteggio che mescola media voto, % vittorie, gol a partita e livello segreto, e cerca di non mettere lo stesso badge
  tutto da una parte. Pesi e regole: `functions/lib/costanti.ts` e `functions/lib/generatore.ts`. Il livello non compare nella risposta. **Livello 5 = il piu' forte, 1 = il piu' debole** (deciso dall'utente).
- `400` con meno di 2 convocati o piu' di 24.

## Voto MVP (admin)

- `POST /api/admin/partite/:id/mvp/chiudi` chiude subito la votazione e calcola vincitore o parita' -> il blocco `mvp` con i risultati.
  `409` se la partita non e' giocata o la votazione e' gia' chiusa (anche in automatico).
- `POST /api/admin/partite/:id/mvp/decidi` `{ "giocatore_id": 13 }` assegna l'MVP -> il blocco `mvp` (`assegnato`). Ammesso solo in due casi:
  - `mvp.stato === "parita_da_decidere"`: si sceglie fra i pari merito (`mvp.candidati`); `400` se non e' fra loro;
  - `mvp.stato === "nessun_voto"` (votazione chiusa senza nessun voto): si sceglie fra i **giocatori della partita** (quelli con una squadra);
    `400` se non ha giocato. *Scelta provvisoria, da confermare* (alternativa: tutti gli attivi; `CANDIDATI_SENZA_VOTI` in `functions/lib/mvp.ts`).
  - In ogni altro stato (`non_aperto`, `aperto`, `assegnato`) `409`. Il vincitore e' sempre uno solo.

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
