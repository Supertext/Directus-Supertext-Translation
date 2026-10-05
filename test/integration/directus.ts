import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(root, 'test/integration/node_modules/directus/cli.js');

export const ADMIN = { email: 'demo-admin@example.com', password: 'admin-pass-123' };
export const EDITOR = { email: 'demo-editor@example.com', password: 'editor-pass-123' };

export type Directus = { url: string; stop(): Promise<void>; log(): string };

/**
 * A real Directus 12 on SQLite in a temp folder, with this repo's built bundle and the
 * demo setup hook (languages, articles, Editor role and accounts).
 */
export async function startDirectus(env: Record<string, string>): Promise<Directus> {
	const dir = mkdtempSync(join(tmpdir(), 'directus-supertext-'));
	const extensions = join(dir, 'extensions');
	mkdirSync(extensions);
	symlinkSync(root, join(extensions, 'directus-extension-supertext-translation'));
	symlinkSync(join(root, 'demo/extensions/directus-extension-demo-setup'), join(extensions, 'directus-extension-demo-setup'));
	mkdirSync(join(dir, 'uploads'));
	// Directus reads package extensions from the project's package.json.
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'directus-integration-test', private: true, type: 'module' }));

	const port = 18000 + Math.floor(Math.random() * 2000);
	const fullEnv: Record<string, string> = {
		...(process.env as Record<string, string>),
		HOST: '127.0.0.1',
		PORT: String(port),
		PUBLIC_URL: `http://127.0.0.1:${port}`,
		DB_CLIENT: 'sqlite3',
		DB_FILENAME: join(dir, 'data.db'),
		SECRET: 'integration-test-secret-0123456789',
		STORAGE_LOCAL_ROOT: join(dir, 'uploads'),
		EXTENSIONS_PATH: extensions,
		TELEMETRY: 'false',
		LOG_LEVEL: 'info',
		RATE_LIMITER_ENABLED: 'false',
		CACHE_ENABLED: 'false',
		DEMO_ADMIN_EMAIL: ADMIN.email,
		DEMO_ADMIN_PASSWORD: ADMIN.password,
		DEMO_EDITOR_EMAIL: EDITOR.email,
		DEMO_EDITOR_PASSWORD: EDITOR.password,
		...env,
	};
	execFileSync(process.execPath, [cli, 'bootstrap'], { cwd: dir, env: fullEnv, stdio: 'pipe' });

	let output = '';
	const child: ChildProcess = spawn(process.execPath, [cli, 'start'], { cwd: dir, env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'] });
	child.stdout!.on('data', (d) => (output += d));
	child.stderr!.on('data', (d) => (output += d));

	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 60_000;
	for (;;) {
		try {
			const res = await fetch(`${url}/server/ping`);
			// The demo hook runs on start; wait until the editor account exists.
			if (res.ok && /Created the editor account|Account from DEMO_EDITOR_EMAIL exists/.test(output)) break;
		} catch {
			// not up yet
		}
		if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Directus did not start:\n${output}`);
		await new Promise((r) => setTimeout(r, 300));
	}

	return {
		url,
		log: () => output,
		async stop() {
			child.kill('SIGTERM');
			await new Promise((r) => setTimeout(r, 500));
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

export async function login(url: string, user: { email: string; password: string }): Promise<string> {
	const res = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(user) });
	const json = (await res.json()) as any;
	if (!json.data?.access_token) throw new Error(`Login failed for ${user.email}: ${JSON.stringify(json)}`);
	return json.data.access_token;
}

export function client(url: string, token?: string) {
	const call = async (method: string, path: string, body?: unknown) => {
		const res = await fetch(url + path, {
			method,
			headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await res.text();
		return { status: res.status, json: text ? (JSON.parse(text) as any) : null };
	};
	return {
		get: (p: string) => call('GET', p),
		post: (p: string, b?: unknown) => call('POST', p, b),
		patch: (p: string, b?: unknown) => call('PATCH', p, b),
		del: (p: string) => call('DELETE', p),
	};
}
