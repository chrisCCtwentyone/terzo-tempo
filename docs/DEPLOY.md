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
./scripts/pubblica.sh
```

Si ferma al primo errore (`set -euo pipefail`, nessuna pipe sui comandi che devono poter fallire) e fa,
in ordine: `tsc -b`, `vitest run` (compresa la guardia dei nomi reali), `vite build`, migrazioni D1
`--remote`, `wrangler pages deploy app/dist --branch main`, poi `scripts/controlla_produzione.sh`.
Esce con 0 solo se e' tutto verde. Servono nell'ambiente `CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID` (vedi "Una sessione nuova").

`scripts/controlla_produzione.sh [indirizzo-della-pubblicazione]` si puo' lanciare da solo quando si
vuole. Controlla il sito VERO: pagine e API pubbliche danno 200; `/admin` e ogni `/api/admin/*`
(elenco ricavato da `functions/api/admin`, GET e POST) rimandano al login di Access (302 verso
`cloudflareaccess.com`) o danno 401/403, mai 200; "livello" non compare in nessuna risposta
pubblica; intestazioni di sicurezza e CSP presenti; l'indirizzo della singola pubblicazione
(`<hash>.terzo-tempo.pages.dev`) e' tutto dietro Access.

Trappole gia' incontrate (dal progetto gemello):

- `tsc --noEmit` qui non controlla niente (tsconfig con `references`): il controllo e' `tsc -b`.
- Una pipe (`| tail`) davanti a un comando che deve poter fallire lo fa sembrare riuscito.
- PBKDF2 sopra 100.000 iterazioni e' rifiutato dai Worker in produzione ma non in locale: le prove
  locali non bastano, dopo ogni pubblicazione si prova il sito vero.
- Subito dopo la CREAZIONE del progetto il sito puo' rispondere 522 per qualche decina di secondi:
  il controllo ritenta i 5xx fino a 4 volte a distanza di 10 secondi.
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
4. Dopo ogni pubblicazione, prova nel browser sul sito vero a 390x844 (`vite preview`/`wrangler pages dev`
   non bastano): console pulita, zero violazioni CSP, niente scroll orizzontale, `/admin` che porta al login
   di Access. Chromium e' gia' installato: mai `playwright install`.
