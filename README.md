# Supertext Translation for Directus

Translate Directus items with **Supertext AI**, right in the Data Studio.

Add the *Supertext Translation* field to any collection that uses Directus' **Translations** field. Editors open an item, tick the languages and click **Translate**: the texts of the source language go to Supertext in one request per language and come back as new or updated translations, which editors review in the usual Translations field.

- Works with Directus' own translations pattern (Translations field, junction collection, languages collection)
- Rich text (WYSIWYG) is sent as HTML: headings, bold, links and lists come back in place, and whole sentences are translated
- Slug fields are translated as words and turned back into URL slugs
- Existing translations are kept unless the editor explicitly chooses to overwrite them
- Formal or informal tone and custom Supertext language codes per language
- A *Supertext* module for administrators shows the configuration and tests the API key
- Directus permissions apply: editors can only translate what they may edit

![The Supertext Translation panel on an article in Directus](docs/images/translate-panel.png)

## Documentation

| Guide | For |
| --- | --- |
| [Installation guide](docs/INSTALLATION.md) | Administrators: requirements, install, API key, languages, settings, troubleshooting |
| [User guide](docs/USER_GUIDE.md) | Editors: translating, reviewing, what gets translated, error messages |
| [Developer guide](docs/DEVELOPER.md) | Architecture, API protocol, local development, tests, demo deployment, releases |

Quick start (Docker):

```dockerfile
FROM directus/directus:12
COPY --chown=node:node directus-extension-supertext-translation /directus/extensions/directus-extension-supertext-translation
# then set SUPERTEXT_API_KEY on the container
```

## Demo

`demo/` is a Directus 12 project with an English sample article and German, French and Italian (Switzerland), deployed to Railway from this repository. See the [developer guide](docs/DEVELOPER.md#demo-railway).

## Changelog and roadmap

See [CHANGELOG.md](CHANGELOG.md) and the [roadmap](docs/DEVELOPER.md#known-limitations--roadmap).

## License

MIT. © Supertext AG
