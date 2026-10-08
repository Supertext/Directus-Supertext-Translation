import { defineInterface } from '@directus/extensions-sdk';
import { t } from '../i18n/index.js';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'supertext-translate',
	// Getters and the options function are read when Directus renders them, so they follow the user's language.
	get name() {
		return t('interface.name');
	},
	icon: 'translate',
	get description() {
		return t('interface.description');
	},
	component: InterfaceComponent,
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
	hideLabel: true,
	hideLoader: true,
	options: () => [
		{
			field: 'translationsField',
			name: t('interface.translationsField'),
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'translations' }, note: t('interface.translationsFieldNote') },
		},
		{
			field: 'sourceLanguage',
			name: t('interface.sourceLanguage'),
			type: 'string',
			meta: { width: 'half', interface: 'input', options: { placeholder: 'en-US' }, note: t('interface.sourceLanguageNote') },
		},
		{
			field: 'fields',
			name: t('interface.fields'),
			type: 'json',
			meta: { width: 'full', interface: 'tags', note: t('interface.fieldsNote') },
		},
	],
});
