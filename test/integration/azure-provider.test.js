import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createAzureFoundryProvider,
  ProviderRateLimitError,
  responsesUrl,
} from "../../src/providers/azure-foundry.js";

test("responsesUrl accepts project and versioned endpoints", () => {
  assert.equal(
    responsesUrl("https://example.services.ai.azure.com/api/projects/project"),
    "https://example.services.ai.azure.com/api/projects/project/openai/v1/responses",
  );
  assert.equal(
    responsesUrl("https://example.openai.azure.com/openai/v1"),
    "https://example.openai.azure.com/openai/v1/responses",
  );
  assert.throws(() => responsesUrl("http://example.com"), /HTTPS/);
  assert.throws(() => responsesUrl("http://localhost.evil.example"), /HTTPS/);
});

test("Azure provider sends Responses API tool turns", async (t) => {
  let request;
  const server = http.createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) {
      chunks.push(chunk);
    }
    request = {
      url: incoming.url,
      headers: incoming.headers,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "response-1",
        output: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "list_changed_files",
            arguments: "{}",
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const provider = createAzureFoundryProvider({
    endpoint: `http://127.0.0.1:${port}`,
    deployment: "review-model",
    apiKey: "test-secret",
  });
  const result = await provider.turn({
    instructions: "review",
    input: "start",
    tools: [],
  });

  assert.equal(request.url, "/openai/v1/responses");
  assert.equal(request.headers["api-key"], "test-secret");
  assert.equal(request.body.model, "review-model");
  assert.equal(result.calls[0].name, "list_changed_files");
});

test("Azure provider classifies HTTP 429 as rate limiting", async () => {
  const provider = createAzureFoundryProvider({
    endpoint: "https://example.invalid",
    deployment: "review-model",
    apiKey: "test-secret",
    fetchImplementation: async () =>
      new Response('{"error":{"code":"rate_limit_exceeded"}}', {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    () =>
      provider.turn({
        instructions: "review",
        input: "start",
        tools: [],
      }),
    (error) =>
      error instanceof ProviderRateLimitError &&
      error.status === 429 &&
      /inconclusive/.test(error.message),
  );
});
