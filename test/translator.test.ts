import { describe, expect, it } from 'vitest';
import { languages, slugify, translate, type Context } from '../src/endpoint/translator';
import { describeTranslations } from '../src/endpoint/schema';
import { readConfig, targetCode, politeness } from '../src/shared/config';
import type { SupertextClient } from '../src/shared/client';

/** The schema overview Directus builds for the demo's Articles collection. */
const schema = {
  collections: {
    articles: { primary: 'id', fields: { id: { field: 'id', special: [] }, translations: { field: 'translations', special: ['translations'] } } },
    articles_translations: { primary: 'id', fields: {} },
    languages: { primary: 'code', fields: {} },
  },
  relations: [
    { collection: 'articles_translations', field: 'articles_id', related_collection: 'articles', meta: { one_field: 'translations', junction_field: 'languages_code' } },
    { collection: 'articles_translations', field: 'languages_code', related_collection: 'languages', meta: { one_field: null, junction_field: 'articles_id' } },
  ],
};

const fieldMeta = [
  { field: 'id', type: 'integer', meta: { special: null } },
  { field: 'articles_id', type: 'integer', meta: {} },
  { field: 'languages_code', type: 'string', meta: {} },
  { field: 'title', type: 'string', meta: { interface: 'input' } },
  { field: 'slug', type: 'string', meta: { interface: 'input', options: { slug: true } } },
  { field: 'summary', type: 'text', meta: { interface: 'input-multiline' } },
  { field: 'body', type: 'text', meta: { interface: 'input-rich-text-html' } },
  { field: 'color', type: 'string', meta: { interface: 'select-color' } },
  { field: 'image', type: 'uuid', meta: { interface: 'file-image', special: ['file'] } },
];

function setup(rows: Record<string, any>[]) {
  const db: Record<string, Record<string, any>[]> = {
    articles: [{ id: 1 }],
    articles_translations: rows,
    languages: [
      { code: 'de-CH', name: 'Deutsch (Schweiz)' },
      { code: 'en-US', name: 'English' },
      { code: 'fr-CH', name: 'Français (Suisse)' },
    ],
  };
  const calls: { html: string; target: string; source?: string; politeness?: string }[] = [];
  class ItemsService {
    constructor(private collection: string) {}
    async readOne(id: unknown) {
      const row = db[this.collection]!.find((r) => r.id === id || r.code === id);
      if (!row) throw new Error('Forbidden');
      return row;
    }
    async readByQuery(query: any) {
      const [field, cond] = Object.entries(query.filter ?? {})[0] ?? [];
      return db[this.collection]!.filter((r) => !field || r[field as string] === (cond as any)._eq);
    }
    async createOne(data: any) {
      const row = { id: db[this.collection]!.length + 10, ...data };
      db[this.collection]!.push(row);
      return row.id;
    }
    async updateOne(id: unknown, data: any) {
      Object.assign(db[this.collection]!.find((r) => r.id === id)!, data);
      return id;
    }
  }
  class FieldsService {
    async readAll() {
      return fieldMeta;
    }
  }
  const client = {
    async translateDocument(html: string, options: any) {
      calls.push({ html, target: options.targetLanguage, source: options.sourceLanguage, politeness: options.politeness });
      return html.replace(/>([^<>]+)</g, (m, text: string) => (text.trim() ? `>[${options.targetLanguage}] ${text}<` : m));
    },
  } as unknown as SupertextClient;
  const ctx: Context = {
    services: { ItemsService, FieldsService },
    schema,
    accountability: { user: 'u1' },
    config: readConfig({ SUPERTEXT_API_KEY: 'k', SUPERTEXT_LANGUAGES: '{"fr-CH":{"politeness":"more"}}' }),
    client: () => client,
  };
  return { ctx, db, calls };
}

const english = {
  id: 1,
  articles_id: 1,
  languages_code: 'en-US',
  title: 'Swiss chocolate',
  slug: 'swiss-chocolate-shipped-worldwide',
  summary: 'Line one\nLine two',
  body: '<p>Made in <strong>Bern</strong>. <a href="https://www.supertext.com">More</a></p>',
  color: '#ff0000',
  image: 'file-1',
};

describe('describeTranslations', () => {
  it('finds the junction, language field and languages collection', () => {
    expect(describeTranslations(schema, 'articles')).toMatchObject({
      junction: 'articles_translations',
      parentField: 'articles_id',
      languageField: 'languages_code',
      languagesCollection: 'languages',
      languagesPrimary: 'code',
    });
  });

  it('explains collections without translations', () => {
    expect(() => describeTranslations({ collections: { pages: { primary: 'id', fields: {} } }, relations: [] }, 'pages')).toThrow(/no Translations field/);
  });
});

describe('languages', () => {
  it('lists every language and marks the existing ones', async () => {
    const { ctx } = setup([{ ...english }]);
    const data = await languages(ctx, 'articles', 1);
    expect(data.source).toBe('en-US');
    expect(data.languages.map((l) => [l.code, l.exists])).toEqual([['de-CH', false], ['en-US', true], ['fr-CH', false]]);
  });
});

describe('translate', () => {
  it('creates translations with markup, line breaks, slug and copied fields', async () => {
    const { ctx, db, calls } = setup([{ ...english }]);
    const results = await translate(ctx, 'articles', 1, { targets: ['de-CH'], overwrite: false });
    expect(results).toEqual([{ language: 'de-CH', status: 'created' }]);

    const german = db.articles_translations!.find((r) => r.languages_code === 'de-CH')!;
    expect(german).toMatchObject({
      articles_id: 1,
      title: '[de-CH] Swiss chocolate',
      slug: 'de-ch-swiss-chocolate-shipped-worldwide',
      summary: '[de-CH] Line one\n[de-CH] Line two',
      color: '#ff0000',
      image: 'file-1',
    });
    expect(german.body).toBe('<p>[de-CH] Made in <strong>[de-CH] Bern</strong>[de-CH] . <a href="https://www.supertext.com">[de-CH] More</a></p>');

    // One document, one data-st-id element per field; the color is not translated
    expect(calls).toHaveLength(1);
    expect(calls[0]!.html).toContain('<div data-st-id="3"><p>Made in');
    expect(calls[0]!.html).not.toContain('#ff0000');
    expect(calls[0]!.source).toBe('en-US');
  });

  it('skips existing translations unless asked to overwrite', async () => {
    const { ctx, db } = setup([{ ...english }, { id: 2, articles_id: 1, languages_code: 'fr-CH', title: 'Mon titre', color: '#00ff00' }]);
    expect(await translate(ctx, 'articles', 1, { targets: ['fr-CH'], overwrite: false })).toEqual([{ language: 'fr-CH', status: 'skipped' }]);
    expect(db.articles_translations![1]!.title).toBe('Mon titre');

    expect(await translate(ctx, 'articles', 1, { targets: ['fr-CH'], overwrite: true })).toEqual([{ language: 'fr-CH', status: 'updated' }]);
    expect(db.articles_translations![1]).toMatchObject({ title: '[fr-CH] Swiss chocolate', color: '#00ff00' });
  });

  it('passes politeness and reports errors per language', async () => {
    const { ctx, calls } = setup([{ ...english }]);
    const failing = ctx.client();
    let n = 0;
    ctx.client = () =>
      ({
        translateDocument: async (html: string, options: any) => {
          if (n++ === 0) throw new Error('Too many requests to Supertext.');
          return failing.translateDocument(html, options);
        },
      }) as unknown as SupertextClient;
    const results = await translate(ctx, 'articles', 1, { targets: ['de-CH', 'fr-CH'], overwrite: false });
    expect(results).toEqual([
      { language: 'de-CH', status: 'error', message: 'Too many requests to Supertext.' },
      { language: 'fr-CH', status: 'created' },
    ]);
    expect(calls.at(-1)!.politeness).toBe('more');
  });

  it('needs a source version', async () => {
    const { ctx } = setup([]);
    await expect(translate(ctx, 'articles', 1, { source: 'en-US', targets: ['de-CH'], overwrite: false })).rejects.toThrow(/no en-US version/);
  });
});

describe('config', () => {
  it('reads keys with prefix, environments and language overrides', () => {
    const config = readConfig({
      SUPERTEXT_API_KEY: ' Supertext-Auth-Key abc ',
      SUPERTEXT_ENVIRONMENT: 'staging',
      SUPERTEXT_LANGUAGES: { 'fr-FR': { code: 'fr-CH', politeness: 'less' } },
    });
    expect(config.apiKey).toBe('abc');
    expect(config.endpoint).toBe('https://api.staging.supertext.com/v1/');
    expect(targetCode(config, 'fr-FR')).toBe('fr-CH');
    expect(politeness(config, 'fr-FR')).toBe('less');
    expect(targetCode(config, 'de-CH')).toBe('de-CH');
    expect(readConfig({ SUPERTEXT_API_ENDPOINT: 'http://127.0.0.1:8765/v1/' }).endpoint).toBe('http://127.0.0.1:8765/v1/');
  });

  it('survives Directus splitting values with commas, and prefers the raw process variables', () => {
    const json = '{"de-CH":{"politeness":"more"},"fr-CH":{"politeness":"less"}}';
    // What Directus' env makes of that value: split at commas.
    const split = readConfig({ SUPERTEXT_LANGUAGES: json.split(',') }, {});
    expect(politeness(split, 'fr-CH')).toBe('less');
    const raw = readConfig({ SUPERTEXT_LANGUAGES: ['garbage'], SUPERTEXT_API_KEY: 123 }, { SUPERTEXT_LANGUAGES: json, SUPERTEXT_API_KEY: '0123' });
    expect(politeness(raw, 'de-CH')).toBe('more');
    expect(raw.apiKey).toBe('0123');
  });

  it('slugifies like a URL', () => {
    expect(slugify('Schweizer Schokolade, weltweit versandt')).toBe('schweizer-schokolade-weltweit-versandt');
    expect(slugify('Chocolat suisse, expédié dans le monde entier')).toBe('chocolat-suisse-expedie-dans-le-monde-entier');
  });
});
