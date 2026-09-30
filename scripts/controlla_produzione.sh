#!/bin/bash
# Controlli sul sito VERO, dopo ogni pubblicazione (e quando si vuole).
#
# Esiste perche' le prove locali hanno gia' mentito (turni-plus: PBKDF2 rifiutato
# solo in produzione, worker di pdf.js mancante). Non puo' entrare come admin:
# controlla quello che si vede da fuori, cioe' quello che vede un estraneo.
#   1. configurazione: ACCESS_TEAM_DOMAIN e ACCESS_AUD in wrangler.toml, secret
#      EMAIL_AUTORIZZATE presente (senza, l'admin risponde 403 a tutti);
#   2. la parte pubblica risponde 200 (pagine e API);
#   3. l'admin (/admin e ogni /api/admin/*, GET e POST) rimanda al login di
#      Cloudflare Access (302 verso *.cloudflareaccess.com) oppure 401/403. MAI 200;
#   4. il livello segreto non compare in nessuna risposta pubblica;
#   5. intestazioni di sicurezza e CSP presenti;
#   6. (se si passa l'indirizzo della singola pubblicazione) e' tutto dietro Access.
#
# Uso: scripts/controlla_produzione.sh [https://<hash>.terzo-tempo.pages.dev]
# Esce con codice diverso da 0 se c'e' anche un solo problema. Nessuna pipe sui
# comandi che devono poter fallire.
set -euo pipefail
cd "$(dirname "$0")/.."

SITO="${SITO:-https://terzo-tempo.pages.dev}"
PROGETTO="terzo-tempo"
problemi=0

male() { echo "  X $1"; problemi=$((problemi + 1)); }
bene() { echo "  ok $1"; }

echo "-> configurazione"
for v in ACCESS_TEAM_DOMAIN ACCESS_AUD; do
  valore=$(sed -n "s/^$v = \"\(.*\)\"$/\1/p" wrangler.toml)
  if [ -z "$valore" ] || [ "$valore" = "DA_COMPILARE" ]; then male "$v manca in wrangler.toml"; else bene "$v"; fi
done
id_db=$(sed -n 's/^database_id = "\(.*\)"$/\1/p' wrangler.toml)
if [ -z "$id_db" ] || [[ "$id_db" == DA_COMPILARE* ]]; then male "database_id manca in wrangler.toml"; else bene "database_id"; fi
if segreti=$(npx wrangler pages secret list --project-name "$PROGETTO" </dev/null 2>&1); then
  if grep -q "EMAIL_AUTORIZZATE" <<<"$segreti"; then bene "secret EMAIL_AUTORIZZATE presente"; else male "secret EMAIL_AUTORIZZATE assente: l'admin rifiuterebbe tutti"; fi
else
  male "impossibile leggere i secret (CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID nell'ambiente?)"
fi

# --- helper -------------------------------------------------------------
# codice e rinvio di una richiesta: "<codice> <redirect_url>"
esito() { curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 20 "$@"; }

# Deve rimandare al login di Access (302 verso *.cloudflareaccess.com) o essere rifiutato (401/403).
chiuso() {
  local metodo="$1" url="$2" r codice dove
  if [ "$metodo" = "POST" ]; then
    r=$(esito -X POST -H 'Content-Type: application/json' -d '{}' "$url") || { male "$metodo $url non raggiungibile"; return; }
  else
    r=$(esito "$url") || { male "$metodo $url non raggiungibile"; return; }
  fi
  codice=${r%% *}; dove=${r#* }
  case "$codice" in
    302|303)
      if [[ "$dove" == https://*.cloudflareaccess.com/* ]]; then bene "$metodo $url -> login di Access"
      else male "$metodo $url -> rinvio inatteso ($codice)"; fi ;;
    401|403) bene "$metodo $url -> rifiutato ($codice)" ;;
    200) male "$metodo $url risponde 200 SENZA LOGIN: esposizione" ;;
    *) male "$metodo $url -> codice inatteso $codice" ;;
  esac
}

aperto() {
  local url="$1" r
  r=$(esito "$url") || { male "$url non raggiungibile"; return; }
  if [ "${r%% *}" = "200" ]; then bene "$url -> 200"; else male "$url -> ${r%% *} (atteso 200)"; fi
}

PAGINE_PUBBLICHE=(/ /classifiche /partite /giocatori)
API_PUBBLICHE=(/api/home /api/classifiche /api/partite /api/giocatori /api/stagioni)

# Ogni rotta admin, ricavata dai file di functions/api/admin: l'elenco non si dimentica di niente.
mapfile -t API_ADMIN < <(cd functions/api && find admin -name '*.ts' | sed -e 's/\.ts$//' -e 's/\/index$//' -e 's/\[id\]/1/g' | sort -u | sed 's|^|/api/|')
if [ "${#API_ADMIN[@]}" -lt 5 ]; then male "elenco delle rotte admin sospetto (${#API_ADMIN[@]}): controlla functions/api/admin"; fi

echo "-> parte pubblica su $SITO (deve dare 200)"
for p in "${PAGINE_PUBBLICHE[@]}" "${API_PUBBLICHE[@]}"; do aperto "$SITO$p"; done

echo "-> admin su $SITO (deve rimandare ad Access o rifiutare, MAI 200)"
chiuso GET "$SITO/admin"
chiuso GET "$SITO/admin/giocatori"
for p in "${API_ADMIN[@]}"; do chiuso GET "$SITO$p"; chiuso POST "$SITO$p"; done
for p in "/API/admin/me" "/%61pi/admin/me" "/api//admin/me" "/api/%61dmin/me"; do chiuso GET "$SITO$p"; done

echo "-> il livello segreto non compare nelle risposte pubbliche"
for p in "${PAGINE_PUBBLICHE[@]}" "${API_PUBBLICHE[@]}"; do
  corpo=$(curl -s --max-time 20 "$SITO$p") || { male "$SITO$p non raggiungibile"; continue; }
  if grep -qi "livello" <<<"$corpo"; then male "$SITO$p contiene \"livello\""; else bene "$SITO$p senza \"livello\""; fi
done

echo "-> intestazioni di sicurezza"
for p in / /api/home; do
  intest=$(curl -s -D - -o /dev/null --max-time 20 "$SITO$p") || { male "$SITO$p non raggiungibile"; continue; }
  intest=$(tr -d '\r' <<<"$intest" | tr 'A-Z' 'a-z')
  for h in "x-content-type-options: nosniff" "referrer-policy: no-referrer" "x-frame-options: deny" "permissions-policy:" "content-security-policy:"; do
    if grep -q "^$h" <<<"$intest"; then bene "$p $h"; else male "$p manca l'intestazione \"$h\""; fi
  done
  for d in "default-src 'self'" "frame-ancestors 'none'" "object-src 'none'"; do
    if grep -q "^content-security-policy:.*$d" <<<"$intest"; then bene "$p CSP $d"; else male "$p la CSP non contiene $d"; fi
  done
done

if [ "${1:-}" != "" ]; then
  echo "-> indirizzo della singola pubblicazione $1 (tutto dietro Access)"
  for p in / /classifiche /api/home /api/giocatori /admin; do chiuso GET "$1$p"; done
fi

if [ "$problemi" -gt 0 ]; then
  echo "-> $problemi PROBLEMI in produzione"
  exit 1
fi
echo "-> produzione OK"
