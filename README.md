# Terzo Tempo

Webapp (mobile-first) per le partite di calcetto: convocati, formazioni, gol, MVP votato, pagelle, classifiche.
Regole e decisioni: `CLAUDE.md`. Backend: `docs/API.md`. Dubbi aperti: `docs/DOMANDE_APERTE.md`.

## Comandi

```bash
npm install
npm run typecheck   # tsc -b
npm test            # vitest (backend su D1 finto + funzioni pure del frontend)
npm run build       # tsc -b && vite build -> app/dist
npm run dev:api     # Pages + D1 locale su :8788 (serve app/dist)
npm run dev         # Vite su :5173, proxy /api -> :8788
npm run e2e         # prova nel browser della parte pubblica (vedi sotto)
npm run e2e:admin   # prova nel browser dell'area admin (flusso completo, touch, chiaro e scuro)
```

## Frontend (`app/src/`)

React + TypeScript, senza router esterno (`router.tsx`: History API, gli URL si condividono: `/partite/12`).

- `pagine/` le schermate pubbliche: Home, Classifiche (`?stagione=<id>|sempre&cat=...`), Partite, Partita, Giocatori, Scheda.
- `ui/` i componenti condivisi, da riusare nell'admin (`import { ... } from '../ui'`): `Figurina`, `Campo` (pedine),
  `Carta`, `Pulsante`/`PulsanteLink`/`Scelta` (pulsanti, pillole, barra), `Tabellone`, `Bollino`, `Voto`, `Badges`,
  `Pagella`, `Marcatori`, `Riga`, `Podio`, `GraficoVoti`, `Caricamento`/`Errore`/`Attesa`.
- `lib/` logica pura e dati: `tipi.ts` (forma delle risposte), `api.ts`, `useCarica.ts`, `formato.ts`, `campo.ts`
  (orientamento del campo: **A in alto, B in basso**; disposizione automatica se mancano le posizioni), `listone.ts`.
- `stili/` `tokens.css` (colori, tema chiaro/"album di notte"), `base.css`, `ui.css`, `pagine.css`.
- `admin/` l'area `/admin`, caricata con `React.lazy` (JS e CSS a parte, non pesano sul bundle pubblico): accesso (`GET /api/admin/me`,
  401/403 = "Area riservata agli admin"), Giocatori, Badge, Stagioni, Partite (convocati, squadre col generatore, campo a moduli con
  trascinamento, risultato, MVP, modifica/eliminazione). Logica pura in `admin/logica.ts` (testata). `shared/` = codice comune a backend e
  frontend (nomi "Cognome I.", moduli e caselle).

Font self-hosted (`@fontsource/anton`, `@fontsource/nunito-sans`, solo i pesi usati): la CSP di
`functions/_middleware.ts` non ammette Google Fonts. Niente `<style>` o script inline; le animazioni sono in CSS e si
spengono tutte con `prefers-reduced-motion`. I nomi delle squadre arrivano dall'API, non sono scritti nel frontend.

## Prova nel browser (`npm run e2e`)

Fa la build di produzione, crea un D1 locale usa-e-getta (migrazioni + `scripts/seed_prova.sql` + tre partite di prova
relative a "adesso", per avere un voto MVP davvero aperto), avvia `wrangler pages dev app/dist` e pilota Chromium
(Playwright) a 390x844 in tema chiaro e scuro: tutte le schermate, il voto MVP col 409 al secondo voto, la chiusura a
tempo scaduto, console senza errori, zero violazioni CSP, nessuna risorsa esterna, nessuno scroll orizzontale.
Esce con codice diverso da 0 se una verifica fallisce. Screenshot in `e2e/schermate/` (ignorata da git; cambia con
`E2E_SCREENS=/percorso`).

Serve un Chromium gia' installato: `PLAYWRIGHT_BROWSERS_PATH` (o `E2E_CHROMIUM=/percorso/chrome`). `playwright-core` e'
fissato a 1.56.1 perche' cerca la revisione di Chromium di quella versione; **non eseguire `playwright install`**.
Porta: `E2E_PORT` (default 8799).

`npm run e2e:admin` fa lo stesso per l'area admin: due server (uno con `DEV_ADMIN_BYPASS=1` passato con `--binding`, senza `.dev.vars`, uno senza per la pagina
"Area riservata"), Chromium con touch e il trascinamento delle pedine con veri eventi touch (CDP). Screenshot in `e2e/schermate/admin/` (o `E2E_SCREENS`).
