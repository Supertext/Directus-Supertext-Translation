import { defineOperationApp } from '@directus/extensions-sdk';
import { t } from '../i18n/index.js';

export default defineOperationApp({
	id: 'supertext-translate-flow',
	// Getters and functions are read when Directus renders them, so they follow the user's language.
	get name() {
		return t('operation.name');
	},
	icon: 'translate',
	get description() {
		return t('operation.description');
	},
	overview: ({ collection, source, targets, onlyMissing }) => [
		{ label: t('operation.collection'), text: collection || t('operation.fromTrigger') },
		{ label: t('panel.from'), text: source || t('operation.firstLanguage') },
		{ label: t('panel.into'), text: (Array.isArray(targets) ? targets.join(', ') : targets) || t('operation.allOtherLanguages') },
		{ label: t('operation.onlyMissing'), text: onlyMissing ? t('operation.yes') : t('operation.no') },
	],
	options: () => [
		{
			field: 'collection',
			name: t('operation.collection'),
			type: 'string',
			meta: { width: 'half', interface: 'system-collection', note: t('operation.collectionNote') },
		},
		{
			field: 'item',
			name: t('operation.item'),
			type: 'json',
			meta: { width: 'half', interface: 'tags', note: t('operation.itemNote') },
		},
		{
			field: 'field',
			name: t('operation.field'),
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'translations' }, note: t('operation.fieldNote') },
		},
		{
			field: 'source',
			name: t('operation.source'),
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'en-US' }, note: t('operation.sourceNote') },
		},
		{
			field: 'targets',
			name: t('operation.targets'),
			type: 'json',
			meta: { width: 'full', interface: 'tags', options: { placeholder: 'de-CH, fr-CH' }, note: t('operation.targetsNote') },
		},
		{
			field: 'fields',
			name: t('operation.fields'),
			type: 'json',
			meta: { width: 'full', interface: 'tags', note: t('operation.fieldsNote') },
		},
		{
			field: 'onlyMissing',
			name: t('operation.onlyMissing'),
			type: 'boolean',
			meta: { width: 'half', interface: 'boolean', options: { label: t('operation.onlyMissingLabel') } },
			schema: { default_value: false },
		},
	],
});
