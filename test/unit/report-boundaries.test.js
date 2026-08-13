import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

async function read(file) {
  return fs.promises.readFile(file, "utf8");
}

test("report consumers depend on the narrow model, renderer, and writer boundaries", async () => {
  const [runner, inputs, policy, index, model, renderer, writer] =
    await Promise.all([
      read("src/runner/review.js"),
      read("src/inputs.js"),
      read("src/policy/policy.js"),
      read("src/index.js"),
      read("src/reports/model.js"),
      read("src/reports/renderer.js"),
      read("src/reports/writer.js"),
    ]);

  for (const consumer of [runner, inputs, policy]) {
    assert.match(consumer, /reports\/model\.js/);
    assert.doesNotMatch(consumer, /reports\/(?:renderer|writer)\.js/);
  }

  for (const module of [model, renderer]) {
    assert.doesNotMatch(module, /node:(?:fs|path)/);
  }
  assert.doesNotMatch(writer, /reports\/(?:model|renderer)\.js/);

  assert.match(index, /reports\/model\.js/);
  assert.match(index, /reports\/renderer\.js/);
  assert.match(index, /reports\/writer\.js/);
  assert.match(
    index,
    /writeReports\(report, markdown, workspace, outputDirectory\)/,
  );
});
