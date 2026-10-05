#!/usr/bin/env node
'use strict';

/**
 * Demo container start (runs before Directus' own docker-entrypoint.cjs):
 *
 * - DATABASE_URL (Railway's PostgreSQL) → DB_CLIENT=pg + DB_CONNECTION_STRING for the database
 *   DIRECTUS_DB_NAME (default "directus"), which is created on that server if missing.
 *   Without DATABASE_URL the demo uses SQLite inside the container (data is lost on redeploy).
 * - PUBLIC_URL from RAILWAY_PUBLIC_DOMAIN.
 * - The first admin of a fresh install: DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD, or, if they're not
 *   set, a throwaway "installer-…@example.com" admin with a random password that is never shown.
 *   It only exists so Directus' public "create admin" screen never appears; the demo hook removes
 *   it as soon as a real admin exists. Passwords are never logged.
 */

const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { realpathSync } = require('node:fs');
const { randomBytes } = require('node:crypto');

const env = { ...process.env };
const log = (message) => console.log(`[demo] ${message}`);

async function prepareDatabase() {
  if (!env.DATABASE_URL) {
    if (!env.DB_CLIENT) {
      env.DB_CLIENT = 'sqlite3';
      env.DB_FILENAME = env.DB_FILENAME || '/directus/database/data.db';
      log('DATABASE_URL not set; using SQLite inside the container.');
    }
    return;
  }
  const name = env.DIRECTUS_DB_NAME || 'directus';
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error('DIRECTUS_DB_NAME may only contain letters, digits and _.');

  const server = new URL(env.DATABASE_URL);
  const target = new URL(env.DATABASE_URL);
  target.pathname = `/${name}`;

  // pg ships with Directus (inside @directus/api's dependencies).
  const api = realpathSync(require.resolve('/directus/node_modules/@directus/api/package.json'));
  const { Client } = createRequire(api)('pg');
  for (let attempt = 1; ; attempt++) {
    const client = new Client({ connectionString: server.toString() });
    try {
      await client.connect();
      const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (exists.rowCount === 0) {
        await client.query(`CREATE DATABASE "${name}"`);
        log(`database ${name} created`);
      }
      await client.end();
      break;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt >= 10) throw new Error(`Could not prepare the database: ${error.message}`);
      log(`database not reachable yet (${error.message}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  env.DB_CLIENT = 'pg';
  env.DB_CONNECTION_STRING = target.toString();
  delete env.DATABASE_URL;
}

function prepareAdmin() {
  if (env.DEMO_ADMIN_EMAIL && env.DEMO_ADMIN_PASSWORD) {
    env.ADMIN_EMAIL = env.DEMO_ADMIN_EMAIL;
    env.ADMIN_PASSWORD = env.DEMO_ADMIN_PASSWORD;
  } else {
    env.ADMIN_EMAIL = `installer-${randomBytes(6).toString('hex')}@example.com`;
    env.ADMIN_PASSWORD = randomBytes(24).toString('base64url');
  }
}

async function main() {
  await prepareDatabase();
  prepareAdmin();
  if (!env.PUBLIC_URL && env.RAILWAY_PUBLIC_DOMAIN) env.PUBLIC_URL = `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  if (!env.SECRET) {
    env.SECRET = randomBytes(32).toString('hex');
    log('SECRET not set; using a random one (everyone is signed out on restart).');
  }
  env.PORT = env.PORT || '8055';

  const child = spawn(process.execPath, ['/directus/docker-entrypoint.cjs'], { stdio: 'inherit', env, cwd: '/directus' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
}

main().catch((error) => {
  console.error(`[demo] ${error.message}`);
  process.exit(1);
});
