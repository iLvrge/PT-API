#!/usr/bin/env bash
#
# Post-deploy smoke test. Run it after every deploy, before telling anyone the
# release is out.
#
#   ./deploy/smoke-test.sh https://api.patentrack.com
#
# Checks only what does not need a login, plus the security properties that
# have to hold on a public host. Exits non-zero on the first real failure so it
# can gate a deploy script.

set -uo pipefail
API="${1:-http://127.0.0.1:3600}"
fails=0

ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fails=$((fails+1)); }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
hdr()  { curl -s -D- -o /dev/null --max-time 30 "$1" | tr -d '\r'; }

echo "smoke test against $API"

# --- the service is up ---------------------------------------------------
[ "$(code "$API/health")" = 200 ] && ok "liveness" || bad "liveness (/health)"

# /health/ready answers status "ready" and names each database it reached.
ready=$(curl -s --max-time 30 "$API/health/ready")
if echo "$ready" | grep -q '"status":"ready"' && ! echo "$ready" | grep -q '"down"'; then
  ok "readiness — every database answered"
else
  bad "readiness: $ready"
fi

# --- authentication is actually required ---------------------------------
[ "$(code "$API/profile")" = 401 ] && ok "protected route refuses an anonymous caller" \
  || bad "/profile did not answer 401 without a token"
[ "$(code "$API/profile" -H 'x-auth-token: not.a.jwt')" = 401 ] && ok "a malformed token is refused" \
  || bad "a malformed token was not refused"

# --- errors are problem documents ----------------------------------------
body=$(curl -s --max-time 30 "$API/profile")
echo "$body" | grep -q '"type":".*errors/invalid-token"' \
  && ok "errors are RFC 7807 with a stable type" \
  || bad "error body is not a problem document: $body"
hdr "$API/profile" | grep -qi 'content-type: application/problem+json' \
  && ok "error content-type" || bad "error content-type is not application/problem+json"

# --- security headers ----------------------------------------------------
h=$(hdr "$API/health")
for want in 'strict-transport-security' 'x-content-type-options' 'content-security-policy' 'referrer-policy'; do
  echo "$h" | grep -qi "^$want" && ok "header $want" || bad "missing header $want"
done
echo "$h" | grep -qi '^x-powered-by' && bad "x-powered-by is leaking the stack" || ok "x-powered-by suppressed"

# --- CORS is an allowlist, not a wildcard --------------------------------
acao=$(curl -s -D- -o /dev/null --max-time 30 "$API/health" -H 'Origin: https://evil.example' | tr -d '\r' | grep -i '^access-control-allow-origin' || true)
[ -z "$acao" ] && ok "an unknown origin gets no CORS grant" || bad "CORS allowed an unknown origin: $acao"

# --- the public share surface still works without a token ----------------
# Pass a known-good share code as $2 to check it end to end.
if [ "${2:-}" != "" ]; then
  [ "$(code "$API/share/$2/2")" = 200 ] && ok "share link resolves anonymously" \
    || bad "share link $2 did not resolve"
else
  [ "$(code "$API/share/definitelynotacode/2")" = 404 ] && ok "unknown share code answers 404" \
    || bad "unknown share code did not answer 404"
fi

# --- the docs are being served ------------------------------------------
v=$(curl -s --max-time 30 "$API/docs.json" | head -c 200 | grep -o '"openapi": *"[^"]*"' || true)
[ -n "$v" ] && ok "OpenAPI served ($v)" || bad "/docs.json did not serve a spec"

echo
if [ "$fails" -eq 0 ]; then
  echo "all checks passed"
  exit 0
fi
echo "$fails check(s) failed"
exit 1
