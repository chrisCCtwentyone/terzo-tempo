# Domande aperte

Punti in cui il requisito era ambiguo. Regola del progetto: non si indovina. Per ciascuno c'e' la scelta piu'
**conservativa e reversibile** fatta nel codice (fase 1, backend) e la domanda da porre all'utente.
Chi risponde puo' cambiare la scelta nel punto indicato.

## Da chiedere all'utente

1. **Livello segreto.** RISOLTA (30/09/2026): 5 = il piu' forte, 1 = il piu' debole (`punteggio()` in `functions/lib/generatore.ts`,
   fissato da un test in `test/generatore.test.ts`).

2. **Descrizioni dei badge.** RISOLTA (30/09/2026): le 12 descrizioni approvate sono in CLAUDE.md e nella migrazione
   `migrations/0002_descrizioni_badge.sql` (la 0001 non e' stata toccata). Le descrizioni ora hanno le lettere accentate vere
   ("velocità"): la 0002 non era mai stata applicata in produzione, quindi e' stata corretta sul posto.

3. **Minimo di partite nelle classifiche.** RISOLTA (30/09/2026): nessun minimo per media voto e % vittorie (`MIN_PARTITE_CLASSIFICA = 0`,
   l'API dice `minimo_partite: 0` e il frontend non mostra la spiegazione). Attenzione: la stessa costante e' usata anche dal generatore
   di squadre, che quindi ora usa le statistiche di chiunque abbia almeno una partita. Va bene, o il generatore vuole un minimo suo?

4. **Votazione chiusa senza nessun voto.** RISOLTA (30/09/2026): l'admin puo' assegnare l'MVP a mano, solo in `nessun_voto` (e la
   scelta fra pari merito in `parita_da_decidere`), con `POST .../mvp/decidi`. **DA CONFERMARE: fra chi puo' scegliere?** Scelto
   "i giocatori della partita" (quelli con una squadra); l'alternativa e' "tutti gli attivi". Per cambiare: `CANDIDATI_SENZA_VOTI`
   in `functions/lib/mvp.ts`. Il frontend pubblico mostra "Scelto dall'admin: nessun voto ricevuto" (`assegnato` con `voti_totali` 0).
   L'MVP scelto cosi' conta nella classifica MVP: va bene? RISOLTA (30/09/2026): si', conta come quelli votati.

5. **Pesi del generatore.** Provvisori, in `functions/lib/costanti.ts`: voto 0.35, vittorie 0.20, gol 0.15, livello 0.30;
   1 gol a partita = punteggio massimo della componente gol; peso dell'equilibrio badge 0.3 contro 1 per l'equilibrio del
   punteggio. I badge positivi e negativi sono trattati allo stesso modo ("non tutto da una parte"): giusto? Le statistiche sono
   quelle di tutto lo storico, non della sola stagione aperta: giusto?
   PARZIALMENTE RISOLTA (30/09/2026): il generatore usa le statistiche anche di chi ha giocato una sola volta e l'admin corregge col livello 1-5.

6. **Una convocazione con qualcuno che poi non si e' presentato.** Regola scelta: e' una presenza solo chi ha una squadra in una
   partita segnata "giocata"; per segnarla giocata ogni convocato deve avere una squadra, quindi chi non c'e' si toglie dai
   convocati. Non esiste il concetto di "convocato assente". Basta cosi'?

7. **Gol non attribuiti.** Se i gol dei giocatori non sommano al risultato il server non blocca: risponde con `avvisi`
   (l'admin decide). Preferisce un blocco (errore 409)?

8. ~~**Chi si puo' votare come MVP.**~~ Deciso dall'utente il 23/10/2026: solo chi ha giocato la partita (convocati con una
   squadra), archiviato o no.

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

## Area admin (scelte fatte, tutte reversibili)

23. **Nome "Cognome I." senza migrazione.** Il nome si salva gia' composto in `giocatori.nome` ("Rossi S.C."); l'admin lo inserisce in due campi
    (`cognome`, `iniziali`) e il server lo compone; per leggerlo si divide con una regola esatta (`shared/nomi.ts`: l'ultima parola e' fatta di sole
    iniziali col punto, il cognome non puo' contenere punti). Non ho aggiunto colonne ne' una migrazione di conversione: nessun dato reale esiste
    ancora (il DB di produzione non e' stato creato) e le nuove colonne avrebbero duplicato `nome`. Se si preferisce la separazione nel DB basta una
    migrazione che aggiunge `cognome` e `iniziali` e riempie da `nome`. Un vecchio DB locale col formato "A. G. Verdi" va rifatto col seed.
    Form tollerante: "de luca" -> "De Luca", "ROSSI" -> "Rossi", iniziali "s c"/"sc"/"S.C." -> "S.C." (1-3 lettere).
24. **Modulo senza colonna.** Il modulo di una squadra si deduce dalle posizioni salvate (coordinate delle caselle). Scelta fatta perche' la creazione
    di una nuova migrazione mi e' stata negata dai permessi dell'ambiente; e' comunque la via piu' semplice e la pagina pubblica non cambia. Limite:
    non si distingue "modulo scelto ma pedine non ancora salvate" (e' una bozza nel browser). Se serve una colonna `modulo_a`/`modulo_b` su `partite`:
    migrazione 0003 e `deduciModulo` diventa un ripiego.
25. **Cambio di squadra = posizioni azzerate** per le due squadre coinvolte (il numero cambia, quindi anche i moduli). Il modulo si sceglie al passo
    "Campo"; finche' non e' scelto, o con meno di 5 / piu' di 8 giocatori, le pedine restano nella disposizione automatica (con avviso).
    Il primo giocatore della squadra prende il portiere: poi lo si trascina.
26. **Eliminare un badge chiede sempre conferma** nella pagina (piu' esplicita se e' assegnato), non solo se assegnato.
27. **Data e ora della nuova partita**: campo vuoto (nessun valore di ripiego): senza data non si crea.
28. **Salvataggio unico della partita**: convocati, squadre, posizioni, gol, voti e cronaca stanno in una bozza sola, con una barra "Modifiche non salvate" /
    "Salva". "Genera squadre", "Rigenera" e "Segna come giocata" salvano prima la bozza (il backend lavora sui dati salvati).
    Convocati modificabili solo in convocazione. Gli "avvisi" sui conti li mostra il backend dopo ogni salvataggio; in piu' l'app segnala se il risultato
    salvato differisce da quello calcolato e offre "Aggiorna il risultato".

## Partita in diretta (01/10/2026): scelte fatte dove CLAUDE.md non copriva, tutte semplici e reversibili

Specifica: CLAUDE.md, "Partita in diretta". Codice: `functions/lib/diretta.ts`, `app/src/admin/Live.tsx`. Da confermare con l'utente quando vuole.

29. **Partenza automatica solo con le squadre assegnate.** Una partita con l'orario passato ma SENZA squadre (almeno un giocatore per squadra) **non** diventa
    "in diretta" da sola: mostrerebbe "IN DIRETTA 0-0" su una partita senza squadre, e CLAUDE.md dice "si segnano gol solo con le squadre assegnate". Per cambiare:
    `statoDiretta` in `functions/lib/diretta.ts` (il ramo "partenza automatica"). La partita vera del 01/10/2026 (22:00 ora italiana) ha le squadre: parte da sola.
30. **"Da confermare" solo se c'e' stata una diretta.** Scaduta la finestra di 2 ore senza "Fine partita": se c'e' stato almeno un gol (o l'admin ha premuto "Inizia")
    diventa "Risultato da confermare"; se la partita era partita da sola e nessuno ha segnato niente torna `non_iniziata` (altrimenti ogni convocazione dimenticata, con le
    squadre, mostrerebbe per sempre "Risultato da confermare 0-0" nella Home). "Da confermare" non ha scadenza: resta finche' l'admin non segna la partita giocata.
31. **Dopo le 2 ore (o dopo "Fine partita") i gol non si registrano piu'** (`409`). Se una partita dura piu' di 2 ore: "Fine partita" si puo' premere comunque
    (anche a finestra scaduta) e i gol mancanti si aggiustano nella schermata Risultato. La costante e' una sola (`DURATA_MASSIMA_DIRETTA_MS`).
32. **Nessun "riapri la diretta".** Dopo "Fine partita" le correzioni si fanno nella schermata Risultato (come sempre). Se serve, e' una rotta in piu'.
33. **"Fine partita" scrive solo i contatori dei giocatori** (`partecipazioni.gol` / `.autogol`), non `partite.gol_a` / `gol_b`: quelli li scrive "Segna come giocata", come
    prima, cosi' in convocazione `gol` resta `null` (contratto di `docs/API.md`). Il punteggio della diretta si ricava dagli eventi. Una seconda pressione di "Fine partita"
    NON ricalcola (cancellerebbe le correzioni a mano).
34. **Chi segna non e' registrato.** Il database non ha email ne' un "hash breve" di chi ha inserito il gol (l'utente lo permetteva "oppure niente"): meno dati, nessun
    rischio. Se un giorno servisse una traccia: una colonna in `eventi_partita`.
35. **Cancellazione logica, non vera.** `annullato = 1`: un invio in ritardo (telefono senza rete) con l'`id_client` di un gol gia' eliminato non lo fa risorgere.
36. **Il tipo di evento sta in una tabella (`tipi_evento`) e non in un CHECK**, cosi' per 'assist' e 'tiro' basta una INSERT (piu' il codice che li conta). Un CHECK di SQLite non si modifica senza ricostruire la tabella.
37. **"Annulla ultimo" dell'interfaccia elimina il gol che SI VEDE come ultimo, per `id_client`**, non chiama `annulla-ultimo` del server: con due admin e una vista non
    aggiornata il server annullerebbe il gol di un altro. La rotta `.../diretta/annulla-ultimo` (idempotente sull'id dell'azione) c'e' ed e' provata, ma l'app non la usa.
38. **L'ordine dei gol e' l'ordine di arrivo al server.** Con un telefono senza rete i gol arrivano tutti insieme al ritorno del segnale, nell'ordine in cui sono stati segnati
    su quel telefono; se un altro admin segna nel frattempo, i suoi gol possono stare in mezzo. Senza minuto (decisione dell'utente) non c'e' modo migliore.
39. **Limite di 200 eventi per partita** (`MAX_EVENTI_DIRETTA`), annullati compresi. Con un limite piu' basso un admin che corregge molto potrebbe esaurirlo.
40. **Nessun service worker** (valutato, rimandato). Motivi: (a) l'app e' una pagina servita da dietro Cloudflare Access: un service worker che serve lo shell `/admin` offline
    dovrebbe lasciar passare il redirect al login e non mettere in cache niente di `/api/admin`, e non si puo' provare davvero senza l'Access vero; (b) la CSP oggi ha
    `worker-src 'none'` e andrebbe aperta a `'self'`; (c) un service worker che sbaglia serve codice vecchio per giorni. Costo del limite: se l'app si chiude **senza segnale** non si
    riapre finche' non torna un po' di campo; i gol in coda restano sul telefono e partono alla prima apertura con rete. Se l'utente vuole, e' il passo successivo.
41. **Se `/api/admin/me` fallisce per la rete mentre si e' "online"** la guscio dell'admin lo prende per una sessione scaduta (comportamento che c'era gia'): ricaricando la pagina
    LIVE con rete a meta' puo' comparire "Area riservata" invece della schermata. I gol in coda restano sul telefono; "Accedi" li ritrova.
42. **Le date delle prove nel browser** (`e2e/`) sono nel 2036, non piu' nel 2026: con la partenza automatica all'orario, una partita di prova con le squadre e la data passata
    sarebbe diventata "in diretta" da sola e avrebbe cambiato la navigazione (scorciatoia LIVE) a meta' di una prova.
