#!/usr/bin/env node
/**
 * Regenerates docs/images from a freshly set-up demo whose extension talks to stand-in.mjs.
 * See docs/DEVELOPER.md -> Docs screenshots.
 *
 *   BASE_URL (default http://127.0.0.1:8055)
 *   DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD     settings screens (administrator)
 *   DEMO_EDITOR_EMAIL / DEMO_EDITOR_PASSWORD   translating (Editor role)
 */
import { chromium } from 'playwright'

const B = process.env.BASE_URL || 'http://127.0.0.1:8055'
const OUT = new URL('../../docs/images', import.meta.url).pathname
const LIVE_API = 'https://api.supertext.com/v1/'

const browser = await chromium.launch()

async function session(email, password) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: email === process.env.DEMO_EDITOR_EMAIL ? 1500 : 860 } })).newPage()
  await page.goto(`${B}/admin/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/admin\/(content|insights|users)/)
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' }).catch(() => {})
  const go = async (url) => {
    await page.goto(B + url)
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' })
    await page.waitForTimeout(800)
  }
  /** Screenshot of one element (scrolled into view), with a little margin. */
  const shot = async (name, locator, margin = 12) => {
    const element = typeof locator === 'string' ? page.locator(locator).first() : locator
    await element.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const r = await element.boundingBox()
    const clip = { x: Math.max(0, r.x - margin), y: Math.max(0, r.y - margin), width: r.width + 2 * margin, height: r.height + 2 * margin }
    await page.screenshot({ path: `${OUT}/${name}.png`, clip })
  }

  return { page, go, shot }
}

// --- Installation guide (administrator) --------------------------------------------------------------
{
  const { page, go } = await session(process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD)
  await go('/admin/supertext')
  // Directus asks administrators for a license key and a project owner; the docs leave both open.
  for (const name of ['Skip', 'Remind Later']) await page.getByRole('button', { name }).click({ timeout: 8000 }).catch(() => {})
  await page.getByRole('button', { name: 'Test connection' }).click()
  await page.getByText('Connected.').waitFor()
  // The docs run against a local stand-in API; show the endpoint users will see.
  await page.evaluate((live) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.includes('127.0.0.1')) n.textContent = live
  }, LIVE_API)
  await page.screenshot({ path: `${OUT}/settings-supertext.png`, clip: { x: 0, y: 0, width: 960, height: 560 } })

  await go('/admin/content/languages')
  await page.screenshot({ path: `${OUT}/languages.png`, clip: { x: 0, y: 0, width: 960, height: 340 } })

  await go('/admin/settings/data-model/articles')
  await page.screenshot({ path: `${OUT}/data-model.png`, clip: { x: 0, y: 0, width: 960, height: 480 } })
}

// --- User guide (editor) -----------------------------------------------------------------------------
{
  const { page, go, shot } = await session(process.env.DEMO_EDITOR_EMAIL, process.env.DEMO_EDITOR_PASSWORD)
  const panel = page.locator('.supertext').first()

  await go('/admin/content/articles/1')
  await panel.getByRole('button', { name: 'Translate' }).waitFor()
  await shot('translate-panel', panel)

  await panel.getByRole('button', { name: 'Translate' }).click()
  await panel.locator('.results').waitFor({ timeout: 60_000 })
  await shot('translate-done', panel)

  await panel.getByRole('button', { name: 'Show translations' }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await panel.getByText('Already translated').first().waitFor()
  await panel.getByText('Deutsch (Schweiz) (de-CH)').click()
  await panel.getByText('Overwrite existing translations').waitFor()
  await shot('overwrite-warning', panel)

  // The result: Directus' Translations interface, every language complete, German selected.
  await go('/admin/content/articles/1')
  const translations = page.locator('.translations').first()
  const toggle = translations.locator('.language-select button.toggle').first()
  await toggle.scrollIntoViewIfNeeded()
  const bar = await toggle.boundingBox()
  await toggle.click()
  const menu = page.locator('.v-list-item').filter({ hasText: 'Deutsch (Schweiz)' }).first()
  await menu.waitFor()
  await page.waitForTimeout(300)
  const list = await page.locator('.v-list-item').filter({ hasText: 'Italiano (Svizzera)' }).last().boundingBox()
  await page.screenshot({ path: `${OUT}/translations-menu.png`, clip: { x: bar.x - 12, y: bar.y - 12, width: bar.width + 24, height: list.y + list.height - bar.y + 24 } })
  await menu.click()
  await page.waitForTimeout(800)
  await shot('translated-result', translations)
}

await browser.close()
console.log(`Screenshots written to ${OUT}`)
