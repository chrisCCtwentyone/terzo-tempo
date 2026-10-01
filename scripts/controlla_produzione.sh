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
#   5b. manifest e icone della webapp: /manifest.webmanifest (200, application/manifest+json, JSON valido, icone
#      dichiarate raggiungibili come PNG della misura dichiarata), /apple-touch-icon.png (200, image/png, 180x180);
#   6. (se si passa l'indirizzo della singola pubblicazione) e' tutto dietro Access;
#   7. prove d'attacco NON distruttive (solo GET, HEAD, OPTIONS e POST verso /api/admin senza credenziali):
#      percorsi mascherati verso l'admin, JWT e cookie contraffatti, intestazioni falsificate
#      (Cf-Access-Authenticated-User-Email, Host, X-Forwarded-For), CSP reale senza unsafe-*,
#      HSTS e compagnia, file sorgente non serviti, nessun segreto nel bundle JS pubblico,
#      nessun 5xx ne' stack trace con id e parametri malevoli, nessun CORS aperto.
#      MAI un voto, MAI una scrittura: il sito vero ha dati veri.
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

# Un 5xx subito dopo la pubblicazione puo' essere la propagazione di Cloudflare (visto sul PRIMO
# deploy: 522 per qualche decina di secondi): si riprova fino a 4 volte, a intervalli di 10 secondi.
# Qualsiasi altro codice (404, 302...) e' un problema vero e non si ritenta.
aperto() {
  local url="$1" r codice tentativo
  for tentativo in 1 2 3 4; do
    r=$(esito "$url") || r="000 "
    codice=${r%% *}
    case "$codice" in 5*|000) [ "$tentativo" -lt 4 ] && sleep 10 ;; *) break ;; esac
  done
  if [ "$codice" = "200" ]; then bene "$url -> 200"; else male "$url -> $codice (atteso 200)"; fi
}

PAGINE_PUBBLICHE=(/ /classifiche /partite /giocatori /info)
API_PUBBLICHE=(/api/home /api/classifiche /api/partite /api/giocatori /api/stagioni /api/diretta)

# Ogni rotta admin, ricavata dai file di functions/api/admin: l'elenco non si dimentica di niente.
mapfile -t API_ADMIN < <(cd functions/api && find admin -name '*.ts' | sed -e 's/\.ts$//' -e 's/\/index$//' -e 's/\[[a-z]*\]/1/g' | sort -u | sed 's|^|/api/|')
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

echo "-> manifest e icone della webapp (Home di iPhone, browser)"
# Il sito risponde 200 con la PAGINA DELL'APP anche per un file che non esiste: per questo si controllano content-type e byte veri.
png_lato() { # stampa "<larghezza>x<altezza>" letto dall'intestazione del PNG, oppure "non-png"
  local f="$1"
  if [ "$(head -c 8 "$f" | od -An -tx1 | tr -d ' \n')" != "89504e470d0a1a0a" ]; then echo "non-png"; return; fi
  local l a
  l=$(od -An -tu1 -j16 -N4 "$f" | awk '{print $1*16777216+$2*65536+$3*256+$4}')
  a=$(od -An -tu1 -j20 -N4 "$f" | awk '{print $1*16777216+$2*65536+$3*256+$4}')
  echo "${l}x${a}"
}
scarica() { # scarica($1 = percorso, $2 = file): stampa "<codice> <content-type>"
  curl -s -o "$2" -w "%{http_code} %{content_type}" --max-time 20 "$SITO$1"
}
manifest_tmp=$(mktemp)
r=$(scarica /manifest.webmanifest "$manifest_tmp") || r="000 "
if [ "${r%% *}" = "200" ] && [[ "${r#* }" == application/manifest+json* ]]; then bene "/manifest.webmanifest -> 200 ${r#* }"; else male "/manifest.webmanifest -> $r (atteso 200 application/manifest+json)"; fi
if icone=$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (m.name !== "Terzo Tempo" || m.short_name !== "Terzo Tempo" || m.start_url !== "/" || m.scope !== "/" || m.display !== "standalone") process.exit(2);
  if (!m.icons.some((i) => i.purpose === "maskable")) process.exit(3);
  for (const i of m.icons) console.log(i.src + " " + i.sizes);
' "$manifest_tmp" 2>/dev/null); then
  bene "manifest: JSON valido, nome, start_url, scope, display standalone, icona maskable"
  while read -r src misura; do
    [ -z "$src" ] && continue
    icona_tmp=$(mktemp)
    r=$(scarica "$src" "$icona_tmp") || r="000 "
    if [ "${r%% *}" = "200" ] && [[ "${r#* }" == image/png* ]] && [ "$(png_lato "$icona_tmp")" = "$misura" ]; then bene "$src -> 200 image/png $misura"; else male "$src -> $r, PNG $(png_lato "$icona_tmp") (atteso 200 image/png $misura)"; fi
    rm -f "$icona_tmp"
  done <<<"$icone"
else
  male "manifest: non e' un JSON valido o mancano nome, start_url, scope, display o l'icona maskable"
fi
rm -f "$manifest_tmp"
apple_tmp=$(mktemp)
r=$(scarica /apple-touch-icon.png "$apple_tmp") || r="000 "
if [ "${r%% *}" = "200" ] && [[ "${r#* }" == image/png* ]] && [ "$(png_lato "$apple_tmp")" = "180x180" ]; then bene "/apple-touch-icon.png -> 200 image/png 180x180"; else male "/apple-touch-icon.png -> $r, PNG $(png_lato "$apple_tmp") (atteso 200 image/png 180x180)"; fi
rm -f "$apple_tmp"
pagina=$(curl -s --max-time 20 "$SITO/") || pagina=""
for atteso in 'rel="manifest"' 'rel="apple-touch-icon"' 'apple-mobile-web-app-capable' 'viewport-fit=cover'; do
  if grep -Fq "$atteso" <<<"$pagina"; then bene "la pagina iniziale contiene $atteso"; else male "la pagina iniziale non contiene $atteso"; fi
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

# ------------------------------------------------------------------------------------------------
# 7. PROVE D'ATTACCO NON DISTRUTTIVE. Solo GET, HEAD, OPTIONS, e POST verso /api/admin/* SENZA credenziali.
# ------------------------------------------------------------------------------------------------

# Codice + rinvio con metodo e intestazioni a scelta (HEAD con -I, gli altri con -X). Uso: esito_m METODO URL [opzioni curl].
# Il corpo della risposta finisce in $CORPO_TMP (per riconoscere la semplice pagina dell'app).
CORPO_TMP=$(mktemp)
trap 'rm -f "$CORPO_TMP"' EXIT
esito_m() {
  local m="$1" u="$2"; shift 2
  : >"$CORPO_TMP"
  if [ "$m" = "HEAD" ]; then
    curl -s -I -o "$CORPO_TMP" -w "%{http_code} %{redirect_url}" --max-time 20 "$@" "$u"
  else
    curl -s -X "$m" -o "$CORPO_TMP" -w "%{http_code} %{redirect_url}" --max-time 20 "$@" "$u"
  fi
}

# Una richiesta ostile all'admin NON deve mai avere successo: login di Access (302), 400/401/403
# (rifiutata), 404/405 (il percorso mascherato non porta a niente). Un 200 e' ammesso SOLO se e' la
# semplice pagina dell'app (il percorso non e' una rotta: il sito risponde con la SPA, senza dati).
# Mai altri 2xx, mai 5xx.
non_aperto() {
  local etichetta="$1"; shift
  local r codice dove
  r=$(esito_m "$@") || { male "$etichetta non raggiungibile"; return; }
  codice=${r%% *}; dove=${r#* }
  case "$codice" in
    302|303) if [[ "$dove" == https://*.cloudflareaccess.com/* ]]; then bene "$etichetta -> login di Access"; else male "$etichetta -> rinvio inatteso a $dove"; fi ;;
    400|401|403|404|405) bene "$etichetta -> $codice" ;;
    200)
      if [ "$1" = "HEAD" ]; then male "$etichetta -> 200 su HEAD: ESPOSIZIONE?"
      elif grep -q '<div id="root">' "$CORPO_TMP" && ! grep -Eq '^\s*[{\[]' "$CORPO_TMP"; then bene "$etichetta -> 200 con la sola pagina dell'app (nessun dato)"
      else male "$etichetta -> 200 con un corpo che non e' la pagina dell'app: ESPOSIZIONE"; fi ;;
    2*) male "$etichetta -> $codice: ESPOSIZIONE" ;;
    *) male "$etichetta -> codice inatteso $codice" ;;
  esac
}

b64url() { printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
ADESSO=$(date +%s)
PAYLOAD_JWT=$(b64url "{\"iss\":\"https://x.cloudflareaccess.com\",\"aud\":[\"x\"],\"email\":\"intruso@example.invalid\",\"exp\":$((ADESSO + 3600)),\"nbf\":$((ADESSO - 10))}")
JWT_NONE="$(b64url '{"alg":"none","typ":"JWT"}').$PAYLOAD_JWT."
JWT_HS256="$(b64url '{"alg":"HS256","typ":"JWT","kid":"x"}').$PAYLOAD_JWT.$(b64url 'firma-finta')"
JWT_RS256="$(b64url '{"alg":"RS256","typ":"JWT","kid":"x"}').$PAYLOAD_JWT.$(b64url 'firma-finta-firma-finta-firma-finta')"

echo "-> percorsi mascherati verso l'admin (mai 2xx: Access, 401/403 o 404)"
MASCHERATI=(
  /API/admin/me /Api/Admin/giocatori /api//admin/me /api///admin//giocatori //api/admin/me /api/admin/me/ /api/admin/./me /api/./admin/me
  /api/x/../admin/me /api/%61dmin/me /api/%41dmin/me /%61pi/admin/me /%61%70%69/%61%64%6d%69%6e/me /api%2Fadmin/me /api%2fadmin%2fme
  /api/admin%2Fme /api%5Cadmin/me /api/%2561dmin/me /api/%252561dmin/me '/api/admin;x=1/me' '/api;x=1/admin/me' /api/admin/me%00 /api/admin/me%20
  /api/%61dmin/%zz /api/%61dmin/%25 /api/%61dmin/me%25 /api/admin /api/admin/ /api/admin/nonesiste /api/admin/giocatori/1/badge
  /api/admin/partite/1/mvp/decidi /api/admin/../admin/giocatori /api/admin/%2e%2e/admin/giocatori
)
for p in "${MASCHERATI[@]}"; do non_aperto "GET $p" GET "$SITO$p"; done
for p in /API/admin/giocatori /api//admin/giocatori /api/%61dmin/giocatori /api/admin/giocatori/ /api/admin/badge; do
  non_aperto "POST $p" POST "$SITO$p" -H 'Content-Type: application/json' -d '{}'
  non_aperto "PUT $p" PUT "$SITO$p" -H 'Content-Type: application/json' -d '{}'
  non_aperto "DELETE $p" DELETE "$SITO$p"
  non_aperto "HEAD $p" HEAD "$SITO$p"
  non_aperto "OPTIONS $p" OPTIONS "$SITO$p"
done
non_aperto "HEAD /api/admin/me" HEAD "$SITO/api/admin/me"
non_aperto "OPTIONS /api/admin/me" OPTIONS "$SITO/api/admin/me"
non_aperto "OPTIONS /api/admin/me con Origin esterna" OPTIONS "$SITO/api/admin/me" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'

# la partita in diretta: ogni scrittura verso l'admin, senza credenziali, non deve mai avere successo (e non scrive niente: Access o il backend rifiutano prima)
echo "-> la diretta: nessuna scrittura senza credenziali (POST/PATCH/DELETE: mai 2xx)"
for p in /api/admin/partite/1/diretta /api/admin/partite/1/diretta/inizia /api/admin/partite/1/diretta/eventi /api/admin/partite/1/diretta/fine /api/admin/partite/1/diretta/annulla-ultimo /api/admin/partite/1/diretta/eventi/1 /api/admin/partite/1/diretta/eventi/00000000-0000-4000-8000-000000000000; do
  non_aperto "POST $p" POST "$SITO$p" -H 'Content-Type: application/json' -d '{"id_client":"00000000-0000-4000-8000-000000000000","tipo":"gol","giocatore_id":1}'
  non_aperto "PATCH $p" PATCH "$SITO$p" -H 'Content-Type: application/json' -d '{"tipo":"autogol"}'
  non_aperto "DELETE $p" DELETE "$SITO$p"
  non_aperto "GET $p" GET "$SITO$p"
done

echo "-> JWT, cookie e intestazioni contraffatti su /api/admin (mai 2xx)"
for jwt in "$JWT_NONE" "$JWT_HS256" "$JWT_RS256" "abc" ""; do
  nome=${jwt:0:12}
  non_aperto "token contraffatto in intestazione [$nome...]" GET "$SITO/api/admin/me" -H "Cf-Access-Jwt-Assertion: $jwt"
  non_aperto "token contraffatto in cookie [$nome...]" GET "$SITO/api/admin/giocatori" -H "Cookie: CF_Authorization=$jwt"
done
non_aperto "Cf-Access-Authenticated-User-Email falsificata" GET "$SITO/api/admin/me" -H 'Cf-Access-Authenticated-User-Email: admin@example.invalid'
non_aperto "email + id Access falsificati" GET "$SITO/api/admin/giocatori" -H 'Cf-Access-Authenticated-User-Email: admin@example.invalid' -H 'Cf-Access-Authenticated-User-Id: x'
non_aperto "X-Forwarded-Email / Remote-User falsificati" GET "$SITO/api/admin/me" -H 'X-Forwarded-Email: admin@example.invalid' -H 'Remote-User: admin@example.invalid' -H 'X-Auth-Request-Email: admin@example.invalid'
non_aperto "service token finto" GET "$SITO/api/admin/me" -H 'Cf-Access-Client-Id: x.access' -H 'Cf-Access-Client-Secret: y'
non_aperto "Authorization: Bearer finto" GET "$SITO/api/admin/me" -H 'Authorization: Bearer abc.def.ghi'
non_aperto "X-Forwarded-For: 127.0.0.1" GET "$SITO/api/admin/me" -H 'X-Forwarded-For: 127.0.0.1' -H 'X-Real-IP: 127.0.0.1' -H 'Cf-Connecting-Ip: 127.0.0.1'
non_aperto "X-Forwarded-Host: localhost" GET "$SITO/api/admin/me" -H 'X-Forwarded-Host: localhost' -H 'Forwarded: for=127.0.0.1;host=localhost'
non_aperto "Origin: http://localhost:8788" GET "$SITO/api/admin/me" -H 'Origin: http://localhost:8788' -H 'Referer: http://localhost/'
# Host falsificato: Cloudflare instrada per nome; deve rifiutare o non trovare, mai servire l'admin
non_aperto "Host: localhost" GET "$SITO/api/admin/me" -H 'Host: localhost'
non_aperto "Host: 127.0.0.1" GET "$SITO/api/admin/giocatori" -H 'Host: 127.0.0.1'
# scrittura "da un altro sito" senza credenziali: mai 2xx
non_aperto "POST /api/admin/badge da un altro sito" POST "$SITO/api/admin/badge" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' -d '{"nome":"x","tipo":"positivo"}'

echo "-> intestazioni e CSP reali (senza unsafe-*, con tutte le direttive che chiudono le vie d'attacco)"
for p in / /api/home /api/non-esiste /classifiche; do
  intest=$(curl -s -D - -o /dev/null --max-time 20 "$SITO$p") || { male "$SITO$p non raggiungibile"; continue; }
  intest=$(tr -d '\r' <<<"$intest" | tr 'A-Z' 'a-z')
  csp=$(grep '^content-security-policy:' <<<"$intest" || true)
  if [ -z "$csp" ]; then male "$p senza CSP"; continue; fi
  if grep -Eq "unsafe-inline|unsafe-eval|unsafe-hashes" <<<"$csp"; then male "$p la CSP contiene unsafe-*"; else bene "$p CSP senza unsafe-*"; fi
  if grep -Eq "[ ]\*[ ;]|[ ]https?:[ ;]" <<<"$csp"; then male "$p la CSP ha un jolly o uno schema aperto"; else bene "$p CSP senza jolly"; fi
  for d in "script-src 'self'" "style-src 'self'" "object-src 'none'" "base-uri 'none'" "form-action 'self'" "frame-ancestors 'none'" "frame-src 'none'" "upgrade-insecure-requests"; do
    if grep -Fq "$d" <<<"$csp"; then bene "$p CSP $d"; else male "$p la CSP non contiene $d"; fi
  done
  for h in "strict-transport-security: max-age=" "cross-origin-opener-policy: same-origin" "cross-origin-resource-policy: same-origin"; do
    if grep -q "^$h" <<<"$intest"; then bene "$p $h"; else male "$p manca \"$h\""; fi
  done
  # (i file statici di Pages mandano da soli "access-control-allow-origin: *": sono pubblici, non e' un problema; le API si')
  for h in "x-powered-by:" "server: express" "x-aspnet-version:"; do
    if grep -q "^$h" <<<"$intest"; then male "$p ha l'intestazione \"$h\""; fi
  done
  if [[ "$p" == /api/* ]] && grep -q "^access-control-allow-origin:" <<<"$intest"; then male "$p concede CORS: un altro sito potrebbe leggere le risposte"; fi
done
# CORS: nessun altro sito puo' leggere le risposte
cors=$(curl -s -D - -o /dev/null --max-time 20 -H 'Origin: https://evil.example' "$SITO/api/home") || cors=""
if grep -qi '^access-control-allow-origin:' <<<"$cors"; then male "/api/home concede CORS a un altro sito"; else bene "/api/home non concede CORS a un altro sito"; fi
pre=$(curl -s -D - -o /dev/null --max-time 20 -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' "$SITO/api/partite/1/mvp") || pre=""
if grep -qi '^access-control-allow-origin:' <<<"$pre"; then male "il preflight del voto concede CORS a un altro sito"; else bene "il preflight del voto non concede CORS a un altro sito"; fi

echo "-> nessun sorgente, configurazione o dato servito come file"
FILE_VIETATI=(/lib/access.ts /lib/access /LIB/access.ts /functions/lib/access.ts /functions/_middleware.ts /_middleware.ts /_worker.js /wrangler.toml /package.json /package-lock.json /tsconfig.json /.git/config /.git/HEAD /.dev.vars /.env /dati/giocatori_reali.tsv /dati/email_admin.txt /migrations/0001_schema_iniziale.sql /scripts/seed_prova.sql /app/src/main.tsx /e2e/e2e.ts /CLAUDE.md /.claude/CLAUDE.md /docs/API.md)
for p in "${FILE_VIETATI[@]}"; do
  tmp=$(mktemp)
  codice=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 20 "$SITO$p") || codice="000"
  # 404, oppure la pagina dell'app (SPA) senza niente di riservato
  if [ "$codice" = "200" ] && grep -Eqi 'verificaAccesso|onRequest|ACCESS_AUD|database_id|CREATE TABLE|INSERT INTO|d1_databases|"scripts"|EMAIL_AUTORIZZATE|^import |^export ' "$tmp"; then
    male "$SITO$p serve un file riservato"
  elif [ "$codice" = "200" ] && ! grep -qi '<div id="root">' "$tmp"; then
    male "$SITO$p risponde 200 con qualcosa che non e' la pagina dell'app"
  elif [ "$codice" = "000" ] || [[ "$codice" == 5* ]]; then
    male "$SITO$p -> $codice"
  else
    bene "$p non serve file riservati ($codice)"
  fi
  rm -f "$tmp"
done

echo "-> nessun segreto nel bundle JS pubblico e nessun sorgente mappato"
indice=$(curl -s --max-time 20 "$SITO/") || indice=""
mapfile -t ASSET < <(grep -Eo '/assets/[A-Za-z0-9._-]+\.(js|css)' <<<"$indice" | sort -u || true)
if [ "${#ASSET[@]}" -lt 2 ]; then male "non trovo i file del bundle nella pagina iniziale (${#ASSET[@]})"; fi
# i pezzi caricati a parte (es. l'area admin) si scoprono dal bundle principale
TUTTI_ASSET=("${ASSET[@]}")
for a in "${ASSET[@]}"; do
  [[ "$a" == *.js ]] || continue
  mapfile -t altri < <(curl -s --max-time 20 "$SITO$a" | grep -Eo '[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.(js|css)' | sort -u || true)
  for x in "${altri[@]}"; do TUTTI_ASSET+=("/assets/$x"); done
done
AUD_TOML=$(sed -n 's/^ACCESS_AUD = "\(.*\)"$/\1/p' wrangler.toml)
DOM_TOML=$(sed -n 's/^ACCESS_TEAM_DOMAIN = "\(.*\)"$/\1/p' wrangler.toml)
DB_TOML=$(sed -n 's/^database_id = "\(.*\)"$/\1/p' wrangler.toml)
mapfile -t UNICI < <(printf '%s\n' "${TUTTI_ASSET[@]}" | sort -u)
for a in "${UNICI[@]}"; do
  tmp=$(mktemp)
  codice=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 20 "$SITO$a") || codice="000"
  if [ "$codice" != "200" ]; then rm -f "$tmp"; continue; fi
  trovato=""
  for parola in EMAIL_AUTORIZZATE ACCESS_AUD ACCESS_TEAM_DOMAIN DEV_ADMIN_BYPASS CLOUDFLARE_API_TOKEN cfut_ cfat_ Cf-Access-Jwt-Assertion CF_Authorization cloudflareaccess.com "$AUD_TOML" "$DOM_TOML" "$DB_TOML" sourceMappingURL "BEGIN PRIVATE KEY"; do
    [ -n "$parola" ] && grep -Fq -- "$parola" "$tmp" && trovato="$trovato $parola"
  done
  # il livello segreto puo' stare solo nel pezzo admin (che il sito pubblico non usa)
  if [[ "$a" != */Admin-* ]] && grep -Eqi 'livello_segreto' "$tmp"; then trovato="$trovato livello_segreto"; fi
  # nessuna email, nessun JWT
  if grep -Eq 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.' "$tmp"; then trovato="$trovato JWT"; fi
  if [ -n "$trovato" ]; then male "$a contiene un termine riservato (AUD, dominio e database_id non sono segreti, ma non devono stare nel browser)"; else bene "$a senza segreti"; fi
  rm -f "$tmp"
done
for a in "${UNICI[@]}"; do
  [[ "$a" == *.js ]] || continue
  codice=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$SITO$a.map") || codice="000"
  case "$codice" in 404) bene "$a.map non esiste" ;; 200) if curl -s --max-time 20 "$SITO$a.map" | grep -q '"sources"'; then male "$a.map espone i sorgenti"; else bene "$a.map non e' un source map"; fi ;; *) bene "$a.map -> $codice" ;; esac
done

echo "-> id e parametri malevoli su rotte pubbliche in sola lettura: mai 5xx, mai stack, mai livello"
MALEVOLI=("%27%20OR%201%3D1--" "1%3B%20DROP%20TABLE%20giocatori%3B--" "1%20UNION%20SELECT%20nome%2C2%2C3%20FROM%20giocatori--" "99999999999999999999999" "-1" "0" "NaN" "1e3" "0x10" "%00" "%zz" "%E0%A4%A" "%D9%A3" "abc")
for m in "${MALEVOLI[@]}"; do
  for p in "/api/giocatori/$m" "/api/partite/$m" "/api/partite/$m/mvp" "/api/partite/$m/diretta" "/api/classifiche?stagione=$m" "/api/partite?stagione=$m" "/api/giocatori/1?stagione=$m" "/api/giocatori?tutti=$m"; do
    tmp=$(mktemp)
    codice=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 20 "$SITO$p") || codice="000"
    # un timeout di rete non e' un errore del sito: si riprova una volta
    if [ "$codice" = "000" ]; then codice=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 30 "$SITO$p") || codice="000"; fi
    if [[ "$codice" == 5* ]] || [ "$codice" = "000" ]; then male "GET $p -> $codice"
    elif grep -Eqi 'sqlite|syntax error|D1_ERROR|stack|at [A-Za-z]+ \(|node_modules|livello' "$tmp"; then male "GET $p espone dettagli interni o il livello"
    else bene "GET $p -> $codice"; fi
    rm -f "$tmp"
  done
done
# le rotte pubbliche di scrittura (voto) non si provano MAI qui: sul sito vero ci sono voti veri.
for p in /api/non-esiste /api/giocatori/abc /api/partite/999999 /api/stagioni/1; do
  tmp=$(mktemp); h=$(curl -s -D - -o "$tmp" --max-time 20 "$SITO$p") || h=""
  if grep -qi 'livello' "$tmp" || grep -qi '^[a-z-]*: .*livello' <<<"$h"; then male "$p contiene \"livello\" (corpo o intestazioni)"; else bene "$p senza \"livello\" (corpo e intestazioni)"; fi
  rm -f "$tmp"
done

if [ "$problemi" -gt 0 ]; then
  echo "-> $problemi PROBLEMI in produzione"
  exit 1
fi
echo "-> produzione OK"
