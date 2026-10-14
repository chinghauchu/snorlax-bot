// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  KEY_PROVIDERS,
  MODEL_PROVIDERS,
  bubbleModel,
  isModelKeyError,
  modelChoice,
  modelErrorCopy,
  modelSummary,
  providerLabel,
} from "./modelProvider.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const app = readFileSync(join(root, "desktop/src/App.tsx"), "utf8");
const css = readFileSync(join(root, "desktop/src/styles.css"), "utf8");
const api = readFileSync(join(root, "desktop/src/api.ts"), "utf8");
const openapi = readFileSync(join(root, "desktop/openapi.yaml"), "utf8");

test("providers cover local and cloud adapters", () => {
  assert.deepEqual(
    MODEL_PROVIDERS.map((row) => row.id),
    ["omlx", "vllm", "openai", "anthropic", "gemini", "grok"],
  );
  assert.equal(providerLabel("omlx"), "Local (oMLX)");
  assert.equal(providerLabel("grok"), "xAI Grok");
  assert.deepEqual([...KEY_PROVIDERS], ["openai", "anthropic", "gemini", "grok"]);
});

test("Use default is an empty choice; a provider needs a model id", () => {
  assert.equal(modelChoice("", "gpt-4o"), null);
  assert.equal(modelChoice("default", "gpt-4o"), null);
  assert.equal(modelChoice("openai", "  "), null);
  assert.deepEqual(modelChoice("openai", " gpt-4o "), {
    provider: "openai",
    id: "gpt-4o",
  });
  assert.equal(modelSummary(null), "Use default");
  assert.equal(modelSummary({ provider: "anthropic", id: "claude" }), "Anthropic · claude");
});

test("bubble label and key error stay subtle and link to Settings", () => {
  assert.equal(bubbleModel(null), null);
  assert.equal(bubbleModel("  "), null);
  assert.equal(bubbleModel("gpt-4o"), "gpt-4o");
  assert.equal(isModelKeyError("missing_key"), true);
  assert.equal(isModelKeyError("invalid_key"), true);
  assert.equal(isModelKeyError(null), false);
  assert.deepEqual(
    modelErrorCopy("Add an OpenAI API key in Settings."),
    { text: "Add an OpenAI API key in", link: "Settings" },
  );
});

test("desktop chrome shows the model and does not store the raw key", () => {
  assert.match(app, /model-kicker/);
  assert.match(app, /model-error-link/);
  assert.match(app, /Use default/);
  assert.match(app, /getModelDefault/);
  assert.match(app, /putProviderKey/);
  assert.match(css, /\.model-kicker/);
  assert.match(api, /\/v1\/settings\/keys\//);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*apiKey/);
  assert.doesNotMatch(app, /snorlax\.providerKeys/);
  assert.match(openapi, /version: 0\.19\.0/);
  assert.match(openapi, /\/v1\/settings\/model/);
  assert.equal(existsSync(join(root, "desktop/src/computerPane.ts")), false);
});
