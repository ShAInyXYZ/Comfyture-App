// The writers' models: Claude, GPT and Gemini on Comfy Router, billed in Comfy credits with the
// same Comfy key as everything else, or Gemma 4 running inside ComfyUI (open weights). Two roles,
// each with its own default: the writer (Story's writers and its assistant, the Cut editor, Pickle's songs) and the
// quick assistants (the pets, the Shot's and the Stage's), both on GPT-6 Luna, the cheapest (answering in JSON, as it
// cannot be made to call a tool), until the owner decides otherwise (26 October). The pages pick
// another; without a Comfy key (or with COMFYTURE_OPEN_WEIGHTS) only Gemma 4 is offered.
// COMFYTURE_LLM and COMFYTURE_LLM_ASSISTANT set the defaults.

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spend } from "./judge.ts";

// provider: how Router is spoken to (Anthropic's Messages, OpenAI's Responses, Google's generateContent);
// tuned: whether it takes a temperature; forced: whether it can be made to answer through a tool
// (Sonnet 5.5 thinks before it answers, so it turns both down; told to use the tool, it does)
type Provider = "anthropic" | "openai" | "vertexai" | "comfyui";
// short: its name on a bar, the maker's glyph beside it; rates: Comfy credits per 1K tokens read and
// written (Comfy's partner pricing), for the picker's prices
export type Llm = { id: string; name: string; short: string; about: string; provider: Provider; rates?: [number, number]; tuned?: boolean; forced?: boolean };
const LLMS: Llm[] = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", short: "Sonnet 5.5", about: "The strongest writer", provider: "anthropic", rates: [0.603, 3.017] },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", short: "Haiku 4.5", about: "Quick, and it calls the tools", provider: "anthropic", rates: [0.302, 1.509], tuned: true, forced: true },
  { id: "gpt-6-sol", name: "GPT-6 Sol", short: "Sol", about: "A strong writer", provider: "openai", rates: [0.603, 3.017] },
  { id: "gpt-6-luna", name: "GPT-6 Luna", short: "Luna", about: "The cheapest, for the assistants", provider: "openai", rates: [0.030, 0.151] },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", short: "3.1 Pro", about: "A strong writer, slower", provider: "vertexai", rates: [0.422, 2.532], tuned: true },
  { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", short: "3.8 Flash", about: "Quick", provider: "vertexai", rates: [0.453, 2.263], tuned: true },
  { id: "gemma-4", name: "Gemma 4", short: "Gemma 4", about: "Open weights, inside ComfyUI", provider: "comfyui" },
];
// COMFYTURE_OPEN_WEIGHTS keeps every partner model out, the writers' and the artists'
const hasKey = () => !!process.env.COMFY_API_KEY?.trim() && !process.env.COMFYTURE_OPEN_WEIGHTS?.trim();
const model = (id: string) => LLMS.find((m) => m.id === id);
export const llms = () => LLMS.filter((m) => m.provider === "comfyui" || hasKey()).map(({ id, name, short, about, provider, rates }) => ({ id, name, short, about, provider, rates, router: provider !== "comfyui" }));
export type Role = "writer" | "assistant";
export function defaultLlm(role: Role = "writer") {
  // COMFYTURE_ASSISTANT=gemma, from before there was a choice, still keeps everything on Gemma 4
  const gemma = process.env.COMFYTURE_ASSISTANT?.trim().toLowerCase() === "gemma" ? "gemma-4" : "";
  const want = (role === "assistant" ? process.env.COMFYTURE_LLM_ASSISTANT?.trim() : process.env.COMFYTURE_LLM?.trim()) || gemma;
  if (want && llms().some((m) => m.id === want)) return want;
  if (!hasKey()) return "gemma-4";
  return "gpt-6-luna";
}
/** The model a request asks for, if it may be used; else its role's default. */
export const pickLlm = (v: unknown, role: Role = "writer") => (typeof v === "string" && llms().some((m) => m.id === v) ? v : defaultLlm(role));
export const onRouter = (id: string) => !!model(id) && model(id)!.provider !== "comfyui";
/** Whether the model can be handed a tool to answer through (Claude); the others write the JSON as text. */
export const takesTools = (id: string) => model(id)?.provider === "anthropic";
export const llmName = (id: string) => model(id)?.name ?? id;

/** A picture file as the models take it: inline, base64, with its type read from its first bytes. */
export async function imageBlock(path: string) {
  const bytes = await readFile(path);
  const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : "image/png";
  return { type, data: bytes.toString("base64") };
}

type Tool = { name: string; description: string; input_schema: unknown };
type Ask = { maxTokens?: number; temperature?: number; image?: { type: string; data: string }; images?: { type: string; data: string }[]; tool?: Tool };
/** The pictures an ask carries, in order: `image` first, then `images`. */
const picturesOf = ({ image, images }: Ask) => [...(image ? [image] : []), ...(images ?? [])];

/**
 * A model on Comfy Router: the brief as its system prompt, the prompt and a picture if there is one.
 * It answers with its text; a Claude handed a tool answers with the tool's input, as JSON.
 */
export async function routerAsk(id: string, system: string, prompt: string, opts: Ask = {}) {
  spend("words");
  const m = model(id);
  if (!m || m.provider === "comfyui") throw new Error(`${id} is not on Comfy Router.`);
  const { body, read } = m.provider === "openai" ? openai(m, system, prompt, opts) : m.provider === "vertexai" ? vertex(m, system, prompt, opts) : anthropic(m, system, prompt, opts);
  const res = await fetch(`https://api.comfy.org/v2/models/${m.provider}/${m.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": process.env.COMFY_API_KEY!.trim(), "Idempotency-Key": randomUUID() },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${m.name}: ${out?.error?.message ?? out?.detail ?? out?.message ?? `${res.status} ${res.statusText}`}`), { status: 502 });
  if (process.env.COMFYTURE_DEBUG) console.log(`${m.id} usage ${JSON.stringify(out.usage ?? out.usageMetadata)}`);
  const text = read(out);
  if (!text) throw Object.assign(new Error(`${m.name} answered nothing. Try again?`), { status: 502 });
  return text;
}

function anthropic(m: Llm, system: string, prompt: string, ask: Ask) {
  const { maxTokens = 3000, temperature = 0.7, tool } = ask;
  const content: Record<string, unknown>[] = [];
  for (const image of picturesOf(ask)) content.push({ type: "image", source: { type: "base64", media_type: image.type, data: image.data } });
  content.push({ type: "text", text: prompt });
  return {
    body: {
      model: m.id,
      max_tokens: maxTokens,
      ...(m.tuned ? { temperature } : {}),
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      ...(tool ? { tools: [tool], tool_choice: m.forced ? { type: "tool", name: tool.name } : { type: "auto" } } : {}),
      messages: [{ role: "user", content }],
    },
    read: (out: any) => {
      const call = (out.content ?? []).find((c: any) => c.type === "tool_use");
      return call ? JSON.stringify(call.input) : String((out.content ?? []).map((c: any) => c.text ?? "").join(""));
    },
  };
}

// OpenAI's Responses API: the GPT-6 ids reason, so their room covers the thinking too, kept brief
function openai(m: Llm, system: string, prompt: string, ask: Ask) {
  const { maxTokens = 3000 } = ask;
  const content: Record<string, unknown>[] = [{ type: "input_text", text: prompt }];
  for (const image of picturesOf(ask)) content.push({ type: "input_image", image_url: `data:${image.type};base64,${image.data}` });
  return {
    body: { instructions: system, input: [{ role: "user", content }], max_output_tokens: maxTokens * 3, reasoning: { effort: "low" } },
    read: (out: any) => String((out.output ?? []).filter((o: any) => o.type === "message").flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text ?? "").join("")),
  };
}

// Google's generateContent: thought parts are left out of the answer
function vertex(m: Llm, system: string, prompt: string, ask: Ask) {
  const { maxTokens = 3000, temperature = 0.7 } = ask;
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const image of picturesOf(ask)) parts.push({ inlineData: { mimeType: image.type, data: image.data } });
  return {
    body: { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: Math.min(65536, maxTokens * 3), temperature } },
    read: (out: any) => String((out.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("")),
  };
}
