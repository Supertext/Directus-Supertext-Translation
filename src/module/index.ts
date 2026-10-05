import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
  id: 'supertext',
  name: 'Supertext',
  icon: 'translate',
  routes: [{ path: '', component: ModuleComponent }],
  preRegisterCheck: (user) => user.admin_access === true,
});
