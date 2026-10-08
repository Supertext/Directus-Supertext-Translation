<template>
	<div class="supertext">
		<div class="head">
			<v-icon name="translate" />
			<span class="title">{{ t('panel.title') }}</span>
		</div>

		<v-notice v-if="error" type="danger">{{ error }}</v-notice>
		<v-notice v-else-if="isNew" type="info">{{ t('panel.saveFirst') }}</v-notice>
		<v-notice v-else-if="info && !info.configured" type="warning">{{ t('panel.noKey') }}</v-notice>

		<template v-if="info && !isNew">
			<div class="row">
				<span class="label">{{ t('panel.from') }}</span>
				<v-select v-model="source" :items="sourceChoices" :disabled="busy || disabled" class="source" />
			</div>

			<div class="label">{{ t('panel.into') }}</div>
			<div class="targets">
				<div v-for="lang in targetLanguages" :key="lang.code" class="target">
					<v-checkbox v-model="selected" :value="lang.code" :label="`${lang.name} (${lang.code})`" :disabled="busy || disabled" />
					<span v-if="lang.hasTranslation" class="existing">{{ t('panel.willReplace') }}</span>
				</div>
			</div>

			<v-notice v-if="sourceHasUnsavedEdits" type="warning">
				{{ t('panel.unsavedSource', { language: source }) }}
			</v-notice>

			<div class="actions">
				<v-button :loading="busy" :disabled="!canTranslate" @click="start">
					<v-icon name="translate" left />
					{{ t('panel.translate') }}
				</v-button>
				<span v-if="busy" class="hint">{{ t('panel.translating', { count: selected.length }) }}</span>
			</div>

			<v-notice v-if="done.length" type="success" class="result">
				{{ t('panel.done', { languages: done.join(', ') }) }}
			</v-notice>
			<v-notice v-for="f in failed" :key="f.language" type="danger" class="result">{{ f.language }}: {{ f.error }}</v-notice>
			<v-notice v-if="incomplete.length" type="warning" class="result">
				{{ t('panel.incomplete', { list: incomplete.join('; ') }) }}
			</v-notice>
		</template>

		<v-dialog v-model="confirming" @esc="confirming = false">
			<v-card>
				<v-card-title>{{ t('panel.replaceTitle') }}</v-card-title>
				<v-card-text>
					{{ t(replacing.length === 1 ? 'panel.replaceText' : 'panel.replaceTextMany', { languages: replacing.join(', ') }) }}
				</v-card-text>
				<v-card-actions>
					<v-button secondary @click="confirming = false">{{ t('panel.cancel') }}</v-button>
					<v-button @click="run">{{ t('panel.replace') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { useApi } from '@directus/extensions-sdk';
import { computed, inject, onMounted, ref, watch, type Ref } from 'vue';
import { apiErrorText, errorText, t } from '../i18n/index.js';

type Language = { code: string; name: string; hasTranslation: boolean; id: string | number | null };
type Relation = { field: string; junctionPk: string; languageFk: string; languagePk: string };
type Info = { configured: boolean; relation: Relation; defaultSource: string | null; fields: { field: string }[]; languages: Language[] };
type Result =
	| { language: string; ok: true; values: Record<string, string>; id: string | number | null; missing: string[] }
	| { language: string; ok: false; error: string; code?: string; key?: string; values?: Record<string, string | number> };
type Edits = { create: Record<string, any>[]; update: Record<string, any>[]; delete: (string | number)[] };

const props = withDefaults(
	defineProps<{
		collection: string;
		primaryKey?: string | number | null;
		disabled?: boolean;
		translationsField?: string | null;
		sourceLanguage?: string | null;
		fields?: string[] | null;
	}>(),
	{ primaryKey: null, disabled: false, translationsField: null, sourceLanguage: null, fields: null },
);
const emit = defineEmits<{ (e: 'setFieldValue', payload: { field: string; value: unknown }): void }>();

const api = useApi();
const values = inject<Ref<Record<string, any>>>('values', ref({}));

const info = ref<Info | null>(null);
const error = ref<string | null>(null);
const source = ref<string>('');
const selected = ref<string[]>([]);
const busy = ref(false);
const confirming = ref(false);
const done = ref<string[]>([]);
const failed = ref<{ language: string; error: string }[]>([]);
const incomplete = ref<string[]>([]);

const isNew = computed(() => props.primaryKey === null || props.primaryKey === '+');
const field = computed(() => info.value?.relation.field ?? props.translationsField ?? 'translations');
const sourceChoices = computed(() => (info.value?.languages ?? []).filter((l) => l.hasTranslation || l.code === source.value).map((l) => ({ text: `${l.name} (${l.code})`, value: l.code })));
const targetLanguages = computed(() => (info.value?.languages ?? []).filter((l) => l.code !== source.value));
const replacing = computed(() => targetLanguages.value.filter((l) => l.hasTranslation && selected.value.includes(l.code)).map((l) => l.name));
const canTranslate = computed(() => !!info.value?.configured && !busy.value && !props.disabled && selected.value.length > 0 && !!source.value && !sourceHasUnsavedEdits.value);

/** Unsaved edits of the source language's row would not be translated. */
const sourceHasUnsavedEdits = computed(() => {
	const edits = values.value?.[field.value];
	const rel = info.value?.relation;
	if (!rel || !edits || Array.isArray(edits) || typeof edits !== 'object') return false;
	const src = info.value!.languages.find((l) => l.code === source.value);
	const langOf = (row: Record<string, any>) => (typeof row[rel.languageFk] === 'object' ? row[rel.languageFk]?.[rel.languagePk] : row[rel.languageFk]);
	const touched = (row: Record<string, any>) => Object.keys(row).some((k) => k !== rel.junctionPk && k !== rel.languageFk);
	return (
		(edits.update ?? []).some((row: Record<string, any>) => src?.id != null && row[rel.junctionPk] == src.id && touched(row)) ||
		(edits.create ?? []).some((row: Record<string, any>) => langOf(row) === source.value && touched(row))
	);
});

onMounted(load);
watch(() => props.primaryKey, load);
// After Save the form drops its pending edits: reload so "has text" is current.
watch(
	() => values.value?.[field.value],
	(now, before) => {
		const isEdits = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
		if (isEdits(before) && !isEdits(now)) load();
	},
);

async function load() {
	error.value = null;
	try {
		const { data } = await api.get('/supertext/info', {
			params: { collection: props.collection, item: isNew.value ? undefined : props.primaryKey, field: props.translationsField || undefined },
		});
		info.value = data.data as Info;
		const langs = info.value.languages;
		const preferred = props.sourceLanguage && langs.some((l) => l.code === props.sourceLanguage) ? props.sourceLanguage : (info.value.defaultSource ?? '');
		source.value = preferred;
		selected.value = langs.filter((l) => l.code !== preferred).map((l) => l.code);
	} catch (e) {
		error.value = apiErrorText(e);
	}
}

function start() {
	if (replacing.value.length) confirming.value = true;
	else run();
}

async function run() {
	confirming.value = false;
	busy.value = true;
	done.value = [];
	failed.value = [];
	incomplete.value = [];
	try {
		const { data } = await api.post('/supertext/translate', {
			collection: props.collection,
			item: props.primaryKey,
			field: field.value,
			source: source.value,
			targets: selected.value,
			fields: props.fields?.length ? props.fields : undefined,
			save: false,
		});
		const results = data.data.results as Result[];
		applyToForm(results);
		const name = (code: string) => info.value?.languages.find((l) => l.code === code)?.name ?? code;
		done.value = results.filter((r) => r.ok).map((r) => name(r.language));
		failed.value = results
			.filter((r): r is Extract<Result, { ok: false }> => !r.ok)
			.map((r) => ({ language: name(r.language), error: errorText({ message: r.error, code: r.code, key: r.key, values: r.values }) }));
		incomplete.value = results.filter((r): r is Extract<Result, { ok: true }> => r.ok && r.missing.length > 0).map((r) => `${name(r.language)}: ${r.missing.join(', ')}`);
	} catch (e) {
		error.value = apiErrorText(e);
	} finally {
		busy.value = false;
	}
}

/** Merges the translations into the form's pending edits of the translations field, like typing them. */
function applyToForm(results: Result[]) {
	const rel = info.value!.relation;
	const current = values.value?.[field.value];
	const edits: Edits = current && !Array.isArray(current) && typeof current === 'object'
		? { create: [...(current.create ?? [])], update: [...(current.update ?? [])], delete: [...(current.delete ?? [])] }
		: { create: [], update: [], delete: [] };
	const langOf = (row: Record<string, any>) => (typeof row[rel.languageFk] === 'object' ? row[rel.languageFk]?.[rel.languagePk] : row[rel.languageFk]);

	for (const r of results) {
		if (!r.ok) continue;
		if (r.id !== null && r.id !== undefined) {
			const i = edits.update.findIndex((row) => row[rel.junctionPk] == r.id);
			const row = { ...(i >= 0 ? edits.update[i] : {}), [rel.junctionPk]: r.id, ...r.values };
			if (i >= 0) edits.update[i] = row;
			else edits.update.push(row);
		} else {
			const i = edits.create.findIndex((row) => langOf(row) === r.language);
			const row = { ...(i >= 0 ? edits.create[i] : {}), ...r.values, [rel.languageFk]: { [rel.languagePk]: r.language } };
			if (i >= 0) edits.create[i] = row;
			else edits.create.push(row);
		}
	}
	emit('setFieldValue', { field: field.value, value: edits });
}
</script>

<style scoped>
.supertext {
	padding: 16px 20px;
	border: var(--theme--border-width, 2px) solid var(--theme--form--field--input--border-color, var(--theme--border-color));
	border-radius: var(--theme--border-radius, 6px);
	display: grid;
	gap: 12px;
}
.head {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--theme--primary);
}
.title {
	font-weight: 600;
	color: var(--theme--foreground);
}
.row {
	display: flex;
	align-items: center;
	gap: 12px;
}
.label {
	font-weight: 600;
	min-width: 48px;
}
.source {
	max-width: 320px;
}
.targets {
	display: grid;
	gap: 4px;
}
.target {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}
.existing {
	color: var(--theme--warning);
	font-size: 13px;
}
.actions {
	display: flex;
	align-items: center;
	gap: 12px;
}
.hint {
	color: var(--theme--foreground-subdued);
}
</style>
