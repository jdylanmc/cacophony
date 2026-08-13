import { ProviderUnavailableError } from "./errors.js";

const MAX_ERROR_BODY = 4_000;

function retryDelayMs(response, retryIndex) {
  let baseDelayMs;
  for (const name of ["retry-after-ms", "x-ms-retry-after-ms"]) {
    const raw = response.headers.get(name);
    if (raw && /^\d+$/.test(raw.trim())) {
      baseDelayMs = Number(raw.trim());
      break;
    }
  }

  if (baseDelayMs === undefined) {
    const retryAfter = response.headers.get("retry-after")?.trim();
    if (retryAfter) {
      if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
        baseDelayMs = Math.ceil(Number(retryAfter) * 1_000);
      } else {
        const retryAt = Date.parse(retryAfter);
        if (Number.isFinite(retryAt)) {
          baseDelayMs = Math.max(0, retryAt - Date.now());
        }
      }
    }
  }

  return Math.min((baseDelayMs ?? 1_000) * 2 ** retryIndex, 1_800_000);
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Cacophony review aborted"));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Cacophony review aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function responsesUrl(endpoint) {
  const normalized = endpoint.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("endpoint must be a valid URL");
  }
  const localHttp =
    parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("endpoint must use HTTPS");
  }
  if (normalized.endsWith("/responses")) {
    return normalized;
  }
  if (normalized.endsWith("/openai/v1")) {
    return `${normalized}/responses`;
  }
  return `${normalized}/openai/v1/responses`;
}

function parseCalls(output) {
  if (!Array.isArray(output)) {
    return [];
  }
  return output
    .filter((item) => item?.type === "function_call")
    .map((item) => {
      if (
        typeof item.call_id !== "string" ||
        !item.call_id ||
        typeof item.name !== "string" ||
        !item.name
      ) {
        throw new Error("Azure AI Foundry returned a malformed function call");
      }
      return {
        callId: item.call_id,
        name: item.name,
        arguments: item.arguments,
      };
    });
}

export function createAzureFoundryProvider({
  endpoint,
  deployment,
  apiKey,
  rateLimitRetries = 0,
  fetchImplementation = globalThis.fetch,
  sleepImplementation = waitForRetry,
}) {
  if (!apiKey) {
    throw new Error("CACOPHONY_AZURE_API_KEY is required");
  }
  if (typeof fetchImplementation !== "function") {
    throw new Error("A fetch implementation is required");
  }
  const url = responsesUrl(endpoint);

  return {
    async turn({ instructions, input, previousResponseId, tools, signal }) {
      const body = {
        model: deployment,
        instructions,
        input,
        tools,
        tool_choice: "auto",
        parallel_tool_calls: false,
      };
      if (previousResponseId) {
        body.previous_response_id = previousResponseId;
      }

      let response;
      for (let attempt = 0; attempt <= rateLimitRetries; attempt += 1) {
        response = await fetchImplementation(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (response.status !== 429) {
          break;
        }
        if (attempt === rateLimitRetries) {
          throw new ProviderUnavailableError({
            provider: "Azure AI Foundry",
            reason: "rate_limit",
            status: response.status,
          });
        }
        await response.body?.cancel();
        await sleepImplementation(retryDelayMs(response, attempt), signal);
      }

      if (!response.ok) {
        const detail = (await response.text()).slice(0, MAX_ERROR_BODY);
        throw new Error(
          `Azure AI Foundry request failed (${response.status}): ${detail || response.statusText}`,
        );
      }

      const result = await response.json();
      if (typeof result.id !== "string" || !result.id) {
        throw new Error("Azure AI Foundry response did not include an id");
      }
      return {
        id: result.id,
        calls: parseCalls(result.output),
        text: typeof result.output_text === "string" ? result.output_text : "",
        usage: result.usage ?? null,
      };
    },
  };
}
