<template>
	<private-view title="Supertext">
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="translate" /></v-button>
		</template>
		<div class="supertext-module">
			<v-notice v-if="error" type="danger">{{ error }}</v-notice>
			<template v-if="status">
				<h2 class="type-title">{{ t.connection }}</h2>
				<dl>
					<dt>{{ t.apiKey }}</dt>
					<dd>{{ status.configured ? t.keySet : t.keyMissing }}</dd>
					<dt>{{ t.api }}</dt>
					<dd><code>{{ status.baseUrl }}</code></dd>
					<dt>{{ t.parallel }}</dt>
					<dd>{{ status.concurrency }}</dd>
					<dt>{{ t.timeout }}</dt>
					<dd>{{ status.timeoutSeconds }} s</dd>
				</dl>
				<p class="hint key-help">
					{{ t.noAccount }} <a :href="signupUrl" target="_blank" rel="noopener">{{ t.createAccount }}</a>.
					{{ t.generateKey }} <a :href="apiKeyUrl" target="_blank" rel="noopener">{{ t.keyPath }}</a> {{ t.adminRole }}
				</p>
				<div class="test">
					<v-button secondary :loading="testing" @click="test">{{ t.test }}</v-button>
					<span v-if="tested === true" class="ok"><v-icon name="check" small /> {{ t.ok }}</span>
					<span v-else-if="tested" class="fail"><v-icon name="error" small /> {{ tested }}</span>
				</div>

				<h2 class="type-title">{{ t.languages }}</h2>
				<p class="hint">{{ t.languagesHint }}</p>
				<p v-if="!status.languages.length" class="hint">{{ t.noLanguages }}</p>
				<table v-else>
					<thead><tr><th>{{ t.language }}</th><th>{{ t.supertext }}</th><th>{{ t.tone }}</th></tr></thead>
					<tbody>
						<tr v-for="l in status.languages" :key="l.collection + l.code">
							<td>{{ l.name }} <code>{{ l.code }}</code></td>
							<td><code>{{ l.target }}</code></td>
							<td>{{ l.politeness === 'more' ? t.formal : l.politeness === 'less' ? t.informal : t.default }}</td>
						</tr>
					</tbody>
				</table>
			</template>
			<v-progress-circular v-else-if="!error" indeterminate />
		</div>
	</private-view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const en = {
	connection: 'Connection', apiKey: 'API key', keySet: 'Set (SUPERTEXT_API_KEY)', keyMissing: 'Missing: set SUPERTEXT_API_KEY',
	api: 'API', parallel: 'Languages at a time', timeout: 'Timeout per language',
	test: 'Test connection', ok: 'Connected. The API key works.', languages: 'Languages',
	languagesHint: 'The languages of your translations fields, as they are sent to Supertext. Change them with SUPERTEXT_LANGUAGE_MAP and SUPERTEXT_POLITENESS.',
	noLanguages: 'No collection has a translations field yet.',
	noAccount: 'No Supertext account yet?', createAccount: 'Create one at supertext.com',
	generateKey: 'Generate your API key at', keyPath: 'supertext.com → Integrations → API', adminRole: '(requires the Admin role), then set it as SUPERTEXT_API_KEY.',
	language: 'Language', supertext: 'Supertext language', tone: 'Tone', formal: 'Formal (Sie, vous)', informal: 'Informal (du, tu)', default: 'Default',
};
const de: typeof en = {
	connection: 'Verbindung', apiKey: 'API-Schlüssel', keySet: 'Gesetzt (SUPERTEXT_API_KEY)', keyMissing: 'Fehlt: SUPERTEXT_API_KEY setzen',
	api: 'API', parallel: 'Sprachen gleichzeitig', timeout: 'Zeitlimit pro Sprache',
	test: 'Verbindung testen', ok: 'Verbunden. Der API-Schlüssel funktioniert.', languages: 'Sprachen',
	languagesHint: 'Die Sprachen Ihrer Übersetzungsfelder, so wie sie an Supertext gesendet werden. Ändern lässt sich das mit SUPERTEXT_LANGUAGE_MAP und SUPERTEXT_POLITENESS.',
	noLanguages: 'Noch keine Sammlung hat ein Übersetzungsfeld.',
	noAccount: 'Noch kein Supertext-Konto?', createAccount: 'Erstellen Sie eines auf supertext.com',
	generateKey: 'Den API-Schlüssel erzeugen Sie unter', keyPath: 'supertext.com → Integrations → API', adminRole: '(erfordert die Admin-Rolle) und setzen ihn als SUPERTEXT_API_KEY.',
	language: 'Sprache', supertext: 'Supertext-Sprache', tone: 'Anrede', formal: 'Formell (Sie, vous)', informal: 'Informell (du, tu)', default: 'Standard',
};
const signupUrl = 'https://www.supertext.com/person/en/account/signin';
const apiKeyUrl = 'https://www.supertext.com/en/integrations/api';
const t = (document.documentElement.lang || 'en').toLowerCase().startsWith('de') ? de : en;

const api = useApi();
const status = ref<any>(null);
const error = ref('');
const testing = ref(false);
const tested = ref<true | string | null>(null);

onMounted(async () => {
	try {
		status.value = (await api.get('/supertext/status')).data.data;
	} catch (e: any) {
		error.value = e?.response?.data?.errors?.[0]?.message ?? String(e);
	}
});

async function test() {
	testing.value = true;
	tested.value = null;
	try {
		await api.post('/supertext/test');
		tested.value = true;
	} catch (e: any) {
		tested.value = e?.response?.data?.errors?.[0]?.message ?? String(e);
	} finally {
		testing.value = false;
	}
}
</script>

<style scoped>
.supertext-module { padding: 0 var(--content-padding) var(--content-padding-bottom); max-width: 800px; display: grid; gap: 16px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; margin: 0; }
dt { font-weight: 600; }
dd { margin: 0; }
.test { display: flex; align-items: center; gap: 12px; }
.ok { color: var(--theme--success); }
.fail { color: var(--theme--danger); }
.hint { color: var(--theme--foreground-subdued); margin: 0; }
.hint a { color: var(--theme--primary); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--theme--border-color-subdued); }
th { color: var(--theme--foreground-subdued); font-weight: 600; }
h2 { margin-top: 12px; }
</style>
