import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * HTTP stand-in for the Supertext AI file API, for Directus running in another
 * process. "Translates" by prefixing every segment with `[<target_lang>] `.
 * `failFor` makes a target language end with status `error`.
 */
export type FakeServer = {
	url: string;
	uploads: { target: string; source: string | null; html: string }[];
	failFor: Set<string>;
	close(): Promise<void>;
};

export async function startFakeSupertext(apiKey: string): Promise<FakeServer> {
	const files = new Map<string, { html: string; target: string }>();
	const state: FakeServer = { url: '', uploads: [], failFor: new Set(), close: async () => {} };
	let n = 0;

	const server = http.createServer(async (req, res) => {
		const send = (status: number, body: unknown, type = 'application/json') => {
			res.writeHead(status, { 'Content-Type': type });
			res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
		};
		if (req.headers.authorization !== `Supertext-Auth-Key ${apiKey}`) return send(401, { error: 'bad key' });
		const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/v1/, '');
		if (req.method === 'POST' && path === '/translate/ai/file') {
			const chunks: Buffer[] = [];
			for await (const c of req) chunks.push(c as Buffer);
			const form = await new Request('http://x', { method: 'POST', headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) }).formData();
			const html = await (form.get('file') as Blob).text();
			const target = String(form.get('target_lang'));
			const id = `f${++n}`;
			files.set(id, { html, target });
			state.uploads.push({ target, source: (form.get('source_lang') as string | null) ?? null, html });
			return send(200, { file_id: id });
		}
		const m = path.match(/^\/translate\/ai\/file\/([^/]+)(\/status|\/translation)?$/);
		const f = m ? files.get(m[1]!) : undefined;
		if (!m || !f) return send(404, { error: 'not found' });
		if (req.method === 'DELETE') {
			files.delete(m[1]!);
			return send(204, '');
		}
		if (m[2] === '/status') return send(200, { status: state.failFor.has(f.target) ? 'error' : 'done' });
		const translated = f.html.replace(/(<div data-st-id="\d+">)((?:<[a-z][^>]*>)*)/g, `$1$2[${f.target}] `);
		return send(200, translated, 'text/html');
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
	state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
	return state;
}
