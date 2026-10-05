/**
 * Demo-only setup, run on every start of the demo (idempotent, never changes existing data):
 *
 * - DEMO_ADMIN_* / DEMO_EDITOR_* accounts (the editor gets an "Editor" role that can edit articles
 *   in every language; Directus has no built-in editor role)
 * - languages en-US, de-CH, fr-CH, it-CH
 * - an "Articles" collection with a Translations field (title, slug, summary, rich-text body)
 *   and the Supertext Translation interface
 * - one English sample article
 */

const LANGUAGES = [
  { code: 'en-US', name: 'English', direction: 'ltr' },
  { code: 'de-CH', name: 'Deutsch (Schweiz)', direction: 'ltr' },
  { code: 'fr-CH', name: 'Français (Suisse)', direction: 'ltr' },
  { code: 'it-CH', name: 'Italiano (Svizzera)', direction: 'ltr' },
];

const SAMPLE = {
  status: 'published',
  translations: [
    {
      languages_code: 'en-US',
      title: 'Swiss chocolate, shipped worldwide',
      slug: 'swiss-chocolate-shipped-worldwide',
      summary: 'How a small family business in Bern brings handmade pralines to 40 countries.',
      body:
        '<h2>From Bern to the world</h2>' +
        '<p>Every praline is made by hand in our <strong>Bern</strong> workshop. Read more on <a href="https://www.supertext.com">our website</a>.</p>' +
        '<ul><li><p>Fresh ingredients from local farmers</p></li><li><p>Climate-neutral delivery within 48 hours</p></li></ul>',
    },
  ],
};

export default ({ action }, { services, getSchema, database, logger, env }) => {
  action('server.start', async () => {
    try {
      await setup({ services, getSchema, database, logger, env });
    } catch (error) {
      logger.error(`[demo] setup failed: ${error?.message ?? error}`);
    }
  });
};

async function setup({ services, getSchema, database, logger, env }) {
  const log = (message) => logger.info(`[demo] ${message}`);
  let schema = await getSchema({ database });

  // ---------------------------------------------------------------- data model
  if (!schema.collections.languages) {
    await new services.CollectionsService({ schema, knex: database }).createOne({
      collection: 'languages',
      meta: { icon: 'translate', display_template: '{{name}}', sort_field: null },
      schema: {},
      fields: [
        { field: 'code', type: 'string', schema: { is_primary_key: true, length: 32 }, meta: { interface: 'input', width: 'half' } },
        { field: 'name', type: 'string', meta: { interface: 'input', width: 'half' } },
        { field: 'direction', type: 'string', schema: { default_value: 'ltr' }, meta: { interface: 'select-dropdown', options: { choices: [{ text: 'LTR', value: 'ltr' }, { text: 'RTL', value: 'rtl' }] } } },
      ],
    });
    log('languages collection created');
    schema = await getSchema({ database });
  }

  const languages = new services.ItemsService('languages', { schema, knex: database });
  for (const language of LANGUAGES) {
    if (!(await languages.readOne(language.code).catch(() => null))) {
      await languages.createOne(language);
      log(`language ${language.code} added`);
    }
  }

  if (!schema.collections.articles) {
    const collections = new services.CollectionsService({ schema, knex: database });
    await collections.createOne({
      collection: 'articles',
      meta: { icon: 'article', display_template: '{{translations.title}}', translations: null, note: 'Demo content, translated with Supertext' },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true }, meta: { hidden: true, readonly: true } },
        {
          field: 'status', type: 'string', schema: { default_value: 'draft' },
          meta: { interface: 'select-dropdown', width: 'half', sort: 1, display: 'labels', options: { choices: [{ text: 'Published', value: 'published' }, { text: 'Draft', value: 'draft' }] } },
        },
        { field: 'translations', type: 'alias', meta: { special: ['translations'], interface: 'translations', options: { languageField: 'name', defaultLanguage: 'en-US', userLanguage: true }, sort: 3 } },
        { field: 'supertext', type: 'alias', meta: { special: ['alias', 'no-data'], interface: 'supertext-translate', sort: 2, width: 'full' } },
      ],
    });
    await collections.createOne({
      collection: 'articles_translations',
      meta: { hidden: true, icon: 'import_export' },
      schema: {},
      fields: [
        { field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true }, meta: { hidden: true } },
        { field: 'articles_id', type: 'integer', meta: { hidden: true } },
        { field: 'languages_code', type: 'string', schema: { max_length: 32 }, meta: { hidden: true } },
        { field: 'title', type: 'string', meta: { interface: 'input', width: 'full', required: true } },
        { field: 'slug', type: 'string', meta: { interface: 'input', width: 'full', options: { slug: true } } },
        { field: 'summary', type: 'text', meta: { interface: 'input-multiline', width: 'full' } },
        { field: 'body', type: 'text', meta: { interface: 'input-rich-text-html', width: 'full' } },
      ],
    });
    schema = await getSchema({ database });
    const relations = new services.RelationsService({ schema, knex: database });
    await relations.createOne({
      collection: 'articles_translations', field: 'articles_id', related_collection: 'articles',
      meta: { one_field: 'translations', junction_field: 'languages_code', sort_field: null },
      schema: { on_delete: 'SET NULL' },
    });
    schema = await getSchema({ database });
    await new services.RelationsService({ schema, knex: database }).createOne({
      collection: 'articles_translations', field: 'languages_code', related_collection: 'languages',
      meta: { one_field: null, junction_field: 'articles_id', sort_field: null },
      schema: { on_delete: 'SET NULL' },
    });
    log('articles collection created');
    schema = await getSchema({ database });
  }

  const articles = new services.ItemsService('articles', { schema, knex: database });
  if ((await articles.readByQuery({ limit: 1, fields: ['id'] })).length === 0) {
    await articles.createOne(SAMPLE);
    log('sample article added');
  }

  await showSupertextModule({ database, log });

  // ------------------------------------------------------------------ accounts
  const editorRole = await ensureEditorRole({ services, schema, database, log });
  const users = new services.UsersService({ schema, knex: database });
  const adminRole = (await database('directus_roles').where({ name: 'Administrator' }).first())?.id;

  for (const [prefix, role] of [['DEMO_ADMIN', adminRole], ['DEMO_EDITOR', editorRole]]) {
    const email = String(env[`${prefix}_EMAIL`] ?? '').trim();
    const password = String(env[`${prefix}_PASSWORD`] ?? '');
    if (!email || !password) {
      log(`${prefix}_EMAIL / ${prefix}_PASSWORD not set; skipping that account.`);
      continue;
    }
    if (await database('directus_users').whereRaw('LOWER(email) = ?', [email.toLowerCase()]).first()) {
      log(`${prefix}: account exists, left unchanged.`);
      continue;
    }
    try {
      await users.createOne({ email, password, role, first_name: 'Demo', last_name: prefix === 'DEMO_ADMIN' ? 'Admin' : 'Editor', status: 'active' });
      log(`${prefix}: account created.`);
    } catch (error) {
      // Directus checks the e-mail format and the project's password policy; the message names the rule.
      logger.warn(`[demo] ${prefix}: account not created (${error?.message ?? error}). Check ${prefix}_EMAIL / ${prefix}_PASSWORD.`);
    }
  }

  // The image starts Directus with a throwaway first admin when DEMO_ADMIN_* is missing; drop it once a real one exists.
  const installer = await database('directus_users').where('email', 'like', 'installer-%@example.com').first();
  const realAdmin = adminRole && (await database('directus_users').where({ role: adminRole, status: 'active' }).whereNot('email', 'like', 'installer-%@example.com').first());
  if (installer && realAdmin) {
    await users.deleteOne(installer.id);
    log('installer account removed');
  }
}

/** Directus' default module bar (12.x) plus the Supertext module before "Documentation". */
const DEFAULT_MODULE_BAR = [
  { type: 'module', id: 'content', enabled: true },
  { type: 'module', id: 'visual', enabled: false },
  { type: 'module', id: 'users', enabled: true },
  { type: 'module', id: 'files', enabled: true },
  { type: 'module', id: 'insights', enabled: true },
  { type: 'module', id: 'flows', enabled: true },
  { type: 'module', id: 'deployments', enabled: false },
  { type: 'link', id: 'docs', enabled: true, name: '$t:documentation', icon: 'help', url: 'https://directus.com/docs' },
  { type: 'module', id: 'settings', enabled: true, locked: true },
];

/** Custom modules only appear once enabled in Settings → Settings → Module Bar; the demo does that once. */
async function showSupertextModule({ database, log }) {
  const settings = await database('directus_settings').select('id', 'module_bar').first();
  let bar = settings?.module_bar;
  if (typeof bar === 'string') bar = JSON.parse(bar);
  bar = Array.isArray(bar) ? bar : DEFAULT_MODULE_BAR.map((item) => ({ ...item }));
  if (bar.some((item) => item.id === 'supertext')) return;
  const before = bar.findIndex((item) => item.id === 'docs' || item.id === 'settings');
  bar.splice(before === -1 ? bar.length : before, 0, { type: 'module', id: 'supertext', enabled: true });
  if (settings) await database('directus_settings').update({ module_bar: JSON.stringify(bar) }).where('id', settings.id);
  else await database('directus_settings').insert({ module_bar: JSON.stringify(bar) });
  log('Supertext module added to the module bar');
}

async function ensureEditorRole({ services, schema, database, log }) {
  const existing = await database('directus_roles').where({ name: 'Editor' }).first();
  if (existing) return existing.id;

  const policies = new services.PoliciesService({ schema, knex: database });
  const policy = await policies.createOne({ name: 'Editor', icon: 'edit', app_access: true, admin_access: false, description: 'Edit and translate articles in every language' });
  const roles = new services.RolesService({ schema, knex: database });
  const role = await roles.createOne({ name: 'Editor', icon: 'edit', description: 'Demo editor: articles in every language', policies: [{ policy }] });

  const permissions = new services.PermissionsService({ schema, knex: database });
  const rows = [];
  for (const collection of ['articles', 'articles_translations']) {
    for (const action of ['create', 'read', 'update']) rows.push({ policy, collection, action, fields: ['*'], permissions: {}, validation: {} });
  }
  rows.push({ policy, collection: 'languages', action: 'read', fields: ['*'], permissions: {}, validation: {} });
  for (const collection of ['directus_files', 'directus_folders']) rows.push({ policy, collection, action: 'read', fields: ['*'], permissions: {}, validation: {} });
  await permissions.createMany(rows);
  log('Editor role created');
  return role;
}
