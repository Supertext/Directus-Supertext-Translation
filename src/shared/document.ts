import { parse } from 'node-html-parser';
import type { Piece } from './codecs.js';

export const SEGMENT_ATTR = 'data-st-id';

/**
 * One HTML document per item and target language:
 *
 *   <div data-st-id="0">About &amp; us</div>
 *   <div data-st-id="1">Read <a href="…">our guide</a>.</div>
 *
 * Each `data-st-id` element is translated on its own by Supertext.
 */
export function buildDocument(pieces: Piece[]): string {
	const body = pieces.map((p, i) => `<div ${SEGMENT_ATTR}="${i}">${p.html}</div>`).join('\n');
	return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n${body}\n</body></html>`;
}

/** Translated inner HTML per piece index; missing or empty segments are absent. */
export function parseDocument(html: string): Map<number, string> {
	const root = parse(html, { comment: false });
	const out = new Map<number, string>();
	for (const el of root.querySelectorAll(`[${SEGMENT_ATTR}]`)) {
		const id = Number(el.getAttribute(SEGMENT_ATTR));
		const inner = el.innerHTML.trim();
		if (Number.isInteger(id) && inner !== '' && !out.has(id)) out.set(id, inner);
	}
	return out;
}
