// The writers' models: Claude on Comfy Router, billed in Comfy credits with the same Comfy key as
// everything else, or Gemma 4 running inside ComfyUI (open weights). The pages pick one; without a
// Comfy key only Gemma 4 is offered. COMFYTURE_LLM sets the default.

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// tuned: whether it takes a temperature (Sonnet 5.5 turns a request with one down)
export type Llm = { id: string; name: string; about: string; router: boolean; tuned?: boolean };
const LLMS: Llm[] = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", about: "The strongest writer, for stories, edits and the assistants", router: true },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", about: "Quick and cheap", router: true, tuned: true },
  { id: "gemma-4", name: "Gemma 4", about: "Open weights, inside ComfyUI", router: false },
];
const hasKey = () => !!process.env.COMFY_API_KEY?.trim();
export const llms = () => LLMS.filter((m) => !m.router || hasKey()).map(({ id, name, about, router }) => ({ id, name, about, router }));
export function defaultLlm() {
  // COMFYTURE_ASSISTANT=gemma, from before there was a choice, still keeps everything on Gemma 4
  const want = process.env.COMFYTURE_LLM?.trim() || (process.env.COMFYTURE_ASSISTANT?.trim().toLowerCase() === "gemma" ? "gemma-4" : "");
  if (want && llms().some((m) => m.id === want)) return want;
  return hasKey() ? "claude-sonnet-5-5" : "gemma-4";
}
/** The model a request asks for, if it may be used; else the default. */
export const pickLlm = (v: unknown) => (typeof v === "string" && llms().some((m) => m.id === v) ? v : defaultLlm());
export const onRouter = (id: string) => LLMS.find((m) => m.id === id)?.router === true;
export const llmName = (id: string) => LLMS.find((m) => m.id === id)?.name ?? id;

/** A picture file as Claude takes it: inline, base64, with its type read from its first bytes. */
export async function imageBlock(path: string) {
  const bytes = await readFile(path);
  const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : "image/png";
  return { type, data: bytes.toString("base64") };
}

type Tool = { name: string; description: string; input_schema: unknown };
/**
 * Claude through Comfy Router: the brief as its system prompt (cached), the prompt and a picture if
 * there is one. It answers with its text, or with the input of the tool it was made to call, as JSON.
 */
export async function routerAsk(model: string, system: string, prompt: string, { maxTokens = 3000, temperature = 0.7, image, tool }: { maxTokens?: number; temperature?: number; image?: { type: string; data: string }; tool?: Tool } = {}) {
  const content: Record<string, unknown>[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.type, data: image.data } });
  content.push({ type: "text", text: prompt });
  const res = await fetch(`https://api.comfy.org/v2/models/anthropic/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(LLMS.find((m) => m.id === model)?.tuned ? { temperature } : {}),
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(tool ? { tools: [tool], tool_choice: { type: "tool", name: tool.name } } : {}),
      messages: [{ role: "user", content }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${llmName(model)}: ${body?.error?.message ?? body?.detail ?? body?.message ?? `${res.status} ${res.statusText}`}`), { status: 502 });
  if (process.env.COMFYTURE_DEBUG) console.log(`${model} usage ${JSON.stringify(body.usage)}`);
  const call = (body.content ?? []).find((c: any) => c.type === "tool_use");
  if (call) return JSON.stringify(call.input);
  return String((body.content ?? []).map((c: any) => c.text ?? "").join(""));
}
