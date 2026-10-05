import { defineEndpoint } from '@directus/extensions-sdk';
import { readConfig } from '../api/config.js';
import { loadItem, translateItem, TranslateError } from '../api/translator.js';

/**
 * /supertext/info       GET  ?collection=&item=&field=   languages, fields, whether a key is set
 * /supertext/translate  POST { collection, item, field?, source?, targets?, fields?, save? }
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
