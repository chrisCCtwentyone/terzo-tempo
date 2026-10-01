#!/bin/bash
# Pubblica su Cloudflare SOLO se tutto e' verde. Si ferma al primo errore.
#
# PUBBLICAZIONE A VERIFICHE MIRATE (CLAUDE.md, decisione del 01/10/2026). Uso:
#   ./scripts/pubblica.sh                  pubblica; le prove nel browser si decidono dai file cambiati
#   ./scripts/pubblica.sh --completo       forza TUTTE le prove nel browser (giro completo)
#   ./scripts/pubblica.sh --solo-piano     stampa il piano e si ferma, senza eseguire NIENTE (nessun test, nessun deploy)
#   ./scripts/pubblica.sh --solo-piano --simula "app/src/admin/Campi.tsx docs/DEPLOY.md"
#                                          come sopra, ma con un elenco di file inventato (per provare le regole)
#
# SEMPRE, in quest'ordine, senza alleggerire: tsc -b, build, vitest (tutti i test unitari: guardie su sicurezza, nomi e
# segreti comprese), migrazioni D1, deploy, scripts/controlla_produzione.sh (il sito VERO).
#
# SOLO LE PROVE NEL BROWSER (npm run e2e, npm run e2e:admin, rilevatore di trabocchi compreso) si decidono dai file cambiati
# rispetto all'ULTIMA PUBBLICAZIONE riuscita. Le regole stanno in scripts/verifiche_mirate.mjs (con i test in
# test/verifiche_mirate.test.ts); in sintesi, la PRIMA che corrisponde a ciascun file:
#   scripts/pubblica.sh, verifiche_mirate.*, scripts/seed_prova.sql            -> COMPLETO (e2e pubblico + e2e admin)
#   e2e/impianto.ts, trabocchi.ts, schermate_trabocchi.ts                      -> COMPLETO
#   e2e/e2e.ts                                                                 -> solo e2e pubblico
#   e2e/e2e_admin.ts, access_simulato.ts, google_simulato.ts, moduli.ts        -> solo e2e admin
#   app/src/admin/**                                                           -> solo e2e admin
#   app/src/pagine/**                                                          -> solo e2e pubblico
#   app/src/ui/**, stili/**, lib/**, app/index.html, app/public/**, shared/**,
#   functions/**, migrations/**, vite.config.*, package.json, package-lock.json -> COMPLETO
#   *.md, docs/**, LICENSE, test/**, scripts/* (gli altri)                     -> NESSUNA prova nel browser
#   qualunque altro percorso (nel dubbio si prova)                             -> COMPLETO
#
# Il RIFERIMENTO e' il commit dell'ultima pubblicazione riuscita:
#   1. il file .ultima-pubblicazione (ignorato da git), scritto alla fine di ogni pubblicazione riuscita e verificata;
#   2. se manca (il container e' effimero), l'ultimo deployment di produzione sull'API di Cloudflare Pages
#      (deployment_trigger.metadata.commit_hash), ma solo se NON e' marcato "commit_dirty": un deployment sporco non dice
#      che cosa e' pubblicato davvero;
#   3. se non si trova, o non e' un antenato di HEAD (o non e' nel repository locale): giro COMPLETO.
# I file cambiati sono quelli fra il riferimento e la cartella di lavoro (commit, modifiche non committate, file nuovi).
#
# Il deploy passa a wrangler --commit-hash (l'HEAD) e --commit-dirty VERO solo se la cartella di lavoro ha davvero modifiche
# non committate; dopo il deploy si verifica sull'API che Cloudflare abbia registrato proprio quell'HEAD, e solo allora si
# salva il riferimento. Con modifiche non committate il riferimento NON si salva (quello vecchio resta valido).
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
# "Una sessione nuova"). Il token non sta mai in un file del repository e non si stampa mai.
set -euo pipefail
cd "$(dirname "$0")/.."

PROGETTO="terzo-tempo"
RAMO_PRODUZIONE="main"   # il ramo di produzione del progetto Pages (non il ramo git in cui si lavora)
FILE_RIFERIMENTO=".ultima-pubblicazione"
API_CLOUDFLARE="https://api.cloudflare.com/client/v4"

uso() {
  # l'intestazione di questo file, fino all'elenco delle regole escluso (righe 3-9)
  sed -n '3,9p' "$0"
  exit "${1:-2}"
}

COMPLETO=0
SOLO_PIANO=0
SIMULA=""
SIMULA_DATA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --completo) COMPLETO=1 ;;
    --solo-piano) SOLO_PIANO=1 ;;
    --simula)
      if [ $# -lt 2 ]; then echo "--simula vuole un elenco di file (tra virgolette)." >&2; exit 2; fi
      SIMULA="$2"; SIMULA_DATA=1; shift ;;
    -h|--aiuto|--help) uso 0 ;;
    *) echo "Opzione sconosciuta: $1" >&2; uso 2 ;;
  esac
  shift
done
if [ "$SIMULA_DATA" = 1 ] && [ "$SOLO_PIANO" = 0 ]; then
  echo "--simula vale solo con --solo-piano: una pubblicazione vera non si decide su file inventati." >&2
  exit 2
fi

HA_CREDENZIALI=0
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then HA_CREDENZIALI=1; fi
if [ "$SOLO_PIANO" = 0 ]; then
  if [ "$HA_CREDENZIALI" = 0 ]; then
    echo "Mancano CLOUDFLARE_API_TOKEN e/o CLOUDFLARE_ACCOUNT_ID nell'ambiente (docs/DEPLOY.md)." >&2
    exit 1
  fi
  # solo le righe di configurazione, non i commenti
  if grep -v '^[[:space:]]*#' wrangler.toml | grep -q "DA_COMPILARE"; then
    echo "wrangler.toml contiene ancora DA_COMPILARE (database_id, ACCESS_TEAM_DOMAIN o ACCESS_AUD)." >&2
    exit 1
  fi
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- il riferimento: l'ultima pubblicazione riuscita ----------------------------------------------------------------

# Il commit e' nel repository locale ed e' un antenato di HEAD?
riferimento_valido() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "$1^{commit}" 2>/dev/null && git merge-base --is-ancestor "$1" HEAD 2>/dev/null
}

# Ultimo deployment di produzione RIUSCITO sull'API di Cloudflare Pages: stampa "<commit_hash> <dirty 0|1> <id breve>".
# Esce con 1 se l'API non risponde o non c'e' nessun deployment. Il token passa da stdin a curl (mai sulla riga di comando).
ultimo_deployment_api() {
  local json="$TMP/deployments.json"
  printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
    curl -fsS --max-time 30 -K - -o "$json" "$API_CLOUDFLARE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROGETTO/deployments?env=production&per_page=10" 2>/dev/null || return 1
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const d = (j.result || []).find((x) => x.environment === "production" && x.latest_stage && x.latest_stage.status === "success");
    const m = d && d.deployment_trigger && d.deployment_trigger.metadata;
    if (!m || !m.commit_hash) process.exit(1);
    console.log(m.commit_hash + " " + (m.commit_dirty ? 1 : 0) + " " + (d.short_id || ""));
  ' "$json"
}

RIF=""              # commit di riferimento ("" = non trovato)
ORIGINE_RIF=""      # da dove viene, per il piano
MOTIVO_NO_RIF=""    # perche' non si e' trovato, per il piano

cerca_riferimento() {
  local h="" riga dirty
  if [ -f "$FILE_RIFERIMENTO" ]; then
    h=$(tr -d '[:space:]' < "$FILE_RIFERIMENTO")
    if riferimento_valido "$h"; then RIF="$h"; ORIGINE_RIF="file $FILE_RIFERIMENTO"; return 0; fi
    MOTIVO_NO_RIF="$FILE_RIFERIMENTO non contiene un commit che sia un antenato di HEAD"
  else
    MOTIVO_NO_RIF="manca il file $FILE_RIFERIMENTO"
  fi
  if [ "$HA_CREDENZIALI" = 0 ]; then
    MOTIVO_NO_RIF="$MOTIVO_NO_RIF e senza credenziali Cloudflare non si puo' chiedere l'ultimo deployment"
    return 0
  fi
  if ! riga=$(ultimo_deployment_api); then
    MOTIVO_NO_RIF="$MOTIVO_NO_RIF; l'API di Cloudflare non ha dato un ultimo deployment di produzione"
    return 0
  fi
  h=${riga%% *}; dirty=${riga#* }; dirty=${dirty%% *}
  if [ "$dirty" = 1 ]; then
    MOTIVO_NO_RIF="$MOTIVO_NO_RIF; l'ultimo deployment di Cloudflare (${h:0:7}) e' marcato commit_dirty: non dice cosa e' pubblicato"
  elif riferimento_valido "$h"; then
    RIF="$h"; ORIGINE_RIF="API di Cloudflare Pages (ultimo deployment di produzione)"
  else
    MOTIVO_NO_RIF="$MOTIVO_NO_RIF; il commit dell'ultimo deployment di Cloudflare (${h:0:7}) non e' un antenato di HEAD"
  fi
}

# --- il piano: quali prove nel browser ------------------------------------------------------------------------------

ELENCO="$TMP/cambiati.txt"
ARGOMENTI_VERIFICHE=()
if [ "$COMPLETO" = 1 ]; then
  ORIGINE_RIF="non serve"
  ARGOMENTI_VERIFICHE=(--completo)
  : > "$ELENCO"
elif [ "$SIMULA_DATA" = 1 ]; then
  ORIGINE_RIF="SIMULATO (--simula): nessun riferimento vero"
  RIF="simulato"
  set -f; printf '%s\n' ${SIMULA//,/ } > "$ELENCO"; set +f
else
  cerca_riferimento
  if [ -z "$RIF" ]; then
    ARGOMENTI_VERIFICHE=(--completo)
    : > "$ELENCO"
  else
    # commit + modifiche non committate (git diff confronta il riferimento con la cartella di lavoro) + file nuovi non ignorati
    { git -c core.quotePath=false diff --name-only --no-renames "$RIF"; git -c core.quotePath=false ls-files --others --exclude-standard; } > "$ELENCO"
  fi
fi

node scripts/verifiche_mirate.mjs ${ARGOMENTI_VERIFICHE[@]+"${ARGOMENTI_VERIFICHE[@]}"} --da-file "$ELENCO" > "$TMP/piano.txt"
{ read -r RIGA_E2E; read -r RIGA_ADMIN; } < "$TMP/piano.txt"
case "$RIGA_E2E" in E2E=0) FA_E2E=0 ;; E2E=1) FA_E2E=1 ;; *) echo "Uscita inattesa di verifiche_mirate.mjs: $RIGA_E2E" >&2; exit 1 ;; esac
case "$RIGA_ADMIN" in E2E_ADMIN=0) FA_ADMIN=0 ;; E2E_ADMIN=1) FA_ADMIN=1 ;; *) echo "Uscita inattesa di verifiche_mirate.mjs: $RIGA_ADMIN" >&2; exit 1 ;; esac

N_CAMBIATI=$(grep -c . "$ELENCO" || true)
HEAD_COMMIT=$(git rev-parse HEAD)
echo "== Piano di pubblicazione =="
echo "HEAD: ${HEAD_COMMIT:0:7}"
if [ "$COMPLETO" = 1 ]; then
  echo "Riferimento: non serve (--completo)"
  echo "  motivo: giro completo richiesto con --completo"
elif [ -z "$RIF" ]; then
  echo "Riferimento: NON TROVATO ($MOTIVO_NO_RIF)"
  echo "  motivo: riferimento non trovato, nel dubbio si prova tutto (giro COMPLETO)"
else
  if [ "$SIMULA_DATA" = 1 ]; then echo "Riferimento: $ORIGINE_RIF"; else echo "Riferimento: ${RIF:0:7} ($ORIGINE_RIF)"; fi
  echo "File cambiati: $N_CAMBIATI"
  tail -n +3 "$TMP/piano.txt"
fi
echo "Sempre: tsc -b, build, vitest (tutti), migrazioni D1, deploy, controllo del sito vero"
if [ "$FA_E2E" = 1 ]; then echo "  e2e pubblico: FA"; else echo "  e2e pubblico: SALTA (nessun file cambiato lo riguarda)"; fi
if [ "$FA_ADMIN" = 1 ]; then echo "  e2e admin:    FA"; else echo "  e2e admin:    SALTA (nessun file cambiato lo riguarda)"; fi
echo "=="

if [ "$SOLO_PIANO" = 1 ]; then
  echo "(--solo-piano: non e' stato eseguito niente)"
  exit 0
fi

# --- esecuzione ------------------------------------------------------------------------------------------------------

# Un passo: stampa il nome, esegue (un errore ferma tutto: set -e) e dice quanto ci ha messo.
passo() {
  local nome="$1" t=$SECONDS
  shift
  echo "-> $nome"
  "$@"
  echo "   ($((SECONDS - t))s)"
}

passo "tipi (tsc -b)" npx tsc -b
# la build PRIMA dei test: test/sicurezza_bundle.test.ts controlla che nel bundle non ci sia nessun segreto
passo "build" npx vite build
passo "test (tutti)" npx vitest run
# prove nel browser (CLAUDE.md, "Controlli su misura"): solo quelle che i file cambiati richiedono, rilevatore di trabocchi compreso
if [ "$FA_E2E" = 1 ]; then passo "e2e pubblico" npm run e2e; else echo "-> e2e pubblico: SALTATO (vedi il piano)"; fi
if [ "$FA_ADMIN" = 1 ]; then passo "e2e admin" npm run e2e:admin; else echo "-> e2e admin: SALTATO (vedi il piano)"; fi
passo "migrazioni D1" npx wrangler d1 migrations apply DB --remote </dev/null

echo "-> pubblicazione"
T_DEPLOY=$SECONDS
# --commit-dirty vero SOLO se la cartella di lavoro ha davvero modifiche non committate; --commit-hash esplicito = HEAD
STATO_GIT=$(git status --porcelain)
if [ -n "$STATO_GIT" ]; then
  SPORCO=true
  echo "   ATTENZIONE: ci sono modifiche non committate: il deployment sara' marcato dirty e il riferimento NON verra' salvato."
else
  SPORCO=false
fi
# L'uscita va anche in un file per leggere l'indirizzo della pubblicazione.
# tee restituisce 0, ma con `pipefail` un errore di wrangler ferma lo stesso.
USCITA="$TMP/deploy.txt"
npx wrangler pages deploy app/dist --project-name "$PROGETTO" --branch "$RAMO_PRODUZIONE" --commit-hash "$HEAD_COMMIT" --commit-dirty="$SPORCO" </dev/null | tee "$USCITA"
INDIRIZZO=$(grep -Eom1 'https://[a-z0-9]+\.terzo-tempo\.pages\.dev' "$USCITA" || true)
echo "   ($((SECONDS - T_DEPLOY))s)"

passo "controllo del sito vero" ./scripts/controlla_produzione.sh ${INDIRIZZO:+"$INDIRIZZO"}

# Il riferimento per la prossima volta: si salva solo se Cloudflare ha registrato davvero l'HEAD appena pubblicato.
echo "-> riferimento per la prossima pubblicazione"
if [ "$SPORCO" = true ]; then
  echo "   non salvato: la pubblicazione aveva modifiche non committate (resta valido il riferimento precedente, se c'e')."
else
  REGISTRATO=""
  for tentativo in 1 2 3 4; do
    if riga=$(ultimo_deployment_api); then
      REGISTRATO=${riga%% *}
      if [ "$REGISTRATO" = "$HEAD_COMMIT" ]; then break; fi
    fi
    if [ "$tentativo" -lt 4 ]; then sleep 5; fi
  done
  if [ -z "$REGISTRATO" ]; then
    echo "   non ho potuto leggere l'ultimo deployment da Cloudflare: salvo il riferimento senza la verifica."
    printf '%s\n' "$HEAD_COMMIT" > "$FILE_RIFERIMENTO"
  elif [ "$REGISTRATO" != "$HEAD_COMMIT" ]; then
    echo "   ERRORE: Cloudflare ha registrato ${REGISTRATO:0:7} come ultimo deployment, ma l'HEAD pubblicato e' ${HEAD_COMMIT:0:7}. Riferimento NON salvato." >&2
    exit 1
  else
    printf '%s\n' "$HEAD_COMMIT" > "$FILE_RIFERIMENTO"
    echo "   salvato ${HEAD_COMMIT:0:7} in $FILE_RIFERIMENTO (Cloudflare concorda)."
  fi
fi

echo "-> OK ($((SECONDS / 60))m $((SECONDS % 60))s in tutto; e2e pubblico: $([ "$FA_E2E" = 1 ] && echo fatto || echo saltato), e2e admin: $([ "$FA_ADMIN" = 1 ] && echo fatto || echo saltato))"
