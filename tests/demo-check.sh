#!/usr/bin/env bash
# CI: starts the demo image twice against PostgreSQL with the stand-in API, checks the demo
# accounts and translates the sample article as the editor. Needs: docker image supertext-directus-demo,
# PostgreSQL at $PG_URL, the stand-in on 127.0.0.1:8765.
set -euo pipefail
PORT=8055
B=http://127.0.0.1:$PORT
export DEMO_ADMIN_EMAIL=ci-admin@example.com DEMO_ADMIN_PASSWORD="ci-$(openssl rand -hex 8)"
export DEMO_EDITOR_EMAIL=ci-editor@example.com DEMO_EDITOR_PASSWORD="ci-$(openssl rand -hex 8)"

start() {
  docker rm -f demo >/dev/null 2>&1 || true
  docker run -d --name demo --network host -e PORT=$PORT -e DATABASE_URL="$PG_URL" -e SECRET=ci-secret-ci-secret-ci-secret-0123 \
    -e DEMO_ADMIN_EMAIL -e DEMO_ADMIN_PASSWORD -e DEMO_EDITOR_EMAIL -e DEMO_EDITOR_PASSWORD \
    -e SUPERTEXT_API_KEY=anything -e SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/ supertext-directus-demo >/dev/null
  for _ in $(seq 90); do curl -sf $B/server/ping >/dev/null && break; sleep 2; done
  for _ in $(seq 30); do docker logs demo 2>&1 | grep -q 'DEMO_EDITOR:' && break; sleep 1; done
  docker logs demo 2>&1 | grep '\[demo\]'
}
login() { curl -sf $B/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

start
start   # second start: nothing duplicated or changed
docker logs demo 2>&1 | grep -q 'DEMO_EDITOR: account exists, left unchanged'
if docker logs demo 2>&1 | grep -qF -e "$DEMO_ADMIN_PASSWORD" -e "$DEMO_EDITOR_PASSWORD"; then echo "password in log"; exit 1; fi

ADMIN=$(login "$DEMO_ADMIN_EMAIL" "$DEMO_ADMIN_PASSWORD")
USERS=$(curl -sfg "$B/users?fields=email&limit=-1" -H "Authorization: Bearer $ADMIN")
echo "$USERS" | python3 -c 'import sys,json; e=[u["email"] for u in json.load(sys.stdin)["data"]]; print(e); assert sorted(e)==["ci-admin@example.com","ci-editor@example.com"], e'
curl -sf -XPOST $B/supertext/test -H "Authorization: Bearer $ADMIN" | grep -q '"ok":true'

EDITOR=$(login "$DEMO_EDITOR_EMAIL" "$DEMO_EDITOR_PASSWORD")
curl -sf -XPOST $B/supertext/translate/articles/1 -H "Authorization: Bearer $EDITOR" -H 'content-type: application/json' \
  -d '{"targets":["de-CH","fr-CH","it-CH"],"overwrite":false}' | python3 -c '
import sys, json
results = json.load(sys.stdin)["data"]["results"]
print(results)
assert [r["status"] for r in results] == ["created"] * 3, results'
curl -sfg "$B/items/articles_translations?filter[languages_code][_eq]=de-CH" -H "Authorization: Bearer $EDITOR" | python3 -c '
import sys, json
row = json.load(sys.stdin)["data"][0]
assert row["title"] == "Schweizer Schokolade, weltweit versandt", row
assert row["slug"] == "schweizer-schokolade-weltweit-versandt", row
assert "<strong>Berner</strong>" in row["body"] and "href=\"https://www.supertext.com\"" in row["body"], row
print("German translation OK")'
curl -sf -XPOST $B/supertext/translate/articles/1 -H "Authorization: Bearer $EDITOR" -H 'content-type: application/json' \
  -d '{"targets":["de-CH"],"overwrite":false}' | grep -q '"skipped"'
echo "Demo check passed"
