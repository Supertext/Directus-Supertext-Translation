/**
 * Translates one item's "translations" field: reads the source-language row of the
 * junction collection, sends its text fields to Supertext as one HTML document per target
 * language, and creates or updates the target-language rows. All reads and writes go
 * through Directus' ItemsService with the editor's accountability, so Directus permissions
 * apply exactly as in the Data Studio.
 */
import { buildDocument, parseDocument, type Segment } from '../shared/html';
import { MAX_DOCUMENT_CHARACTERS, type SupertextClient } from '../shared/client';
import { politeness, targetCode, type Config } from '../shared/config';
import { TranslationError, describeTranslations, type TranslationsField } from './schema';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Services = { ItemsService: any; FieldsService: any };

export interface Context {
  services: Services;
  schema: any;
  accountability: any;
  config: Config;
  client: () => SupertextClient;
}

export interface LanguageInfo {
  code: string;
  name: string;
  exists: boolean;
  isSource: boolean;
}

export interface Result {
  language: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
}

/** Interfaces whose value is HTML (sent as HTML, so markup is kept). */
const HTML_INTERFACES = new Set(['input-rich-text-html']);
/** Interfaces that hold codes or structured data, never translated. */
const SKIP_INTERFACES = new Set(['input-code', 'select-dropdown', 'select-radio', 'select-icon', 'select-color', 'input-hash', 'boolean', 'datetime']);
/** Fields that are generated or relational lists: neither translated nor copied. */
const NO_COPY_SPECIALS = ['uuid', 'date-created', 'date-updated', 'user-created', 'user-updated', 'o2m', 'm2m', 'm2a', 'files', 'translations', 'alias', 'no-data'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

export async function languages(ctx: Context, collection: string, id: string | number): Promise<{ field: string; source: string; languages: LanguageInfo[] }> {
  const field = describeTranslations(ctx.schema, collection);
  const rows = await readRows(ctx, field, id);
  const existing = new Set(rows.map((row) => String(row[field.languageField])));
  const languagesService = new ctx.services.ItemsService(field.languagesCollection, { schema: ctx.schema, accountability: ctx.accountability });
  const all: any[] = await languagesService.readByQuery({ limit: -1, sort: [field.languagesPrimary] });
  const source = pickSource(ctx.config, [...existing], all.map((l) => String(l[field.languagesPrimary])));
  return {
    field: field.field,
    source,
    languages: all.map((language) => {
      const code = String(language[field.languagesPrimary]);
      return { code, name: String(language.name ?? code), exists: existing.has(code), isSource: code === source };
    }),
  };
}

export async function translate(
  ctx: Context,
  collection: string,
  id: string | number,
  options: { source?: string; targets: string[]; overwrite: boolean },
): Promise<Result[]> {
  const field = describeTranslations(ctx.schema, collection);
  const rows = await readRows(ctx, field, id);
  const byLanguage = new Map(rows.map((row) => [String(row[field.languageField]), row]));
  const source = options.source || pickSource(ctx.config, [...byLanguage.keys()], []);
  const sourceRow = byLanguage.get(source);
  if (!sourceRow) {
    throw new TranslationError(`This item has no ${source || 'source'} version to translate from.`, 400);
  }

  const fields = await translatableFields(ctx, field);
  const segments: Segment[] = [];
  const keys: string[] = [];
  const slugs = new Set<string>();
  for (const { name, html, slug } of fields.translate) {
    const value = sourceRow[name];
    if (typeof value !== 'string' || value.trim() === '') continue;
    if (slug) {
      if (!SLUG.test(value)) continue;
      slugs.add(name);
      segments.push({ text: value.replace(/-/g, ' '), html: false });
    } else {
      segments.push({ text: value, html });
    }
    keys.push(name);
  }

  const junction = new ctx.services.ItemsService(field.junction, { schema: ctx.schema, accountability: ctx.accountability });
  const results: Result[] = [];

  for (const target of [...new Set(options.targets)]) {
    if (target === source) continue;
    const existing = byLanguage.get(target);
    if (existing && !options.overwrite) {
      results.push({ language: target, status: 'skipped' });
      continue;
    }
    try {
      const translated = segments.length ? await translateSegments(ctx, segments, source, target) : new Map<number, string>();
      const data: Record<string, unknown> = {};
      keys.forEach((name, index) => {
        const value = translated.get(index);
        if (value === undefined || value.trim() === '') return;
        data[name] = slugs.has(name) ? slugify(value) : value;
      });

      if (existing) {
        await junction.updateOne(existing[field.junctionPrimary], data);
        results.push({ language: target, status: 'updated' });
      } else {
        // A new translation starts as a copy of the source (images, numbers, …) with the texts translated.
        const copy: Record<string, unknown> = {};
        for (const name of fields.copy) copy[name] = sourceRow[name];
        await junction.createOne({ ...copy, ...data, [field.parentField]: id, [field.languageField]: target });
        results.push({ language: target, status: 'created' });
      }
    } catch (error) {
      results.push({ language: target, status: 'error', message: messageOf(error) });
    }
  }
  return results;
}

async function translateSegments(ctx: Context, segments: Segment[], source: string, target: string): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  // Keep each document below the API's size limit.
  const groups: number[][] = [[]];
  let size = 0;
  segments.forEach((segment, index) => {
    if (groups[groups.length - 1]!.length && size + segment.text.length > MAX_DOCUMENT_CHARACTERS) {
      groups.push([]);
      size = 0;
    }
    groups[groups.length - 1]!.push(index);
    size += segment.text.length;
  });

  for (const group of groups) {
    const part = group.map((i) => segments[i]!);
    const html = await ctx.client().translateDocument(buildDocument(part), {
      targetLanguage: targetCode(ctx.config, target),
      sourceLanguage: targetCode(ctx.config, source),
      politeness: politeness(ctx.config, target),
    });
    parseDocument(html, part).forEach((value, position) => result.set(group[position]!, value));
  }
  return result;
}

async function readRows(ctx: Context, field: TranslationsField, id: string | number): Promise<any[]> {
  const parent = new ctx.services.ItemsService(field.collection, { schema: ctx.schema, accountability: ctx.accountability });
  // Throws Forbidden if the editor may not read the item.
  await parent.readOne(id, { fields: [field.parentPrimary] });
  const junction = new ctx.services.ItemsService(field.junction, { schema: ctx.schema, accountability: ctx.accountability });
  return junction.readByQuery({ filter: { [field.parentField]: { _eq: id } }, fields: ['*'], limit: -1 });
}

async function translatableFields(ctx: Context, field: TranslationsField) {
  // Interfaces live in the fields' meta, which the schema overview doesn't carry.
  const fieldsService = new ctx.services.FieldsService({ schema: ctx.schema });
  const meta: any[] = await fieldsService.readAll(field.junction);
  const translate: { name: string; html: boolean; slug: boolean }[] = [];
  const copy: string[] = [];
  for (const f of meta) {
    const name = String(f.field);
    if ([field.junctionPrimary, field.parentField, field.languageField].includes(name)) continue;
    const special: string[] = f.meta?.special ?? [];
    if (f.type === 'alias' || special.some((s) => NO_COPY_SPECIALS.includes(s))) continue;
    const iface = String(f.meta?.interface ?? '');
    const isText = (f.type === 'string' || f.type === 'text') && special.length === 0 && !SKIP_INTERFACES.has(iface);
    if (isText) {
      translate.push({ name, html: HTML_INTERFACES.has(iface), slug: name === 'slug' || f.meta?.options?.slug === true });
    } else {
      copy.push(name);
    }
  }
  return { translate, copy };
}

function pickSource(config: Config, existing: string[], all: string[]): string {
  if (config.sourceLanguage && (existing.includes(config.sourceLanguage) || !existing.length)) return config.sourceLanguage;
  return existing[0] ?? all[0] ?? '';
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as Error).message);
  return String(error);
}
