# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- First version of the Directus extension (bundle for Directus 11 and 12):
  - *Supertext Translation* interface: translate an item's Translations field into any of its languages, with an "Already translated" marker per language and an explicit *Overwrite existing translations* option.
  - API endpoint `/supertext` that reads and writes with the editor's permissions.
  - Text, multi-line text and WYSIWYG (HTML) fields are translated; slugs are translated as words and turned back into slugs; other fields are copied into new translations.
  - *Supertext* module for administrators: configuration, language table and *Test connection*.
  - Settings through environment variables: `SUPERTEXT_API_KEY` (with or without the `Supertext-Auth-Key` prefix), `SUPERTEXT_ENVIRONMENT`, `SUPERTEXT_API_ENDPOINT`, `SUPERTEXT_LANGUAGES`, `SUPERTEXT_SOURCE_LANGUAGE`, `SUPERTEXT_TIMEOUT`.
  - Retries when the Supertext API answers HTTP 429 (rate limit).
  - English and German interface texts.
- Demo for Railway (`demo/`) with demo accounts, languages and a sample article created on every start.
