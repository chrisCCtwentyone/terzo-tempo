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
