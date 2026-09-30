# CLAUDE.md — Terzo Tempo

Webapp (quasi solo da telefono) per le partite di calcetto di un gruppo di ~20 amici:
presenze, formazioni, gol, MVP, pagelle, cronache e statistiche divertenti nel
tempo. L'utente non scrive codice: lo sviluppo e' interamente delegato a Claude Code.

## Regole di lavoro (non negoziabili)

- **CHIEDERE QUANDO NON SI SA.** Istruzione esplicita dell'utente: "qualsiasi cosa tu
  non sappia chiedi, non improvvisare, non inventare". Le domande si fanno con
  risposte cliccabili (AskUserQuestion), non con elenchi da leggere. Questa regola
  prevale su qualsiasi skill che dica di "procedere con un default".
- **Mai inventare un dato.** Statistiche, risultati, nomi: solo quelli inseriti da un
  admin. Un dato mancante si mostra come mancante, mai con un valore di ripiego.
- **Organizzazione:** la sessione principale fa da capo progetto e coordina; il
  lavoro (codice, grafica, test, ricerche) si assegna a subagenti di tipo **Sonnet**.
- **Ogni commit si invia subito a GitHub** (repository privato).
- **Nessun nome reale nei file tracciati da git** (codice, test, esempi, documenti).
  Negli esempi si usano cognomi inventati: M. Rossi, L. Bianchi, A. G. Verdi...
  I nomi veri vivono solo nel database.
- **Mai fidarsi di una prova locale per cio' che gira nel browser o in produzione**:
  si prova con la build di produzione (`vite preview`) e, dopo ogni pubblicazione,
  sul sito vero. Mai passare in una pipe un comando che deve poter fallire.

## Decisioni prese (30/09/2026)

- **Nome**: Terzo Tempo. Repository `chrisCCtwentyone/terzo-tempo`, privato.
- **Hosting**: Cloudflare Pages + D1 (gratuito, ~20 utenti).
- **Accesso**: parte pubblica senza password. Sezione admin (1-4 admin) protetta,
  metodo proposto: Cloudflare Access con codice via email (le email degli admin NON
  vanno in git: stanno in un secret). Da confermare quando si arriva li'.
- **Partite**: squadre rifatte ogni volta, numero di giocatori per squadra variabile
  (5, 6, 7...). Tutto lo gestisce l'admin.
- **Dati per partita**: risultato, gol, autogol, voti in pagella 1-10 (dall'admin),
  cronaca scritta (spesso breve o assente: la pagina deve stare bene anche senza).
  **Niente assist** (decisione dell'utente, 30/09/2026: "non verra' usato").
- **MVP votato**, non piu' scelto dall'admin (decisioni dell'utente, 30/09/2026):
  - un voto per telefono, anonimo, senza login (il telefono ricorda di aver
    votato). L'utente sa che si aggira con incognito/altro browser e lo accetta;
  - vota tutto il gruppo, non solo chi ha giocato; ci si puo' votare da soli;
  - la votazione la chiude l'admin a mano; se non lo fa, si chiude da sola 24 ore
    dopo l'ORARIO DELLA PARTITA (es. partita gio 21:00 -> chiusa ven 21:00), anche
    se l'admin carica la partita in ritardo. Nessuno deve poter votare giorni dopo;
  - mentre e' aperta si vede solo quanti hanno votato; il risultato esce alla chiusura;
  - in caso di parita' decide l'admin fra i pari merito.
- **Stagioni**: aperte e chiuse a mano dall'admin; classifiche per stagione e storico.
- **Giocatori**: identificati come "Iniziale. Cognome" (anche due iniziali, es.
  "S. C. Rossi"). Niente foto per ora; in futuro forse foto o avatar stile
  fantacalcio. Lista sempre ampliabile. I giocatori veri li fornisce l'utente DOPO
  le prove con giocatori generici.
- **Squadre**: per ora si chiamano sempre "Casaccati" contro "Smollicati"
  (decisione dell'utente, 30/09/2026; potra' cambiare: tenerlo in un solo punto).
- **Convocati**: la lista la inserisce l'admin (il gruppo si organizza su
  WhatsApp, nessuno userebbe un "ci sono" nell'app). Niente risposte dei giocatori.
- **Formazioni sul campo** stile "leghe Fantagazzetta": le pedine le TRASCINA
  l'admin col dito; la posizione si salva e si mostra a tutti.
- **Generatore di squadre**: parte dai convocati, bilancia un mix di media voto,
  percentuale vittorie, gol e **livello segreto** dato dall'admin; cerca anche di
  distribuire i badge fra le due squadre. Poi l'admin ritocca a mano.
- **Livello segreto** (es. 1-5): uno per giocatore, condiviso fra tutti gli admin,
  MAI visibile ai giocatori ("senza che nessuno si offenda"). Non deve uscire da
  nessuna API pubblica, nemmeno in un campo ignorato dall'interfaccia.
- **Badge** (caratteristiche, positive e negative), assegnati dagli admin e
  visibili a tutti sulla figurina e nel listone giocatori. Lista iniziale:
  positivi Corridore, Cecchino, Instancabile, Muro, Regista, Saracinesca
  (portiere), Dribblomane; negativi Turista (non torna in difesa), Egoista (non
  passa mai), Polemico, Ritardatario, Fragile. Gli admin possono crearne di nuovi.
- **Altre funzioni volute**: classifiche (gol, presenze, media voto, MVP), scheda
  giocatore, listone giocatori, statistiche divertenti.
- **Stile**: animazioni importanti ma leggere; non e' un sito vetrina, deve essere
  rapido. **Stile scelto: B "Figurine"** (30/09/2026): carta avorio con grana,
  colori pieni da stampa, ombre stampate, giocatori come figurine con iniziali,
  font Anton + Nunito Sans, tema chiaro e "album di notte". Riferimento:
  `docs/anteprima-figurine.html` (prototipo approvato).
- **Riferimento funzionale**: https://trntmarkt.altervista.org/ (lo stile grafico NON
  piace all'utente). Non ancora analizzato: il dominio era bloccato dalla rete.

## Skill del progetto

- `ponytail` (in `.claude/skills/`, solo le skill, senza gli hook): evitare codice e
  dipendenze superflue. Vale la regola "chiedere quando non si sa" sopra.
- `graphify` (in `.claude/skills/graphify/`): mappa del codice per domande di
  architettura. Richiede il pacchetto Python `graphifyy` (la skill lo installa se
  manca). L'output `graphify-out/` non va in git.
