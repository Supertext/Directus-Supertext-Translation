/**
 * Finds the parts of Directus' translations pattern for a collection:
 *
 *   articles.translations (alias, special "translations")
 *     → junction articles_translations (articles_id → articles, languages_code → languages)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface TranslationsField {
  collection: string;
  parentPrimary: string;
  field: string;
  junction: string;
  junctionPrimary: string;
  parentField: string;
  languageField: string;
  languagesCollection: string;
  languagesPrimary: string;
}

export function describeTranslations(schema: any, collection: string, fieldName?: string): TranslationsField {
  const parent = schema?.collections?.[collection];
  if (!parent) throw new TranslationError(`Unknown collection ${collection}.`, 404);

  const fields = Object.values(parent.fields ?? {}) as any[];
  const field = fields.find((f) => (f.special ?? []).includes('translations') && (!fieldName || f.field === fieldName));
  if (!field) throw new TranslationError(`The collection ${collection} has no Translations field.`, 400);

  const relations = (schema.relations ?? []) as any[];
  const toParent = relations.find((r) => r.related_collection === collection && r.meta?.one_field === field.field);
  if (!toParent) throw new TranslationError(`The Translations field of ${collection} has no junction collection.`, 400);

  const junction = toParent.collection as string;
  const languageField = toParent.meta?.junction_field as string;
  const toLanguages = relations.find((r) => r.collection === junction && r.field === languageField);
  if (!languageField || !toLanguages?.related_collection) {
    throw new TranslationError(`The Translations field of ${collection} has no languages collection.`, 400);
  }

  const languagesCollection = toLanguages.related_collection as string;
  return {
    collection,
    parentPrimary: parent.primary,
    field: field.field,
    junction,
    junctionPrimary: schema.collections[junction]?.primary ?? 'id',
    parentField: toParent.field,
    languageField,
    languagesCollection,
    languagesPrimary: schema.collections[languagesCollection]?.primary ?? 'code',
  };
}
