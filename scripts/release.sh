#!/usr/bin/env bash
# Publica la versión actual de main para el usuario.
#   auto     → OTA si el fingerprint nativo ya tiene build; si no, APK nuevo (default)
#   update   → forzar update OTA
#   build    → forzar APK nuevo (EAS) + GitHub Release build-<versionCode>
#   forecast → solo decir si saldría como "ota" o "apk"
# Corre igual en GitHub Actions (CI=true, eas instalado) y en local (usa npx eas-cli).
set -euo pipefail

MODE="${1:-auto}"
REPO="daniellp-rubio/uber-finanzas"
APK_URL="https://github.com/$REPO/releases/latest/download/uber-finanzas.apk"

if command -v eas >/dev/null 2>&1; then EAS=(eas); else EAS=(npx -y eas-cli@latest); fi
cd "$(git rev-parse --show-toplevel)"

log()     { echo "release: $*" >&2; }
summary() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }

# ── En local solo se publica main limpio e igual a origin/main ───────────────
if [ -z "${CI:-}" ] && [ "$MODE" != "forecast" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  [ "$BRANCH" = "main" ] || { log "hay que estar en main (estás en $BRANCH)"; exit 1; }
  [ -z "$(git status --porcelain)" ] || { log "hay cambios sin commitear"; exit 1; }
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { log "main local != origin/main (git pull)"; exit 1; }
fi

"${EAS[@]}" whoami >/dev/null 2>&1 || { log "EAS sin sesión: 'npx eas-cli login' o EXPO_TOKEN"; exit 1; }

# ── Fingerprint nativo ──────────────────────────────────────────────────────
HASH=$("${EAS[@]}" fingerprint:generate --platform android --build-profile production --json --non-interactive | jq -r '.hash')
[ -n "$HASH" ] && [ "$HASH" != "null" ] || { log "no se pudo calcular el fingerprint"; exit 1; }
log "fingerprint $HASH"

COUNT=$("${EAS[@]}" build:list --platform android --build-profile production --status finished \
  --fingerprint-hash "$HASH" --limit 1 --json --non-interactive | jq 'length')
if [ "$COUNT" -gt 0 ]; then FORECAST=ota; else FORECAST=apk; fi

if [ "$MODE" = "forecast" ]; then
  echo "RELEASE_FORECAST=$FORECAST fingerprint=$HASH"
  if [ "$FORECAST" = ota ]; then
    summary "### Pronóstico: OTA · solo JavaScript, le llega al abrir la app"
  else
    summary "### Pronóstico: APK · cambio nativo, se construye APK y la app muestra el aviso"
  fi
  summary "fingerprint \`$HASH\`"
  exit 0
fi

if [ "$MODE" = "auto" ]; then
  if [ "$FORECAST" = ota ]; then MODE=update; else MODE=build; fi
fi
MSG=$(git log -1 --pretty=%s)
log "modo $MODE · $MSG"

# ── OTA ─────────────────────────────────────────────────────────────────────
if [ "$MODE" = "update" ]; then
  "${EAS[@]}" update --channel production --platform android --environment production \
    --message "$MSG" --non-interactive
  echo "RELEASE_RESULT=ota fingerprint=$HASH"
  summary "### Release: update OTA (canal production) · se aplica al abrir la app"
  exit 0
fi

# ── APK ─────────────────────────────────────────────────────────────────────
# --freeze-credentials: nunca generar una llave nueva. Con otra llave el APK no
# instala encima del actual, y desinstalar borra los datos del usuario.
TMP=$(mktemp -d)
"${EAS[@]}" build --platform android --profile production --non-interactive --wait \
  --freeze-credentials --message "$MSG" --json > "$TMP/build.json"

URL=$(jq -r '.[0].artifacts.buildUrl' "$TMP/build.json")
CODE=$(jq -r '.[0].appBuildVersion' "$TMP/build.json")
VERSION=$(jq -r '.[0].appVersion' "$TMP/build.json")
[ -n "$URL" ] && [ "$URL" != "null" ] || { log "el build no devolvió APK"; cat "$TMP/build.json" >&2; exit 1; }

curl -fsSL -o "$TMP/uber-finanzas.apk" "$URL"
gh release create "build-$CODE" "$TMP/uber-finanzas.apk" \
  --repo "$REPO" --target "$(git rev-parse HEAD)" \
  --title "Uber Finanzas $VERSION (build $CODE)" \
  --notes "Instalar: abrir $APK_URL en el celular y tocar Instalar. Se instala encima de la versión anterior; los datos se conservan. NO desinstalar la app vieja.

fingerprint: $HASH" \
  --generate-notes --latest

echo "RELEASE_RESULT=apk build=$CODE url=$APK_URL"
summary "### Release: APK build $CODE"
summary "- $APK_URL"
