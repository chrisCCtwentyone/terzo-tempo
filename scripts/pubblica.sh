#!/bin/bash
# Pubblica su Cloudflare SOLO se tutto e' verde. Si ferma al primo errore.
#
# Modellato su quello di turni-plus, con le sue trappole gia' pagate:
#  - nessuna pipe sui comandi che devono poter fallire: la pipe restituisce il
#    codice dell'ULTIMO comando e un errore diventa un successo (una build rotta
#    e' stata "pubblicata" cosi' il 21/09/2026). L'unica pipe, verso tee, e'
#    protetta da `pipefail`;
#  - il controllo dei tipi e' `tsc -b`: `tsc --noEmit` con "references" non
#    controlla niente;
#  - le prove locali non bastano: alla fine si controlla il sito VERO.
#
# Serve nell'ambiente CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID (docs/DEPLOY.md,
# "Una sessione nuova"). Il token non sta mai in un file del repository.
set -euo pipefail
cd "$(dirname "$0")/.."

PROGETTO="terzo-tempo"
RAMO_PRODUZIONE="main"   # il ramo di produzione del progetto Pages (non il ramo git in cui si lavora)

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Mancano CLOUDFLARE_API_TOKEN e/o CLOUDFLARE_ACCOUNT_ID nell'ambiente (docs/DEPLOY.md)." >&2
  exit 1
fi
# solo le righe di configurazione, non i commenti
if grep -v '^[[:space:]]*#' wrangler.toml | grep -q "DA_COMPILARE"; then
  echo "wrangler.toml contiene ancora DA_COMPILARE (database_id, ACCESS_TEAM_DOMAIN o ACCESS_AUD)." >&2
  exit 1
fi

echo "-> tipi (tsc -b)";   npx tsc -b
echo "-> test";            npx vitest run
echo "-> build";           npx vite build
echo "-> migrazioni D1";   npx wrangler d1 migrations apply DB --remote </dev/null
echo "-> pubblicazione"
# L'uscita va anche in un file per leggere l'indirizzo della pubblicazione.
# tee restituisce 0, ma con `pipefail` un errore di wrangler ferma lo stesso.
USCITA=$(mktemp)
npx wrangler pages deploy app/dist --project-name "$PROGETTO" --branch "$RAMO_PRODUZIONE" --commit-dirty=true </dev/null | tee "$USCITA"
INDIRIZZO=$(grep -Eo 'https://[a-z0-9]+\.terzo-tempo\.pages\.dev' "$USCITA" | head -n 1 || true)
rm -f "$USCITA"
echo "-> controllo del sito vero"
./scripts/controlla_produzione.sh $INDIRIZZO
echo "-> OK"
