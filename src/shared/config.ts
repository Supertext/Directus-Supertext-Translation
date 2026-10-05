/**
 * Plugin settings, all from environment variables (Directus' own convention):
 *
 *   SUPERTEXT_API_KEY          key, with or without the "Supertext-Auth-Key " prefix
 *   SUPERTEXT_ENVIRONMENT      live (default) | staging | testing
 *   SUPERTEXT_API_ENDPOINT     custom base URL (overrides the environment)
 *   SUPERTEXT_LANGUAGES        JSON: { "<language code>": { "code": "fr-CH", "politeness": "more" } }
 *   SUPERTEXT_SOURCE_LANGUAGE  language translated from when the editor doesn't choose (default: first existing)
 *   SUPERTEXT_TIMEOUT          seconds to wait for one translation (default 180)
 */
import { SupertextClient, type ClientOptions, type Politeness } from './client';

export const ENVIRONMENTS: Record<string, string> = {
  live: 'https://api.supertext.com/v1/',
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/',
};

export interface LanguageSetting {
  code?: string;
  politeness?: Politeness;
}

export interface Config {
  apiKey: string;
  endpoint: string;
  languages: Record<string, LanguageSetting>;
  sourceLanguage: string;
  timeoutSeconds: number;
}

export function normalizeKey(key: unknown): string {
  return String(key ?? '')
    .trim()
    .replace(/^Supertext-Auth-Key\s+/i, '');
}

/**
 * Directus casts environment values (a value containing a comma becomes an array, digits a number),
 * which would break the JSON in SUPERTEXT_LANGUAGES or an API key. The raw process variables win;
 * Directus' parsed env (e.g. from its .env file) is the fallback.
 */
export function readConfig(directusEnv: Record<string, unknown>, processEnv: Record<string, string | undefined> = globalThis.process?.env ?? {}): Config {
  const env: Record<string, unknown> = { ...directusEnv };
  for (const [key, value] of Object.entries(processEnv)) {
    if (key.startsWith('SUPERTEXT_') && value !== undefined) env[key] = value;
  }
  const custom = String(env.SUPERTEXT_API_ENDPOINT ?? '').trim();
  const environment = String(env.SUPERTEXT_ENVIRONMENT ?? 'live').toLowerCase();
  let languages: Record<string, LanguageSetting> = {};
  const raw = Array.isArray(env.SUPERTEXT_LANGUAGES) ? env.SUPERTEXT_LANGUAGES.join(',') : env.SUPERTEXT_LANGUAGES;
  if (raw && typeof raw === 'object') {
    languages = raw as Record<string, LanguageSetting>;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      languages = JSON.parse(raw.replace(/^json:/, ''));
    } catch {
      languages = {};
    }
  }
  const timeout = Number(env.SUPERTEXT_TIMEOUT ?? 180);
  return {
    apiKey: normalizeKey(env.SUPERTEXT_API_KEY),
    endpoint: custom || ENVIRONMENTS[environment] || ENVIRONMENTS.live!,
    languages,
    sourceLanguage: String(env.SUPERTEXT_SOURCE_LANGUAGE ?? '').trim(),
    timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? timeout : 180,
  };
}

/** Supertext target for a Directus language code: the SUPERTEXT_LANGUAGES override, else the code itself. */
export function targetCode(config: Config, language: string): string {
  return config.languages[language]?.code?.trim() || language;
}

export function politeness(config: Config, language: string): Politeness {
  const value = config.languages[language]?.politeness;
  return value === 'more' || value === 'less' ? value : 'default';
}

export function createClient(config: Config, extra: Partial<ClientOptions> = {}): SupertextClient {
  return new SupertextClient({ apiKey: config.apiKey, endpoint: config.endpoint, pollTimeoutMs: config.timeoutSeconds * 1000, ...extra });
}
