import { ref } from 'vue';
import { messages, type MessageKey } from './messages.js';

export type { MessageKey } from './messages.js';

type Values = Record<string, string | number | null | undefined>;

const htmlLang = () => (typeof document === 'undefined' ? '' : document.documentElement.lang);

/**
 * The user's Directus language. Directus sets `<html lang>` together with its own locale
 * whenever it applies the user's language; a MutationObserver mirrors it into this ref so
 * our templates re-render. `currentLanguage()` reads the attribute itself, so texts that
 * Directus re-reads when its locale changes (definition getters, option and overview
 * functions) are current even before the observer has run.
 */
export const language = ref(htmlLang() || 'en-US');

export function currentLanguage(): string {
	const tracked = language.value; // keeps Vue's dependency tracking
	return htmlLang() || tracked;
}

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
	new MutationObserver(() => {
		language.value = htmlLang() || 'en-US';
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

/** `de-CH` → German, `fr-CA` → French, anything else → English. */
export function messagesFor(lang: string) {
	const primary = lang.toLowerCase().split(/[-_]/)[0] as keyof typeof messages;
	return messages[primary] ?? messages.en;
}

export function format(text: string, values: Values = {}): string {
	return text.replace(/\{(\w+)\}/g, (match, name: string) => (values[name] == null ? match : String(values[name])));
}

/** A string in the user's current Directus language. */
export function t(key: MessageKey, values?: Values, lang = currentLanguage()): string {
	return format(messagesFor(lang)[key] ?? messages.en[key], values);
}

/** An API error in the user's language: by `key` (or `error.<code>`), else the API's English message. */
export function errorText(error: { message?: string; key?: string; code?: string; values?: Values }, lang = currentLanguage()): string {
	const key = (error.key ?? (error.code ? `error.${error.code}` : '')) as MessageKey;
	if (!(key in messages.en)) return error.message ?? '';
	const text = t(key, error.values, lang);
	const detail = error.values?.detail;
	return detail && !messages.en[key].includes('{detail}') ? `${text} (${detail})` : text;
}

/** Reads `{ errors: [{ message, extensions: { code, key, values } }] }` from a failed API call. */
export function apiErrorText(e: unknown): string {
	const err = e as { response?: { data?: { errors?: { message?: string; extensions?: { code?: string; key?: string; values?: Values } }[] } }; message?: string };
	const first = err?.response?.data?.errors?.[0];
	if (!first) return err?.message ?? String(e);
	return errorText({ message: first.message, ...first.extensions });
}
