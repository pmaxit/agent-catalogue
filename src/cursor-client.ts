export interface CursorModel {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

export interface CreateAgentRequest {
  prompt: { text: string };
  model?: CursorModel;
  name?: string;
  mode?: "agent" | "plan";
  mcpServers?: unknown[];
  repos?: Array<{ url: string; startingRef?: string }>;
}

export interface CreateAgentResponse {
  agent: {
    id: string;
    name: string;
    status: string;
    url?: string;
    latestRunId?: string;
  };
  run: {
    id: string;
    agentId: string;
    status: string;
  };
}

export interface RunRecord {
  id: string;
  agentId: string;
  status: string;
  result?: string;
  durationMs?: number;
}

export interface CursorClientOptions {
  baseUrl: string;
  apiKey: string;
  auth: "basic" | "bearer";
  requestTimeoutMs: number;
}

export class CursorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "CursorApiError";
  }
}

/** Thin Cursor Cloud Agents REST client (https://api.cursor.com/v1/agents). */
export class CursorClient {
  constructor(private readonly opts: CursorClientOptions) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extra,
    };
    if (this.opts.auth === "bearer") {
      headers.Authorization = `Bearer ${this.opts.apiKey}`;
    } else {
      const token = Buffer.from(`${this.opts.apiKey}:`).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    accept?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.opts.requestTimeoutMs,
    );
    try {
      const res = await fetch(`${this.opts.baseUrl}${path}`, {
        method,
        headers: this.headers(accept ? { Accept: accept } : undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new CursorApiError(
          `Cursor API ${method} ${path} failed (${res.status})`,
          res.status,
          text,
        );
      }
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  createAgent(payload: CreateAgentRequest): Promise<CreateAgentResponse> {
    return this.request<CreateAgentResponse>("POST", "/v1/agents", payload);
  }

  createRun(
    agentId: string,
    prompt: string,
    mode?: "agent" | "plan",
  ): Promise<{ run: RunRecord }> {
    return this.request("POST", `/v1/agents/${agentId}/runs`, {
      prompt: { text: prompt },
      ...(mode ? { mode } : {}),
    });
  }

  getRun(agentId: string, runId: string): Promise<RunRecord> {
    return this.request("GET", `/v1/agents/${agentId}/runs/${runId}`);
  }

  async waitForRun(
    agentId: string,
    runId: string,
    options: {
      pollIntervalMs: number;
      timeoutMs: number;
      onStatus?: (status: string) => void;
    },
  ): Promise<RunRecord> {
    const terminal = new Set([
      "FINISHED",
      "ERROR",
      "CANCELLED",
      "EXPIRED",
    ]);
    const started = Date.now();
    let last = "";
    while (Date.now() - started < options.timeoutMs) {
      const run = await this.getRun(agentId, runId);
      if (run.status !== last) {
        last = run.status;
        options.onStatus?.(run.status);
      }
      if (terminal.has(run.status)) return run;
      await sleep(options.pollIntervalMs);
    }
    throw new CursorApiError(
      `Timed out waiting for run ${runId}`,
      408,
    );
  }

  /**
   * Stream a run via SSE and accumulate assistant text.
   * Falls back to waitForRun if the stream endpoint fails.
   */
  async streamRun(
    agentId: string,
    runId: string,
    onEvent: (event: { type: string; data: Record<string, unknown> }) => void,
  ): Promise<{ text: string; status: string }> {
    const res = await fetch(
      `${this.opts.baseUrl}/v1/agents/${agentId}/runs/${runId}/stream`,
      {
        method: "GET",
        headers: this.headers({ Accept: "text/event-stream" }),
      },
    );
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new CursorApiError(
        `Stream failed (${res.status})`,
        res.status,
        text,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistant = "";
    let status = "RUNNING";
    let eventType = "message";
    let dataLines: string[] = [];

    const flush = () => {
      if (!dataLines.length) return;
      const raw = dataLines.join("\n");
      dataLines = [];
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        data = { text: raw };
      }
      onEvent({ type: eventType, data });
      if (eventType === "assistant" && typeof data.text === "string") {
        assistant += data.text;
      }
      if (eventType === "result") {
        if (typeof data.status === "string") status = data.status;
        if (typeof data.text === "string" && data.text) assistant = data.text;
      }
      eventType = "message";
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        } else if (line === "") {
          flush();
        }
      }
    }
    flush();

    if (!assistant) {
      const run = await this.getRun(agentId, runId);
      return { text: run.result ?? "", status: run.status };
    }
    return { text: assistant, status };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
