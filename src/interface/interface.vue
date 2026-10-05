<template>
  <div class="supertext">
    <div class="header">
      <v-icon name="translate" />
      <span class="title">{{ t.title }}</span>
    </div>

    <v-notice v-if="isNew" type="info">{{ t.saveFirst }}</v-notice>
    <v-notice v-else-if="error" type="danger">{{ error }}</v-notice>
    <v-notice v-else-if="info && !info.configured" type="warning">{{ t.notConfigured }}</v-notice>

    <template v-else-if="info && !results">
      <div class="row">
        <span class="label">{{ t.from }}</span>
        <v-select v-model="source" :items="sourceItems" inline />
      </div>
      <div class="targets">
        <span class="label">{{ t.into }}</span>
        <div v-for="language in targets" :key="language.code" class="target">
          <v-checkbox v-model="selected" :value="language.code" :label="`${language.name} (${language.code})`" />
          <v-chip v-if="language.exists" x-small class="exists">{{ t.exists }}</v-chip>
        </div>
      </div>
      <v-notice v-if="overwriteNeeded" type="warning" class="overwrite">
        <div>
          <v-checkbox v-model="overwrite" :label="t.overwrite" />
          <p class="hint">{{ t.overwriteHint }}</p>
        </div>
      </v-notice>
      <p class="hint">{{ t.savedVersion }}</p>
      <v-button :loading="busy" :disabled="!selected.length" @click="run">{{ t.translate }}</v-button>
    </template>

    <template v-else-if="results">
      <ul class="results">
        <li v-for="result in results" :key="result.language" :class="result.status">
          <v-icon :name="icon(result.status)" small />
          {{ nameOf(result.language) }}: {{ describe(result) }}
        </li>
      </ul>
      <v-button secondary @click="reload">{{ t.show }}</v-button>
    </template>

    <v-progress-linear v-else indeterminate />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';

const props = defineProps<{ collection: string; primaryKey: string | number | null }>();

const strings = {
  en: {
    title: 'Translate with Supertext',
    saveFirst: 'Save the item first, then translate it.',
    notConfigured: 'Supertext is not set up yet: an administrator needs to set SUPERTEXT_API_KEY.',
    from: 'From',
    into: 'Into',
    exists: 'Already translated',
    overwrite: 'Overwrite existing translations',
    overwriteHint: 'Changes made to those translations will be replaced by a new translation of the source. Leave this off to translate only the missing languages.',
    savedVersion: 'Supertext translates the saved version. Save your changes first.',
    translate: 'Translate',
    show: 'Show translations',
    created: 'translation created',
    updated: 'translation updated',
    skipped: 'already translated, skipped',
  },
  de: {
    title: 'Mit Supertext übersetzen',
    saveFirst: 'Speichern Sie den Eintrag zuerst und übersetzen Sie ihn dann.',
    notConfigured: 'Supertext ist noch nicht eingerichtet: Eine Administratorin oder ein Administrator muss SUPERTEXT_API_KEY setzen.',
    from: 'Aus',
    into: 'In',
    exists: 'Bereits übersetzt',
    overwrite: 'Bestehende Übersetzungen überschreiben',
    overwriteHint: 'Änderungen an diesen Übersetzungen werden durch eine neue Übersetzung ersetzt. Ausgeschaltet lassen, um nur fehlende Sprachen zu übersetzen.',
    savedVersion: 'Supertext übersetzt die gespeicherte Fassung. Speichern Sie Ihre Änderungen zuerst.',
    translate: 'Übersetzen',
    show: 'Übersetzungen anzeigen',
    created: 'Übersetzung erstellt',
    updated: 'Übersetzung aktualisiert',
    skipped: 'bereits übersetzt, übersprungen',
  },
};
const t = (document.documentElement.lang || 'en').toLowerCase().startsWith('de') ? strings.de : strings.en;

interface Language { code: string; name: string; exists: boolean; isSource: boolean }
interface Result { language: string; status: string; message?: string }

const api = useApi();
const info = ref<{ source: string; configured: boolean; languages: Language[] } | null>(null);
const source = ref('');
const selected = ref<string[]>([]);
const overwrite = ref(false);
const busy = ref(false);
const error = ref('');
const results = ref<Result[] | null>(null);

const isNew = computed(() => props.primaryKey === '+' || props.primaryKey === null);
const sourceItems = computed(() => (info.value?.languages ?? []).filter((l) => l.exists).map((l) => ({ text: l.name, value: l.code })));
const targets = computed(() => (info.value?.languages ?? []).filter((l) => l.code !== source.value));
const overwriteNeeded = computed(() => targets.value.some((l) => l.exists && selected.value.includes(l.code)));

watch(source, () => {
  selected.value = targets.value.filter((l) => !l.exists).map((l) => l.code);
});

onMounted(load);

async function load() {
  if (isNew.value) return;
  try {
    const response = await api.get(`/supertext/languages/${props.collection}/${props.primaryKey}`);
    info.value = response.data.data;
    source.value = info.value!.source;
    selected.value = targets.value.filter((l) => !l.exists).map((l) => l.code);
  } catch (e: any) {
    error.value = e?.response?.data?.errors?.[0]?.message ?? String(e);
  }
}

async function run() {
  busy.value = true;
  error.value = '';
  try {
    const response = await api.post(`/supertext/translate/${props.collection}/${props.primaryKey}`, {
      source: source.value,
      targets: selected.value,
      overwrite: overwrite.value,
    });
    results.value = response.data.data.results;
  } catch (e: any) {
    error.value = e?.response?.data?.errors?.[0]?.message ?? String(e);
  } finally {
    busy.value = false;
  }
}

function nameOf(code: string) {
  return info.value?.languages.find((l) => l.code === code)?.name ?? code;
}

function describe(result: Result) {
  if (result.status === 'error') return result.message ?? '';
  return (t as any)[result.status] ?? result.status;
}

function icon(status: string) {
  return status === 'error' ? 'error' : status === 'skipped' ? 'remove' : 'check';
}

function reload() {
  window.location.reload();
}
</script>

<style scoped>
.supertext { border: var(--theme--border-width, 2px) solid var(--theme--border-color-subdued, #e4eaf1); border-radius: var(--theme--border-radius, 6px); padding: 16px 20px; display: grid; gap: 12px; }
.header { display: flex; align-items: center; gap: 8px; }
.title { font-weight: 600; }
.row { display: flex; align-items: center; gap: 8px; }
.label { color: var(--theme--foreground-subdued); }
.targets { display: grid; gap: 6px; }
.target { display: flex; align-items: center; gap: 8px; }
.exists { --v-chip-background-color: var(--theme--warning-background, #fff3cd); --v-chip-color: var(--theme--warning, #b98b00); }
.hint { color: var(--theme--foreground-subdued); font-size: 13px; margin: 0; }
.overwrite .hint { margin-top: 4px; }
.results { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.results .error { color: var(--theme--danger); }
.results .created, .results .updated { color: var(--theme--success); }
.results .skipped { color: var(--theme--foreground-subdued); }
</style>
