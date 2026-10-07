# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-10-07

### Added

- Directus 12 bundle `directus-extension-supertext-translation`.
- **Supertext** page for administrators (module bar): configuration, the languages with their Supertext code and tone, and *Test connection*; endpoints `/supertext/status` and `/supertext/test`.

- *Supertext translation* interface: a **Translate with Supertext** box in the item form with source and target languages, a warning and confirmation for languages that already have text, and results per language. Translations go into the form's Translations field; the editor reviews and saves.
- Flow operation **Supertext: translate**: translates and saves items from a manual or event trigger; *Only empty languages*; saving doesn't re-trigger flows.
- Endpoint `/supertext/info` and `/supertext/translate`, with the user's permissions; users who can't edit the item are refused before anything is sent.
- Links to create a Supertext account and to generate the API key (supertext.com → Integrations → API, Admin role required) on the Supertext page, in the *Test connection* error without a key, and in the README and installation guide.
- Text, rich text (block by block, formatting and structure kept, editable in Directus 12's editor) and markdown fields.
- Settings via environment variables: `SUPERTEXT_API_KEY` (with or without the `Supertext-Auth-Key` prefix), `SUPERTEXT_ENVIRONMENT`, `SUPERTEXT_API_URL`, `SUPERTEXT_LANGUAGE_MAP`, `SUPERTEXT_POLITENESS`, `SUPERTEXT_CONCURRENCY`, `SUPERTEXT_POLL_INTERVAL`, `SUPERTEXT_TIMEOUT`.
- Retries when Supertext's rate limit is hit (HTTP 429).
- Installation, user and developer guides with screenshots; unit tests and integration tests against a real Directus 12; CI.
- Directus 12 demo (`demo/`) with accounts from `DEMO_ADMIN_*` / `DEMO_EDITOR_*`, an Editor role, four Swiss languages and English sample articles, deployed on Railway.

### Fixed

- JSON settings with more than one entry (e.g. `SUPERTEXT_POLITENESS={"de-CH":"more","fr-CH":"more"}`) were rejected, because Directus splits environment values at commas.
