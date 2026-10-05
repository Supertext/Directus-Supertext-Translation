import { defineEndpoint } from '@directus/extensions-sdk';
import { SupertextError } from '../shared/client';
import { createClient, readConfig, targetCode, politeness } from '../shared/config';
import { languages, translate, messageOf, type Context } from './translator';
import { TranslationError } from './schema';

/**
 * /supertext/status                         GET   configuration (admins)
 * /supertext/test                           POST  checks the API key (admins)
 * /supertext/languages/:collection/:id      GET   languages and which exist
 * /supertext/translate/:collection/:id      POST  { source?, targets: [], overwrite? }
 */
export default defineEndpoint({
  id: 'supertext',
  handler: (router, { services, env, logger }) => {
    const context = (req: any): Context => {
      const config = readConfig(env);
      return { services, schema: req.schema, accountability: req.accountability, config, client: () => createClient(config) };
    };

    const requireUser = (req: any, res: any): boolean => {
      if (!req.accountability?.user) {
        res.status(401).json({ errors: [{ message: 'You need to be logged in.' }] });
        return false;
      }
      return true;
    };

    const fail = (res: any, error: unknown) => {
      const status = error instanceof TranslationError ? error.status : (error as any)?.status ?? (error instanceof SupertextError ? 502 : 500);
      const message = messageOf(error);
      if (status >= 500) logger.error(`[supertext] ${message}`);
      res.status(status >= 400 && status < 600 ? status : 500).json({ errors: [{ message }] });
    };

    router.get('/status', async (req: any, res) => {
      if (!requireUser(req, res)) return;
      if (!req.accountability.admin) return res.status(403).json({ errors: [{ message: 'Admins only.' }] });
      const config = readConfig(env);
      const languagesService = new services.ItemsService('languages', { schema: req.schema, accountability: req.accountability });
      let list: any[] = [];
      try {
        list = await languagesService.readByQuery({ limit: -1, sort: ['code'] });
      } catch {
        list = [];
      }
      res.json({
        data: {
          apiKey: Boolean(config.apiKey),
          endpoint: config.endpoint,
          sourceLanguage: config.sourceLanguage,
          timeout: config.timeoutSeconds,
          languages: list.map((l) => ({ code: l.code, name: l.name ?? l.code, target: targetCode(config, l.code), politeness: politeness(config, l.code) })),
        },
      });
    });

    router.post('/test', async (req: any, res) => {
      if (!requireUser(req, res)) return;
      if (!req.accountability.admin) return res.status(403).json({ errors: [{ message: 'Admins only.' }] });
      try {
        const config = readConfig(env);
        if (!config.apiKey) throw new TranslationError('No Supertext API key is configured (SUPERTEXT_API_KEY).', 400);
        await createClient(config).validate();
        res.json({ data: { ok: true } });
      } catch (error) {
        fail(res, error);
      }
    });

    router.get('/languages/:collection/:id', async (req: any, res) => {
      if (!requireUser(req, res)) return;
      try {
        const data = await languages(context(req), req.params.collection, req.params.id);
        res.json({ data: { ...data, configured: Boolean(readConfig(env).apiKey) } });
      } catch (error) {
        fail(res, error);
      }
    });

    router.post('/translate/:collection/:id', async (req: any, res) => {
      if (!requireUser(req, res)) return;
      try {
        const ctx = context(req);
        if (!ctx.config.apiKey) throw new TranslationError('Supertext is not set up yet: the administrator needs to set SUPERTEXT_API_KEY.', 400);
        const body = req.body ?? {};
        const targets = Array.isArray(body.targets) ? body.targets.map(String) : [];
        if (!targets.length) throw new TranslationError('Choose at least one language.', 400);
        const results = await translate(ctx, req.params.collection, req.params.id, {
          source: body.source ? String(body.source) : undefined,
          targets,
          overwrite: body.overwrite === true,
        });
        res.json({ data: { results } });
      } catch (error) {
        fail(res, error);
      }
    });
  },
});
