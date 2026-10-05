# Developer guide

## Architecture

A Directus 12 *bundle* extension (`package.json → directus:extension`):

```
src/
  endpoint/index.ts        /supertext/info, /supertext/translate (Express router, user's accountability),
                           /supertext/status, /supertext/test (administrators)
  interface/               "Supertext translation" presentation interface (Vue 3) for the item form
    index.ts               definition + options (translationsField, sourceLanguage, fields)
    interface.vue          languages, replace warning, puts translations into the form (setFieldValue)
  module/                  "Supertext" page for administrators (route /admin/supertext): configuration,
                           languages with Supertext code and tone, Test connection
  operation/               Flow operation "Supertext: translate" (id supertext-translate-flow)
    app.ts                 options UI
    api.ts                 handler: items from options or trigger; translates and saves
  api/
    config.ts              SUPERTEXT_* environment variables (raw process.env first: Directus splits values at commas)
    translator.ts          relation discovery, permission check, document per item, one request per language, save
  shared/
    codecs.ts              field value ⇄ pieces: text, HTML (block by block), markdown (line/block based)
    document.ts            HTML document with data-st-id elements; parse the response
    supertext-client.ts    Supertext AI file API v1 client (shared with the Payload plugin)
    languages.ts           target/source codes, politeness
demo/                      Railway demo (Dockerfile, start script, demo setup hook)
test/                      unit tests, integration tests (real Directus), docs screenshots
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

## Supertext API protocol

AI file translation API v1, same as the WordPress and Payload plugins. Base URLs `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. Header `Authorization: Supertext-Auth-Key <key>` (a pasted prefix is stripped; always exactly one).

| Step | Request | Notes |
| --- | --- | --- |
| Upload | `POST translate/ai/file` multipart: `file` (`content.html`, type exactly `text/html`), `target_lang`, optional `source_lang` (primary subtag), optional `politeness` (`more`/`less`) | → `{ file_id }` |
| Poll | `GET translate/ai/file/{id}/status` | `translating`, `done`, `error`, `limit_exceeded`, `deleted` |
| Download | `GET translate/ai/file/{id}/translation` | translated HTML |
| Delete | `DELETE translate/ai/file/{id}` | always attempted |

HTTP 429 (`RATE_LIMIT_EXCEEDED`) is retried up to 4 times (`Retry-After`, else 1/2/4/8 s with jitter). Errors map to `SupertextError.code`: 401/403 `authentication_failure`, 404 `not_found`, 413 `payload_too_large`, 429 `too_many_requests`, 5xx `service_unavailable`, network `transport_error`, status `error` → `translation_error`, `limit_exceeded` → `quota_exceeded`.

### Endpoint reference

`GET /supertext/info?collection=articles&item=1[&field=translations]` →
`{ configured, relation: { field, junction, junctionPk, languageFk, languagePk, … }, defaultSource, fields: [{ field, kind }], languages: [{ code, name, hasTranslation, id }] }`

`POST /supertext/translate` → `{ collection, item, field, source, fields, results: [{ language, ok, values, id, created, missing, saved } | { language, ok: false, error, code }] }`

`GET /supertext/status` (administrators) → `{ configured, baseUrl, concurrency, timeoutSeconds, languages: [{ collection, code, name, target, politeness }] }`: every languages collection used by a translations field.

`POST /supertext/test` (administrators) → `{ ok: true }` after `GET features` on the Supertext API (cost-free key check). A rejected key comes back as 502, never 401 (a 401 would sign the admin out of the app).

Errors: `{ errors: [{ message, extensions: { code } }] }` with `unauthenticated` (401), `forbidden` (403; also non-admins on `/status` and `/test`), `not_configured` (400, `/test` without a key), `missing_api_key` (503), `no_source`, `unknown_language`, `no_targets`, `no_fields`, `no_translations_field` (400).

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
- `test/supertext-client.test.ts`: protocol, multipart, status/HTTP errors, 429 retries, key prefix.
- `test/config.test.ts`: settings, including JSON values Directus has split at commas.
- `test/demo-check.sh` (CI, needs Docker, PostgreSQL and the stand-in): starts the demo image twice, checks that the demo accounts exist exactly once and no password is logged, `/status` and `/test` as admin (403 for the editor), and translates and saves the first sample article as the editor.
- `test/integration/directus.test.ts`: Directus 12.4 in a temp folder with the built bundle and the demo setup hook, Supertext replaced by `fake-supertext-server.ts` (prefixes `[<lang>] `). Demo setup (languages, articles, accounts, no passwords in the log), `/info`, translating without saving, structure of rich text, failed languages, unknown languages/missing source, read-only users get 403 and send nothing, saving through the parent and updating the same row, the Flow operation with a manual trigger, and translate-on-create without a loop.

CI (`.github/workflows/ci.yml`): **test** (typecheck, unit and integration tests on Node 22) and **demo** (builds `demo/Dockerfile`, runs `test/demo-check.sh` against a PostgreSQL service and the stand-in).

## Demo (`demo/`)

Directus 12.4.1 (`directus/directus` image) with this bundle built in the first Docker stage, and `demo/extensions/directus-extension-demo-setup`, a hook that runs on every start and only adds what is missing:

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

## Releasing

1. Move *Unreleased* in `CHANGELOG.md` under the new version; bump `version` in `package.json`.
2. `npm run build && npm test && npm run test:integration`.
3. Tag `vX.Y.Z`, push, `npm publish` (keywords include `directus-extension` for the Marketplace).

## Known limitations / roadmap

- Runs in the request; very long items and many languages can take a while (`SUPERTEXT_TIMEOUT`). Next: run in the background with progress.
- Block editor (`input-block-editor`), JSON/repeater fields and nested relations (e.g. translations of related items, M2A page builders) are not translated.
- Markdown paragraphs spanning several lines come back as one line; `*`/`_` style and escapes may change.
- Slugs are not generated for new languages.
- Re-translating replaces earlier manual edits of the translated fields; no change detection or translation memory.
- No Directus *AI Translations* integration (Directus 12's own LLM feature); Supertext is a separate button.
- Human (professional) translation orders, as in the WordPress plugin, are not implemented.
