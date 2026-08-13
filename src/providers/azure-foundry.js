const MAX_ERROR_BODY = 4_000;

export class ProviderRateLimitError extends Error {
  constructor(provider, status = 429) {
    super(`${provider} rate limit exceeded (${status}); review is inconclusive`);
    this.name = "ProviderRateLimitError";
    this.provider = provider;
    this.status = status;
  }
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
  fetchImplementation = globalThis.fetch,
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

      const response = await fetchImplementation(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, MAX_ERROR_BODY);
        if (response.status === 429) {
          throw new ProviderRateLimitError("Azure AI Foundry", response.status);
        }
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
