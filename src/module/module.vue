<template>
	<private-view title="Supertext">
		<template #title-outer:prepend>
			<v-button class="header-icon" rounded disabled icon secondary><v-icon name="translate" /></v-button>
		</template>
		<div class="supertext-module">
			<v-notice v-if="error" type="danger">{{ error }}</v-notice>
			<template v-if="status">
				<h2 class="type-title">{{ t('module.connection') }}</h2>
				<dl>
					<dt>{{ t('module.version') }}</dt>
					<dd>
						<a v-if="releaseUrl(status.version)" :href="releaseUrl(status.version)!" target="_blank" rel="noopener">{{ status.version }}</a>
						<template v-else>{{ status.version || t('module.unknown') }}</template>
					</dd>
					<dt>{{ t('module.apiKey') }}</dt>
					<dd>{{ status.configured ? t('module.keySet') : t('module.keyMissing') }}</dd>
					<dt>{{ t('module.api') }}</dt>
					<dd><code>{{ status.baseUrl }}</code></dd>
					<dt>{{ t('module.parallel') }}</dt>
					<dd>{{ status.concurrency }}</dd>
					<dt>{{ t('module.timeout') }}</dt>
					<dd>{{ status.timeoutSeconds }} s</dd>
				</dl>
				<p class="hint key-help">
					{{ t('module.noAccount') }} <a :href="signupUrl" target="_blank" rel="noopener">{{ t('module.createAccount') }}</a>.
					{{ t('module.generateKey') }} <a :href="apiKeyUrl" target="_blank" rel="noopener">{{ t('module.keyPath') }}</a> {{ t('module.adminRole') }}
				</p>
				<dl>
					<dt>{{ t('module.keyCheck') }}</dt>
					<dd>
						<template v-if="check">
							<span :class="check.status === 'ok' ? 'ok' : 'fail'"><v-icon :name="check.status === 'ok' ? 'check' : 'error'" small /> {{ checkText(check) }}</span>
							<div class="hint">{{ t('module.checkedAt', { time: when(check.checkedAt) }) }}</div>
						</template>
						<template v-else>{{ t('module.notChecked') }}</template>
					</dd>
				</dl>
				<div class="test">
					<v-button secondary :loading="testing" @click="test">{{ t('module.test') }}</v-button>
					<span v-if="tested" class="fail"><v-icon name="error" small /> {{ tested }}</span>
				</div>
				<dl>
					<dt>{{ t('module.reports') }}</dt>
					<dd>{{ status.reports?.enabled ? t('module.reportsOn') : t('module.reportsOff') }}</dd>
				</dl>
				<p class="hint">{{ t('module.reportsHelp') }}</p>

				<h2 class="type-title">{{ t('module.languages') }}</h2>
				<p class="hint">{{ t('module.languagesHint') }}</p>
				<p v-if="!status.languages.length" class="hint">{{ t('module.noLanguages') }}</p>
				<table v-else>
					<thead><tr><th>{{ t('module.language') }}</th><th>{{ t('module.supertext') }}</th><th>{{ t('module.tone') }}</th></tr></thead>
					<tbody>
						<tr v-for="l in status.languages" :key="l.collection + l.code">
							<td>{{ l.name }} <code>{{ l.code }}</code></td>
							<td><code>{{ l.target }}</code></td>
							<td>{{ l.politeness === 'more' ? t('module.formal') : l.politeness === 'less' ? t('module.informal') : t('module.default') }}</td>
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
import { apiErrorText, currentLanguage, t, type MessageKey } from '../i18n/index.js';

const signupUrl = 'https://www.supertext.com/person/en/account/signin';
const apiKeyUrl = 'https://www.supertext.com/en/integrations/api';
/** GitHub release page for a release version (X.Y.Z). */
const releaseUrl = (v: unknown) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? `https://github.com/Supertext/Directus-Supertext-Translation/releases/tag/v${v}` : null);

const api = useApi();
const status = ref<any>(null);
const error = ref('');
const testing = ref(false);
const tested = ref<string | null>(null);
type KeyCheck = { status: 'ok' | 'invalid' | 'missing' | 'unreachable' | 'error'; checkedAt: string; httpStatus: number | null };
const check = ref<KeyCheck | null>(null);

/** The key check result in the user's language (texts from the Commando Center's guide). */
const checkText = (c: KeyCheck) => t(`keycheck.${c.status}` as MessageKey, { status: c.httpStatus ?? '' });
const when = (iso: string) => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(currentLanguage());
};

onMounted(async () => {
	try {
		status.value = (await api.get('/supertext/status')).data.data;
		check.value = status.value?.reports?.check ?? null;
	} catch (e: any) {
		error.value = apiErrorText(e);
	}
});

async function test() {
	testing.value = true;
	tested.value = null;
	try {
		check.value = (await api.post('/supertext/test')).data.data.check;
	} catch (e: any) {
		tested.value = apiErrorText(e);
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
.hint a, dd a { color: var(--theme--primary); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--theme--border-color-subdued); }
th { color: var(--theme--foreground-subdued); font-weight: 600; }
h2 { margin-top: 12px; }
</style>
