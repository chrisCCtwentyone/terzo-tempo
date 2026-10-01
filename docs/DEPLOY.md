# Messa in produzione di Terzo Tempo

Sito: <https://terzo-tempo.pages.dev> (Cloudflare Pages + D1). La parte pubblica
(`/`, `/classifiche`, `/partite`, `/giocatori`, `/api/*` non admin) e' aperta a tutti.
`/admin` e `/api/admin/*` stanno dietro Cloudflare Access (codice via email, One-time PIN),
e il backend riverifica da solo il token (`functions/lib/access.ts`). Nessuna email e nessun
token in questo file, ne' in git.

## Cosa c'e' su Cloudflare

| Cosa | Nome / valore |
| --- | --- |
| Progetto Pages | `terzo-tempo`, ramo di produzione `main` (si pubblica sempre con `--branch main`, qualunque sia il ramo git) |
| Database D1 | `terzo-tempo` (binding `DB`); il `database_id` e' in `wrangler.toml` |
| App Access 1 | `terzo-tempo admin`: `terzo-tempo.pages.dev/admin` e `terzo-tempo.pages.dev/api/admin`, sessione 720h |
| App Access 2 | `terzo-tempo anteprime`: `*.terzo-tempo.pages.dev` per intero (anteprime e indirizzi delle singole pubblicazioni), sessione 720h |
| Policy | in entrambe una policy "allow" con le email degli admin (`include` > email) |
| Metodo di accesso | One-time PIN (l'IdP e' quello predefinito dell'account, lo stesso delle app di turni-plus) |
| Secret Pages | `EMAIL_AUTORIZZATE`: elenco di email separate da virgola, la seconda difesa del backend |
| `wrangler.toml` | `ACCESS_TEAM_DOMAIN` (dominio Zero Trust) e `ACCESS_AUD` (AUD dell'app 1): non sono segreti |

Il progetto gemello `turni-plus` sullo stesso account, il suo database e le sue app Access
non si toccano.

## Come si pubblica

```bash
./scripts/pubblica.sh              # pubblica, con le prove nel browser decise dai file cambiati
./scripts/pubblica.sh --completo   # forza TUTTE le prove nel browser
./scripts/pubblica.sh --solo-piano # stampa il piano e si ferma: non esegue niente
./scripts/pubblica.sh --solo-piano --simula "app/src/admin/Campi.tsx docs/DEPLOY.md"   # piano su un elenco di file inventato
```

Si ferma al primo errore (`set -euo pipefail`, nessuna pipe sui comandi che devono poter fallire).
**Sempre**, in quest'ordine e senza alleggerire: `tsc -b`, `vite build`, `vitest run` (TUTTI i test unitari, compresi
le guardie su sicurezza, nomi reali e segreti), migrazioni D1 `--remote`, `wrangler pages deploy app/dist --branch main`,
poi `scripts/controlla_produzione.sh`. Esce con 0 solo se e' tutto verde. La build viene PRIMA dei test perche'
`test/sicurezza_bundle.test.ts` controlla che nel bundle non ci sia nessun segreto. Servono nell'ambiente
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (vedi "Una sessione nuova"); `--solo-piano` non li richiede.

### Verifiche mirate: quali prove nel browser

Le prove nel browser (`npm run e2e`, `npm run e2e:admin`, rilevatore di trabocchi compreso) sono le sole che si alleggeriscono, in
base ai file cambiati rispetto all'**ultima pubblicazione riuscita** (decisione dell'utente, 01/10/2026). Prima di eseguire
qualunque cosa lo script stampa il piano: il riferimento usato, i file cambiati (riassunti per regola), quali prove fa, quali
salta e perche'. Le regole stanno in `scripts/verifiche_mirate.mjs` (la prima che corrisponde a un file vince) e sono provate da
`test/verifiche_mirate.test.ts`:

| File cambiati | Prove nel browser |
| --- | --- |
| `app/src/admin/**` | solo `e2e:admin` |
| `app/src/pagine/**` | solo `e2e` pubblico |
| `app/src/ui/**`, `app/src/stili/**`, `app/src/lib/**`, `app/index.html`, `app/public/**`, `shared/**`, `functions/**`, `migrations/**`, `vite.config.*`, `package.json`, `package-lock.json`, `e2e/impianto.ts`, `e2e/trabocchi.ts`, `e2e/schermate_trabocchi.ts` | TUTTE E DUE |
| `e2e/e2e.ts` | solo `e2e` pubblico |
| `e2e/e2e_admin.ts`, `e2e/live.ts`, `e2e/access_simulato.ts`, `e2e/google_simulato.ts`, `e2e/moduli.ts` | solo `e2e:admin` |
| `scripts/pubblica.sh`, `scripts/verifiche_mirate.*` (la logica che sceglie), `scripts/seed_prova.sql` (i dati di tutte le prove) | COMPLETO |
| solo `*.md`, `docs/**`, `LICENSE`, `test/**`, altri file in `scripts/` | nessuna prova nel browser |
| qualunque altro percorso (es. `app/src/App.tsx`, `wrangler.toml`, `tsconfig*.json`, `.gitignore`) | COMPLETO: nel dubbio si prova |

Un file solo basta ad accendere una prova; con file di tipi diversi valgono le prove di tutti (unione). Senza nessun file
cambiato non c'e' nessuna prova nel browser (e' lo stato gia' provato).

**Il riferimento** e' il commit dell'ultima pubblicazione riuscita, cercato in quest'ordine:

1. il file `.ultima-pubblicazione` (ignorato da git), scritto alla fine di ogni pubblicazione riuscita;
2. se manca (il container della sessione e' effimero), l'ultimo deployment di produzione sull'API di Cloudflare Pages
   (`deployment_trigger.metadata.commit_hash`), ma solo se NON e' marcato `commit_dirty`: un deployment sporco non dice che
   cosa c'e' davvero in produzione (fino al 30/09/2026 lo script passava sempre `--commit-dirty=true`, quindi i deployment piu'
   vecchi sono tutti sporchi e non servono come riferimento);
3. se non si trova, o non e' un antenato di HEAD (o non esiste nel repository locale): giro COMPLETO.

I file cambiati sono quelli fra il riferimento e la cartella di lavoro: commit, modifiche non committate e file nuovi non ignorati.

Il deploy passa a wrangler `--commit-hash` esplicito (l'HEAD) e `--commit-dirty` VERO solo se la cartella di lavoro ha davvero
modifiche non committate. Dopo il controllo del sito vero lo script chiede all'API che commit ha registrato Cloudflare: se e'
l'HEAD appena pubblicato salva `.ultima-pubblicazione`, se e' un altro esce con errore senza salvare. Con modifiche non committate
il riferimento NON si salva (resta quello vecchio): **conviene committare PRIMA di pubblicare**, cosi' il riferimento avanza e
Cloudflare registra un commit vero. Alla fine lo script stampa i secondi di ogni passo e la durata totale.

`scripts/controlla_produzione.sh [indirizzo-della-pubblicazione]` si puo' lanciare da solo quando si
vuole. Controlla il sito VERO: pagine e API pubbliche danno 200; `/admin` e ogni `/api/admin/*`
(elenco ricavato da `functions/api/admin`, GET e POST; i segmenti `[id]`, `[eid]`... diventano `1`, quindi anche le rotte della diretta, con in piu' una prova esplicita di POST/PATCH/DELETE senza credenziali su `.../diretta/*`: mai 2xx) rimandano al login di Access (302 verso
`cloudflareaccess.com`) o danno 401/403, mai 200; "livello" non compare in nessuna risposta
pubblica; `/manifest.webmanifest` (200, `application/manifest+json`, JSON valido, icone dichiarate raggiungibili) e `/apple-touch-icon.png` (200, `image/png`, 180x180: il sito risponde 200 con la pagina dell'app anche per un file che non c'e', quindi si guardano content-type e byte del PNG); intestazioni di sicurezza e CSP presenti (senza `unsafe-*`, con HSTS); l'indirizzo della singola
pubblicazione (`<hash>.terzo-tempo.pages.dev`) e' tutto dietro Access.

Lo stesso script fa anche le **prove d'attacco NON distruttive** (solo GET, HEAD, OPTIONS, e POST/PUT/DELETE verso
`/api/admin/*` senza credenziali; mai un voto, mai una scrittura): percorsi mascherati verso l'admin (maiuscole, `%61`,
doppi slash, `;`, `%2F`, doppia codifica, percentuali malformate), JWT `alg: none`/HS256/RS256 contraffatti in intestazione e
in cookie, `Cf-Access-Authenticated-User-Email` e `Host`/`X-Forwarded-*` falsificati, CORS, file sorgente e di configurazione
non serviti, nessun segreto nel bundle JS pubblico, nessun 5xx ne' stack con id e parametri malevoli (SQL, numeri enormi,
unicode). Si puo' lanciare quando si vuole, anche da solo, senza toccare i dati.

Trappole gia' incontrate (dal progetto gemello):

- `tsc --noEmit` qui non controlla niente (tsconfig con `references`): il controllo e' `tsc -b`.
- Una pipe (`| tail`) davanti a un comando che deve poter fallire lo fa sembrare riuscito.
- PBKDF2 sopra 100.000 iterazioni e' rifiutato dai Worker in produzione ma non in locale: le prove
  locali non bastano, dopo ogni pubblicazione si prova il sito vero.
- Subito dopo la CREAZIONE del progetto il sito puo' rispondere 522 per qualche decina di secondi:
  il controllo ritenta i 5xx fino a 4 volte a distanza di 10 secondi.
- Access chiede il codice solo se il browser chiede la PAGINA al server. Il pulsante "Area admin" del piede e' quindi un
  `<a href="/admin">` normale (e `vai()`/`Link` del router fanno una navigazione di pagina vera verso /admin da fuori
  dell'area): una navigazione della SPA mostrava il guscio dell'admin e poi "Non riesco a raggiungere il server",
  perche' il fetch a `/api/admin/me` seguiva il 302 di Access verso un altro sito (bloccato da CORS e CSP). Ora le chiamate
  admin usano `redirect: 'manual'`; un rinvio, un 401/403 o una risposta non JSON su `/api/admin/me` fanno UNA navigazione
  di pagina vera (flag in `sessionStorage` contro i cicli), poi "Area riservata" con il pulsante per riprovare. Il guscio
  dell'admin compare solo dopo `/api/admin/me` = 200. `npm run e2e:admin` lo prova con un finto Access (`e2e/access_simulato.ts`).
- Il `.pages.dev` di un progetto nuovo e' `<nome>.pages.dev` solo se il nome e' libero: qui lo e'.

## Aggiungere o togliere un admin

Le email vanno cambiate in DUE posti, e devono concordare:

1. **Le policy delle due app Access** (chi riceve il codice via email). Dal pannello: Zero Trust >
   Access controls > Applications > `terzo-tempo admin` > Policies > Include > Emails, e lo stesso
   per `terzo-tempo anteprime`. Oppure via API (token con "Access: Apps and Policies Edit"): per ciascuna
   delle due app `GET /accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps` (si riconoscono dal nome che inizia
   per `terzo-tempo`), poi `PUT /accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/<id-app>/policies/<id-policy>`
   rimandando la policy con `include` = `[{"email": {"email": "..."}}, ...]` (la policy e' legata all'app,
   non riutilizzabile). Rileggere dopo la scrittura.
2. **Il secret `EMAIL_AUTORIZZATE`** (chi riceve i DATI dell'admin), con l'elenco completo delle email
   separate da virgola, senza spazi ne' a capo, passato da file via stdin (mai stampato):

   ```bash
   tr -d '\r\n' < dati/email_admin.txt | npx wrangler pages secret put EMAIL_AUTORIZZATE --project-name terzo-tempo
   ```

   `dati/` e' ignorata da git: e' li' che sta l'elenco locale (una copia di riferimento, mai in git).
   Il secret vale dalla pubblicazione successiva: dopo il cambio, `./scripts/pubblica.sh`.

Se le due liste non concordano: chi e' solo nella policy entra ma riceve 403 dai dati; chi e' solo nel
secret non riceve nemmeno il codice (Access non avvisa: la pagina dice comunque "codice inviato").
Per TOGLIERE qualcuno subito: oltre a toglierlo dai due posti, Zero Trust > Team & Resources > Users >
la persona > Revoke sessions (altrimenti la sessione dura fino a un mese).

## Dove stanno i giocatori veri

- Nel D1 di produzione, tabella `giocatori` (14 righe inserite il 30/09/2026, `livello_segreto` NULL,
  nessun badge, attivi). Da ora si gestiscono dall'area `/admin`: non si reinserisce niente a mano
  (lo script SQL usato non e' idempotente: rilanciarlo darebbe errore sui doppioni o duplicati).
- Copia di riferimento locale: `dati/giocatori_reali.tsv` (cognome, iniziali, nota; le iniziali possono
  mancare), ignorata da git. Serve alla guardia `test/guardia_nomi.test.ts`, che fallisce se un
  cognome reale compare in un file tracciato. Se un test trova un match si correggono i FILE, mai il test.
- Mai in git: ne' nel codice, ne' nei test, ne' negli esempi (si usano Rossi, Bianchi, Verdi...), ne'
  nei documenti. Gli screenshot del sito vero contengono nomi veri: si tengono FUORI dal repository.
- `scripts/seed_prova.sql` (nomi inventati) e' solo per lo sviluppo locale: NON va mai caricato in produzione.

Per vedere i giocatori in produzione:

```bash
npx wrangler d1 execute terzo-tempo --remote --command "SELECT id, nome, attivo FROM giocatori ORDER BY nome"
```

## Una sessione nuova (macchina o sessione senza memoria)

1. Nell'ambiente devono esserci `CLOUDFLARE_API_TOKEN` (token API con permessi su Pages, D1 e
   "Access: Apps and Policies Edit") e `CLOUDFLARE_ACCOUNT_ID` (visibile nella dashboard di Cloudflare).
   Il token non sta in nessun file del repository: si esporta nella sessione (per esempio da un file
   fuori dal repo con `. /percorso/env.sh`) e non si stampa mai (niente `echo`, niente `cat`).
2. `git checkout` del ramo, `npm install` (il `.npmrc` ha `legacy-peer-deps=true`), `npm test`.
3. `./scripts/pubblica.sh`. Senza `dati/giocatori_reali.tsv` la guardia dei nomi non ha niente da
   controllare e passa: non e' un errore, ma ricordare che i nomi veri non vanno mai in git.
3b. In locale `.dev.vars` (copia di `.dev.vars.example`) apre l'admin solo con Access NON configurato: l'esempio azzera
   `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`, che altrimenti verrebbero da `wrangler.toml`. `npm run e2e:admin` li passa con `--binding` (insieme a `GOOGLE_MAPS_PROVA`, l'indirizzo del finto Google locale: vedi `docs/API.md`, sezione Campi; in produzione quella variabile non va mai messa e, se ci fosse, verrebbe ignorata).
   Le migrazioni si applicano anche alla base locale: `npm run db:migra` (la `0003` aggiunge `voti_mvp.hash_ip`, la `0004` la tabella `campi` e `partite.campo_id`: nessun dato, i campi li inserisce l'admin; la `0005` la partita in diretta: `partite.diretta_iniziata_il` / `diretta_finita_il`, le tabelle `tipi_evento` (con `gol` e `autogol`) ed `eventi_partita`, vuote. E' solo additiva: le partite esistenti restano com'erano, e una partita con le squadre assegnate e l'orario passato parte da sola "in diretta" per le 2 ore successive).
4. Dopo ogni pubblicazione, prova nel browser sul sito vero a 390x844 (`vite preview`/`wrangler pages dev`
   non bastano): console pulita, zero violazioni CSP, niente scroll orizzontale, `/admin` che porta al login
   di Access. Chromium e' gia' installato: mai `playwright install`.
