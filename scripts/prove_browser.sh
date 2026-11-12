#!/bin/bash
# Le prove nel browser di pubblica.sh, SENZA build e SENZA deploy (si possono lanciare da sole, per provarle).
#
#   ./scripts/prove_browser.sh pubblico        solo l'e2e pubblico   (node e2e/e2e.ts)
#   ./scripts/prove_browser.sh admin           solo l'e2e admin      (node e2e/e2e_admin.ts)
#   ./scripts/prove_browser.sh pubblico admin  tutti e due INSIEME (in parallelo)
#
# Serve app/dist gia' costruita (npx vite build): le due prove la leggono soltanto, quindi non si ricostruisce
# (`npm run e2e` ricostruirebbe, e due build insieme sulla stessa cartella si pesterebbero i piedi).
# Parallelo sicuro perche': ogni prova ha il suo D1 usa-e-getta (mkdtemp in e2e/impianto.ts, uno per processo), le sue porte
# (pubblico 8799; admin 8780-8783 e 8790) e le sue schermate (e2e/schermate e e2e/schermate/admin).
# Chromium parte due volte nello stesso container: se vedi timeout spuri, lancia le prove una alla volta.
#
# Variabili che passano alle prove: E2E_CHROMIUM, E2E_TRABOCCHI_SCHERMATE (quali schermate controlla il rilevatore di trabocchi:
# tutte | nessuna | gruppi separati da virgola; vedi scripts/verifiche_mirate.mjs), E2E_TRABOCCHI, E2E_SOLO.
#
# Aspetta SEMPRE tutte le prove richieste (anche se una fallisce presto: ognuna ripulisce il suo server e il suo D1), stampa
# l'output di ciascuna e i tempi (la durata e' misurata aspettando le prove nell'ordine dato: metti per prima la piu' breve), ed esce con 0 solo se TUTTE sono andate bene. Il codice di uscita di ogni prova e' letto
# con `wait` sul suo processo (nessuna pipe che lo nasconda).
set -uo pipefail
cd "$(dirname "$0")/.."

[ $# -gt 0 ] || { sed -n '2,6p' "$0" >&2; exit 2; }
if [ ! -f app/dist/index.html ]; then echo "Manca app/dist: prima 'npx vite build'." >&2; exit 2; fi

LOG=$(mktemp -d)
trap 'rm -rf "$LOG"' EXIT

nomi=(); pids=(); inizi=(); codici=()
for prova in "$@"; do
  case "$prova" in
    pubblico) file=e2e/e2e.ts ;;
    admin) file=e2e/e2e_admin.ts ;;
    *) echo "Prova sconosciuta: $prova (pubblico | admin)" >&2; exit 2 ;;
  esac
  node "$file" > "$LOG/$prova.txt" 2>&1 &
  nomi+=("$prova"); pids+=($!); inizi+=($SECONDS)
  echo "-> e2e $prova avviato (pid $!)"
done

esito=0
for i in "${!nomi[@]}"; do
  codice=0
  wait "${pids[$i]}" || codice=$?
  durata=$((SECONDS - inizi[i]))
  echo "<- e2e ${nomi[$i]} finito con codice $codice dopo ${durata}s"
  [ "$codice" = 0 ] || esito=1
  codici[i]=$codice
done

for i in "${!nomi[@]}"; do
  echo
  echo "======== output e2e ${nomi[$i]} (codice ${codici[$i]}) ========"
  cat "$LOG/${nomi[$i]}.txt"
done
echo
if [ "$esito" = 0 ]; then echo "== prove nel browser: TUTTE VERDI =="; else echo "== prove nel browser: FALLITE (vedi sopra) ==" >&2; fi
exit "$esito"
