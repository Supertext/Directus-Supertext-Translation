import { HtmlDocument } from 'supertext-sdk';
import type { Piece } from './codecs.js';

/**
 * One HTML document per item and target language (packed by the Supertext SDK):
 *
 *   <div data-st-id="0">About &amp; us</div>
 *   <div data-st-id="1">Read <a href="…">our guide</a>.</div>
 *
 * Each `data-st-id` element is translated on its own by Supertext. Pieces are HTML.
 */
export function buildDocument(pieces: Piece[]): string {
	return HtmlDocument.build(pieces.map((p) => ({ text: p.html, html: true })));
}

/** Translated inner HTML per piece index; missing or empty segments are absent. */
export function parseDocument(html: string, count: number): Map<number, string> {
	const out = new Map<number, string>();
	HtmlDocument.parse(html, Array.from({ length: count }, () => ({ html: true }))).forEach((inner, i) => {
		const text = inner?.trim();
		if (text) out.set(i, text);
	});
	return out;
}
