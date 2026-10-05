import { describe, expect, it } from 'vitest';
import { encode, kindForField, htmlToText } from '../src/shared/codecs.js';
import { buildDocument, parseDocument } from '../src/shared/document.js';

/** Round trip through a fake translator that upper-cases text outside tags. */
function roundTrip(kind: 'text' | 'html' | 'markdown', value: string, translate = upper) {
	const enc = encode(kind, value)!;
	const doc = buildDocument(enc.pieces);
	const translated = parseDocument(translate(doc));
	return { pieces: enc.pieces.map((p) => p.html), result: enc.rebuild(enc.pieces.map((_, i) => translated.get(i))) };
}
const upperText = (t: string) => t.replace(/&[#a-z0-9]+;|[^&]+/gi, (part) => (part.startsWith('&') ? part : part.toUpperCase()));
const upper = (html: string) =>
	html.replace(/(<div data-st-id="\d+">)([\s\S]*?)(<\/div>)/g, (_, o, inner: string, c) => o + inner.replace(/(^|>)([^<]+)/g, (_m, gt: string, t: string) => gt + upperText(t)) + c);

describe('plain text', () => {
	it('escapes, keeps surrounding whitespace and decodes the answer', () => {
		const { pieces, result } = roundTrip('text', '  Fish & chips <3  ');
		expect(pieces).toEqual(['Fish &amp; chips &lt;3']);
		expect(result).toBe('  FISH & CHIPS <3  ');
	});

	it('keeps line breaks of multi-line text', () => {
		const { pieces, result } = roundTrip('text', 'Line one\nLine two');
		expect(pieces).toEqual(['Line one<br>Line two']);
		expect(result).toBe('LINE ONE\nLINE TWO');
	});

	it('skips empty values', () => {
		expect(encode('text', '   ')).toBeNull();
		expect(encode('text', null)).toBeNull();
	});
});

describe('HTML', () => {
	const html =
		'<h2>Translate in one click</h2><p>Click <strong>Translate</strong> and <a href="https://x.test/a?b=1&amp;c=2">read more</a>.</p>' +
		'<ul><li><p>Titles</p></li><li><p>Rich <em>text</em></p></li></ul><blockquote><p>Quote</p></blockquote><pre><code>npm i</code></pre>';

	it('sends one piece per block with its inline formatting', () => {
		const { pieces } = roundTrip('html', html);
		expect(pieces).toEqual([
			'Translate in one click',
			'Click <strong>Translate</strong> and <a href="https://x.test/a?b=1&amp;c=2">read more</a>.',
			'Titles',
			'Rich <em>text</em>',
			'Quote',
		]);
	});

	it('puts translations back into the same structure and leaves code alone', () => {
		const { result } = roundTrip('html', html);
		expect(result).toBe(
			'<h2>TRANSLATE IN ONE CLICK</h2><p>CLICK <strong>TRANSLATE</strong> AND <a href="https://x.test/a?b=1&amp;c=2">READ MORE</a>.</p>' +
				'<ul><li><p>TITLES</p></li><li><p>RICH <em>TEXT</em></p></li></ul><blockquote><p>QUOTE</p></blockquote><pre><code>npm i</code></pre>',
		);
	});

	it('translates tables cell by cell', () => {
		const { pieces } = roundTrip('html', '<table><tbody><tr><th><p>Name</p></th><td><p>Value</p></td></tr></tbody></table>');
		expect(pieces).toEqual(['Name', 'Value']);
	});

	it('treats HTML without blocks as one piece', () => {
		const { pieces, result } = roundTrip('html', 'Hello <b>world</b>');
		expect(pieces).toEqual(['Hello <b>world</b>']);
		expect(result).toBe('HELLO <b>WORLD</b>');
	});

	it('keeps the source block when a segment is missing from the answer', () => {
		const enc = encode('html', '<p>One</p><p>Two</p>')!;
		expect(enc.rebuild(['Eins', undefined])).toBe('<p>Eins</p><p>Two</p>');
	});

	it('keeps umlauts and entities intact', () => {
		const enc = encode('html', '<p>A &amp; B</p>')!;
		expect(enc.rebuild(['Ä &amp; Ö – «ok»'])).toBe('<p>Ä &amp; Ö – «ok»</p>');
	});
});

describe('markdown', () => {
	const md = ['# Getting started', '', 'Read the **guide** and', 'the [FAQ](https://x.test/faq).', '', '- First item', '- [ ] Todo *item*', '1. Numbered', '', '> Quoted text', '', '```js', 'const a = 1;', '```', '', '| Name | Value |', '| --- | --- |', '| Speed | Fast |'].join('\n');

	it('translates text and keeps markers, links and code', () => {
		const { pieces, result } = roundTrip('markdown', md);
		expect(pieces).toEqual([
			'Getting started',
			'Read the <strong>guide</strong> and the <a href="https://x.test/faq">FAQ</a>.',
			'First item',
			'Todo <em>item</em>',
			'Numbered',
			'Quoted text',
			'Name',
			'Value',
			'Speed',
			'Fast',
		]);
		expect(result).toBe(
			['# GETTING STARTED', '', 'READ THE **GUIDE** AND THE [FAQ](https://x.test/faq).', '', '- FIRST ITEM', '- [ ] TODO *ITEM*', '1. NUMBERED', '', '> QUOTED TEXT', '', '```js', 'const a = 1;', '```', '', '| NAME | VALUE |', '| --- | --- |', '| SPEED | FAST |'].join('\n'),
		);
	});
});

describe('field kinds', () => {
	it('picks a codec from the interface', () => {
		expect(kindForField({ type: 'string', meta: { interface: 'input' } })).toBe('text');
		expect(kindForField({ type: 'text', meta: { interface: 'input-multiline' } })).toBe('text');
		expect(kindForField({ type: 'text', meta: { interface: 'input-rich-text-html' } })).toBe('html');
		expect(kindForField({ type: 'text', meta: { interface: 'input-rich-text-md' } })).toBe('markdown');
		expect(kindForField({ type: 'string', meta: { interface: 'input', options: { slug: true } } })).toBeNull();
		expect(kindForField({ type: 'string', meta: { interface: 'select-dropdown' } })).toBeNull();
		expect(kindForField({ type: 'integer', meta: { interface: 'input' } })).toBeNull();
		expect(kindForField({ type: 'json', meta: { interface: 'input-code' } })).toBeNull();
	});

	it('reads text out of returned HTML', () => {
		expect(htmlToText('Fish &amp; chips<br>and&nbsp;more')).toBe('Fish & chips\nand more');
	});
});
