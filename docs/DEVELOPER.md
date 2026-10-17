# Developer guide

## Architecture

A Directus 12 *bundle* extension (`package.json → directus:extension`):

```
src/
  endpoint/index.ts        /supertext/info, /supertext/translate (Express router, user's accountability),
                           /supertext/status, /supertext/test (administrators), /supertext/ping (public)
  interface/               "Supertext translation" presentation interface (Vue 3) for the item form
    index.ts               definition + options (translationsField, sourceLanguage, fields)
    interface.vue          languages, replace warning, puts translations into the form (setFieldValue)
  module/                  "Supertext" page for administrators (route /admin/supertext): version, configuration,
                           languages with Supertext code and tone, Test connection
  operation/               Flow operation "Supertext: translate" (id supertext-translate-flow)
    app.ts                 options UI
    api.ts                 handler: items from options or trigger; translates and saves
  api/
    config.ts              SUPERTEXT_* environment variables (raw process.env first: Directus splits values at commas)
    translator.ts          relation discovery, permission check, document per item, one request per language, save
    version.ts             extension version, read at runtime from package.json
    reporting.ts           Commando Center: version reports, API key check, ping (Plugin Health's InstallationReporter),
                           state in the table supertext_state
  i18n/
    messages.ts            all UI strings in en/de/fr/it (app side)
    index.ts               t(), errorText(): picks the strings by the user's Directus language
  shared/
    codecs.ts              field value ⇄ pieces: text, HTML (block by block), markdown (line/block based)
    document.ts            HTML document with data-st-id elements (the SDK's HtmlDocument)
    supertext-client.ts    the extension's Supertext client on top of the Supertext SDK
    languages.ts           target/source codes (the SDK's Languages), politeness
vendor/supertext-sdk/      Supertext SDK (TypeScript, built), bundled into dist/; see *Supertext SDK*
vendor/supertext-plugin-health/  Supertext Plugin Health (TypeScript, built), bundled into dist/; see *Supertext Plugin Health*
scripts/vendor-sdk.sh      updates vendor/supertext-sdk
scripts/vendor-plugin-health.sh  updates vendor/supertext-plugin-health
demo/                      Railway demo (Dockerfile, start script, demo setup hook)
test/                      unit tests, integration tests (real Directus), docs screenshots, end-to-end tests (test/e2e)
```

### Data model

Directus's translations: parent collection `articles` → alias field `translations` (special `translations`) → junction collection `articles_translations` with `articles_id` (FK to the parent), `languages_code` (FK to `languages`) and the translatable fields. `findTranslationsRelation()` finds this from `schema.relations`: the relation whose `related_collection` is the parent and whose `meta.one_field` is the field; `meta.junction_field` is the language FK; its relation names the languages collection.

Translatable fields are the junction's fields (from `FieldsService`, for interface metadata) minus primary key, both FKs, hidden and read-only fields, mapped by interface (`kindForField()`): `input`/`input-multiline` → text (not with `options.slug`), `input-rich-text-html` → html, `input-rich-text-md` → markdown.

### Flow

1. `POST /supertext/translate { collection, item, field?, source?, targets?, fields?, save? }` (signed-in users only).
2. `PermissionsService.getItemPermissions(collection, item).update.access` must be true (admins always), otherwise 403 before anything is sent.
3. The item's translation rows and the languages are read with the user's accountability. Source: request, else the Translations field's `defaultLanguage` option, else the first language with text.
4. All translatable fields of the source row become one HTML document (pieces in field order); it's sent once per target language (`SUPERTEXT_CONCURRENCY` at a time). Per language: ok + values, or an error; one failing language doesn't stop the others.
5. `save: false` (item form): the values are returned. The interface merges them into the form's pending edits of the translations field (`{ create, update, delete }`: existing rows as `update` by primary key, new languages as `create` with `languages_code: { code }`) and emits `setFieldValue`. The editor saves; Directus applies permissions, validation and revisions.
6. `save: true` (Flow operation): `ItemsService(parent).updateOne(item, { translations: edits })` per language, with the user's accountability; the operation passes `emitEvents: false` so a flow on `items.update`/`items.create` doesn't trigger itself.

### Rich text

Directus 12's WYSIWYG editor (TipTap) shows HTML it would serialize differently as read-only ("normalization"). So the HTML codec never rebuilds markup: it finds the leaf blocks (`p`, `h1–h6`, `li`/`td`/`th`/… without block children), sends each block's inner HTML as **one** segment (inline tags like `<strong>`, `<a href>` included, so sentences stay whole), and puts each translation back into the same element. HTML without blocks is one segment. `pre`/`code` are skipped. The serialized result is the source structure with translated text, so it stays editable.

### Markdown

Line based: headings, list items (incl. task boxes), quotes and table cells are translated one by one with their markers kept; consecutive plain lines form one paragraph (rewrapped to one line). Inline markdown → HTML (`marked.parseInline`) for the segment, and back with a small converter (bold, italic, strikethrough, code, links, images, line breaks; other tags stay HTML). Fences, indented code, HTML blocks, link definitions and rules are left alone.

### Document

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<div data-st-id="0">Content that speaks every language</div>
<div data-st-id="3">Open an article, … click <strong>Translate</strong>. …</div>
</body></html>
```

Segments missing or empty in the response keep the source text and are reported (`missing` per language, shown in the box).

### Interface strings

Directus can't load translation strings from extensions (custom strings only come from *Settings* → *Translations*), so the app side brings a small dictionary: `src/i18n/messages.ts` holds every string in English, German, French and Italian, `src/i18n/index.ts` picks them by the user's Directus language. Directus sets `<html lang>` together with its own locale, so `t()` reads that attribute (a MutationObserver mirrors it into a ref for our templates). The definitions use getters (`name`, `description`) and functions (`options`, `overview`) so Directus reads them when it renders, in the current language. Primary subtags select the language (`fr-CA` → French); anything else gets English.

The API answers in English (`message`, for logs and API clients) and adds `extensions.key` and `extensions.values` to errors and `key`/`values` to failed languages in `/translate`; the app shows `key` (`error.<code>` or `supertext.<SupertextErrorCode>`) from the dictionary and appends `values.detail`, the Supertext API's own text. `SupertextError.detail` carries that text.

New or changed strings need all four languages in the same commit: formal address (Sie, vous, Lei), Directus's own terms (*Sammlung*/*collection*/*raccolta*, *Element*/*élément*/*elemento*, *Flow*/*flux*/*flusso*), "Supertext", `{placeholders}` and URLs unchanged. `test/i18n.test.ts` checks keys, placeholders and URLs and that every used key and API error has a message.

## Supertext API protocol

AI file translation API v1, same as the WordPress plugin and every other Supertext plugin, done by the Supertext SDK. Base URLs `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. Header `Authorization: Supertext-Auth-Key <key>` (a pasted prefix is stripped; always exactly one).

| Step | Request | Notes |
| --- | --- | --- |
| Upload | `POST translate/ai/file` multipart: `file` (`content.html`, type exactly `text/html`), `target_lang`, optional `source_lang` (bare language, see *Language codes*), optional `politeness` (`more`/`less`) | → `{ file_id }` |
| Poll | `GET translate/ai/file/{id}/status` | `translating`, `done`, `error`, `limit_exceeded`, `deleted` |
| Download | `GET translate/ai/file/{id}/translation` | translated HTML |
| Delete | `DELETE translate/ai/file/{id}` | always attempted, also after errors |

HTTP 429 (`RATE_LIMIT_EXCEEDED`) is retried up to 4 times (`Retry-After`, else 1/2/4/8 s with jitter, at most 30 s). Errors are the SDK's `SupertextError` with a stable `code`: `missing_api_key`, `authentication_failure` (401/403), `invalid_language_pair` (400 `INVALID_LANGUAGE_PAIR`), `not_found` (404), `payload_too_large` (413), `too_many_requests` (429), `service_unavailable` (5xx), `unexpected_status`, `transport_error` (network), `no_file_id`, `translation_error` (status `error`), `quota_exceeded` (`limit_exceeded`), `file_deleted`, `timeout`, `incomplete_response`. Each has a `supertext.<code>` message in all four languages (`test/i18n.test.ts` checks every code of the SDK). The API key never appears in messages.

### Supertext SDK

All Supertext calls go through the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (`sdk/typescript`, npm name `supertext-sdk`), the shared client of all Supertext plugins: it provides the client and the API key check (`checkApiKey()`, `apiKeyFingerprint`, `SDK_VERSION`); version reports and the ping are in *Supertext Plugin Health* (below). It is a devDependency (`"supertext-sdk": "file:vendor/supertext-sdk"`) that `directus-extension build` bundles into `dist/`, so sites install nothing besides the extension. `vendor/supertext-sdk/` holds its built JavaScript and type declarations, a lean `package.json` (`node_modules/supertext-sdk` is a link to it), `COMMIT` (the SDK commit) and `VERSION` (the SDK version). Never edit it: fix the SDK repository and copy it again with `scripts/vendor-sdk.sh [ref]`, which builds the SDK, replaces the copy entirely and updates `package-lock.json` when the SDK version changed:

```bash
scripts/vendor-sdk.sh                  # latest main of the SDK repository
scripts/vendor-sdk.sh <commit|branch>  # a tag, branch or commit
SDK_DIR=/path/to/Supertext-API-SDK-and-Guide scripts/vendor-sdk.sh   # a local clone, as it is
```

Then run the unit and integration tests and note the update in `CHANGELOG.md`. Once the SDK is on npm, the devDependency points at the published version instead; it stays bundled. `src/shared/supertext-client.ts` wraps the SDK client (options in milliseconds, a `fetch` for tests, the User-Agent `supertext-sdk-typescript directus-extension-supertext-translation`).

### Supertext Plugin Health

[Supertext Plugin Health](https://github.com/Supertext/Commando-Center-Supertext-Translation/tree/main/plugin-health) (`plugin-health/typescript` in the Commando Center repository, package name `supertext-plugin-health`) sends the version reports and the API key check result to the Supertext Commando Center and answers its reachability ping (`InstallationReporter`, `reportsEnabled()`, `reporterState()`, `pingResponse()`; see *Commando Center* below). It has no dependencies and doesn't need the SDK: `src/api/reporting.ts` passes in the SDK's `SDK_VERSION` and a key checker built from the SDK's `checkApiKey()` and `apiKeyFingerprint`. Like the SDK it is a devDependency (`"supertext-plugin-health": "file:vendor/supertext-plugin-health"`) bundled into `dist/`; `vendor/supertext-plugin-health/` holds the built JavaScript, type declarations, a lean `package.json`, `COMMIT` and `VERSION`. Never edit it: fix Plugin Health in Commando-Center-Supertext-Translation/plugin-health and copy it again with `scripts/vendor-plugin-health.sh` (builds it, replaces the copy entirely, updates `package-lock.json` when the version changed):

```bash
scripts/vendor-plugin-health.sh plugin-health-v0.1.0   # a release tag
scripts/vendor-plugin-health.sh                        # latest main of the Commando Center repository
PLUGIN_HEALTH_DIR=/path/to/Commando-Center-Supertext-Translation scripts/vendor-plugin-health.sh   # a local clone, as it is
```

Then run the unit and integration tests and note the update in `CHANGELOG.md`.

### Language codes

Supertext accepts exactly the codes its `GET features` lists (the SDK's `Languages`, from the live API): bare sources (`en`, `de`); targets in one exact form each, regional for German, English, French, Italian and Portuguese (`de-CH`, `en-US`, `pt-BR`), with a script for Chinese and Serbian (`zh-Hans`, `sr-Latn`), bare for the others (`es`, `nl`, `sl`). Anything else is HTTP 404 `INVALID_LANGUAGE_PAIR`; formal/informal for a target without it (`en-US`, `rm`, …) is HTTP 400 `FEATURE_ERROR` (`unsupported_feature`). No pair within one language.

`src/shared/languages.ts` turns Directus language codes into Supertext codes with the SDK's `Languages`, **without guessing**:

- `targetCode(code, languageMap)`: the `SUPERTEXT_LANGUAGE_MAP` entry wins (sent as it is); else a Directus code that equals a Supertext code apart from case and `_`/`-` (`de-CH`, `fr_ch` → `fr-CH`, `es`); else `SupertextError('unsupported_language')`, which the translator reports for that language (`supertext.unsupported_language` with `{language}`) without calling Supertext. There are no default regions: `de` must be mapped (to `de-DE`, `de-CH` or `de-AT`).
- `sourceCode(code, languageMap)`: the mapping's value in its source form (`{"de":"de-CH"}` → `de`, so one mapping serves both directions), else the Supertext source for the code (`en-US` → `en`), else `unsupported_language`.
- The Supertext page shows the code per language, *Not mapped* for the others, and warns when a tone is set for a target that has none.

The stand-ins (`test/fakeSupertext.ts`, `test/integration/fake-supertext-server.ts`, `test/docs/stand-in.mjs`) reject bare targets and regional sources like the real API.

### Commando Center: version reports, key check, ping

Protocol: [Commando-Center-Supertext-Translation](https://github.com/Supertext/Commando-Center-Supertext-Translation) → `docs/DEVELOPER.md` → *Report protocol*; Supertext Plugin Health's `InstallationReporter` and `pingResponse()` implement it, with the SDK's `checkApiKey()` and `apiKeyFingerprint` as the key checker (the SDK client gets `SUPERTEXT_API_URL` and the extension's User-Agent); `src/api/reporting.ts` only supplies what Directus knows:

- **Setting:** `SUPERTEXT_VERSION_REPORTS` (default on; `reportsEnabled()`), read from the raw environment first like the other settings. Off: no reports, ping 404. `SUPERTEXT_REPORT_URL` sends reports elsewhere (tests).
- **Report fields:** `site_url` = `PUBLIC_URL` (absolute), else the request's protocol and host; plugin `Directus-Supertext-Translation` with the version from `package.json`; system `Directus` with the version of the running `directus` package (`process.argv[1]` → its `package.json`, else resolved from the project); `sdk_version` = the bundled SDK's `SDK_VERSION`; `callback.url` = `<site>/supertext/ping`.
- **When:** Directus has no settings form for the extension, so there is no `settings_saved`. `onRequest` runs in the background on `/status`, `/info`, `/translate` and after the Flow operation (reports `installed`, `upgraded` or `api_key_check`; checks the key only when its fingerprint changed); `/test` runs `testConnection` and waits for it; a translation with `authentication_failure` runs `authenticationFailed`. Calls are serialized per process. Nothing here ever throws into a request.
- **State:** one row (`key = 'reporter'`, JSON) in `supertext_state`, created with Knex on first use (`StateStore`). Plugin Health's state has the same format the SDK 0.1–0.2 reporter stored, so the switch kept the history (no new `installed` report).
- **Ping:** `GET /supertext/ping` needs no login; Directus doesn't cache custom endpoints, and the answer says `Cache-Control: no-store`.

### Endpoint reference

`GET /supertext/info?collection=articles&item=1[&field=translations]` →
`{ configured, relation: { field, junction, junctionPk, languageFk, languagePk, … }, defaultSource, fields: [{ field, kind }], languages: [{ code, name, hasTranslation, id }] }`

`POST /supertext/translate` → `{ collection, item, field, source, fields, results: [{ language, ok, values, id, created, missing, saved } | { language, ok: false, error, code, key, values }] }`

`GET /supertext/status` (administrators) → `{ version, reports: { enabled, check }, configured, baseUrl, concurrency, timeoutSeconds, languages: [{ collection, code, name, target, politeness }] }`: `version` is read at runtime from the extension's `package.json` (`src/api/version.ts`, looking upwards from `dist/api.js`; `null` if not found; the page links an `X.Y.Z` version to its GitHub release). `languages` covers every languages collection used by a translations field.

`POST /supertext/test` (administrators) → `{ ok, check: { status, checkedAt, httpStatus, errorCode, fingerprint } }`: the SDK's key check (`GET features`, cost-free), `status` one of `ok`, `invalid`, `missing`, `unreachable`, `error`. Always HTTP 200 for administrators (a 401 would sign the admin out of the app); the page shows `keycheck.<status>`.

`GET /supertext/ping?challenge=<16–64 of A-Z a-z 0-9 _ ->` (public) → 200 `{ ok: true, plugin: "Directus-Supertext-Translation", challenge }`, 400 `{ ok: false }` for any other challenge, 404 with reports off.

Errors: `{ errors: [{ message, extensions: { code, key, values } }] }` (`key`/`values`: the message for the app, see *Interface strings*) with `unauthenticated` (401), `forbidden` (403; also non-admins on `/status` and `/test`), `not_configured` (400, `/test` without a key), `missing_api_key` (503), `no_source`, `unknown_language`, `no_targets`, `no_fields`, `no_translations_field` (400).

## Local setup

```bash
git clone https://github.com/Supertext/Directus-Supertext-Translation.git
cd Directus-Supertext-Translation
npm ci
npm run build          # dist/app.js, dist/api.js
npm run dev            # rebuild on change
```

Use it in a local Directus: symlink the repo into the project's `extensions/` folder (`ln -s $PWD <project>/extensions/directus-extension-supertext-translation`), set `EXTENSIONS_AUTO_RELOAD=true` and the `SUPERTEXT_*` variables. For a local Directus with the demo content, also link `demo/extensions/directus-extension-demo-setup` and set `DEMO_*` (see below).

## Tests

```bash
npm test                 # unit tests (Vitest)
npm run typecheck        # vue-tsc (TypeScript 5; vue-tsc doesn't support TypeScript 7 yet)
npm run test:integration # builds, then starts a real Directus 12 (SQLite) — installs it into test/integration first
```

- `test/codecs.test.ts`: text/HTML/markdown round trips, block segmentation, tables, missing segments, field kinds.
- `test/supertext-client.test.ts`: the extension's client on the SDK: protocol, multipart, status/HTTP errors, 429 retries, key prefix, language codes. The SDK's own tests and conformance scenarios run in the SDK repository.
- `test/config.test.ts`: settings, including JSON values Directus has split at commas.
- `test/i18n.test.ts`: all four languages have the English keys, placeholders and URLs; every key the app uses, every API error and every Supertext error code has a message; language lookup and error texts.
- `test/endpoint.test.ts`: `/status` returns the version from `package.json` and refuses non-admins.
- `test/reporting.test.ts`: the setting, site URL, state kept in the table, one `installed` report, a 401 reported once as `api_key_check`, nothing sent with reports off, ping answers, no exception when the database fails.
- `test/demo-check.sh` (CI, needs Docker, PostgreSQL and the stand-in): starts the demo image twice, checks that the demo accounts exist exactly once and no password is logged, `/status` and `/test` as admin (403 for the editor), and translates and saves the first sample article as the editor.
- `test/integration/directus.test.ts`: Directus 12.5 in a temp folder with the built bundle and the demo setup hook, Supertext replaced by `fake-supertext-server.ts` (prefixes `[<lang>] `). Demo setup (languages, articles, accounts, no passwords in the log), `/info`, translating without saving, structure of rich text, failed languages, unknown languages/missing source, read-only users get 403 and send nothing, saving through the parent and updating the same row, the Flow operation with a manual trigger, translate-on-create without a loop, and the Commando Center (public ping, key check, the `installed` report with Directus 12.5.0 and the callback URL, sent to the fake's `POST /report`, never containing the key).

CI (`.github/workflows/ci.yml`): **test** (typecheck, unit and integration tests on Node 22) and **demo** (builds `demo/Dockerfile`, runs `test/demo-check.sh` against a PostgreSQL service and the stand-in). `.github/workflows/checks.yml` and `links.yml` lint the workflows and check the links. `.github/workflows/e2e.yml` runs the end-to-end test against the real Supertext API and regenerates the docs screenshots (see *End-to-end tests*).

## End-to-end tests

The unit and integration tests use fakes. `.github/workflows/e2e.yml` also tests against the **real Supertext API**, so changes on Supertext's side (language codes, regional variants, formatting, rate limits) show up. It runs on every push to `main` that touches the extension, the vendored packages, the demo or the tests, on pull requests that change the E2E test or workflow, every Monday (05:15 UTC), and by hand (*Actions → E2E → Run workflow*). It builds the demo image once (Docker layer cache in GitHub Actions) and starts it twice on a PostgreSQL service, each with a new database (`directus_live`, `directus_docs`) and demo accounts made up for the run:

1. **Real API** (repository or organization secret `SUPERTEXT_API_KEY`; without it these steps are skipped with a warning). Version reports are off (`SUPERTEXT_VERSION_REPORTS=0`), so CI runs don't appear in the Commando Center.
   - `test/e2e/features.mjs` asks the live `GET features` (cost-free, no plugin or SDK code) whether every pair the demo translates (`en` → `de-CH`, `fr-CH`, `it-CH`, as the extension sends them for the demo's `en-US` source) is offered; a missing pair fails the run. Whether the extension's own language list matches the API is the SDK's job (its own tests).
   - `test/e2e/live.mjs` (Playwright): the demo editor opens each sample article in the Directus app, clicks **Translate** in the *Translate with Supertext* box (all target languages preselected) and saves the form. Then the data is checked through Directus's REST API (as the editor): each article has exactly one translation row per target language, title, summary and body are filled and at least 80 % of them changed (single words may stay the same), no `data-st-id`/placeholder is left, links (and their targets), bold, italics, headings, paragraphs, list items and quotes are kept, the text is in the target language (common words of each language counted), de-CH has no "ß", and the source row and the article status are unchanged. The box and Directus must show no error. Translating again (the replace warning is confirmed) must update the same rows (no duplicates). Each run translates the two sample articles twice into three languages (around 6,000 characters on the key's account).
2. **Stand-in API**: the docs screenshots (see *Docs screenshots*), so the images don't change with each machine translation. If `docs/images/` changed, a second job pushes the branch `automation/docs-screenshots` and opens (or updates) the pull request "Docs: regenerate screenshots" (only for runs on `main`). This needs *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.

If a run fails, the artifact `e2e-debug` has the result pages (screenshots of each article after translating), the demo logs and the stand-in log. Locally:

```bash
cd test/e2e && npm install && npx playwright install chromium
# fresh demo (new database) with a real SUPERTEXT_API_KEY, e.g. on port 8081 (see Demo)
SUPERTEXT_API_KEY=… E2E_SOURCE=en E2E_TARGETS=de-CH,fr-CH,it-CH node features.mjs
DIRECTUS_URL=http://127.0.0.1:8081 EDITOR_EMAIL=… EDITOR_PASSWORD=… npm run live
```

`live.mjs` also passes against the stand-in API (it returns real translations for the sample articles), which is how to try changes to it without a key.

## Demo (`demo/`)

Directus 12.5.0 (`directus/directus` image) with this bundle built in the first Docker stage, and `demo/extensions/directus-extension-demo-setup`, a hook that runs on every start and only adds what is missing:

- languages `en-US` (source), `de-CH`, `fr-CH`, `it-CH`;
- collection `articles` with `status`, a Translations field (title, summary, WYSIWYG body; default language en-US; list display "translations") and the *Supertext translation* field; two English sample articles;
- the extension's **Supertext** page in the module bar (added once; later changes by admins stay);
- policy **Editors** (app access; CRUD on articles and their translations, read languages, revisions and activity) on role **Editor**;
- **accounts** (demo accounts rule in `CLAUDE.md`): `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` → role with an admin-access policy (created if needed); `DEMO_EDITOR_EMAIL`/`DEMO_EDITOR_PASSWORD` → Editor. Missing accounts are created, existing ones never changed; a password under 8 characters (or rejected by the project's password policy) skips the account with a warning; only variable names are logged.

Directus 12's bootstrap creates no user without `ADMIN_EMAIL`, and a fresh install shows the browser `/setup` screen (first admin, license acceptance). With `DEMO_ADMIN_*` set the demo creates the admin, so `/setup` no longer appears. On first login Directus asks administrators about a license key / Core plan and a project owner (Directus MSCL-1.0-GPL license); that choice is left to the project's owner and not automated.

`demo/docker/start.cjs` replaces the image command: with `DEMO_DATABASE_URL` (a Postgres server URL) it creates the database `DEMO_DATABASE_NAME` (default `directus`) if needed and sets `DB_CLIENT`/`DB_CONNECTION_STRING`, then runs the image's entrypoint (bootstrap, start). Variables: [demo/.env.example](../demo/.env.example).

```bash
docker build -f demo/Dockerfile -t directus-supertext-demo .
docker run -p 8055:8055 -e DEMO_DATABASE_URL=postgresql://user:pass@host:5432/postgres \
  -e SECRET=… -e PUBLIC_URL=http://localhost:8055 -e PORT=8055 \
  -e DEMO_ADMIN_EMAIL=… -e DEMO_ADMIN_PASSWORD=… -e DEMO_EDITOR_EMAIL=… -e DEMO_EDITOR_PASSWORD=… \
  -e SUPERTEXT_API_KEY=… directus-supertext-demo
```

### Railway

Project **supertext-cms-demos** (Amsterdam), service **Directus** from this repository (`main`, Dockerfile `demo/Dockerfile`, build context = repo root, healthcheck `/server/ping`). It uses the project's shared **Postgres** (`DEMO_DATABASE_URL=${{Postgres.DATABASE_URL}}`, own database `directus`). `SUPERTEXT_API_KEY` references the Payload service's variable. Live: <https://directus-production-349f.up.railway.app/admin>. Uploads are not persisted (the demo has no files).

If a push doesn't deploy: check that Railway's GitHub app has access to this repository; a redeploy of the service also picks up the latest commit.

To reset the demo: drop the `directus` database in Postgres and redeploy.

## Docs screenshots

`docs/images/*.png` come from a fresh demo whose `SUPERTEXT_API_URL` points at `test/docs/stand-in.mjs`, a stand-in API that returns real German, French and Italian for the sample articles (`test/docs/translations.json`, keyed by the segment HTML). Regenerate them in the same commit as UI changes:

```bash
node test/docs/stand-in.mjs &                       # :8765
# fresh demo with SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/ (e.g. the docker run above, new database)
DIRECTUS_URL=http://127.0.0.1:8055 EDITOR_EMAIL=… EDITOR_PASSWORD=… ADMIN_EMAIL=… ADMIN_PASSWORD=… \
  npm run docs:screenshots
```

The script uses the editor for the translate screens and the admin for languages, interface options, the Flow operation and the Supertext page (where it shows the live API address instead of the stand-in's) (it closes the admin's license prompts with *Skip* / *Remind Later*, and creates a flow). 1280×900 at 1×, cropped.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). Lift an ignore rule when the plugin moves to the new version.

`vue` is ignored completely: it must be exactly the version `@directus/extensions-sdk` pins (the Vue that Directus itself bundles), otherwise there are two copies of Vue's types and `vue-tsc` crashes (`Cannot read properties of undefined (reading 'length')`). When Dependabot updates the SDK and CI fails on `npm run typecheck`, set `vue` in `package.json` to the SDK's version (`npm view @directus/extensions-sdk@<version> dependencies.vue`, then `npm install -D -E vue@<that version>`) on the same branch.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Third-party actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- JavaScript and TypeScript are analysed by CodeQL (see below), so this repo runs no separate static analyser.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

## Releasing

Releases are published by `.github/workflows/release.yml` when the version is officially bumped; nobody tags or creates releases by hand.

1. Check that `npm run build && npm test && npm run test:integration` pass.
2. Move the *Unreleased* entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` section, and keep an empty *Unreleased* above it.
3. Set the same version in:
   - `package.json`: the npm package version
4. Push to `main`. The workflow checks that the version files match `CHANGELOG.md`, then tags `vX.Y.Z` and creates the GitHub release with the CHANGELOG section as notes (0.x versions as pre-releases). A push that adds no new version does nothing, and a version that is already released is skipped. After fixing a failed run, start it again with *Run workflow* on the *Release* workflow.

Publishing to npm stays manual: `npm publish` after the release (the `directus-extension` keyword lists it in the Marketplace).
## Known limitations / roadmap

- Runs in the request; very long items and many languages can take a while (`SUPERTEXT_TIMEOUT`). Next: run in the background with progress.
- Block editor (`input-block-editor`), JSON/repeater fields and nested relations (e.g. translations of related items, M2A page builders) are not translated.
- Markdown paragraphs spanning several lines come back as one line; `*`/`_` style and escapes may change.
- Slugs are not generated for new languages.
- Re-translating replaces earlier manual edits of the translated fields; no change detection or translation memory.
- No Directus *AI Translations* integration (Directus 12's own LLM feature); Supertext is a separate button.
- Human (professional) translation orders, as in the WordPress plugin, are not implemented.
