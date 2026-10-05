# Directus Supertext Translation

AI translation for [Directus](https://directus.io) 12 by [Supertext](https://www.supertext.com). Adds a **Translate with Supertext** box to the item form: pick the languages, click *Translate*, review the translations in Directus's own Translations field and save. A Flow operation translates in bulk or automatically.

![The translate box in the item form](docs/images/02-translated-form.png)

- Works with Directus's standard translations (languages collection + Translations field)
- Text, rich text (formatting, links and structure kept, stays editable) and markdown
- Respects Directus permissions; nothing is saved until the editor clicks *Save*
- Flow operation for bulk and automatic translation
- A *Supertext* page for administrators with the configuration and a connection test

**Live demo:** <https://directus-production-349f.up.railway.app/admin> (credentials from the Supertext team)

## Guides

- [Installation guide](docs/INSTALLATION.md): requirements, install, API key, languages, permissions, Flows, settings, troubleshooting
- [User guide](docs/USER_GUIDE.md): translating, reviewing and saving in the Directus app
- [Developer guide](docs/DEVELOPER.md): architecture, Supertext API protocol, tests, demo, roadmap

Part of Supertext's translation plugins for open source CMSs. See also the [WordPress plugin](https://github.com/Supertext/supertext-wordpress-polylang), the [Drupal module](https://www.drupal.org/project/tmgmt_supertext_ai), the [Payload plugin](https://github.com/Supertext/Payload-Supertext-Translation) and the [Contao bundle](https://github.com/Supertext/Contao-Supertext-Translation).

[Changelog](CHANGELOG.md) · MIT licensed
