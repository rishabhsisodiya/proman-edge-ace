import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { FrappeEnvelope } from './frappe-envelope.types';

/**
 * Ported verbatim from PROMAN/backend/src/lib/frappeClient.ts — calls custom
 * whitelisted methods on ERPNext's "proman_edge" Frappe app (RPC-style, via
 * /api/method/{method}), distinct from ErpDbService (read-only raw SQL) and
 * from standard REST resource writes (Stock Entry/Sales Invoice in the
 * ticketing module). Used only where a dashboard feature has no DB-only
 * equivalent — e.g. the Sales quotation-actions drawer.
 *
 * KNOWN OPEN ITEM: depends on the "proman_edge" custom Frappe app being
 * installed on the target ERPNext instance. Not confirmed present on our test
 * DB/site — verify with Shivam before treating these endpoints as working.
 */
@Injectable()
export class FrappeRpcService {
  private readonly logger = new Logger(FrappeRpcService.name);

  private buildToken(): string {
    const key = process.env.FRAPPE_API_KEY ?? '';
    const secret = process.env.FRAPPE_API_SECRET ?? '';
    return `token ${key}:${secret}`;
  }

  private baseUrl(): string {
    return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
  }

  private assertOk<T>(msg: T, method: string): T {
    if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).ok === false) {
      const err = (msg as Record<string, unknown>).error as { code?: string; message?: string } | undefined;
      // BadGatewayException (not a plain Error) — Nest's default exception
      // filter replaces any non-HttpException with a generic "Internal
      // server error" in the actual API response, even though we already
      // extracted the real ERPNext message here. Throwing a proper
      // HttpException subclass lets that real message reach the client.
      throw new BadGatewayException(`Frappe ${method} → ${err?.code ?? 'ERROR'}: ${err?.message ?? 'Unknown error'}`);
    }
    return msg;
  }

  async get<T = FrappeEnvelope>(method: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]): [string, string] => [k, String(v)]);

    const qs = new URLSearchParams(entries).toString();
    const url = `${this.baseUrl()}/api/method/${method}${qs ? `?${qs}` : ''}`;

    const t0 = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: this.buildToken(), Accept: 'application/json' },
    });
    const ms = Date.now() - t0;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`GET ${method} failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 500)}` : ''}`);
      throw new BadGatewayException(`Frappe ${method} → HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }

    const json = (await res.json()) as { message: T };
    this.logger.log(`GET ${method.split('.').pop()} — ${ms}ms`);
    return this.assertOk(json.message, method);
  }

  async post<T = FrappeEnvelope>(method: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl()}/api/method/${method}`;

    const t0 = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.buildToken(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;

    const json = (await res.json().catch(() => ({}))) as {
      message: T;
      exc?: string;
      exception?: string;
      _server_messages?: string;
    };

    if (!res.ok) {
      const errJson = json as Record<string, unknown>;
      // Priority: _server_messages (Frappe's own user-facing message, best)
      // > exc (raw Python traceback, take the last non-empty line — most
      // specific when there's no server message) > exception (often just a
      // bare class name like "TypeError", least useful — fallback only).
      let msg = `HTTP ${res.status}`;
      if (errJson.exception) msg = String(errJson.exception);
      if (errJson.exc) msg = String(errJson.exc).split('\n').filter(Boolean).pop() ?? msg;
      if (errJson._server_messages) {
        try {
          const parsed = JSON.parse(String(errJson._server_messages));
          const inner = JSON.parse(Array.isArray(parsed) ? parsed[0] : parsed);
          if (inner.message) msg = inner.message;
        } catch {
          /* ignore parse errors */
        }
      }
      const cleanMsg = msg.replace(/<[^>]+>/g, '').trim();
      this.logger.error(`POST ${method} failed: ${cleanMsg}`);
      throw new BadGatewayException(`ERPNext ${method} failed: ${cleanMsg}`);
    }

    this.logger.log(`POST ${method.split('.').pop()} — ${ms}ms`);
    return this.assertOk(json.message, method);
  }
}
