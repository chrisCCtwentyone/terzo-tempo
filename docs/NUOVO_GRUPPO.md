# Terzo Tempo per il tuo gruppo

Questa guida serve a chi vuole un Terzo Tempo **suo**, per il suo gruppo di calcetto, sul **suo** account Cloudflare.
Il tuo sito sarà del tutto separato dall'originale: dati, giocatori, admin e indirizzo tuoi. Tutto ciò che serve è gratuito.

Il grosso del lavoro lo fa uno script che fa domande passo passo: `node scripts/nuovo_gruppo.mjs`. Ci vogliono circa 20 minuti.

## Cosa serve

- Un account **Cloudflare** gratuito: <https://dash.cloudflare.com/sign-up>
- Un account **GitHub** (consigliato, per ricevere gli aggiornamenti)
- Sul computer: **[Node.js](https://nodejs.org/)** versione 22 o più recente (la "LTS") e **[Git](https://git-scm.com/)**.
  Vanno bene Mac, Linux e Windows (i comandi si scrivono nel Terminale, o in PowerShell su Windows).

## 1. Prendi una copia del progetto

Su GitHub apri <https://github.com/chrisCCtwentyone/terzo-tempo> e premi **Fork**: ottieni una copia tua, che potrai
aggiornare quando l'originale riceve novità. Poi, nel Terminale:

```bash
git clone https://github.com/<il-tuo-utente>/terzo-tempo.git
cd terzo-tempo
npm ci
npx wrangler login      # si apre il browser: accedi a Cloudflare e autorizza
```

Se hai più di un account Cloudflare, prima dei comandi indica quale usare con la variabile `CLOUDFLARE_ACCOUNT_ID`.
Il valore si trova nella dashboard, a destra in "Account ID". Per esempio `export CLOUDFLARE_ACCOUNT_ID=...` su Mac/Linux,
oppure `$env:CLOUDFLARE_ACCOUNT_ID="..."` in PowerShell.

## 2. Lancia lo script

```bash
node scripts/nuovo_gruppo.mjs
```

Lo script, nell'ordine:

1. mostra l'account Cloudflare collegato e chiede conferma;
2. chiede il **nome del sito**, per esempio `calcetto-giovedi`, che diventa `calcetto-giovedi.pages.dev`. `terzo-tempo` è già preso;
3. crea il progetto **Cloudflare Pages** e il database **D1**, e scrive i loro dati in `wrangler.toml`;
4. si ferma e ti chiede di creare il **login dell'area admin** su Cloudflare Access (vedi sotto), poi chiede due valori;
5. chiede le **email degli admin**: restano solo su Cloudflare, mai in un file;
6. crea le tabelle del database, controlla che tutto sia a posto (build e test) e pubblica il sito.

Se qualcosa va storto si ferma e dice cosa. Puoi rilanciarlo: riusa progetto e database già creati.

### Il passo "Access": il login dell'area admin

La parte pubblica del sito è aperta a tutti: classifiche, partite, voto MVP. L'area **/admin**, dove si inseriscono giocatori
e partite, è protetta da **Cloudflare Access**: chi entra riceve un codice via email, e solo le email che scegli tu possono
entrare. Quando lo script si ferma, nel browser:

1. Nella dashboard Cloudflare apri **Zero Trust**. La prima volta ti fa scegliere il **nome del team**, per esempio
   `calcetto-giovedi`, e il piano: scegli **Free**. Cloudflare potrebbe chiedere un metodo di pagamento anche per il piano
   gratuito.
2. Vai in **Access > Applications** (in alcune versioni del pannello: *Access controls > Applications*) e premi
   **Add an application > Self-hosted**.
3. Come indirizzi (*public hostname* / *destinations*) aggiungi le tre righe che lo script ti ha mostrato:
   - `il-tuo-sito.pages.dev` con percorso `admin`
   - `il-tuo-sito.pages.dev` con percorso `api/admin`
   - `*.il-tuo-sito.pages.dev` senza percorso: copre gli indirizzi di anteprima di ogni pubblicazione

   Se il pannello non ti lascia aggiungere la terza riga, crea una seconda applicazione uguale solo per quella.
4. **Policy**: azione *Allow*, *Include > Emails*, e scrivi le email degli admin.
5. Metodo di accesso: **One-time PIN**, il codice via email. Di solito è già attivo.
6. Salva, poi torna allo script e incolla:
   - il **Team domain**: è `<nome-del-team>.cloudflareaccess.com`;
   - l'**Application Audience (AUD) Tag** della prima applicazione, una sequenza di 64 caratteri che trovi nella pagina
     dell'applicazione.

Se sbagli un valore, l'area admin resta **chiusa** (risponde "Area riservata"), mai aperta: basta rilanciare lo script.

## 3. Dopo la pubblicazione

- Apri `https://il-tuo-sito.pages.dev/admin`, inserisci la tua email e il codice ricevuto.
- Crea una **stagione**, poi i **giocatori**, poi la prima partita. Il resto lo trovi nel [README](../README.md).
- Salva la configurazione nel tuo fork. `wrangler.toml` non contiene segreti.

  ```bash
  git commit -am "Configurazione del mio gruppo"
  git push
  ```

Non caricare mai `scripts/seed_prova.sql` sul sito vero: contiene giocatori inventati per le prove in locale.

## Aggiornamenti

Quando il progetto originale riceve novità:

1. su GitHub, nella pagina del tuo fork, premi **Sync fork > Update branch**;
2. nel Terminale:

   ```bash
   git pull
   node scripts/aggiorna_gruppo.mjs
   ```

Lo script reinstalla le dipendenze, rifà build e test, aggiunge al database le tabelle nuove (i tuoi dati restano) e
ripubblica. Se GitHub segnala un conflitto su `wrangler.toml`, tieni i **tuoi** valori di `name`, `database_name`,
`database_id`, `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`.

`scripts/pubblica.sh` è lo script del sito originale: per il tuo usa `aggiorna_gruppo.mjs`.

## Aggiungere o togliere un admin

Le email stanno in **due** posti, e devono essere le stesse:

1. la policy dell'applicazione Access (Zero Trust > Access > Applications > la tua app > Policies);
2. il secret `EMAIL_AUTORIZZATE`, con l'elenco **completo** separato da virgole:

   ```bash
   npx wrangler pages secret put EMAIL_AUTORIZZATE --project-name il-tuo-sito
   node scripts/aggiorna_gruppo.mjs     # il secret vale dalla pubblicazione successiva
   ```

Chi è solo nella policy entra ma vede "Area riservata". Chi è solo nel secret non riceve il codice.

## Problemi frequenti

| Cosa succede | Perché e cosa fare |
| --- | --- |
| Subito dopo la prima pubblicazione il sito dà errore 522 | Normale per qualche decina di secondi: riprova. |
| "Codice inviato" ma l'email non arriva | L'email non è nella policy di Access: aggiungila (e controlla lo spam). |
| Entri in /admin ma vedi "Area riservata" | L'email non è nel secret `EMAIL_AUTORIZZATE`, oppure Team domain o AUD in `wrangler.toml` sono sbagliati: rilancia `nuovo_gruppo.mjs`. |
| `More than one account available` | Imposta `CLOUDFLARE_ACCOUNT_ID` (vedi il passo 1). |
| Lo script dice che l'account ospita già il sito originale | Sei collegato all'account dell'autore: `npx wrangler logout`, poi `npx wrangler login` con il tuo. |

## Licenza

Terzo Tempo è sotto licenza [MIT](../LICENSE): puoi usarlo e modificarlo liberamente, lasciando il file `LICENSE` con il
copyright dell'autore.
