import { LanguageCodes } from 'supertext-sdk';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/api/config.js';

/**
 * Directus language codes → Supertext codes, as the translator and the Supertext page use
 * them: the SDK's LanguageCodes with SUPERTEXT_LANGUAGE_MAP as overrides. (The SDK client
 * itself is tested in its own repository.)
 */
describe('language codes', () => {
	it('sends the source as a bare language', () => {
		expect(LanguageCodes.source('en')).toBe('en');
		expect(LanguageCodes.source('de-CH')).toBe('de');
		expect(LanguageCodes.source('pt_BR')).toBe('pt');
		expect(LanguageCodes.source('EN-us')).toBe('en');
	});

	it('gives a bare target its default region', () => {
		expect(LanguageCodes.target('de')).toBe('de-DE');
		expect(LanguageCodes.target('en')).toBe('en-US');
		expect(LanguageCodes.target('sl')).toBe('sl-SI');
		expect(LanguageCodes.target('ZH')).toBe('zh-CN');
	});

	it('keeps a regional target and normalizes case and underscores', () => {
		expect(LanguageCodes.target('de-CH')).toBe('de-CH');
		expect(LanguageCodes.target('de_ch')).toBe('de-CH');
		expect(LanguageCodes.target('fr-ch')).toBe('fr-CH');
		expect(LanguageCodes.target('zh-hant')).toBe('zh-Hant');
		expect(LanguageCodes.target('es-419')).toBe('es-419');
	});

	it('lets SUPERTEXT_LANGUAGE_MAP win', () => {
		const { languageMap } = readConfig({}, { SUPERTEXT_LANGUAGE_MAP: '{"ch":"de-CH","de":"de-AT"}' });
		expect(LanguageCodes.target('ch', languageMap)).toBe('de-CH');
		expect(LanguageCodes.target('de', languageMap)).toBe('de-AT');
		expect(LanguageCodes.source('ch', languageMap)).toBe('de');
		expect(LanguageCodes.target('fr', languageMap)).toBe('fr-FR');
	});

	it('sends unknown bare codes unchanged', () => {
		expect(LanguageCodes.target('xx')).toBe('xx');
		expect(LanguageCodes.target('ch')).toBe('ch');
	});
});
