# ⚽ Terzo Tempo

**Le partite di calcetto del gruppo, con classifiche, figurine e MVP votato da tutti.**

Sito: **<https://terzo-tempo.pages.dev>**

Un gruppo di amici, una partita a settimana, squadre rifatte ogni volta. Da telefono si vede subito chi segna di più, chi ha la media voto migliore, chi è stato MVP e come erano schierati i due squadroni. Chi organizza inserisce convocati e risultati, il resto lo fa il sito.

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="Cloudflare Pages" src="https://img.shields.io/badge/Cloudflare%20Pages-F38020?logo=cloudflarepages&logoColor=white">
  <img alt="Cloudflare D1" src="https://img.shields.io/badge/Cloudflare%20D1-F38020?logo=cloudflare&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white">
</p>

---

## Cosa fa

L'app è pensata per un gruppo di circa venti amici che giocano a calcetto e vogliono tenere memoria di quello che succede in campo, quasi sempre **dal telefono**: la grafica è mobile-first, in stile "Figurine" (carta avorio, colori pieni da stampa, tema chiaro e "album di notte").

| Funzione | Cosa si vede |
|---|---|
| **Classifiche** | Gol, presenze, media voto, MVP e percentuale di vittorie. Per stagione oppure "sempre". |
| **Scheda giocatore** | La figurina con i **badge** (Cecchino, Muro, Turista...), le statistiche, gli ultimi cinque risultati (V/P/S) e il grafico dei voti in pagella. |
| **Campo con moduli** | Le formazioni sul campo, in stile fantacalcio: modulo scelto per la partita (per esempio 2-1-2 o 3-2-1) e giocatori sulle loro caselle. |
| **Voto MVP dal telefono** | Ogni partita ha la sua votazione: si vota dal telefono, **senza login**, un voto per dispositivo. |
| **Generatore di squadre** | Dai convocati propone due squadre bilanciate; poi chi organizza ritocca a mano. |
| **Stagioni** | Aperte e chiuse a mano: classifiche per stagione e storico. |
| **Area admin** | Giocatori, badge, stagioni, partite, risultati e MVP. Protetta da Cloudflare Access. |

La parte pubblica è in **sola lettura**, tranne il voto MVP. Tutto il resto lo scrive l'area admin.

---

## Architettura

Una singola pubblicazione su Cloudflare: il frontend è una SPA React servita da Pages, le API sono Pages Functions, i dati stanno in D1. `/admin` e `/api/admin` sono dietro **Cloudflare Access** (codice via email), e il backend riverifica da solo il token.

```mermaid
flowchart LR
    B["📱 Browser<br/>telefono"] --> P["☁️ Cloudflare Pages<br/>SPA React"]
    B -->|"/api/*"| F["⚙️ Pages Functions<br/>API JSON"]
    B -.->|"/admin, /api/admin"| A{"🔐 Cloudflare Access<br/>codice via email"}
    A --> P
    A --> F
    F -->|"riverifica il token<br/>e l'email"| F
    F --> D[("🗄️ Cloudflare D1<br/>SQLite")]
```

> Le rotte pubbliche non hanno login. Le rotte admin rispondono 401 o 403 senza un token valido: **mai aperte per errore**.

---

## Flusso di una partita

Dalla convocazione alla chiusura del voto MVP. Le squadre si rifanno a ogni partita e possono avere un numero diverso di giocatori.

```mermaid
flowchart TD
    A["📋 Convocati<br/>(li inserisce l'admin)"] --> B["🎲 Genera squadre<br/>bilanciate"]
    B --> C["✋ Ritocco a mano"]
    C --> D["📐 Moduli e campo<br/>giocatori sulle caselle"]
    D --> E["🥅 Risultato, gol e voti<br/>in pagella"]
    E --> F["✅ Partita 'giocata'"]
    F --> G["🗳️ Voto MVP aperto<br/>a tutto il gruppo"]
    G --> H{"Chiusura"}
    H -->|"l'admin la chiude"| I{"Esito dei voti"}
    H -->|"24 ore dopo l'orario<br/>della partita"| I
    I -->|"un solo primo"| J["🏆 MVP assegnato"]
    I -->|"parità"| K["⚖️ Decide l'admin<br/>fra i pari merito"]
    I -->|"zero voti"| L["🧑‍⚖️ L'admin sceglie l'MVP"]
    K --> J
    L --> J
```

La scadenza automatica si calcola sull'**orario della partita**, non su quando la si carica: se l'admin inserisce il risultato in ritardo, nessuno può comunque votare giorni dopo. Non c'è nessun cron: la chiusura viene applicata alla prima lettura o al primo voto successivi.

---

## Il voto MVP

Vota tutto il gruppo, non solo chi ha giocato, senza login e in modo anonimo. Il server riconosce il telefono da un cookie casuale e ne salva **solo l'hash**.

```mermaid
sequenceDiagram
    autonumber
    actor U as Telefono
    participant API as Pages Functions
    participant DB as D1

    U->>API: GET /api/partite/12
    API->>DB: legge la partita e chiude il voto se è scaduto
    API-->>U: solo quanti hanno votato e se questo dispositivo ha già votato
    Note over U,API: mentre il voto è aperto i risultati per giocatore restano nascosti

    U->>API: POST /api/partite/12/mvp con il giocatore scelto
    alt il dispositivo non ha ancora il cookie
        API->>API: genera un token casuale
        API-->>U: Set-Cookie del dispositivo (HttpOnly, Secure)
    end
    API->>API: hash SHA-256 del token
    API->>DB: inserisce il voto (partita, hash, giocatore)
    alt primo voto di questo dispositivo per questa partita
        DB-->>API: ok
        API-->>U: 200 voto registrato
    else già votato o votazione chiusa
        DB-->>API: violazione di UNIQUE (partita, hash)
        API-->>U: 409 conflitto
    end

    Note over U,API: alla chiusura, dall'admin o dopo 24 ore, escono i risultati
    U->>API: GET /api/partite/12
    API-->>U: voti per giocatore, vincitore oppure parità da decidere
```

Chi usa la modalità in incognito o un altro browser risulta un dispositivo nuovo: è un limite noto e accettato.

---

## Modello dati

Le squadre nel database sono solo `A` e `B`: i loro nomi arrivano dal codice, in un solo punto. Le date sono ISO 8601 in UTC, l'orario mostrato è quello di Roma.

```mermaid
erDiagram
    STAGIONI ||--o{ PARTITE : contiene
    PARTITE ||--o{ PARTECIPAZIONI : "ha convocati"
    GIOCATORI ||--o{ PARTECIPAZIONI : gioca
    GIOCATORI ||--o{ GIOCATORE_BADGE : ha
    BADGE ||--o{ GIOCATORE_BADGE : assegnato
    PARTITE ||--o{ VOTI_MVP : riceve
    GIOCATORI ||--o{ VOTI_MVP : "e' votato"
    PARTITE ||--o| MVP_VINCITORI : "ha un MVP"
    GIOCATORI ||--o{ MVP_VINCITORI : "e' MVP"

    GIOCATORI {
        int id PK
        text nome UK "Cognome I."
        int attivo "0 = archiviato"
        int livello_segreto "1-5, solo admin"
        text creato_il
    }
    BADGE {
        int id PK
        text nome UK
        text descrizione
        text tipo "positivo o negativo"
    }
    GIOCATORE_BADGE {
        int giocatore_id PK, FK
        int badge_id PK, FK
    }
    STAGIONI {
        int id PK
        text nome UK
        int aperta "una sola aperta"
        text data_inizio
        text data_fine
    }
    PARTITE {
        int id PK
        int stagione_id FK
        text data_ora "ISO UTC"
        text stato "convocazione o giocata"
        int gol_a
        int gol_b
        text cronaca
        text mvp_stato "aperto, parita_da_decidere, assegnato, nessun_voto"
        text mvp_chiuso_il
    }
    PARTECIPAZIONI {
        int partita_id PK, FK
        int giocatore_id PK, FK
        text squadra "A, B o vuoto"
        real pos_x "0-100"
        real pos_y "0-100"
        int gol
        int autogol
        real voto_pagella "1-10 a mezzi punti"
    }
    VOTI_MVP {
        int id PK
        int partita_id FK
        text hash_token "solo l'hash SHA-256"
        int giocatore_id FK
        text creato_il
    }
    MVP_VINCITORI {
        int partita_id PK, FK
        int giocatore_id FK
    }
```

`VOTI_MVP` ha un vincolo `UNIQUE (partita_id, hash_token)`: un dispositivo, un voto per partita. Schema completo in [`migrations/`](migrations/).

---

## Stack

- **TypeScript** ovunque, controllato con `tsc -b`
- **[React](https://react.dev/) 19** + **[Vite](https://vite.dev/)**: SPA con un router minimo sulla History API, senza librerie di routing
- **[Cloudflare Pages](https://pages.cloudflare.com/)** + **Pages Functions**: hosting e API JSON
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)**: database SQLite, con migrazioni in `migrations/`
- **[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)**: cancello dell'area admin
- **Font self-hosted** ([Anton](https://fontsource.org/fonts/anton) e [Nunito Sans](https://fontsource.org/fonts/nunito-sans) via Fontsource): la CSP non ammette risorse esterne
- **[Vitest](https://vitest.dev/)**: test del backend su un D1 finto e delle funzioni pure del frontend
- **[Playwright](https://playwright.dev/)**: prove nel browser sulla build di produzione

---

## Struttura del progetto

```
├── app/                # frontend
│   ├── index.html
│   └── src/
│       ├── pagine/     # schermate pubbliche: Home, Classifiche, Partite, Scheda, Info...
│       ├── ui/         # componenti condivisi: Figurina, Campo, Carta, Badges...
│       ├── admin/      # area /admin, caricata a parte con React.lazy
│       ├── lib/        # tipi, chiamate API, logica pura
│       └── stili/      # token, tema chiaro e scuro, stili dei componenti
├── functions/          # Pages Functions: middleware, API pubbliche e admin
│   ├── api/            #   rotte (le admin sotto api/admin)
│   └── lib/            #   accesso, generatore di squadre, MVP, statistiche
├── shared/             # codice comune a frontend e backend: nomi e moduli
├── migrations/         # schema D1
├── scripts/            # pubblicazione, controllo del sito vero, dati di prova
├── test/               # Vitest (compresa la guardia dei nomi reali)
├── e2e/                # prove nel browser con Playwright
├── docs/               # API, messa in produzione, decisioni aperte
├── wrangler.toml       # configurazione Cloudflare (nessun segreto)
└── CLAUDE.md           # regole e decisioni del progetto
```

---

## Esecuzione in locale

```bash
git clone https://github.com/chrisCCtwentyone/terzo-tempo.git
cd terzo-tempo
npm install
```

Database locale con i **dati di prova** (giocatori inventati), poi l'app:

```bash
cp .dev.vars.example .dev.vars   # apre l'area admin, ma solo da localhost
npm run db:migra                 # crea le tabelle nel D1 locale
npm run db:seed                  # carica i dati di prova
npm run build                    # il backend locale serve app/dist
npm run dev:api                  # Pages + D1 locale su http://localhost:8788
npm run dev                      # in un altro terminale: Vite su :5173, proxy /api verso :8788
```

### Test

```bash
npm run typecheck   # tsc -b
npm test            # Vitest
npm run e2e         # browser: build di produzione, D1 usa-e-getta, Chromium a 390x844, tema chiaro e scuro
npm run e2e:admin   # come sopra, per l'area admin (con eventi touch veri)
```

Le prove nel browser controllano tutte le schermate, il voto MVP col conflitto al secondo voto, la chiusura a tempo scaduto, la console senza errori, zero violazioni CSP, nessuna risorsa esterna e nessuno scroll orizzontale. Servono un Chromium già installato e `playwright-core` alla versione fissata: dettagli in [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Pubblicazione

Si pubblica con un solo comando, che si ferma al primo errore e alla fine controlla il sito vero:

```bash
./scripts/pubblica.sh
```

Account Cloudflare, Access, secret e trappole già incontrate: [`docs/DEPLOY.md`](docs/DEPLOY.md). Contratto delle API: [`docs/API.md`](docs/API.md).

---

## Sicurezza e privacy

**Il livello segreto non esce mai dalle API pubbliche.** Chi organizza può dare a ogni giocatore un livello da 1 a 5 che il generatore di squadre usa per bilanciare, ma nessuno lo deve vedere. Esiste solo nelle rotte admin: non compare in nessuna risposta pubblica, nemmeno come campo vuoto, e un test lo verifica su ogni rotta. Anche `scripts/controlla_produzione.sh` lo cerca nel sito vero dopo ogni pubblicazione.

**Nessun nome reale nel codice.** Gli esempi, i test e i dati di prova usano solo cognomi inventati (Rossi M., Bianchi L., Verdi A.G.). I nomi veri vivono solo nel database di produzione. Una **guardia** nei test legge l'elenco reale da un file locale ignorato da git e fallisce se uno di quei nomi compare in un file tracciato.

**Area admin fail-closed.** `/api/admin/*` richiede un token di Cloudflare Access, che il backend verifica da solo (firma, audience ed email). Se manca un pezzo della configurazione la risposta è 403, mai un accesso aperto. Un test elenca ogni file sotto `functions/api/admin` e controlla che nessuno risponda senza accesso, anche con percorsi scritti in modo strano.

**Voto anonimo.** Del token del dispositivo si salva solo l'hash SHA-256: nemmeno chi legge il database può risalire al telefono. Le scritture da un altro sito sono rifiutate (difesa dal CSRF). Contro gli script, un freno semplice: al massimo 10 voti per rete e per partita, contati su un pezzetto (16 bit) di hash dell'indirizzo, così una famiglia sullo stesso wifi vota senza problemi e nessuno può risalire all'indirizzo.

**Niente codice iniettato.** La CSP ammette solo risorse proprie, senza `unsafe-inline` né `unsafe-eval`; React non usa mai `innerHTML`; nessun testo scritto dall'admin finisce in un `href` o in un `src`. Ogni query D1 usa parametri (`bind`): un test analizza il codice e lancia payload da manuale su ogni rotta. Nomi, badge e cronache hanno lunghezze massime e non ammettono caratteri di controllo.

**Prove d'attacco automatiche.** Suite di test su SQL injection, percorsi mascherati verso l'admin, JWT contraffatti, CSRF, limiti degli ingressi, intestazioni, segreti nel bundle e nella storia di git; un e2e che inserisce payload XSS dall'admin e verifica che la parte pubblica li mostri come testo; `scripts/controlla_produzione.sh` ripete le prove non distruttive sul sito vero a ogni pubblicazione.

Nel repository non ci sono email, token o chiavi: le email degli admin stanno nel secret `EMAIL_AUTORIZZATE` e nelle policy di Access.

---

## Credits

Creato da [chrisCCtwentyone](https://github.com/chrisCCtwentyone)

### Skill di terze parti

In [`.claude/skills/`](.claude/skills/) ci sono due skill per Claude Code usate nello sviluppo (solo le skill, senza gli hook), ciascuna con la sua nota di origine in `SOURCE.md`:

| Skill | Licenza | Fonte |
|---|---|---|
| `ponytail` (e le sue varianti `ponytail-*`) | MIT | [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) |
| `graphify` | Apache-2.0 | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) |

---

## Licenza

Codice rilasciato con licenza [MIT](LICENSE). Le skill in `.claude/skills/` mantengono le loro licenze (vedi tabella sopra).
