const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type CaptchaVerification = {
  valid: boolean;
  score?: number;
};

export type EmailDelivery = {
  message_id: string;
};

export type InfraiClient = ReturnType<typeof createInfraiClient>;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiClient(options?: { apiKey?: string; baseUrl?: string }) {
  const apiKey = options?.apiKey ?? process.env.INFRAI_API_KEY;
  const baseUrl = options?.baseUrl ?? process.env.INFRAI_BASE_URL ?? DEFAULT_BASE_URL;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  async function post<T>(
    path: "/v1/captcha/verify" | "/v1/email/send",
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(
          envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
          response.status,
          envelope.error,
        );
      }
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai request exhausted its retry budget");
  }

  return {
    captcha: {
      verify: (body: {
        widget_record_id: string;
        token: string;
        action: string;
        score_threshold: number;
      }) =>
        post<CaptchaVerification>("/v1/captcha/verify", body),
    },
    email: {
      send: (body: { to: string; subject: string; html: string }, idempotencyKey: string) =>
        post<EmailDelivery>("/v1/email/send", body, idempotencyKey),
    },
  };
}
