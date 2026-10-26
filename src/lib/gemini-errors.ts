export const GEMINI_FAILURE_CODES = [
  "not_configured",
  "invalid_key",
  "blocked_key",
  "billing",
  "permission",
  "model",
  "quota",
  "invalid_request",
  "timeout",
  "network",
  "provider",
  "content_blocked",
  "output_limit",
  "response_format",
  "unknown",
] as const;

export type GeminiFailureCode = (typeof GEMINI_FAILURE_CODES)[number];
export type GeminiFailure = { code: GeminiFailureCode; status?: number; providerCode?: string };
export type GeminiTextResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export class GeminiRequestError extends Error {
  readonly code: GeminiFailureCode;
  readonly status?: number;
  readonly providerCode?: string;

  constructor(
    code: GeminiFailureCode,
    message: string,
    status?: number,
    providerCode?: string,
  ) {
    super(message);
    this.name = "GeminiRequestError";
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
  }
}

export function isGeminiFailureCode(value: unknown): value is GeminiFailureCode {
  return typeof value === "string" && (GEMINI_FAILURE_CODES as readonly string[]).includes(value);
}

export function geminiFailureFromHttp(status: number, providerCode = "", providerMessage = ""): GeminiFailure {
  const detail = `${providerCode} ${providerMessage}`.toLocaleLowerCase();
  if (detail.includes("reported as leaked") || detail.includes("api key was blocked") || detail.includes("blocked api key")) {
    return { code: "blocked_key", status, providerCode };
  }
  if (status === 401 || detail.includes("api_key_invalid") || detail.includes("api key not valid") || detail.includes("invalid api key")) {
    return { code: "invalid_key", status, providerCode };
  }
  if (status === 429) return { code: "quota", status, providerCode };
  if (status === 404 || detail.includes("model_not_found") || /model.+(?:not found|not available|does not exist|unsupported)/.test(detail)) {
    return { code: "model", status, providerCode };
  }
  if (
    status === 402 || detail.includes("billing") || detail.includes("payment") || detail.includes("prepay") ||
    detail.includes("free tier") || detail.includes("failed_precondition")
  ) return { code: "billing", status, providerCode };
  if (status === 403) return { code: "permission", status, providerCode };
  if ([408, 499, 504].includes(status)) return { code: "timeout", status, providerCode };
  if (status === 400) return { code: "invalid_request", status, providerCode };
  if (status >= 500) return { code: "provider", status, providerCode };
  return { code: "unknown", status, providerCode };
}

export function classifyGeminiFailure(error: unknown): GeminiFailure {
  if (error instanceof GeminiRequestError) {
    return { code: error.code, status: error.status, providerCode: error.providerCode };
  }
  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; code?: unknown; status?: unknown; providerCode?: unknown };
    if (isGeminiFailureCode(candidate.code)) {
      return {
        code: candidate.code,
        status: typeof candidate.status === "number" ? candidate.status : undefined,
        providerCode: typeof candidate.providerCode === "string" ? candidate.providerCode : undefined,
      };
    }
    if (candidate.name === "AbortError" || candidate.name === "TimeoutError") return { code: "timeout" };
  }
  if (error instanceof TypeError) return { code: "network" };
  return { code: "unknown" };
}

export function geminiFailureMessage(code: GeminiFailureCode): string {
  switch (code) {
    case "not_configured": return "Gemini is not configured. Add an API key under Master → Integrations.";
    case "invalid_key": return "Google rejected the Gemini API key. Replace it under Master → Integrations.";
    case "blocked_key": return "Google has blocked this Gemini key. Create a new key in Google AI Studio, then replace it.";
    case "billing": return "This Gemini project needs active billing or API access in Google AI Studio.";
    case "permission": return "This key or project is not allowed to call Gemini. Check its API restrictions and project access.";
    case "model": return "The selected Gemini model is unavailable for this key. Choose a supported model under Master → Integrations.";
    case "quota": return "Gemini's rate or usage limit was reached. Wait briefly and retry, or check the project quota.";
    case "invalid_request": return "Gemini rejected the model options. Test the selected model under Master → Integrations.";
    case "timeout": return "Gemini did not respond in time. Retry in a moment.";
    case "network": return "The worker could not reach Gemini. Retry in a moment.";
    case "provider": return "Gemini is temporarily unavailable. Retry in a moment.";
    case "content_blocked": return "Gemini's content filters blocked this draft.";
    case "output_limit": return "Gemini used its response limit before producing a complete answer.";
    case "response_format": return "Gemini returned an unusable answer format.";
    default: return "The Gemini request failed unexpectedly. Test the connection under Master → Integrations.";
  }
}

export function geminiTextFromResponse(data: GeminiTextResponse): string {
  const blocked = data.promptFeedback?.blockReason;
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason?.toLocaleUpperCase();
  if (blocked || ["SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "OTHER"].includes(finishReason ?? "")) {
    throw new GeminiRequestError("content_blocked", "Gemini blocked the content");
  }
  if (finishReason === "MAX_TOKENS") throw new GeminiRequestError("output_limit", "Gemini exhausted the response limit");
  const output = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
  if (!output) throw new GeminiRequestError("response_format", "Gemini returned no usable text");
  return output;
}
