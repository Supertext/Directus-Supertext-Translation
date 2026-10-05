import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'supertext-translate-flow',
	name: 'Supertext: translate',
	icon: 'translate',
	description: 'Translate items into their other languages with Supertext and save the translations.',
	overview: ({ collection, source, targets, onlyMissing }) => [
		{ label: 'Collection', text: collection || 'From trigger' },
		{ label: 'From', text: source || 'First language' },
		{ label: 'Into', text: (Array.isArray(targets) ? targets.join(', ') : targets) || 'All other languages' },
		{ label: 'Only empty languages', text: onlyMissing ? 'Yes' : 'No' },
	],
	options: [
		{
			field: 'collection',
			name: 'Collection',
			type: 'string',
			meta: { width: 'half', interface: 'system-collection', note: 'Leave empty to use the collection of the trigger.' },
		},
		{
			field: 'item',
			name: 'Item IDs',
			type: 'json',
			meta: { width: 'half', interface: 'tags', note: 'Leave empty to use the item(s) of the trigger.' },
		},
		{
			field: 'field',
			name: 'Translations field',
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'translations' }, note: 'Only needed if the collection has more than one.' },
		},
		{
			field: 'source',
			name: 'Translate from',
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'en-US' }, note: 'Language code. Empty: the first language.' },
		},
		{
			field: 'targets',
			name: 'Translate into',
			type: 'json',
			meta: { width: 'full', interface: 'tags', options: { placeholder: 'de-CH, fr-CH' }, note: 'Language codes. Empty: all other languages.' },
		},
		{
			field: 'fields',
			name: 'Fields',
			type: 'json',
			meta: { width: 'full', interface: 'tags', note: 'Fields of the translations collection. Empty: all text fields.' },
		},
		{
			field: 'onlyMissing',
			name: 'Only empty languages',
			type: 'boolean',
			meta: { width: 'half', interface: 'boolean', options: { label: 'Skip languages that already have text' } },
			schema: { default_value: false },
		},
	],
});
