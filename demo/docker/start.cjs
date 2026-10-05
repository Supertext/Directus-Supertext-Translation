#!/usr/bin/env node
'use strict';
/**
 * Demo start: on a shared Postgres server, use (and create if needed) a database of
 * its own, then hand over to the image's normal entrypoint (bootstrap + start).
 *
 *   DEMO_DATABASE_URL   postgresql://user:pass@host:5432/anydb   (e.g. Railway's DATABASE_URL)
 *   DEMO_DATABASE_NAME  database for Directus (default: directus)
 *
 * Without DEMO_DATABASE_URL the DB_* variables are used as they are.
 */
const { createRequire } = require('node:module');
const { realpathSync } = require('node:fs');

async function main() {
	const serverUrl = process.env.DEMO_DATABASE_URL;
	if (serverUrl) {
		const name = process.env.DEMO_DATABASE_NAME || 'directus';
		if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('DEMO_DATABASE_NAME may only contain a-z, 0-9 and _.');
		const api = realpathSync(require.resolve('/directus/node_modules/@directus/api/package.json'));
		const { Client } = createRequire(api)('pg');
		const client = new Client({ connectionString: serverUrl });
		for (let attempt = 1; ; attempt++) {
			try {
				await client.connect();
				break;
			} catch (error) {
				if (attempt >= 30) throw error;
				console.log(`Waiting for the database... (${error.message})`);
				await new Promise((r) => setTimeout(r, 2000));
			}
		}
		const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
		if (exists.rowCount === 0) {
			await client.query(`CREATE DATABASE "${name}"`);
			console.log(`Created the database "${name}".`);
		}
		await client.end();
		const url = new URL(serverUrl);
		url.pathname = `/${name}`;
		process.env.DB_CLIENT = 'pg';
		process.env.DB_CONNECTION_STRING = url.toString();
	}
	require('/directus/docker-entrypoint.cjs');
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
