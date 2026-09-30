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

- **Nome**: Terzo Tempo. Repository `chrisCCtwentyone/terzo-tempo`: l'utente vuole
  renderlo **PUBBLICO** (30/09/2026). Quindi, a maggior ragione: nessuna email,
  nessun nome reale, nessun token nei file tracciati NE' nella storia dei commit.
  README curato con diagrammi di flusso (sul modello del repo pubblico
  `chrisCCtwentyone/toto-amici`).
- **Credits**: nell'app, una pagina "Info" con "creato da chrisCCtwentyone" e link
  al profilo GitHub (https://github.com/chrisCCtwentyone). Solo il nickname, MAI il
  nome vero (decisione dell'utente).
- **Licenza**: MIT, intestata a chrisCCtwentyone (decisione dell'utente, 30/09/2026).
- **Hosting**: Cloudflare Pages + D1 (gratuito, ~20 utenti).
- **Accesso**: parte pubblica senza password. Sezione admin (/admin e /api/admin)
  dietro Cloudflare Access con codice via email (OTP, come turni-plus), piu'
  verifica del JWT nel backend. Le email degli admin NON vanno in git: stanno nella
  policy di Access e nel secret EMAIL_AUTORIZZATE. Stesso account e stessa
  organizzazione Zero Trust di turni-plus: chi ha gia' fatto il codice su turni-plus
  entra in Terzo Tempo senza un nuovo codice SE e' anche nella lista di Terzo Tempo
  (sessione globale dell'organizzazione). Spiegato all'utente il 30/09/2026, che
  ha scelto di lasciarlo cosi' ("se non e' un buco di sicurezza lascia tutto cosi'").
  Chi non e' nella lista non entra: la policy e' valutata per app e il backend
  ricontrolla AUD ed email.
- **Dati reali**: il sito online parte con i giocatori VERI forniti dall'utente
  (30/09/2026), inseriti direttamente nel database di produzione e MAI in un file
  tracciato. I dati finti di scripts/seed_prova.sql servono solo in locale e nei test.
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
  - in caso di parita' decide l'admin fra i pari merito;
  - se si chiude senza nessun voto, l'MVP lo sceglie l'admin (solo in quel caso);
  - un MVP scelto dall'admin (parita' o zero voti) conta in classifica come gli altri.
- **Stagioni**: aperte e chiuse a mano dall'admin; classifiche per stagione e storico.
- **Giocatori**: nome mostrato OVUNQUE nell'app (classifiche, listone, campo,
  pagelle) come **"Cognome I."**, iniziali attaccate col punto: "Rossi M.",
  "Rossi S.C.", "De Luca V." (decisione dell'utente, 30/09/2026; prima era
  "S. C. Rossi"). Alcuni giocatori veri hanno solo un nome o un nome provvisorio
  (utente: "lasciali, in futuro si modificano o si eliminano"): le iniziali
  possono mancare e allora si mostra il solo nome scritto. Niente foto per ora; in futuro forse foto o avatar stile
  fantacalcio. Lista sempre ampliabile. I giocatori veri li fornisce l'utente DOPO
  le prove con giocatori generici.
- **Squadre**: per ora si chiamano sempre "Casaccati" contro "Smollicati"
  (decisione dell'utente, 30/09/2026; potra' cambiare: tenerlo in un solo punto).
- **Convocati**: la lista la inserisce l'admin (il gruppo si organizza su
  WhatsApp, nessuno userebbe un "ci sono" nell'app). Niente risposte dei giocatori.
- **Formazioni sul campo** stile "leghe Fantagazzetta": l'admin sceglie il MODULO
  per ogni partita e TRASCINA i giocatori sulle caselle del modulo (posizioni
  ANCORATE, non libere). Portiere sempre incluso. Moduli disponibili
  (30/09/2026): a 5 "1-2-1" e "2-2"; a 6 "2-1-2" e "3-2"; a 7 "3-2-1", "2-3-1",
  "3-1-2"; a 8 "3-3-1" e "3-2-2". Squadre in numero diverso "non capitano mai"
  (utente): se succede, ogni squadra usa i moduli del proprio numero.
- **Generatore di squadre**: parte dai convocati, bilancia un mix di media voto,
  percentuale vittorie, gol e **livello segreto** dato dall'admin; cerca anche di
  distribuire i badge fra le due squadre. Poi l'admin ritocca a mano. Usa le
  statistiche anche di chi ha giocato una sola volta: l'admin corregge col livello.
- **Livello segreto** da 1 a 5, **5 = il piu' forte**: uno per giocatore, condiviso fra tutti gli admin,
  MAI visibile ai giocatori ("senza che nessuno si offenda"). Non deve uscire da
  nessuna API pubblica, nemmeno in un campo ignorato dall'interfaccia.
- **Badge** (caratteristiche, positive e negative), assegnati dagli admin e
  visibili a tutti sulla figurina e nel listone giocatori. Lista iniziale:
  positivi Corridore, Cecchino, Instancabile, Muro, Regista, Saracinesca
  (portiere), Dribblomane; negativi Turista (non torna in difesa), Egoista (non
  passa mai), Polemico, Ritardatario, Fragile. Gli admin possono crearne di nuovi.
  Descrizioni approvate (30/09/2026): Corridore "brucia tutti in velocita'",
  Cecchino "tiro preciso e potente", Instancabile "corre fino all'ultimo minuto",
  Muro "in difesa non si passa", Regista "sa sempre a chi passarla", Saracinesca
  "tra i pali para tutto", Dribblomane "non rinuncia mai al dribbling", Turista
  "non torna in difesa", Egoista "non passa mai", Polemico "discute ogni fallo",
  Ritardatario "arriva a partita iniziata", Fragile "sempre acciaccato".
- **Classifiche**: nessun minimo di partite per media voto e % vittorie (compaiono
  tutti subito; decisione dell'utente).
- **Altre funzioni volute**: classifiche (gol, presenze, media voto, MVP), scheda
  giocatore, listone giocatori, statistiche divertenti.
- **Stile**: animazioni importanti ma leggere; non e' un sito vetrina, deve essere
  rapido. **Stile scelto: B "Figurine"** (30/09/2026): carta avorio con grana,
  colori pieni da stampa, ombre stampate, giocatori come figurine con iniziali,
  font Anton + Nunito Sans, tema chiaro e "album di notte". Riferimento:
  `docs/anteprima-figurine.html` (prototipo approvato).
- **Logo** (30/09/2026): scelto "A - Figurina" fra tre proposte: figurina inclinata
  con bordo inchiostro e ombra stampata, pallone su finestra blu, fascia rossa,
  sfondo giallo pieno. Sorgente: `docs/logo/logo-figurina.svg`. E' l'icona del sito,
  della schermata Home di iPhone (web app) e il marchio nell'intestazione.
- **Riferimento funzionale**: https://trntmarkt.altervista.org/ (lo stile grafico NON
  piace all'utente). Non ancora analizzato: il dominio era bloccato dalla rete.

## Skill del progetto

- `ponytail` (in `.claude/skills/`, solo le skill, senza gli hook): evitare codice e
  dipendenze superflue. Vale la regola "chiedere quando non si sa" sopra.
- `graphify` (in `.claude/skills/graphify/`): mappa del codice per domande di
  architettura. Richiede il pacchetto Python `graphifyy` (la skill lo installa se
  manca). L'output `graphify-out/` non va in git.
