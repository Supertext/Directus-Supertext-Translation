# Developer guide — Supertext Translation for Directus

How the extension is built, how to work on it, and how it is released and deployed.

## Architecture

A Directus **bundle** extension (`package.json` → `directus:extension`, built with `@directus/extensions-sdk`) with three entries:

| Entry | Type | Source | Purpose |
| --- | --- | --- | --- |
| `supertext` | endpoint | `src/endpoint/` | `/supertext/*` routes; reads and writes items |
| `supertext-translate` | interface | `src/interface/` | The *Translate with Supertext* panel (alias field, group *Presentation*, stores nothing) |
| `supertext-module` | module (route id `supertext`) | `src/module/` | *Supertext* page for administrators: configuration, languages, *Test connection* |

```
Panel (interface.vue)
   │ GET  /supertext/languages/:collection/:id     languages, which exist, configured?
   │ POST /supertext/translate/:collection/:id     { source?, targets[], overwrite }
   ▼
endpoint/index.ts ── context: ItemsService/FieldsService with req.accountability (editor's permissions)
   ▼
endpoint/schema.ts   describeTranslations(): Translations alias field → junction collection
                     (parent field, language field) → languages collection
endpoint/translator.ts
   │ reads the junction rows of the item, picks the source row
   │ translatable fields from the junction's field meta (interfaces)
   │ shared/html.ts buildDocument(): one <div data-st-id="N"> per field value
   ▼
shared/client.ts  POST file → poll status → GET translation → DELETE   (one document per target language)
   ▼
parseDocument() → createOne() (new language: copy of the source row + translations) or updateOne()
```

| Module | Responsibility |
| --- | --- |
| `src/shared/client.ts` | Supertext AI file translation API v1 (`fetch`, injectable for tests), auth header, 429 retries, error messages |
| `src/shared/html.ts` | Builds/parses the HTML document (`node-html-parser`); plain text is escaped and line breaks travel as `<br>` |
| `src/shared/config.ts` | Settings from environment variables (see [installation guide](INSTALLATION.md#settings)), language code mapping and tone |
| `src/endpoint/schema.ts` | Finds the parts of Directus' translations pattern in the schema overview |
| `src/endpoint/translator.ts` | `languages()` and `translate()`; field rules (below) |
| `src/endpoint/index.ts` | Routes, auth checks, error responses `{ errors: [{ message }] }` |
| `src/interface/` | Panel UI (Vue 3, Directus components `v-select`, `v-checkbox`, `v-notice`, …), English and German strings chosen from the Data Studio's language |
| `src/module/` | Admin page, registered only for users with admin access (`preRegisterCheck`) |

**Routes** (all need a logged-in user):

| Route | Who | |
| --- | --- | --- |
| `GET /supertext/status` | admins | Configuration and the rows of the `languages` collection with their Supertext code and tone |
| `POST /supertext/test` | admins | `GET features` on the Supertext API (cost-free key check) |
| `GET /supertext/languages/:collection/:id` | anyone who may read the item | `{ field, source, languages: [{ code, name, exists, isSource }], configured }` |
| `POST /supertext/translate/:collection/:id` | anyone who may edit the translations | `{ results: [{ language, status: created\|updated\|skipped\|error, message? }] }` |

### Field rules

`translatableFields()` in `src/endpoint/translator.ts` reads the junction collection's fields (with `FieldsService`, because interfaces live in the field meta):

- Skipped entirely: the primary key, the parent and language fields, alias fields and fields with the specials `uuid`, `date-created`, `date-updated`, `user-created`, `user-updated`, `o2m`, `m2m`, `m2a`, `files`, `translations`, `alias`, `no-data`.
- **Translated:** fields of type `string` or `text` with no special and an interface other than `input-code`, `select-dropdown`, `select-radio`, `select-icon`, `select-color`, `input-hash`, `boolean`, `datetime`.
  - `input-rich-text-html` is sent as HTML; everything else as escaped plain text.
  - Slugs (field named `slug` or with `options.slug`) are sent as words (`a-b-c` → `a b c`) if they look like a slug, and slugified afterwards.
- **Copied** into a *new* translation row: all other fields (numbers, files, JSON, …).
- Empty values are skipped; a translation that comes back empty doesn't overwrite.

Every field value is one `data-st-id` element, so whole texts (and all paragraphs of a rich-text field) are translated in context. Documents are split below 900,000 characters.

**Overwriting:** existing target rows are only updated with `overwrite: true`; otherwise they are reported as `skipped`. Each target language is independent: an error in one doesn't stop the others.

**Environment variables:** Directus' env parser casts values (a value with a comma becomes an array). `readConfig()` therefore prefers the raw `process.env` value for `SUPERTEXT_*` and re-joins arrays from Directus' parsed env (e.g. a `.env` file).

## Supertext API protocol

Shared with the WordPress plugin and every other Supertext CMS plugin:

1. `POST {base}translate/ai/file`: multipart with `file` (part `Content-Type` exactly `text/html`, no charset, or the API answers 415), `target_lang` (BCP-47, e.g. `de-CH`), optional `source_lang` (primary subtag only, e.g. `en`, or the pair is rejected), optional `politeness` (`more`/`less`). Returns `{file_id}`.
2. `GET …/{file_id}/status` until `done` (`error`, `limit_exceeded`, `deleted` are terminal).
3. `GET …/{file_id}/translation` returns the translated HTML.
4. `DELETE …/{file_id}` (files also expire after 24 h).

Auth header: `Authorization: Supertext-Auth-Key <key>`. The header name must be `Authorization` (`Authentication` gets 403). Supertext shows the key with the prefix, so the client strips a pasted `Supertext-Auth-Key ` and always sends exactly one. Base URLs: `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. `GET features` is the cost-free key check.

**Rate limit:** the API limits requests per second per key (HTTP 429). The client retries a 429 up to 4 times, waiting for `Retry-After` if sent, otherwise 1, 2, 4 and 8 seconds plus jitter. Target languages are translated one after the other.

## Local development

```bash
npm ci
npm run dev          # rebuilds dist/ on change
```

Link the repository into a Directus project's extensions folder and start Directus with auto-reload:

```bash
mkdir -p my-directus/extensions
ln -s "$PWD" my-directus/extensions/directus-extension-supertext-translation
ln -s "$PWD/demo/extensions/directus-extension-supertext-demo" my-directus/extensions/
cd my-directus && npm install directus@12
# .env: DB_CLIENT=sqlite3, DB_FILENAME=./data.db, SECRET=…, ADMIN_EMAIL=…, ADMIN_PASSWORD=…, EXTENSIONS_AUTO_RELOAD=true
npx directus bootstrap && npx directus start
```

The demo hook (second link) creates the languages, the *Articles* collection with the panel and a sample article. To work without a real key, run the stand-in API (`npm run stand-in`) and start Directus with `SUPERTEXT_API_KEY=anything SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/`. It returns real German, French and Italian for the sample article and `[de-CH] …`-prefixed text for anything else.

## Tests

```bash
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run build
```

- `test/client.test.ts`: the API protocol, auth header and prefix, 429 retries, errors, clean-up.
- `test/html.test.ts`: document packing and parsing.
- `test/translator.test.ts`: `translate()` and `languages()` against fake Directus services and a fake client: create, update, skip, overwrite, copied fields, HTML, slugs, per-language errors, configuration (including Directus' comma splitting).

CI (`.github/workflows/ci.yml`) on every push and pull request:

- **test**: tests, type check and build on Node 22; the packed extension is kept as a build artifact.
- **demo**: builds the demo image, starts it twice against PostgreSQL with the stand-in API, checks the demo accounts (created once, never duplicated), translates the sample article through the endpoint as the editor and checks title, slug and markup.

## Demo (Railway)

The public demo is a container built from `demo/Dockerfile`: Directus 12.4 with this extension, English plus German, French and Italian (Switzerland) and a sample article. It runs on Railway in the `supertext-cms-demos` project, service `Directus`, region EU West (Amsterdam): <https://directus-production-supertext.up.railway.app/admin> (see Railway for the current domain). The data lives in a `directus` database on the project's PostgreSQL service.

**Deploys:** Railway watches `main` of this repository (`railway.json` points it at `demo/Dockerfile`, health check `/server/ping`) and rebuilds on every push.

**What's in `demo/`:**

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds the extension (Node 22), then `ghcr.io/directus/directus:12.4.1` with the extension, the demo hook and the entrypoint. Sets the demo's Supertext settings (formal tone, source `en-US`). |
| `entrypoint.cjs` | Every start: creates the database if missing, sets `DB_*` from `DATABASE_URL`, `PUBLIC_URL` from `RAILWAY_PUBLIC_DOMAIN`, the first admin (below), then hands over to Directus' own `docker-entrypoint.cjs` (bootstrap + start) |
| `extensions/directus-extension-supertext-demo/` | Hook on `server.start`: languages, *Articles* collection with Translations field and the Supertext panel, sample article, *Editor* role, demo accounts, Supertext module in the module bar |
| `.env.example` | The variables below |

**No volume:** Railway's volume limit for the project is reached, and the demo needs none: everything is in PostgreSQL. Files uploaded in the demo disappear with the next deploy.

**Service variables:**

| Variable | |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`; the demo database (`DIRECTUS_DB_NAME`, default `directus`) is created on that server if missing. Without it the container uses SQLite (lost on redeploy). |
| `SECRET` | Random secret for sessions and tokens |
| `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` | Administrator (Directus' *Administrator* role) |
| `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` | Editor for automated tests and screenshots: the demo's *Editor* role (Directus has no built-in editor role), which may read, create and update articles and their translations in every language, and read languages and files |
| `SUPERTEXT_API_KEY` | Supertext key |
| `SUPERTEXT_API_ENDPOINT` | Optional, e.g. the staging API |
| `PORT` | Port Directus listens on (8055) |

**Demo accounts:** on every start the hook creates the `DEMO_ADMIN` and `DEMO_EDITOR` accounts if no account with that e-mail address exists. Existing accounts are never changed; change passwords in the Data Studio. Directus checks the e-mail address (it rejects reserved domains such as `.invalid`) and the project's password policy (none by default); if an account can't be created, it is skipped with a warning naming the variable and the reason, and the demo still starts. Passwords are never logged.

**No "create admin" screen:** Directus 12 shows a public *create the first admin* screen until a user exists. The entrypoint prevents that: on a fresh database it installs Directus with `DEMO_ADMIN_*` as the first admin, or, if those aren't set, with a throwaway `installer-…@example.com` admin whose random password is never stored or shown. The hook deletes that throwaway account as soon as a real active administrator exists. So once `DEMO_*` is set, the screen never appears.

**License prompts:** Directus 12 asks administrators once for a license key and a project owner. The demo leaves both to Supertext (the screenshot script clicks *Skip* / *Remind Later*).

**Run it locally:**

```bash
docker build -f demo/Dockerfile -t supertext-directus-demo .
docker run --rm -p 8055:8055 \
  -e DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/postgres -e SECRET=dev-secret-at-least-32-characters \
  -e DEMO_ADMIN_EMAIL=you@example.com -e DEMO_ADMIN_PASSWORD='choose-one' \
  -e SUPERTEXT_API_KEY=… supertext-directus-demo
# http://localhost:8055/admin
```

## Docs screenshots

The images in `docs/images/` are generated by `tests/docs/screenshots.mjs` (Playwright) from a freshly set-up demo whose extension talks to `tests/docs/stand-in.mjs`. The stand-in returns German, French and Italian for the sample article (`samples.json`, real Supertext output). Regenerate them whenever a screen they show changes:

```bash
cd tests/docs && npm install && npx playwright install chromium && cd ../..
npm run stand-in &
# a fresh demo (new database) with DEMO_* set, started with
# SUPERTEXT_API_KEY=anything SUPERTEXT_API_ENDPOINT=http://127.0.0.1:8765/v1/
BASE_URL=http://127.0.0.1:8055 DEMO_ADMIN_EMAIL=… DEMO_ADMIN_PASSWORD=… \
  DEMO_EDITOR_EMAIL=… DEMO_EDITOR_PASSWORD=… npm run docs:screenshots
```

On the Supertext module the script replaces the stand-in's local address with the live API address before taking the picture.

## Releasing

1. Bump `version` in `package.json`.
2. Move the *Unreleased* entries in `CHANGELOG.md` under the new version.
3. Tag `vX.Y.Z` on `main`, run `npm ci && npm run build && npm pack` and attach the `.tgz` to a GitHub release (`gh release create vX.Y.Z directus-extension-supertext-translation-X.Y.Z.tgz`).

Planned: publishing to npm and the Directus Marketplace.

## Conventions

- TypeScript strict, ES modules; keep `src/shared/` free of Directus imports (tested on its own).
- User-visible strings in English and German.
- Keep the three docs in `docs/` current with every change (see `CLAUDE.md`).

## Known limitations / roadmap

- Translation runs inside the editor's request (one language after the other, up to `SUPERTEXT_TIMEOUT` each). Planned: background jobs for long content and bulk translation of many items.
- Only the translations pattern (Translations field). Collections that keep languages in separate fields or separate items are not supported.
- Markdown fields are translated as plain text (Markdown syntax usually comes back intact). Block editor (`input-block-editor`) and other JSON fields are not translated; they are copied into new translations.
- The *Supertext* module lists the `languages` collection; projects with a differently named languages collection still translate fine but see no language table.
- Not on npm or in the Directus Marketplace yet.
- Human (professional) translation orders are not supported yet (the WordPress plugin has them).
