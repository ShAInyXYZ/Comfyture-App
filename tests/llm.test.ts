// Which model the app asks by default: GPT-6 Luna for the writers and the assistants alike (the owner's decision of 26 October: capable and
// cheap, and nothing else until they say so), Gemma 4 without a Comfy key, an environment choice still winning, an unknown choice ignored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLlm, pickLlm } from "../server/llm.ts";

const env = (set: Record<string, string | undefined>, run: () => void) => {
  const was = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(set)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    run();
  } finally {
    for (const [k, v] of Object.entries(was)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
};

test("with a Comfy key, Luna is the default of both roles; without one, Gemma 4", () => {
  env({ COMFY_API_KEY: "k", COMFYTURE_LLM: undefined, COMFYTURE_LLM_ASSISTANT: undefined, COMFYTURE_ASSISTANT: undefined, COMFYTURE_OPEN_WEIGHTS: undefined }, () => {
    assert.equal(defaultLlm("writer"), "gpt-6-luna");
    assert.equal(defaultLlm("assistant"), "gpt-6-luna");
    assert.equal(pickLlm(undefined), "gpt-6-luna", "a request that names none gets it");
    assert.equal(pickLlm("not-a-model"), "gpt-6-luna", "and one that names a model there is not");
    assert.equal(pickLlm("claude-sonnet-5-5"), "claude-sonnet-5-5", "a model picked on purpose is still allowed");
  });
  env({ COMFY_API_KEY: "", COMFYTURE_LLM: undefined, COMFYTURE_LLM_ASSISTANT: undefined }, () => assert.equal(defaultLlm("writer"), "gemma-4"));
  env({ COMFY_API_KEY: "k", COMFYTURE_LLM: "gemma-4", COMFYTURE_OPEN_WEIGHTS: undefined }, () => assert.equal(defaultLlm("writer"), "gemma-4", "the environment's choice wins"));
});
