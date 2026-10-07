import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import endpoint from '../src/endpoint/index.js';
import { extensionVersion } from '../src/api/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Registers the endpoint on a fake router and returns its GET /status handler. */
function statusHandler() {
	const routes: Record<string, (req: any, res: any) => Promise<void>> = {};
	const router: any = {
		get: (path: string, fn: any) => (routes[`GET ${path}`] = fn),
		post: (path: string, fn: any) => (routes[`POST ${path}`] = fn),
	};
	const config: any = typeof endpoint === 'function' ? { handler: endpoint } : endpoint;
	config.handler(router, { services: {}, getSchema: async () => ({ collections: {}, relations: [] }), env: {}, logger: { error() {}, warn() {} } });
	return routes['GET /status'];
}

function call(handler: any, req: any) {
	return new Promise<{ status: number; body: any }>((resolve) => {
		let status = 200;
		const res: any = { status: (s: number) => ((status = s), res), json: (body: any) => resolve({ status, body }) };
		handler(req, res);
	});
}

describe('GET /supertext/status', () => {
	it('returns the version from package.json', async () => {
		const { status, body } = await call(statusHandler(), { accountability: { user: 'u1', admin: true } });
		expect(status).toBe(200);
		expect(body.data.version).toBe(pkg.version);
		expect(body.data.languages).toEqual([]);
	});

	it('refuses non-admins', async () => {
		const { status } = await call(statusHandler(), { accountability: { user: 'u1', admin: false } });
		expect(status).toBe(403);
	});
});

describe('extensionVersion', () => {
	it('finds the package.json above the built bundle', () => {
		expect(extensionVersion(new URL('../dist', import.meta.url).pathname)).toBe(pkg.version);
	});

	it('is null outside the package', () => {
		expect(extensionVersion('/')).toBeNull();
	});
});
