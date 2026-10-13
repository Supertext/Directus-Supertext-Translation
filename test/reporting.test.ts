import { describe, expect, it } from 'vitest';
import { publicUrl, Reporting, siteUrl, versionReportsEnabled } from '../src/api/reporting.js';
import { readConfig } from '../src/api/config.js';

/** Just enough of Knex for the state table: hasTable/createTable and one key/value row. */
function fakeDatabase() {
	const rows = new Map<string, string>();
	let table = false;
	const db: any = (name: string) => {
		expect(name).toBe('supertext_state');
		return {
			where: ({ key }: { key: string }) => ({
				first: async () => (rows.has(key) ? { value: rows.get(key) } : undefined),
				update: async ({ value }: { value: string }) => (rows.has(key) ? (rows.set(key, value), 1) : 0),
			}),
			insert: async ({ key, value }: { key: string; value: string }) => void rows.set(key, value),
		};
	};
	db.schema = { hasTable: async () => table, createTable: async () => void (table = true) };
	return { db, rows };
}

const logger = { debug() {}, warn() {} };

/** fetch for both Supertext (GET features) and the center (POST report). */
function fakeFetch(features = 200) {
	const reports: any[] = [];
	const fetch = async (url: string, init?: RequestInit) => {
		if (String(url).endsWith('/features')) return new Response('{}', { status: features });
		reports.push(JSON.parse(String(init?.body)));
		return new Response('{"ok":true}', { status: 202 });
	};
	return { fetch, reports };
}

describe('settings', () => {
	it('reports are on by default and SUPERTEXT_VERSION_REPORTS=0 turns them off', () => {
		expect(versionReportsEnabled({}, {})).toBe(true);
		expect(versionReportsEnabled({}, { SUPERTEXT_VERSION_REPORTS: '0' })).toBe(false);
		expect(versionReportsEnabled({ SUPERTEXT_VERSION_REPORTS: false }, {})).toBe(false);
		expect(versionReportsEnabled({ SUPERTEXT_VERSION_REPORTS: 0 }, {})).toBe(false);
	});

	it('takes the site URL from PUBLIC_URL, else from the request', () => {
		expect(publicUrl({ PUBLIC_URL: 'https://cms.example.ch/' })).toBe('https://cms.example.ch');
		expect(publicUrl({ PUBLIC_URL: '/' })).toBeNull();
		const req = { protocol: 'https', get: (h: string) => (h === 'host' ? 'cms.example.ch' : undefined) };
		expect(siteUrl({}, req)).toBe('https://cms.example.ch');
		expect(siteUrl({})).toBeNull();
	});
});

describe('Reporting', () => {
	const config = readConfig({ SUPERTEXT_API_KEY: 'k1' }, {});

	it('checks the key, reports the installation once and keeps the state', async () => {
		const { db, rows } = fakeDatabase();
		const { fetch, reports } = fakeFetch();
		const reporting = new Reporting({ env: {}, database: db, logger, reporterOverrides: { fetch, reportUrl: 'https://center.test/api/v1/report', clientOptions: { fetch } } });
		const first = await reporting.run('onRequest', config, 'https://cms.example.ch');
		expect(first?.event).toBe('installed');
		expect(first?.check?.status).toBe('ok');
		expect(reports[0]).toMatchObject({ event: 'installed', plugin: { name: 'Directus-Supertext-Translation' }, system: { name: 'Directus' }, callback: { url: 'https://cms.example.ch/supertext/ping' } });
		expect(JSON.stringify(reports)).not.toContain('k1');
		expect(rows.get('reporter')).toContain('"reportedKeyStatus":"ok"');
		// Nothing changed: no second report, no second key check.
		const second = await reporting.run('onRequest', config, 'https://cms.example.ch');
		expect(second?.event).toBeNull();
		expect(reports).toHaveLength(1);
		expect((await reporting.lastCheck())?.status).toBe('ok');
	});

	it('marks the key invalid after a 401 and reports the change once', async () => {
		const { db } = fakeDatabase();
		const { fetch, reports } = fakeFetch();
		const reporting = new Reporting({ env: {}, database: db, logger, reporterOverrides: { fetch, reportUrl: 'https://center.test/r', clientOptions: { fetch } } });
		await reporting.run('onRequest', config, 'https://cms.example.ch');
		await reporting.run('authenticationFailed', config, 'https://cms.example.ch', 401);
		await reporting.run('authenticationFailed', config, 'https://cms.example.ch', 401);
		expect(reports.map((r) => r.event)).toEqual(['installed', 'api_key_check']);
		expect(reports[1].api_key_check).toMatchObject({ status: 'invalid', http_status: 401 });
	});

	it('sends nothing with reports off, but still checks the key', async () => {
		const { db } = fakeDatabase();
		const { fetch, reports } = fakeFetch(403);
		const reporting = new Reporting({ env: { SUPERTEXT_VERSION_REPORTS: '0' }, database: db, logger, reporterOverrides: { enabled: false, fetch, clientOptions: { fetch } } });
		const result = await reporting.run('testConnection', config, 'https://cms.example.ch');
		expect(result?.check?.status).toBe('invalid');
		expect(reports).toHaveLength(0);
		expect(reporting.ping('abcdefghijklmnop1234').status).toBe(404);
	});

	it('answers the ping only for a valid challenge', () => {
		const { db } = fakeDatabase();
		const reporting = new Reporting({ env: {}, database: db, logger });
		const ok = reporting.ping('abcdefghijklmnop1234');
		expect(ok.status).toBe(200);
		expect(JSON.parse(ok.body)).toEqual({ ok: true, plugin: 'Directus-Supertext-Translation', challenge: 'abcdefghijklmnop1234' });
		expect(reporting.ping('short').status).toBe(400);
		expect(reporting.ping(['x']).status).toBe(400);
	});

	it('never throws when the database fails', async () => {
		const db: any = () => {
			throw new Error('db down');
		};
		db.schema = { hasTable: async () => true };
		const reporting = new Reporting({ env: {}, database: db, logger });
		await expect(reporting.run('onRequest', config, 'https://cms.example.ch')).resolves.toBeNull();
		await expect(reporting.lastCheck()).resolves.toBeNull();
	});
});
