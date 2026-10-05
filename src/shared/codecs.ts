/**
 * Field value ⇄ translatable segments.
 *
 * Each segment is sent to Supertext as one `data-st-id` element. Rich text is split
 * into its smallest blocks (paragraph, heading, list item paragraph, table cell), and
 * each block goes as ONE segment with its inline formatting (`<strong>`, `<a href>`, …).
 * Sentences then stay whole, and the block structure we put the translations back into
 * is exactly the source's, so Directus's editor (TipTap) shows the result as editable.
 */
import { parse, HTMLElement, NodeType } from 'node-html-parser';
import { marked } from 'marked';

export type FieldKind = 'text' | 'html' | 'markdown';

/** A piece to translate: `html` is the inner HTML sent (plain text is escaped). */
export type Piece = { html: string };

/** Splits a field value into pieces and rebuilds it from their translations. */
export type Encoded = {
	pieces: Piece[];
	/** `translated[i]` is the translated inner HTML of `pieces[i]` (undefined = keep source). */
	rebuild(translated: (string | undefined)[]): string;
};

export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&amp;/g, '&');
}

/** Text of an HTML fragment, whitespace collapsed (for plain text fields). */
export function htmlToText(html: string): string {
	return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function encode(kind: FieldKind, value: unknown): Encoded | null {
	if (typeof value !== 'string' || value.trim() === '') return null;
	switch (kind) {
		case 'text':
			return encodeText(value);
		case 'html':
			return encodeHtml(value);
		case 'markdown':
			return encodeMarkdown(value);
	}
}

// --- Plain text -------------------------------------------------------------------------

function encodeText(value: string): Encoded {
	const text = value.trim();
	const start = value.indexOf(text);
	const lead = value.slice(0, start);
	const trail = value.slice(start + text.length);
	return {
		pieces: [{ html: escapeHtml(text).replace(/\n/g, '<br>') }],
		rebuild: ([t]) => (t === undefined ? value : lead + htmlToText(t) + trail),
	};
}

// --- HTML (WYSIWYG) ---------------------------------------------------------------------

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'DT', 'DD', 'FIGCAPTION', 'CAPTION', 'BLOCKQUOTE', 'SUMMARY', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'FIGURE', 'DETAILS', 'DL', 'HR']);
/** Never translated, never descended into. */
const SKIP = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'SVG', 'IFRAME', 'VIDEO', 'AUDIO', 'MATH']);

const hasText = (el: HTMLElement) => el.text.trim() !== '';
const isBlock = (el: HTMLElement) => BLOCKS.has(el.tagName) || SKIP.has(el.tagName);

function encodeHtml(value: string): Encoded {
	const root = parse(value, { comment: true });
	const leaves: HTMLElement[] = [];

	const visit = (el: HTMLElement) => {
		for (const child of el.childNodes) {
			if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
			const c = child as HTMLElement;
			if (SKIP.has(c.tagName)) continue;
			if (!isBlock(c)) continue;
			const blockChildren = c.childNodes.some((n) => n.nodeType === NodeType.ELEMENT_NODE && isBlock(n as HTMLElement));
			if (blockChildren) visit(c);
			else if (hasText(c)) leaves.push(c);
		}
	};

	// Text directly at the top level (no wrapping blocks): translate the whole value at once.
	const looseText = root.childNodes.some(
		(n) => (n.nodeType === NodeType.TEXT_NODE && n.text.trim() !== '') || (n.nodeType === NodeType.ELEMENT_NODE && !isBlock(n as HTMLElement) && hasText(n as HTMLElement)),
	);
	if (looseText) {
		return { pieces: [{ html: value.trim() }], rebuild: ([t]) => (t === undefined ? value : t) };
	}

	visit(root);
	return {
		pieces: leaves.map((el) => ({ html: el.innerHTML.trim() })),
		rebuild(translated) {
			leaves.forEach((el, i) => {
				const t = translated[i];
				if (t !== undefined) el.set_content(t);
			});
			return root.toString();
		},
	};
}

// --- Markdown ---------------------------------------------------------------------------

const inlineToHtml = (md: string) => (marked.parseInline(md, { async: false }) as string).trim();
const htmlToInline = (html: string) => inlineMarkdown(parse(html)).replace(/[ \t]*\n[ \t]*/g, ' ').trim();

/** Inline HTML (as returned by Supertext) back to markdown. Unknown tags keep their HTML. */
function inlineMarkdown(node: HTMLElement): string {
	return node.childNodes
		.map((child) => {
			if (child.nodeType === NodeType.TEXT_NODE) return decodeEntities(child.rawText).replace(/([\\`*_[\]])/g, '\\$1');
			if (child.nodeType !== NodeType.ELEMENT_NODE) return '';
			const el = child as HTMLElement;
			const inner = inlineMarkdown(el);
			switch (el.tagName) {
				case 'STRONG':
				case 'B':
					return `**${inner}**`;
				case 'EM':
				case 'I':
					return `*${inner}*`;
				case 'DEL':
				case 'S':
					return `~~${inner}~~`;
				case 'CODE':
					return '`' + decodeEntities(el.innerHTML) + '`';
				case 'BR':
					return '  \n';
				case 'A': {
					const href = el.getAttribute('href') ?? '';
					const title = el.getAttribute('title');
					return `[${inner}](${href}${title ? ` "${title}"` : ''})`;
				}
				case 'IMG': {
					const title = el.getAttribute('title');
					return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''}${title ? ` "${title}"` : ''})`;
				}
				default:
					return el.outerHTML;
			}
		})
		.join('');
}

/**
 * Line-based: headings, list items, quotes and table cells are translated one by one
 * with their markers kept; consecutive plain lines form one paragraph. Code fences,
 * indented code, front matter, HTML blocks and link reference definitions stay as they are.
 */
function encodeMarkdown(value: string): Encoded {
	const lines = value.split('\n');
	type Part = { line: number; start: number; end: number } | { lines: number[]; prefix: string[] };
	const parts: Part[] = [];
	const pieces: Piece[] = [];
	let fence: string | null = null;
	let para: number[] = [];

	const flush = () => {
		if (!para.length) return;
		const md = para.map((i) => lines[i]!.trim()).join(' ');
		parts.push({ lines: para, prefix: [] });
		pieces.push({ html: inlineToHtml(md) });
		para = [];
	};

	lines.forEach((line, i) => {
		const fenceMatch = line.match(/^\s*(```|~~~)/);
		if (fence) {
			if (fenceMatch && fenceMatch[1] === fence) fence = null;
			return;
		}
		if (fenceMatch) {
			flush();
			fence = fenceMatch[1]!;
			return;
		}
		if (line.trim() === '' || /^( {4}|\t)/.test(line) || /^\s*(<\/?[a-z][^>]*>\s*)+$/i.test(line) || /^\s*\[[^\]]+\]:\s/.test(line) || /^\s*([-*_]\s*){3,}$/.test(line)) {
			flush();
			return;
		}
		if (/^\s*\|/.test(line)) {
			flush();
			if (/^\s*\|?\s*:?-{2,}/.test(line)) return; // table separator
			const re = /\|([^|]*)/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(line))) {
				const cell = m[1]!;
				if (cell.trim() === '') continue;
				const start = m.index + 1 + cell.indexOf(cell.trim());
				parts.push({ line: i, start, end: start + cell.trim().length });
				pieces.push({ html: inlineToHtml(cell.trim()) });
			}
			return;
		}
		const marker = line.match(/^(\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?)(.*)$/)!;
		const prefix = marker[1]!;
		const text = marker[2]!;
		if (prefix.trim() === '' || /^\s*(>\s*)+$/.test(prefix)) {
			// Plain paragraph line (possibly quoted): part of the current paragraph.
			if (/^\s*(>\s*)+$/.test(prefix)) {
				flush();
				const start = prefix.length;
				if (text.trim() === '') return;
				parts.push({ line: i, start, end: line.length });
				pieces.push({ html: inlineToHtml(text) });
				return;
			}
			para.push(i);
			return;
		}
		flush();
		if (text.trim() === '') return;
		parts.push({ line: i, start: prefix.length, end: line.length });
		pieces.push({ html: inlineToHtml(text.replace(/\s+#+\s*$/, '')) });
	});
	flush();

	return {
		pieces,
		rebuild(translated) {
			const out = [...lines];
			const dropped = new Set<number>();
			parts.forEach((part, i) => {
				const t = translated[i];
				if (t === undefined) return;
				const md = htmlToInline(t);
				if ('line' in part) {
					const line = out[part.line]!;
					out[part.line] = line.slice(0, part.start) + md + line.slice(part.end);
				} else {
					const [first, ...rest] = part.lines;
					const indent = lines[first!]!.match(/^\s*/)![0];
					out[first!] = indent + md;
					rest.forEach((r) => dropped.add(r));
				}
			});
			return out.filter((_, i) => !dropped.has(i)).join('\n');
		},
	};
}

/** Which codec a field gets, from its Directus interface; null = not translated. */
export function kindForField(field: { type: string; meta?: { interface?: string | null; options?: Record<string, unknown> | null; special?: string[] | null } | null }): FieldKind | null {
	if (field.type !== 'string' && field.type !== 'text') return null;
	const iface = field.meta?.interface ?? null;
	const options = field.meta?.options ?? {};
	switch (iface) {
		case 'input-rich-text-html':
			return 'html';
		case 'input-rich-text-md':
			return 'markdown';
		case 'input':
			// Slugs, URLs-as-input and similar are machine values.
			if (options?.slug === true || options?.masked === true) return null;
			return 'text';
		case 'input-multiline':
		case null:
			return 'text';
		default:
			return null;
	}
}
