import { defineEndpoint } from '@directus/extensions-sdk';
import { readConfig } from '../api/config.js';
import { findTranslationsRelation, loadItem, translateItem, TranslateError } from '../api/translator.js';
import { SupertextClient, SupertextError } from '../shared/supertext-client.js';
import { politenessFor, targetCode } from '../shared/languages.js';

/**
 * /supertext/info       GET  ?collection=&item=&field=   languages, fields, whether a key is set
 * /supertext/translate  POST { collection, item, field?, source?, targets?, fields?, save? }
 * /supertext/status     GET  configuration and languages (admins; the Supertext module)
 * /supertext/test       POST cost-free check of the API key (admins)
 *
 * Both run with the signed-in user's permissions. `save` defaults to false: the item
 * form puts the translations into the form and the editor saves them.
 */
export default defineEndpoint({
	id: 'supertext',
	handler: (router, { services, getSchema, env, logger }) => {
		const fail = (res: any, error: unknown) => {
			if (error instanceof TranslateError) return res.status(error.status).json({ errors: [{ message: error.message, extensions: { code: error.code } }] });
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
			if (!req.accountability.admin) throw new TranslateError('Only administrators can do this.', 403, 'forbidden');
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
				res.json({
					data: {
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
				if (!config.apiKey) throw new TranslateError('No Supertext API key is configured (SUPERTEXT_API_KEY).', 400, 'not_configured');
				try {
					await new SupertextClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }).validateApiKey();
				} catch (error) {
					// Supertext's own 401/403 must not reach the app as a Directus 401 (that signs the admin out).
					if (error instanceof SupertextError) throw new TranslateError(error.message, 502, error.code);
					throw error;
				}
				res.json({ data: { ok: true } });
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
				const result = await translateItem({
					services,
					schema: req.schema ?? (await getSchema()),
					accountability: req.accountability,
					config: readConfig(env),
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
				res.json({ data: result });
			} catch (error) {
				fail(res, error);
			}
		});
	},
});
