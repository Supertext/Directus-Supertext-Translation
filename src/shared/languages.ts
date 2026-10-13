import { Languages } from 'supertext-sdk/v1'
import type { Politeness } from './supertext-client.js'

/**
 * Directus language codes → Supertext codes, with the Supertext SDK's rules (the same in every
 * Supertext plugin, no guessing): the mapping (SUPERTEXT_LANGUAGE_MAP) wins; otherwise a Directus
 * code that equals a Supertext code apart from case and `_`/`-` is used (`de-CH`, `es`); anything
 * else throws `SupertextError('unsupported_language')`. Sources are bare (`en-US` → `en`).
 */
export const SUPERTEXT_TARGETS = Languages.TARGETS

export function targetCode(locale: string, map: Record<string, string> = {}): string {
  return Languages.target(locale, map)
}

/** The target code, or null when the language isn't mapped (for the Supertext page). */
export function targetCodeOrNull(locale: string, map: Record<string, string> = {}): string | null {
  try {
    return Languages.target(locale, map)
  } catch {
    return null
  }
}

export function sourceCode(locale: string, map: Record<string, string> = {}): string {
  return Languages.source(locale, map)
}

export function politenessFor(locale: string, map: Record<string, Politeness> = {}): Politeness {
  return map[locale] ?? 'default'
}

/** Whether Supertext offers formal/informal for a target code (null: not in the SDK's list). */
export const supportsPoliteness = (target: string): boolean | null => Languages.supportsPoliteness(target)
