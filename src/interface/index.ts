import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
  id: 'supertext-translate',
  name: 'Supertext Translation',
  icon: 'translate',
  description: 'Translate this item’s Translations field with Supertext',
  component: InterfaceComponent,
  types: ['alias'],
  localTypes: ['presentation'],
  group: 'presentation',
  options: null,
  hideLabel: true,
  hideLoader: true,
});
