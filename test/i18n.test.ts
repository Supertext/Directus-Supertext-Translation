import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorText, format, messagesFor, t } from '../src/i18n/index.js';
import { en, messages } from '../src/i18n/messages.js';
import { statusError, SupertextError } from '../src/shared/supertext-client.js';

const root = join(__dirname, '../src');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const all = (dir: string): string[] =>
	readdirSync(join(root, dir)).flatMap((name) => {
		const path = join(dir, name);
		return statSync(join(root, path)).isDirectory() ? all(path) : /\.(ts|vue)$/.test(name) ? [path] : [];
	});
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const urls = (text: string) => [...text.matchAll(/https:\/\/[^\s)]+/g)].map((m) => m[0]).sort();

describe('UI strings', () => {
	it('come in English, German, French and Italian', () => {
		expect(Object.keys(messages).sort()).toEqual(['de', 'en', 'fr', 'it']);
	});

	for (const lang of ['de', 'fr', 'it'] as const) {
		it(`${lang} has the English keys, placeholders and URLs`, () => {
			expect(Object.keys(messages[lang]).sort()).toEqual(Object.keys(en).sort());
			for (const [key, text] of Object.entries(en)) {
				const translated = messages[lang][key as keyof typeof en];
				expect(translated, key).not.toBe('');
				expect(placeholders(translated), key).toEqual(placeholders(text));
				expect(urls(translated), key).toEqual(urls(text));
				expect(translated.split('Supertext').length, key).toBe(text.split('Supertext').length);
			}
		});
	}

	it('has every key the app uses', () => {
		const used = all('.')
			.filter((file) => !file.startsWith('i18n'))
			.flatMap((file) => [...read(file).matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]!));
		expect(used.length).toBeGreaterThan(60);
		for (const key of used) expect(en, key).toHaveProperty([key]);
	});

	it('has a message for every API error key and Supertext error code', () => {
		const api = read('api/translator.ts') + read('endpoint/index.ts');
		const codes = [...api.matchAll(/TranslateError\([^;]*?, \d{3}, '(\w+)'(?:, \{[^}]*\})?(?:, '([\w.]+)')?/g)];
		expect(codes.length).toBeGreaterThan(8);
		for (const [, code, key] of codes) expect(en, key ?? code).toHaveProperty([key ?? `error.${code}`]);
		expect(en).toHaveProperty(['error.save_failed']);
		const union = read('shared/supertext-client.ts').match(/export type SupertextErrorCode =([\s\S]*?)\n\n/)![1]!;
		for (const [, code] of union.matchAll(/'(\w+)'/g)) expect(en, code).toHaveProperty([`supertext.${code}`]);
	});
});

describe('lookup', () => {
	it('picks the language by its primary subtag and falls back to English', () => {
		expect(messagesFor('de-CH')).toBe(messages.de);
		expect(messagesFor('fr-CA')).toBe(messages.fr);
		expect(messagesFor('it-IT')).toBe(messages.it);
		expect(messagesFor('es-ES')).toBe(messages.en);
		expect(t('panel.title', undefined, 'it-IT')).toBe('Traduci con Supertext');
		expect(format('{a} and {b}', { a: 1 })).toBe('1 and {b}');
	});

	it('translates API errors by key or code, keeps unknown ones and appends the detail', () => {
		const e = statusError(429, 'slow down');
		expect(errorText({ message: e.message, key: `supertext.${e.code}`, values: { detail: e.detail! } }, 'fr-FR')).toBe(
			'Trop de requêtes vers Supertext. Veuillez réessayer dans un instant. (slow down)',
		);
		expect(errorText({ message: 'x', code: 'no_source', values: { language: 'en-US' } }, 'de-DE')).toBe(
			'Es gibt keinen Text in en-US zum Übersetzen. Füllen Sie zuerst die Übersetzung in en-US aus und speichern Sie sie.',
		);
		expect(errorText({ message: 'x', key: 'error.save_failed', values: { detail: 'boom' } }, 'it')).toBe('Tradotto ma non salvato: boom');
		expect(errorText({ message: 'Directus says no', code: 'FORBIDDEN' }, 'de')).toBe('Directus says no');
		expect(new SupertextError('timeout', 'x').detail).toBeUndefined();
	});
});
