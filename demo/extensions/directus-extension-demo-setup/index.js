/**
 * Demo site setup. Runs on every start and only adds what is missing:
 *
 * - languages: en-US (source), de-CH, fr-CH, it-CH
 * - "articles" with a translations field (title, summary, body) and the
 *   "Translate with Supertext" field, plus two English sample articles
 * - "Editor" role + policy: app access, articles in every language, the Supertext endpoint
 * - the extension's "Supertext" module in the module bar (custom modules start hidden)
 * - accounts from DEMO_ADMIN_EMAIL/PASSWORD (administrator) and
 *   DEMO_EDITOR_EMAIL/PASSWORD (editor); existing accounts are never changed
 *
 * Not part of the published extension.
 */

const LANGUAGES = [
	{ code: 'en-US', name: 'English', direction: 'ltr' },
	{ code: 'de-CH', name: 'Deutsch (Schweiz)', direction: 'ltr' },
	{ code: 'fr-CH', name: 'Français (Suisse)', direction: 'ltr' },
	{ code: 'it-CH', name: 'Italiano (Svizzera)', direction: 'ltr' },
];

const ARTICLES = [
	{
		status: 'published',
		translations: [
			{
				languages_code: 'en-US',
				title: 'Content that speaks every language',
				summary: 'How Supertext translates your Directus content while keeping its structure.',
				body:
					'<h2>Translate in one click</h2>' +
					'<p>Open an article, choose the languages and click <strong>Translate</strong>. The translations appear in the form, so you can <em>review them</em> before you save.</p>' +
					'<ul><li><p>Titles and summaries</p></li><li><p>Rich text with formatting and <a href="https://www.supertext.com">links</a></p></li><li><p>Markdown fields</p></li></ul>' +
					'<p>Every language gets its own translation row, exactly as if an editor had typed it.</p>',
			},
		],
	},
	{
		status: 'published',
		translations: [
			{
				languages_code: 'en-US',
				title: 'About Supertext',
				summary: 'A Swiss language company combining AI translation with expert linguists.',
				body:
					'<p>We are a Swiss language company. Our team combines AI translation with linguists who know your market &amp; your customers.</p>' +
					'<blockquote><p>Good translation is invisible: readers simply understand.</p></blockquote>' +
					'<p>Questions? Write to <a href="mailto:hello@supertext.com">hello@supertext.com</a>.</p>',
			},
		],
	},
];

const MIN_PASSWORD_LENGTH = 8;

export default ({ init }, { services, getSchema, logger, env }) => {
	init('app.after', async () => {
		try {
			await setup({ services, getSchema, logger, env });
		} catch (error) {
			logger.error(`[demo-setup] ${error?.stack ?? error}`);
		}
	});
};

async function setup({ services, getSchema, logger, env }) {
	const { CollectionsService, FieldsService, RelationsService, ItemsService, RolesService, PoliciesService, PermissionsService, UsersService, AccessService } = services;
	const ctx = async () => ({ schema: await getSchema(), accountability: null });

	// --- Schema --------------------------------------------------------------------------
	let schema = await getSchema();
	if (!schema.collections.languages) {
		await new CollectionsService(await ctx()).createOne({
			collection: 'languages',
			meta: { icon: 'translate', note: 'Languages of the website', display_template: '{{ name }} ({{ code }})', sort_field: null },
			schema: {},
			fields: [
				{ field: 'code', type: 'string', schema: { is_primary_key: true, length: 16 }, meta: { interface: 'input', options: { font: 'monospace' }, width: 'half', note: 'BCP 47 code, e.g. de-CH' } },
				{ field: 'name', type: 'string', meta: { interface: 'input', width: 'half' } },
				{ field: 'direction', type: 'string', schema: { default_value: 'ltr' }, meta: { interface: 'select-dropdown', options: { choices: [ { text: 'Left to right', value: 'ltr' }, { text: 'Right to left', value: 'rtl' } ] }, width: 'half' } },
			],
		});
		logger.info('[demo-setup] Created the "languages" collection.');
	}

	schema = await getSchema();
	if (!schema.collections.articles) {
		const collections = new CollectionsService(await ctx());
		await collections.createOne({
			collection: 'articles',
			meta: { icon: 'article', display_template: '{{ translations.title }}', sort_field: null },
			schema: {},
			fields: [
				{ field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true }, meta: { hidden: true } },
				{ field: 'status', type: 'string', schema: { default_value: 'draft' }, meta: { interface: 'select-dropdown', width: 'half', options: { choices: [ { text: 'Published', value: 'published' }, { text: 'Draft', value: 'draft' } ] }, display: 'labels' } },
			],
		});
		await collections.createOne({
			collection: 'articles_translations',
			meta: { hidden: true, icon: 'import_export' },
			schema: {},
			fields: [
				{ field: 'id', type: 'integer', schema: { is_primary_key: true, has_auto_increment: true }, meta: { hidden: true } },
				{ field: 'articles_id', type: 'integer', meta: { hidden: true } },
				{ field: 'languages_code', type: 'string', schema: { length: 16 }, meta: { hidden: true } },
				{ field: 'title', type: 'string', meta: { interface: 'input', width: 'full', required: true } },
				{ field: 'summary', type: 'text', meta: { interface: 'input-multiline', width: 'full' } },
				{ field: 'body', type: 'text', meta: { interface: 'input-rich-text-html', width: 'full', options: { toolbar: ['bold', 'italic', 'h2', 'h3', 'numlist', 'bullist', 'blockquote', 'link', 'removeformat', 'code'] } } },
			],
		});

		const fields = new FieldsService(await ctx());
		await fields.createField('articles', {
			field: 'translations',
			type: 'alias',
			meta: {
				special: ['translations'],
				interface: 'translations',
				options: { languageField: 'name', defaultLanguage: 'en-US', userLanguage: false },
				display: 'translations',
				display_options: { template: '{{ title }}', languageField: 'name', defaultLanguage: 'en-US', userLanguage: false },
				width: 'full',
				sort: 3,
			},
		});

		const relations = new RelationsService(await ctx());
		await relations.createOne({
			collection: 'articles_translations',
			field: 'articles_id',
			related_collection: 'articles',
			meta: { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' },
			schema: { on_delete: 'CASCADE' },
		});
		await relations.createOne({
			collection: 'articles_translations',
			field: 'languages_code',
			related_collection: 'languages',
			meta: { one_field: null, junction_field: 'articles_id', sort_field: null },
			schema: { on_delete: 'SET NULL' },
		});
		logger.info('[demo-setup] Created "articles" with a translations field.');
	}

	// Alias fields are not part of the schema overview; ask the fields service.
	const articleFields = (await new FieldsService(await ctx()).readAll('articles')).map((f) => f.field);
	if (!articleFields.includes('supertext')) {
		await new FieldsService(await ctx()).createField('articles', {
			field: 'supertext',
			type: 'alias',
			meta: {
				special: ['alias', 'no-data'],
				interface: 'supertext-translate',
				options: { translationsField: 'translations', sourceLanguage: 'en-US' },
				width: 'full',
				sort: 2,
			},
		});
		logger.info('[demo-setup] Added the "Translate with Supertext" field to "articles".');
	}

	// --- Languages and sample content ------------------------------------------------------
	const languages = new ItemsService('languages', await ctx());
	const existing = new Set((await languages.readByQuery({ limit: -1, fields: ['code'] })).map((l) => l.code));
	const missing = LANGUAGES.filter((l) => !existing.has(l.code));
	if (missing.length) {
		await languages.createMany(missing);
		logger.info(`[demo-setup] Added languages: ${missing.map((l) => l.code).join(', ')}.`);
	}

	const articles = new ItemsService('articles', await ctx());
	if ((await articles.readByQuery({ limit: 1, fields: ['id'] })).length === 0) {
		await articles.createMany(ARTICLES);
		logger.info('[demo-setup] Created English sample articles.');
	}

	// --- Editor role and policy -------------------------------------------------------------
	const policies = new PoliciesService(await ctx());
	let [policy] = await policies.readByQuery({ filter: { name: { _eq: 'Editors' } }, limit: 1, fields: ['id'] });
	if (!policy) {
		const id = await policies.createOne({
			name: 'Editors',
			icon: 'edit',
			description: 'Edit articles in every language and translate them with Supertext.',
			app_access: true,
			admin_access: false,
		});
		policy = { id };
		const all = { fields: ['*'], permissions: {}, validation: {}, presets: null };
		const crud = (collection) => ['create', 'read', 'update', 'delete'].map((action) => ({ policy: id, collection, action, ...all }));
		await new PermissionsService(await ctx()).createMany([
			...crud('articles'),
			...crud('articles_translations'),
			{ policy: id, collection: 'languages', action: 'read', ...all },
			// The Revisions panel of an item (earlier versions of translations).
			{ policy: id, collection: 'directus_revisions', action: 'read', ...all },
			{ policy: id, collection: 'directus_activity', action: 'read', ...all },
		]);
		logger.info('[demo-setup] Created the "Editors" policy.');
	}

	const roles = new RolesService(await ctx());
	let [editorRole] = await roles.readByQuery({ filter: { name: { _eq: 'Editor' } }, limit: 1, fields: ['id'] });
	if (!editorRole) {
		const id = await roles.createOne({ name: 'Editor', icon: 'edit', description: 'Content editors' });
		await new AccessService(await ctx()).createOne({ role: id, policy: policy.id });
		editorRole = { id };
		logger.info('[demo-setup] Created the "Editor" role.');
	}
	const adminRole = await ensureAdminRole({ services, ctx, logger });

	await showSupertextModule({ services, ctx, logger });

	// --- Accounts ---------------------------------------------------------------------------
	await ensureUser({ services, ctx, logger, env, prefix: 'DEMO_ADMIN', role: adminRole?.id, label: 'administrator' });
	await ensureUser({ services, ctx, logger, env, prefix: 'DEMO_EDITOR', role: editorRole.id, label: 'editor' });
}

/** Directus 12's default module bar; used when the project hasn't customised it yet. */
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

/** Adds the Supertext module (Settings → Settings → Module Bar) once; later changes by admins stay. */
async function showSupertextModule({ services, ctx, logger }) {
	const settings = new services.SettingsService(await ctx());
	const current = (await settings.readSingleton({ fields: ['module_bar'] }))?.module_bar;
	const bar = Array.isArray(current) ? [...current] : DEFAULT_MODULE_BAR.map((item) => ({ ...item }));
	if (bar.some((item) => item.id === 'supertext')) return;
	const before = bar.findIndex((item) => item.id === 'docs' || item.id === 'settings');
	bar.splice(before === -1 ? bar.length : before, 0, { type: 'module', id: 'supertext', enabled: true });
	await settings.upsertSingleton({ module_bar: bar });
	logger.info('[demo-setup] Added the Supertext module to the module bar.');
}

/** A role with an admin-access policy (bootstrap creates one only when it creates the first user). */
async function ensureAdminRole({ services, ctx, logger }) {
	const policies = new services.PoliciesService(await ctx());
	let [policy] = await policies.readByQuery({ filter: { admin_access: { _eq: true } }, limit: 1, fields: ['id'] });
	if (!policy) {
		policy = { id: await policies.createOne({ name: 'Administrator', icon: 'verified', admin_access: true, app_access: true }) };
	}
	const access = new services.AccessService(await ctx());
	const [link] = await access.readByQuery({ filter: { policy: { _eq: policy.id }, role: { _nnull: true } }, limit: 1, fields: ['role'] });
	if (link?.role) return { id: typeof link.role === 'object' ? link.role.id : link.role };
	const id = await new services.RolesService(await ctx()).createOne({ name: 'Administrator', icon: 'verified', description: 'Full access' });
	await access.createOne({ role: id, policy: policy.id });
	logger.info('[demo-setup] Created the "Administrator" role.');
	return { id };
}

async function ensureUser({ services, ctx, logger, env, prefix, role, label }) {
	const email = String(env[`${prefix}_EMAIL`] ?? '').trim().toLowerCase();
	const password = String(env[`${prefix}_PASSWORD`] ?? '');
	if (!email && !password) return;
	if (!email || !password) {
		logger.warn(`[demo-setup] Set both ${prefix}_EMAIL and ${prefix}_PASSWORD to create the ${label} account; skipped.`);
		return;
	}
	if (!role) {
		logger.warn(`[demo-setup] No role for the ${label} account; skipped.`);
		return;
	}
	const users = new services.UsersService(await ctx());
	const [found] = await users.readByQuery({ filter: { email: { _eq: email } }, limit: 1, fields: ['id'] });
	if (found) {
		logger.info(`[demo-setup] Account from ${prefix}_EMAIL exists, left unchanged.`);
		return;
	}
	if (password.length < MIN_PASSWORD_LENGTH) {
		logger.warn(`[demo-setup] ${prefix}_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters; ${label} account not created.`);
		return;
	}
	try {
		// UsersService applies the project's password policy (Settings → Security).
		await users.createOne({ email, password, role, status: 'active', first_name: label === 'editor' ? 'Demo' : 'Demo', last_name: label === 'editor' ? 'Editor' : 'Admin' });
		logger.info(`[demo-setup] Created the ${label} account from ${prefix}_EMAIL.`);
	} catch (error) {
		logger.warn(`[demo-setup] Could not create the ${label} account from ${prefix}_EMAIL: ${error?.message ?? error}`);
	}
}
