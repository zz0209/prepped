import { parse as parseDisposition } from 'content-disposition';
import { version } from '../package.json';
import { startDesktop, type Target } from './config.js';

/** A refusal or failure of the Prepped service, with its HTTP status and code (docs/API.md), or of reaching it. */
export class PreppedError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly code: string | null = null) {
    super(message);
    this.name = 'PreppedError';
  }
}

type Query = Record<string, string | number | boolean | undefined>;
export type RequestOptions = { json?: unknown; form?: FormData; query?: Query };

/** Requests to one Prepped service with an agent's token (server/agent-tokens.ts). */
export class Client {
  // Named in the token's "last used by" in Settings: the command line, or the MCP client that started the server.
  userAgent = `prepped-cli/${version}`;

  constructor(public target: Target) {}

  private address(path: string, query?: Query): string {
    const url = new URL(path, `${this.target.url}/`);
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    return url.toString();
  }

  private async send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.target.token}`, 'User-Agent': this.userAgent, Accept: 'application/json' };
    let body: string | FormData | undefined;
    if (options.form) body = options.form;
    else if (options.json !== undefined) { body = JSON.stringify(options.json); headers['Content-Type'] = 'application/json'; }
    let response: Response;
    try {
      response = await fetch(this.address(path, options.query), { method, headers, body });
    } catch (error) {
      const reason = (error as { cause?: { code?: string } }).cause?.code;
      if (!this.target.desktop || reason !== 'ECONNREFUSED') throw new PreppedError(`Could not reach Prepped at ${this.target.url}: ${reason ?? (error as Error).message}`, null, 'UNREACHABLE');
      // The desktop app is closed: it starts hidden, as at login, and the request goes to it once it answers.
      const started = await startDesktop(this.target.desktop);
      if (!started) throw new PreppedError('The Prepped desktop app is not running on this computer. Open Prepped and try again.', null, 'DESKTOP_NOT_RUNNING');
      this.target = { ...this.target, url: started };
      response = await fetch(this.address(path, options.query), { method, headers, body });
    }
    if (!response.ok) {
      const text = await response.text();
      let message = text.slice(0, 2000) || response.statusText;
      let code: string | null = null;
      if ((response.headers.get('content-type') ?? '').includes('application/json')) {
        const parsed = JSON.parse(text) as { error?: string; code?: string };
        message = parsed.error ?? message;
        code = parsed.code ?? null;
      }
      throw new PreppedError(message, response.status, code);
    }
    return response;
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, options);
    return await response.json() as T;
  }

  /** A file the service sends as an attachment (a resume's PDF, a meeting's Markdown record), with its name. */
  async download(path: string, query?: Query): Promise<{ data: Buffer; name: string | null; type: string }> {
    const response = await this.send('GET', path, { query });
    const disposition = response.headers.get('content-disposition');
    const name = disposition ? parseDisposition(disposition).parameters.filename ?? null : null;
    return { data: Buffer.from(await response.arrayBuffer()), name, type: response.headers.get('content-type') ?? '' };
  }
}
