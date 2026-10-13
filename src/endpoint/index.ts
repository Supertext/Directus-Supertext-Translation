import { defineEndpoint } from '@directus/extensions-sdk';
import { readConfig } from '../api/config.js';
import { findTranslationsRelation, loadItem, translateItem, TranslateError } from '../api/translator.js';
import { SupertextClient } from '../shared/supertext-client.js';
import { politenessFor, targetCode } from '../shared/languages.js';
import { extensionVersion } from '../api/version.js';
import { Reporting, siteUrl } from '../api/reporting.js';

/**
 * /supertext/info       GET  ?collection=&item=&field=   languages, fields, whether a key is set
 * /supertext/translate  POST { collection, item, field?, source?, targets?, fields?, save? }
 * /supertext/status     GET  version, configuration and languages (admins; the Supertext module)
 * /supertext/test       POST cost-free check of the API key (admins)
 * /supertext/ping       GET  ?challenge=   public: the Commando Center's reachability check
 *
 * Both run with the signed-in user's permissions. `save` defaults to false: the item
 * form puts the translations into the form and the editor saves them.
 */
export default defineEndpoint({
	id: 'supertext',
	handler: (router, { services, getSchema, env, logger, database }) => {
		const reporting = new Reporting({ env, database, logger });
		/** Version report and key check on back-end requests (in the background, see api/reporting.ts). */
		const report = (req: any, config: ReturnType<typeof readConfig>) => reporting.inBackground('onRequest', config, siteUrl(env, req));

		// Public, no login: the Commando Center checks that the site is reachable. Only while version reports are on.
		router.get('/ping', (req: any, res: any) => {
			const answer = reporting.ping(req.query?.challenge);
			res.status(answer.status).set(answer.headers).send(answer.body);
		});

		const fail = (res: any, error: unknown) => {
			if (error instanceof TranslateError) {
				return res.status(error.status).json({ errors: [{ message: error.message, extensions: { code: error.code, key: error.key, values: error.values } }] });
			}
			const e = error as any;
			const status = typeof e?.status === 'number' ? e.status : 500;
			if (status >= 500) logger.error(`[supertext] ${e?.stack ?? e}`);
			return res.status(status).json({ errors: [{ message: e?.message ?? 'Unexpected error', extensions: { code: e?.code ?? 'INTERNAL' } }] });
		};

		const requireUser = (req: any) => {
			if (!req.accountability?.user) throw new TranslateError('Sign in to use Supertext.', 401, 'unauthenticated');
		};

		const requireAdmin = (req: any) => {
			requireUser(req);
			if (!req.accountability.admin) throw new TranslateError('Only administrators can do this.', 403, 'forbidden', {}, 'error.admin_only');
		};

		router.get('/status', async (req: any, res: any) => {
			try {
				requireAdmin(req);
				const schema = req.schema ?? (await getSchema());
				const config = readConfig(env);
				// Every languages collection used by a translations field, with its rows.
				const languageCollections = new Map<string, string>();
				for (const collection of Object.keys(schema.collections)) {
					try {
						const rel = findTranslationsRelation(schema, collection);
						languageCollections.set(rel.languages, rel.languagePk);
					} catch {
						// not a collection with translations
					}
				}
				const languages: { collection: string; code: string; name: string; target: string; politeness: string }[] = [];
				for (const [collection, pk] of languageCollections) {
					const rows: any[] = await new services.ItemsService(collection, { schema, accountability: req.accountability }).readByQuery({ limit: -1, sort: [pk] });
					for (const row of rows) {
						const code = String(row[pk]);
						languages.push({ collection, code, name: String(row.name ?? code), target: targetCode(code, config.languageMap), politeness: politenessFor(code, config.politeness) });
					}
				}
				report(req, config);
				res.json({
					data: {
						version: extensionVersion(),
						reports: { enabled: reporting.enabled, check: await reporting.lastCheck() },
						configured: config.apiKey !== '',
						baseUrl: config.baseUrl,
						concurrency: config.concurrency,
						timeoutSeconds: config.timeoutMs / 1000,
						languages,
					},
				});
			} catch (error) {
				fail(res, error);
			}
		});

		router.post('/test', async (req: any, res: any) => {
			try {
				requireAdmin(req);
				const config = readConfig(env);
				// The automatic key check (SDK): ok, invalid, missing, unreachable or error. Also reports a changed status.
				const result = await reporting.run('testConnection', config, siteUrl(env, req));
				const check = result?.check ?? (await new SupertextClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }).checkApiKey());
				res.json({ data: { ok: check.status === 'ok', check } });
			} catch (error) {
				fail(res, error);
			}
		});

		router.get('/info', async (req: any, res: any) => {
			try {
				requireUser(req);
				const { collection, item, field } = req.query as Record<string, string>;
				if (!collection) throw new TranslateError('"collection" is required.');
				const schema = req.schema ?? (await getSchema());
				const config = readConfig(env);
				report(req, config);
				const data = await loadItem(services, schema, req.accountability, collection, item && item !== '+' ? item : null, field || undefined);
				res.json({
					data: {
						configured: config.apiKey !== '',
						relation: data.relation,
						defaultSource: data.defaultSource,
						fields: data.fields,
						languages: data.languages,
					},
				});
			} catch (error) {
				fail(res, error);
			}
		});

		router.post('/translate', async (req: any, res: any) => {
			try {
				requireUser(req);
				const body = req.body ?? {};
				if (typeof body.collection !== 'string' || body.item === undefined || body.item === null || body.item === '') {
					throw new TranslateError('"collection" and "item" are required.');
				}
				const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
				const config = readConfig(env);
				const result = await translateItem({
					services,
					schema: req.schema ?? (await getSchema()),
					accountability: req.accountability,
					config,
					collection: body.collection,
					item: body.item,
					field: typeof body.field === 'string' && body.field ? body.field : undefined,
					source: typeof body.source === 'string' ? body.source : undefined,
					targets: list(body.targets),
					fields: list(body.fields),
					save: body.save === true,
				});
				for (const r of result.results) {
					if (!r.ok) logger.warn(`[supertext] ${body.collection}/${body.item} → ${r.language}: ${r.error}`);
				}
				const rejected = result.results.find((r) => !r.ok && r.code === 'authentication_failure');
				if (rejected) reporting.inBackground('authenticationFailed', config, siteUrl(env, req), Number(rejected.values?.status) || 401);
				else report(req, config);
				res.json({ data: result });
			} catch (error) {
				fail(res, error);
			}
		});
	},
});
