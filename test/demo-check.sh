#!/usr/bin/env bash
# CI: starts the demo image twice against PostgreSQL with the stand-in API, checks the demo
# accounts (created once, never duplicated, passwords never logged), the admin endpoints and a
# translation of the first sample article as the editor.
# Needs: docker image supertext-directus-demo, PostgreSQL at $PG_URL, the stand-in on 127.0.0.1:8765.
set -euo pipefail
PORT=8055
B=http://127.0.0.1:$PORT
export DEMO_ADMIN_EMAIL=ci-admin@example.com DEMO_ADMIN_PASSWORD="ci-$(openssl rand -hex 8)"
export DEMO_EDITOR_EMAIL=ci-editor@example.com DEMO_EDITOR_PASSWORD="ci-$(openssl rand -hex 8)"

start() {
	docker rm -f demo >/dev/null 2>&1 || true
	docker run -d --name demo --network host -e PORT=$PORT -e DEMO_DATABASE_URL="$PG_URL" -e SECRET=ci-secret-ci-secret-ci-secret-0123 \
		-e DEMO_ADMIN_EMAIL -e DEMO_ADMIN_PASSWORD -e DEMO_EDITOR_EMAIL -e DEMO_EDITOR_PASSWORD \
		-e SUPERTEXT_API_KEY=anything -e SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/ \
		-e 'SUPERTEXT_POLITENESS={"de-CH":"more","fr-CH":"more","it-CH":"more"}' supertext-directus-demo >/dev/null
	for _ in $(seq 90); do curl -sf $B/server/ping >/dev/null && break; sleep 2; done
	curl -sf $B/server/ping >/dev/null
	docker logs demo 2>&1 | grep '\[demo-setup\]' || true
}
login() { curl -sf $B/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }

start
start   # second start: nothing duplicated or changed
docker logs demo 2>&1 | grep > /dev/null 'Account from DEMO_EDITOR_EMAIL exists, left unchanged'
logs=$(docker logs demo 2>&1)
if grep -qF -e "$DEMO_ADMIN_PASSWORD" -e "$DEMO_EDITOR_PASSWORD" <<< "$logs"; then echo "A password appeared in the log"; exit 1; fi

ADMIN=$(login "$DEMO_ADMIN_EMAIL" "$DEMO_ADMIN_PASSWORD")
curl -sfg "$B/users?fields=email&limit=-1" -H "Authorization: Bearer $ADMIN" | python3 -c '
import sys, json
emails = sorted(u["email"] for u in json.load(sys.stdin)["data"])
print(emails)
assert emails == ["ci-admin@example.com", "ci-editor@example.com"], emails'
curl -sf -XPOST $B/supertext/test -H "Authorization: Bearer $ADMIN" | grep > /dev/null '"ok":true'
curl -sf $B/supertext/status -H "Authorization: Bearer $ADMIN" | python3 -c '
import sys, json
d = json.load(sys.stdin)["data"]
assert d["configured"] and d["baseUrl"] == "http://127.0.0.1:8765/v1/", d
assert d["version"] == json.load(open("package.json"))["version"], d
tones = {l["code"]: l["politeness"] for l in d["languages"]}
assert tones["de-CH"] == "more" and tones["it-CH"] == "more", tones   # JSON with commas survives
print("status OK")'

EDITOR=$(login "$DEMO_EDITOR_EMAIL" "$DEMO_EDITOR_PASSWORD")
test "$(curl -s -o /dev/null -w '%{http_code}' $B/supertext/status -H "Authorization: Bearer $EDITOR")" = 403
curl -sf -XPOST $B/supertext/translate -H "Authorization: Bearer $EDITOR" -H 'content-type: application/json' \
	-d '{"collection":"articles","item":1,"targets":["de-CH","fr-CH","it-CH"],"save":true}' | python3 -c '
import sys, json
results = json.load(sys.stdin)["data"]["results"]
print([(r["language"], r["ok"], r.get("saved"), r.get("error")) for r in results])
assert all(r["ok"] and r["saved"] for r in results), results'
curl -sfg "$B/items/articles_translations?filter[articles_id][_eq]=1&filter[languages_code][_eq]=de-CH" -H "Authorization: Bearer $EDITOR" | python3 -c '
import sys, json
row = json.load(sys.stdin)["data"][0]
assert row["title"] == "Inhalte, die jede Sprache sprechen", row
assert "<strong>Übersetzen</strong>" in row["body"] and "href=\"https://www.supertext.com\"" in row["body"], row
print("German translation OK")'
echo "Demo check passed"
