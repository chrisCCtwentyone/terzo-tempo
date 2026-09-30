# Domande aperte

Punti in cui il requisito era ambiguo. Regola del progetto: non si indovina. Per ciascuno c'e' la scelta piu'
**conservativa e reversibile** fatta nel codice (fase 1, backend) e la domanda da porre all'utente.
Chi risponde puo' cambiare la scelta nel punto indicato.

## Da chiedere all'utente

1. **Cosa significa il livello segreto: 5 e' il piu' forte o il piu' debole?**
   Scelta: 5 = piu' forte, 1 = piu' debole (`punteggio()` in `functions/lib/generatore.ts`). Se e' il contrario le squadre
   generate sarebbero sbilanciate al contrario: **da confermare prima di usare il generatore**.

2. **Descrizioni dei badge.** Il CLAUDE.md ne da solo tre: Saracinesca ("portiere"), Turista ("non torna in difesa"),
   Egoista ("non passa mai"). Gli altri nove (Corridore, Cecchino, Instancabile, Muro, Regista, Dribblomane, Polemico,
   Ritardatario, Fragile) hanno `descrizione = NULL` nella migrazione, per non inventare. L'admin le compila con
   `PATCH /api/admin/badge/:id`. Vuole dettarle lui?

3. **Minimo di partite nelle classifiche.** Valore provvisorio **3** (`MIN_PARTITE_CLASSIFICA`). Vale per `media_voto`
   (conta le partite *con pagella*) e per `pct_vittorie` (conta le presenze), e anche affinche' il generatore usi le statistiche di
   un giocatore. Sotto soglia il giocatore non compare in quelle due classifiche (non vale 0, semplicemente non c'e').
   Quanto vuole che sia? Serve anche una soglia diversa per la % vittorie?

4. **Votazione chiusa senza nessun voto.** Stato `nessun_voto`, nessun MVP; l'admin **non** puo' assegnarlo a mano
   (decide solo fra pari merito, come da CLAUDE.md). Va bene, o l'admin deve poterlo assegnare comunque?

5. **Pesi del generatore.** Provvisori, in `functions/lib/costanti.ts`: voto 0.35, vittorie 0.20, gol 0.15, livello 0.30;
   1 gol a partita = punteggio massimo della componente gol; peso dell'equilibrio badge 0.3 contro 1 per l'equilibrio del
   punteggio. I badge positivi e negativi sono trattati allo stesso modo ("non tutto da una parte"): giusto? Le statistiche sono
   quelle di tutto lo storico, non della sola stagione aperta: giusto?

6. **Una convocazione con qualcuno che poi non si e' presentato.** Regola scelta: e' una presenza solo chi ha una squadra in una
   partita segnata "giocata"; per segnarla giocata ogni convocato deve avere una squadra, quindi chi non c'e' si toglie dai
   convocati. Non esiste il concetto di "convocato assente". Basta cosi'?

7. **Gol non attribuiti.** Se i gol dei giocatori non sommano al risultato il server non blocca: risponde con `avvisi`
   (l'admin decide). Preferisce un blocco (errore 409)?

8. **Chi si puo' votare come MVP.** "Chiunque sia nel listone" = i giocatori **attivi**. Un giocatore archiviato dopo aver
   giocato non e' piu' votabile per le partite vecchie ancora aperte (rarissimo: la finestra e' di 24 ore). Va bene?

9. **Prossima partita in home** = la partita in convocazione con la data piu' vicina, anche se la data e' passata e
   l'admin non l'ha segnata giocata (cosi' non si nasconde niente: se e' rimasta li' si vede e si corregge o cancella).
   Preferisce mostrare solo quelle future?

10. **Piu' stagioni aperte.** Al massimo una alla volta (vincolo del DB). Si possono creare partite anche in una stagione chiusa
    (serve per inserire lo storico). Va bene?

11. **Font.** Il CLAUDE.md indica Anton e Nunito Sans. La CSP di `functions/_middleware.ts` ammette solo risorse del nostro sito:
    i font vanno self-hosted (es. `@fontsource/anton`), non da Google Fonts. Va detto all'agente frontend.

## Scelte tecniche senza impatto sull'utente (per completezza)

- **Orari**: `data_ora` senza fuso = Europe/Rome, salvata in UTC (`romaAUtc`, testata anche per il cambio d'ora).
- **Chiusura automatica del voto**: `mvp_chiuso_il` = scadenza (`data_ora` + 24 h), non l'istante della lettura. Una partita
  segnata giocata dopo la scadenza si chiude alla prima lettura, senza voti.
- **Cookie del dispositivo non firmato**: chi fabbrica cookie a mano puo' votare piu' volte. E' lo stesso limite di "incognito"
  che l'utente ha gia' accettato; si potra' firmarlo con un secret se un giorno servisse.
- **Nomi dei giocatori**: `Iniziale. Cognome` con regola rigida (maiuscola + punto, eventualmente piu' iniziali), unici senza
  distinguere maiuscole: due omonimi con la stessa iniziale non possono coesistere, serve una seconda iniziale.
- **Modifiche concorrenti**: `PUT .../convocati` sostituisce tutto: se due admin salvano insieme vince l'ultimo.
- **Classifiche**: includono anche i giocatori archiviati (storico), con `attivo: false`; il listone no (salvo `?tutti=1`).
- **Generatore**: ricerca esaustiva, fino a 24 convocati (~0,1 s per 20); oltre, errore 400. Se un giorno servissero
  piu' giocatori si passa a un'euristica (nota `MAX_CONVOCATI_GENERATORE`).
- **Errori dell'admin**: 401 senza token, 403 token/email/configurazione non validi, 503 chiavi di Access irraggiungibili
  (sempre chiuso). Lo scarto rispetto a turni-plus: la configurazione mancante e' 403 (come chiesto), non 503.
- **npm**: `.npmrc` con `legacy-peer-deps=true` perche' `npm install` con l'albero completo (Vite 8 + plugin React 6 +
  wrangler) va in crash dentro npm 10.9 ("Cannot read properties of null (reading 'edgesOut')"); con il flag e' pulito.

## Frontend pubblico (scelte fatte, tutte reversibili)

Scelte della parte pubblica dove il requisito non diceva tutto. Nessuna e' stata indovinata sui dati: sono solo scelte di
presentazione. Da confermare con l'utente.

12. **Orientamento del campo.** `docs/API.md` lascia la scelta al frontend: **la squadra A gioca in alto, la B in basso**
    (`LATO_ALTO` in `app/src/lib/campo.ts`), coerente con le posizioni del seed. Il prototipo aveva A in basso. L'admin
    (drag & drop) deve usare lo stesso verso, altrimenti le pedine si vedono a specchio.
13. **Disposizione automatica delle pedine.** Vale per l'INTERA squadra se anche una sola pedina non ha la posizione
    (mescolare posizioni salvate e automatiche darebbe pedine sovrapposte). Righe da 4 al massimo, senza ruoli
    (il prototipo metteva il portiere per primo: non sappiamo chi lo e').
14. **Convocati nella home.** Figurine con cognome (nome per intero se due hanno lo stesso cognome). Il prototipo mostrava
    anche il luogo del campo: l'API non lo ha, quindi non c'e'.
15. **"Statistica curiosa".** Una sola, ricavata dai dati gia' in home: il miglior voto in pagella dell'ultima partita
    (a pari merito, tutti). Sparisce se non ci sono pagelle. Altre (serie positive, compagno portafortuna...) non sono
    ricavabili dalle API attuali senza molte chiamate: non ci sono.
16. **Classifiche: selettore.** Barra a due voci (stagione aperta / Sempre) piu' una tendina "Altre stagioni" per le chiuse.
    Il periodo e la categoria stanno nell'URL (`/classifiche?stagione=2&cat=mvp`), cosi' si condividono.
17. **Badge sulle figurine.** Segni sul bordo (tondo verde = positivo, rombo rosso = negativo, al massimo 3); le etichette
    con il nome stanno nel listone e nella scheda. Sulle figurine delle partite i badge arrivano dal listone
    (una richiesta condivisa, riusata per un minuto): se non arriva, le figurine restano senza badge.
18. **Listone.** Oltre a figurina, nome e badge ho aggiunto le presenze totali a destra (dato gia' nell'API).
19. **Scheda giocatore.** Numeri della stagione aperta con "sempre" sotto; senza stagione aperta solo quelli di sempre.
    Il grafico mostra le ultime 10 pagelle (la riga tratteggiata e' la media di sempre). Gli "ultimi 5" mostrano l'esito e
    la data, non il punteggio (l'API non lo da'). Niente "numero di figurina" ne' statistiche divertenti del prototipo.
20. **Voto MVP.** Il conto alla rovescia usa l'orologio del telefono: se e' sbagliato il conto e' sbagliato, ma a tempo
    scaduto la pagina rilegge dal server (ogni 5 secondi finche' non risulta chiusa). Il blocco sta in fondo alla partita;
    dalla home "Vota ora" porta li'. Mentre e' aperto: solo il numero dei votanti, mai i conteggi (li' ce li mette solo il server).
21. **Partita in convocazione.** Mostra il tabellone con "–" e "Da giocare", i convocati e, se l'admin ha gia' assegnato le
    squadre, anche il campo (senza voti); niente pagella ne' voto MVP.
22. **Area admin.** Per ora `/admin` e' un segnaposto (`app/src/admin/Admin.tsx`), caricato a parte con `React.lazy`.
