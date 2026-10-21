// Who made the model at the core of a workflow or a tool: its logo is pressed into the book's spine (the Library's and the Shelf's) and
// the Library filters by it. A maker is found from what Comfy's catalogue says (its `logos` providers), then from the workflow's models,
// then from its title: the first rule that matches wins, so the families come before the companies that make them (Nano Banana and Gemini
// before Google, Qwen before Alibaba). Plain data with no imports: the server (the Library's catalogue) and the page read the same rules.
// The logos are web/brand/makers/mono/<id>.svg (one colour, 24x24); scripts/utensils-makers.mjs makes the pressed ones and their CSS.

/** The makers, in the order they are tried. `id` is the logo's file; `by` is the company, when the logo is a family's. */
export const MAKERS = [
  { id: "nanobanana", name: "Nano Banana", by: "Google", match: /nano\s*banana/i },
  { id: "gemini", name: "Gemini", by: "Google", match: /gemini|\bveo\b|\bomni\b.*flash|imagen/i },
  { id: "google", name: "Google", match: /\bgoogle\b|gemma|\bfilm\b|mediapipe/i },
  { id: "bytedance", name: "ByteDance", match: /bytedance|seed(ream|ance|vr|\s*audio|\s*2\.0|edit)|depth\s*anything|\bhumo\b|vcube|dreamina/i },
  { id: "kling", name: "Kling", by: "Kuaishou", match: /kling|liveportrait|kolors/i },
  { id: "grok", name: "Grok", by: "xAI", match: /\bgrok\b|\bxai\b/i },
  { id: "openai", name: "OpenAI", match: /openai|\bgpt[-\s]?(image|\d)|chatgpt|dall[-·\s]?e/i },
  { id: "flux", name: "FLUX", by: "Black Forest Labs", match: /\bflux|black\s*forest|kontext/i },
  { id: "qwen", name: "Qwen", by: "Alibaba", match: /qwen/i },
  { id: "wan", name: "Wan", by: "Alibaba", match: /\bwan\s?[\d.]|\bwan\b|wanmove|wan-move|\bvace\b|wan\s*animate|wan\s*dancer|\bati\b/i },
  { id: "alibaba", name: "Alibaba", match: /alibaba|z-image|zimage|\bovis/i },
  { id: "lightricks", name: "LTX", by: "Lightricks", match: /\bltx|lightricks/i },
  { id: "hunyuan", name: "Hunyuan", by: "Tencent", match: /hunyuan|\bhy\s?(3d|image|video|\d)/i },
  { id: "stability", name: "Stability", match: /stability|\bsdxl|\bsd\s?[\d.]+|\bsd3|stable\s*(audio|diffusion|video)|\bsvd\b/i },
  { id: "claude", name: "Claude", by: "Anthropic", match: /claude|anthropic/i },
  { id: "minimax", name: "MiniMax", match: /minimax|hailuo/i },
  { id: "vidu", name: "Vidu", match: /\bvidu/i },
  { id: "pixverse", name: "PixVerse", match: /pixverse/i },
  { id: "luma", name: "Luma", match: /\bluma\b|\bray\s?\d|photon|uni-1/i },
  { id: "runway", name: "Runway", match: /runway|aleph/i },
  { id: "recraft", name: "Recraft", match: /recraft/i },
  { id: "ideogram", name: "Ideogram", match: /ideogram/i },
  { id: "bria", name: "Bria", match: /\bbria\b/i },
  { id: "elevenlabs", name: "ElevenLabs", match: /eleven\s*(labs|v\d)|elevenlabs/i },
  { id: "fishaudio", name: "Fish Audio", match: /fish\s*audio/i },
  { id: "tripo", name: "Tripo", match: /tripo/i },
  { id: "meshy", name: "Meshy", match: /meshy/i },
  { id: "rodin", name: "Rodin", by: "Hyper3D", match: /rodin|hyper3d/i },
  { id: "topaz", name: "Topaz", match: /topaz/i },
  { id: "magnific", name: "Magnific", match: /magnific/i },
  { id: "krea", name: "Krea", match: /\bkrea/i },
  { id: "heygen", name: "HeyGen", match: /heygen/i },
  { id: "happyhorse", name: "HappyHorse", match: /happy\s*horse/i },
  { id: "higgsfield", name: "Higgsfield", match: /higgsfield/i },
  { id: "wavespeed", name: "WaveSpeed", match: /wavespeed/i },
  { id: "pruna", name: "Pruna", match: /pruna/i },
  { id: "sync", name: "Sync", match: /\bsync(\.so|\s*\d)/i },
  { id: "beeble", name: "Beeble", match: /beeble/i },
  { id: "hitpaw", name: "HitPaw", match: /hitpaw/i },
  { id: "quiver", name: "Quiver", match: /quiver|\barrow\s?2/i },
  { id: "sonilo", name: "Sonilo", match: /sonilo/i },
  { id: "ace", name: "ACE-Step", by: "ACE Studio", match: /ace[-\s]?step/i },
  { id: "hidream", name: "HiDream", match: /hidream/i },
  { id: "kandinsky", name: "Kandinsky", match: /kandinsky/i },
  { id: "baai", name: "BAAI", match: /omnigen|\bbaai\b/i },
  { id: "meta", name: "Meta", match: /\bmeta\b|\bsam\s?\d|segment\s*anything/i },
  { id: "microsoft", name: "Microsoft", match: /microsoft|\bmai\b|\bmai[-\s]image|\bmoge\b/i },
  { id: "nvidia", name: "NVIDIA", match: /nvidia|\brtx\b/i },
  { id: "baidu", name: "Baidu", match: /baidu|\bernie\b/i },
  { id: "longcat", name: "LongCat", by: "Meituan", match: /longcat/i },
  { id: "antgroup", name: "Ant Group", match: /\bming\b|inclusionai|ant\s*group/i },
  { id: "kimi", name: "Kimi", by: "Moonshot", match: /\bkimi\b|moonshot/i },
  { id: "openrouter", name: "OpenRouter", match: /openrouter/i },
];

/** Comfy's own provider names (its catalogue's `logos`) that are not a maker's name as it is written above. */
const PROVIDER = { "black forest labs": "flux", wan: "wan", bria: "bria", grok: "grok", "sync.so": "sync", "fish audio": "fishaudio", topaz: "topaz", pruna: "pruna", meta: "meta", hunyuan: "hunyuan", lightricks: "lightricks", anthropic: "claude", happyhorse: "happyhorse", rodin: "rodin" };

export const makerById = (id) => MAKERS.find((m) => m.id === id) ?? null;

/**
 * The maker of a workflow (or a tool): `providers` are the catalogue's (its logos), `models` its model files or names, `title` its title.
 * The title names the model at its core ("Seedance 2.0 + LLM Prompt Helper" is Seedance's, though a Gemini writes its prompt), then the
 * models, which name the family better than the provider does (a Google workflow running Nano Banana is Nano Banana's); the provider
 * decides when they name none. Answers a maker's id, or null.
 */
export function makerOf({ providers = [], models = [], title = "" } = {}) {
  for (const text of [title, models.join(" ")]) for (const m of MAKERS) if (m.match.test(text)) return m.id;
  for (const p of providers.flat()) {
    const key = String(p ?? "").trim().toLowerCase();
    const id = PROVIDER[key] ?? MAKERS.find((m) => m.name.toLowerCase() === key || m.id === key)?.id;
    if (id) return id;
  }
  return null;
}
