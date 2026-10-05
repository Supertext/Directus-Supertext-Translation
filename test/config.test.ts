import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/api/config.js';

describe('readConfig', () => {
	it('reads JSON settings even after Directus split them at commas', () => {
		const json = '{"de-CH":"more","fr-CH":"less"}';
		const config = readConfig({ SUPERTEXT_POLITENESS: json.split(',') }, {});
		expect(config.politeness).toEqual({ 'de-CH': 'more', 'fr-CH': 'less' });
	});

	it('prefers the raw process variables over Directus’ cast values', () => {
		const config = readConfig(
			{ SUPERTEXT_API_KEY: 123, SUPERTEXT_LANGUAGE_MAP: ['{"de":"de-CH"', '"fr":"fr-CH"}'] },
			{ SUPERTEXT_API_KEY: '0123', SUPERTEXT_LANGUAGE_MAP: '{"de":"de-CH","fr":"fr-CH"}' },
		);
		expect(config.apiKey).toBe('0123');
		expect(config.languageMap).toEqual({ de: 'de-CH', fr: 'fr-CH' });
	});

	it('uses the environment or an explicit URL', () => {
		expect(readConfig({ SUPERTEXT_ENVIRONMENT: 'staging' }, {}).baseUrl).toContain('staging');
		expect(readConfig({ SUPERTEXT_API_URL: 'http://127.0.0.1:8765/v1/' }, {}).baseUrl).toBe('http://127.0.0.1:8765/v1/');
	});
});
