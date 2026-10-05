import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'supertext-translate',
	name: 'Supertext translation',
	icon: 'translate',
	description: 'A "Translate with Supertext" box for the translations field of this collection.',
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
	hideLabel: true,
	hideLoader: true,
	options: [
		{
			field: 'translationsField',
			name: 'Translations field',
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'translations' }, note: 'Only needed if the collection has more than one translations field.' },
		},
		{
			field: 'sourceLanguage',
			name: 'Translate from',
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'en-US' }, note: 'Language code preselected as the source.' },
		},
		{
			field: 'fields',
			name: 'Fields to translate',
			type: 'json',
			meta: { width: 'full', interface: 'tags', note: 'Fields of the translations collection. Empty: all text, rich text and markdown fields.' },
		},
	],
});
