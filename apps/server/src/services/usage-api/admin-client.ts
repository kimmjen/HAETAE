import { z } from "zod";

/**
 * Tiny client for Anthropic's Organization Admin API. The endpoints we
 * care about return paginated time-bucketed reports, so this module
 * exposes one async generator per report and lets the caller decide
 * whether to consume the whole stream or stop early.
 *
 * Authentication: `x-api-key` header set to a `sk-ant-admin-...` key
 * issued from Anthropic Console → Settings → Admin API. Plain user API
 * keys (`sk-ant-api03-...`) are silently rejected by the server with
 * 401 — surfaced here as `AdminApiAuthError` so the UI can show a
 * "key may have been issued without admin scope" hint.
 */

export const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_BASE_URL = "https://api.anthropic.com";

/** Thrown when fetch returns 401/403 — usually a missing or wrong key. */
export class AdminApiAuthError extends Error {
  constructor(public readonly status: number) {
    super(`Admin API authentication failed (HTTP ${status})`);
    this.name = "AdminApiAuthError";
  }
}

/** Other non-2xx responses. We do not echo the response body to avoid
 *  leaking secrets that might appear in error envelopes. */
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly route: string,
  ) {
    super(`Admin API ${route} failed (HTTP ${status})`);
    this.name = "AdminApiError";
  }
}

// ---------- usage_report/messages ----------

const UsageRow = z
  .object({
    uncached_input_tokens: z.number().int().nonnegative().optional(),
    cache_creation_input_tokens: z.number().int().nonnegative().optional(),
    cache_read_input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
    model: z.string().optional(),
    service_tier: z.string().optional(),
    context_window: z.string().optional(),
    api_key_id: z.string().nullable().optional(),
    workspace_id: z.string().nullable().optional(),
  })
  .passthrough();

const UsageBucket = z
  .object({
    starting_at: z.string(),
    ending_at: z.string(),
    results: z.array(UsageRow),
  })
  .passthrough();

const UsageReportResponse = z.object({
  data: z.array(UsageBucket),
  has_more: z.boolean(),
  next_page: z.string().nullable().optional(),
});

export type UsageReportResponse = z.infer<typeof UsageReportResponse>;

// ---------- cost_report ----------

const CostRow = z
  .object({
    /** Anthropic returns amount as a *string* decimal ("1.234567"). */
    amount: z.string(),
    currency: z.string(),
    cost_type: z.string().optional(),
    model: z.string().optional(),
    service_tier: z.string().optional(),
    context_window: z.string().optional(),
    workspace_id: z.string().nullable().optional(),
  })
  .passthrough();

const CostBucket = z
  .object({
    starting_at: z.string(),
    ending_at: z.string(),
    results: z.array(CostRow),
  })
  .passthrough();

const CostReportResponse = z.object({
  data: z.array(CostBucket),
  has_more: z.boolean(),
  next_page: z.string().nullable().optional(),
});

export type CostReportResponse = z.infer<typeof CostReportResponse>;

// ---------- client ----------

export interface AdminClientOptions {
  /** `sk-ant-admin-...`. Empty string disables every method (returns
   *  null from fetchers) so the caller can mount the client even when
   *  the key is unset and let pages render lock-state instead of
   *  exploding. */
  apiKey: string;
  /** Override for tests. Default is the real Anthropic host. */
  baseUrl?: string;
  /** Inject a fetch impl for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export interface ReportRange {
  /** RFC3339 inclusive lower bound. */
  startingAt: string;
  /** RFC3339 exclusive upper bound. */
  endingAt: string;
  /** SDK accepts `1d` and `1h`. Server defaults to `1d` if unset. */
  bucketWidth?: "1d" | "1h";
}

export class AdminClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AdminClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  /** True iff the client was constructed with a non-empty key. UI uses
   *  this to render the "no key" empty state without firing requests. */
  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Fetch every page of the usage_report/messages endpoint for the
   * given range. Yields one parsed bucket per `data[]` entry across all
   * pages — the caller can stop early or accumulate everything.
   */
  async *streamUsage(range: ReportRange): AsyncGenerator<UsageReportResponse["data"][number]> {
    yield* this.streamReport<UsageReportResponse["data"][number]>(
      "/v1/organizations/usage_report/messages",
      range,
      UsageReportResponse,
    );
  }

  /** Same shape as `streamUsage` but for `cost_report`. */
  async *streamCost(range: ReportRange): AsyncGenerator<CostReportResponse["data"][number]> {
    yield* this.streamReport<CostReportResponse["data"][number]>(
      "/v1/organizations/cost_report",
      range,
      CostReportResponse,
    );
  }

  private async *streamReport<TBucket>(
    pathname: string,
    range: ReportRange,
    schema:
      | typeof UsageReportResponse
      | typeof CostReportResponse,
  ): AsyncGenerator<TBucket> {
    if (!this.isConfigured) return;

    let nextPage: string | null | undefined;
    let safety = 1000; // hard cap on pagination loops to prevent infinite spin
    do {
      const url = this.buildUrl(pathname, range, nextPage);
      const res = await this.fetchImpl(url, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          accept: "application/json",
        },
      });
      if (res.status === 401 || res.status === 403) {
        throw new AdminApiAuthError(res.status);
      }
      if (!res.ok) {
        throw new AdminApiError(res.status, pathname);
      }
      const json = await res.json();
      const parsed = schema.parse(json);
      for (const bucket of parsed.data) {
        yield bucket as TBucket;
      }
      nextPage = parsed.next_page ?? null;
      if (!parsed.has_more) break;
      safety -= 1;
      if (safety <= 0) {
        throw new AdminApiError(599, `${pathname} (pagination cap)`);
      }
    } while (nextPage);
  }

  private buildUrl(
    pathname: string,
    range: ReportRange,
    nextPage: string | null | undefined,
  ): string {
    const url = new URL(pathname, `${this.baseUrl}/`);
    if (nextPage) {
      url.searchParams.set("next_page", nextPage);
    } else {
      url.searchParams.set("starting_at", range.startingAt);
      url.searchParams.set("ending_at", range.endingAt);
      if (range.bucketWidth) url.searchParams.set("bucket_width", range.bucketWidth);
    }
    return url.toString();
  }
}

/** Convenience: read `ANTHROPIC_ADMIN_KEY` from env and build a client.
 *  Empty/unset env returns a client where `isConfigured === false`. */
export function adminClientFromEnv(env: NodeJS.ProcessEnv = process.env): AdminClient {
  return new AdminClient({ apiKey: env.ANTHROPIC_ADMIN_KEY ?? "" });
}
