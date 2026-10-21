# Official ComfyUI templates on Comfy Cloud: research for the Utensils "Templates" workspace

Researched 2026-10-21. Read-only: only GET calls (plus the read-only MCP calls `initialize`, `tools/list`, `get_template_schema`, `estimate_credits`, `search_templates`). Nothing was submitted, uploaded or generated; no credits were spent. The API key was used from `.env` and never printed.

Shortlist of 40 templates as JSON: `docs/research/comfy-templates-shortlist.json`.

## 0. The short answer

1. The catalog is the MIT repo `Comfy-Org/workflow_templates`. Comfy Cloud serves its own copy, public and with no key, at `https://cloud.comfy.org/templates/index.json` (695 templates today; GitHub `main` has 701).
2. All templates are UI-format (litegraph "save" format), not API-format. 39% use subgraphs. Neither Cloud API v1 (`/api/prompt`) nor v2 (`/api/v2/jobs`) accepts UI format (v2 answers `422 workflow_format_ui`).
3. Cloud has a hosted MCP server, `https://cloud.comfy.org/mcp` (works with the `X-API-Key` header), whose tools do exactly what Utensils needs: `get_template_schema` (the form), `estimate_credits` (cost before running), `run_template` (server-side UI-to-API conversion plus submit), `save_workflow` and `run_saved_workflow` (convert any editor JSON). That is the simplest reliable converter. A local Node port is the fallback (algorithm in section 3).
4. Everything after submit (job tracking, cancel, outputs, uploads, model import) is already covered by `server/engine.ts`, `server/cloud.ts` and `@comfyorg/sdk`.

## 1. Where the catalog lives

### Sources, all tested with GET

| What | URL | Result |
|---|---|---|
| Cloud's own catalog (best choice: matches what Cloud can run) | `https://cloud.comfy.org/templates/index.json` | 200, 781 KB, no key needed, 695 templates |
| Cloud's per-template workflow | `https://cloud.comfy.org/templates/{name}.json` | 200; 677 of 695 JSON-identical to GitHub `main`, 18 differ slightly |
| Cloud's thumbnail | `https://cloud.comfy.org/templates/{name}-1.webp` (`-2.webp` for before/after) | 200 image/webp (audio templates: `-1.mp3`) |
| Cloud's MCP-oriented index | `https://cloud.comfy.org/templates/index.mcp.json` | 200, 564 KB |
| GitHub raw index | `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/index.json` | 200, 789 KB, ETag, `max-age=300`, 701 templates |
| GitHub raw workflow / thumbnail | `.../main/templates/{name}.json`, `.../main/templates/{name}-1.webp` | 200 |
| jsDelivr | `https://cdn.jsdelivr.net/gh/Comfy-Org/workflow_templates@main/templates/index.json` (and `...-1.webp`) | 200. Pin a tag instead of `main`: tags exist, latest `v0.11.93` (tag URL not fetched) |
| Index schema | `.../main/templates/index.schema.json` | 200, JSON Schema draft-07 (fields below) |
| GitHub API tree | `https://api.github.com/repos/Comfy-Org/workflow_templates/git/trees/main?recursive=1` | 4791 entries, not truncated |
| PyPI | `https://pypi.org/pypi/comfyui-workflow-templates/json` | 0.11.93, MIT. Meta package; real files in `-core`, `-json`, `-media-image/video/other/api`, `-media-assets-01/02` (each ~90-100 MB) |
| npm | `@comfyorg/comfyui-workflow-templates` | 404. There is no npm package |
| Cloud `/api/workflow_templates` | `https://cloud.comfy.org/api/workflow_templates` | 200 `{}`. Empty on Cloud (OpenAPI says "Empty object") |
| Cloud `/api/templates`, `/api/templates/index.json` | | 404 |
| ComfyUI core | `server.py` serves the pip package as static `/templates/*` (so `/templates/index.json`); `/api/workflow_templates` (custom_node_manager.py) maps custom-node packs to their `example_workflows`, NOT the official catalog | read from source |

Cloud reports (`GET /api/system_stats`): `cloud_version v0.483.0`, `comfyui_version v0.42.1`, `workflow_templates_version 0.7.64`.

Recommendation: fetch `https://cloud.comfy.org/templates/index.json` (fall back to jsDelivr `@v0.11.93`), cache to disk, revalidate daily. Do NOT vendor the repo: `templates/` is 608 MB, `input/` 2.2 GB, `output/` 1.2 GB. Vendoring only the index (0.8 MB) plus lazily cached `-1.webp` thumbnails (tens of KB each) is enough. Workflow JSONs: 702 files, 27.7 MB total, fetched on demand (all 701 downloaded in 19 s with 16 parallel curls).

### index.json shape

Top level: array of 12 categories `{moduleName: "default", category: "Foundation"|"Applied", isEssential?, title, icon, type: "image"|"video"|"audio"|"3d"|"llm", templates: []}`.
Categories (Cloud counts): Image 209, Image Tools 55, Video 210, Video Tools 43, Audio 41, 3D Model 44, Vector 7, LLM 20, Node Basics 7, Product & Ads 16, Character & Fashion 28, Brand & Design 15. Names are unique across categories (701 entries = 701 names).

Template fields (counts on 701): `name` (701, = file name without .json, pattern `^[a-zA-Z0-9._-]+$`), `title`, `description`, `mediaType` (image|video|audio|3d; the observed values are only `image` 690 and `audio` 11, because it describes the THUMBNAIL), `mediaSubtype` (`webp` or `mp3`, the thumbnail extension), `tags` (e.g. "Text to Image", "Image Edit", "API", "Int8", "LoRA", "Video Edit", "Relight", "Remove Background"), `models` (699, display names like "Wan2.2", "LTX-2.3"), `date`, `usage` (popularity counter), `username` (creator), `minComfyUIVersion` (698), `size` (679, bytes of models to download; 0 for partner), `openSource` (650: true 256, false 394), `searchRank` (591), `io` (622: `{inputs:[{nodeId,nodeType,file,mediaType}], outputs:[{nodeId,nodeType,file,mediaType}]}`; `inputs[].file` is the sample input file under repo `input/`), `thumbnail` (356, up to 2 repo-root paths in `output/`, `input/` or `thumbnail/`, full-size originals, do not use), `thumbnailVariant` (205: compareSlider 180, hoverDissolve 23, hoverZoom, zoomHover), `logos` (317: `[{provider}]`, logo files in `index_logo.json`), `requiresCustomNodes` (79: Registry pack ids), `tutorialUrl` (156), `includeOnDistributions` (23), `isApp` (18; true = App Mode, derived from the workflow's `extra.linearMode`), `status` (active|archived|deprecated).

Thumbnail addressing: every one of the 701 has `templates/{name}-1.{mediaSubtype}`. 194 also have `-2.webp` (the "after" image for compareSlider / hoverDissolve). Use these, never the `thumbnail` array.

Counts: 701 total; 390 carry the tag "API" (partner/API-node templates); 256 open-source; 79 need custom node packs.

### License and terms

- Repo `Comfy-Org/workflow_templates`: MIT, "Copyright (c) 2023-present Comfy Org" (GitHub API `license.spdx_id = MIT`; LICENSE file read). The pip package is MIT. Fine to vendor or fetch into an MIT app. The README states no separate media license.
- Not safe to copy into an MIT app: ComfyUI frontend `graphToPrompt` (GPL-3.0), `comfy-cli` (GPL-3.0, includes the Python converter), ComfyUI itself (GPL-3.0). Reading them to understand the algorithm is fine; port from the Unlicense converter instead.
- Models and partner services have their own terms: `openSource:false` on 394 templates; running a partner template sends your content to the provider; partner logos are trademarks (show them only as the provider label); some partner templates (Seedance `*_real_human`) need ByteDance asset ids or KYC. Credit creators with `username`.
- The Cloud OpenAPI file declares GPL-3.0 for the spec (docs.comfy.org/openapi-cloud.yaml).

## 2. Template workflow format

All 701 are UI-format, `version: 0.4`, with `last_node_id`, `last_link_id`, `nodes`, `links` (array form `[id, origin_id, origin_slot, target_id, target_slot, type]`), `groups`, `config`, `extra`.

Measured on the 701 GitHub files:
- 274 (39%) have `definitions.subgraphs` (272 of 695 on Cloud). 23 have nested subgraphs (a subgraph whose inner node is another subgraph).
- 482 node instances are bypassed (mode 4), 3 muted (mode 2), 41 `PrimitiveNode`, 81 legacy `Reroute`, 782 `MarkdownNote`, 85 `Note`.
- 0 group nodes (`workflow>...` types); `extra.groupNodes` is empty everywhere. Group-node support is not needed.
- 294 embed `properties.models = [{name, url, directory}]` on loader nodes (1429 Hugging Face URLs, 6 civitai). This is the model manifest, usable for imports.
- 49 have `extra.linearData = {inputs: [[nodeId, widgetName], ...], outputs: [nodeId...]}`, and 18 (`isApp: true`, names end in `.app`) have `extra.linearMode`. This is the template author's own list of "the inputs a friendly form should show" (App Mode). Use it when present.

Node types used (top): LoadImage 612, SaveImage 462, SaveVideo 344, CLIPTextEncode, PrimitiveInt, ComfySwitchNode, KSampler, UNETLoader, LoadVideo 77, LoadAudio 41, partner nodes like GeminiImage2Node 67.

### Cloud object_info

`GET https://cloud.comfy.org/api/object_info` (X-API-Key): 200, 10,554,032 bytes in 2.6 s; with `Accept-Encoding: gzip` it is 985 KB in 1.4 s. `cache-control: private, no-store`, so cache it yourself (key it on `cloud_version`). 3796 node definitions, 280 with `api_node: true`, 276 with `price_badge`. Per node: `input` {required, optional, hidden}, `input_order`, `output`, `output_name`, `display_name`, `description`, `python_module`, `category`, `output_node`, `search_aliases`, `deprecated`, `experimental`.

Coverage: of all node types used by the 701 templates (including inside subgraphs), only 7 are missing from Cloud's object_info, in 6 templates, and those 6 are exactly the ones absent from Cloud's own index (`api_bria_fibo2_t2i`, `api_clarity_ai_crystal_video_upscale`, `api_flux3_max_i2v`, `api_flux3_max_t2v`, `api_heygen_voice_1`, `video_fasth3_ominiref_r2v`) plus a mistyped node in `template_animate_diff_loops`. Cloud preinstalls RES4LYF, KJNodes, Impact Pack, WAS, LayerStyle, WanVideoWrapper, LTXVideo, Fill-Nodes, VideoHelperSuite, etc., so the 79 templates with `requiresCustomNodes` still resolve.

### Cloud accepts only API format

- v1 `POST /api/prompt`: `{prompt: <API graph>, extra_data?, partial_execution_targets?}`.
- v2 `POST /api/v2/jobs`: `{workflow: <API graph>, extra_data: {api_key_comfy_org | auth_token_comfy_org}}`; the SDK rejects UI format locally (`guardUiFormat`, `WorkflowFormatUi`) and the server answers `422 workflow_format_ui`.
- Server-side conversion exists only through the MCP tools `run_template`, `run_saved_workflow`, `get_template_schema`, `estimate_credits`, `apply_slots` (see section 4).

### What graphToPrompt does (ComfyUI_frontend `src/utils/executionUtil.ts` + `src/lib/litegraph/src/subgraph/ExecutableNodeDTO.ts`)

1. Run `applyToGraph` on virtual nodes (Primitive etc.), then `graph.serialize()`.
2. Build one DTO per node in execution order. Subgraph instances are flattened: the inner node's id is `outerId:innerId` (nested: `a:b:c`).
3. Skip a node if it is virtual (Note, MarkdownNote, PrimitiveNode, Reroute, GetNode/SetNode) or `mode === 2` (muted) or `mode === 4` (bypass).
4. For every kept node: for each widget (in node widget order) with `options.serialize !== false`, `inputs[widget.name] = value` (array values are wrapped as `{__value__: [...]}`, `curve` widgets as `{__type__: "CURVE", __value__}`).
5. For every `node.inputs[i]`: `resolveInput(i)`. Result is either a literal widget value (`widgetInfo`, used for subgraph inputs that are unconnected and for converted widgets fed by a Primitive) or `[originExecId, originSlot]`.
6. `resolveOutput(slot, type)` on the source: muted gives nothing (input omitted); bypass gives `resolveInput(_getBypassSlotIndex(slot, type))` where the index is: type `*` or empty means same slot index (else 0); otherwise the same slot index if both its type and the output type accept the connection; else the first input with exactly the requested type; else the first compatible input; none means the input is dropped. Subgraph instance gives the inner node behind the subgraph output (`resolveSubgraphOutput`). Virtual Get/Set resolve to the Set node's source. Reroutes are followed.
7. A link that leaves a subgraph (origin id `-10`, the input proxy) is resolved through the outer instance's input link, or, if unconnected, to the instance's promoted widget value. A link to `-20` is the output proxy.
8. Post-process: delete any `[id, slot]` input that points at a node not in the output. Add `class_type = node.comfyClass` and `_meta.title`.

### What a Node port needs from object_info (the part the frontend gets from its node classes)

The UI JSON stores `widgets_values` as a flat positional array. Names come from `object_info`:
- Walk `input_order.required` then `input_order.optional`. An input is a widget when its type is an array (legacy combo) or one of `INT FLOAT STRING BOOLEAN COMBO COMFY_DYNAMICCOMBO_V3 COMFY_AUTOGROW_V3 COLOR CURVE BOUNDINGBOX MARKDOWN IMAGECOMPARE WIDGET_GROUP`, and `forceInput` is not set. Everything else is a socket.
- Insert an extra value after a widget whose options carry `control_after_generate` (value is one of `fixed|increment|decrement|randomize`; drop it from the API inputs). `image_upload`/`video_upload`/`audio_upload` add a trailing pseudo-widget (`"image"`, `null`); drop it.
- `COMFY_DYNAMICCOMBO_V3`: the selected key, then the sub-inputs of the selected option (`options[i].inputs.required/optional`), flattened in order; API input names are dotted (`model`, `model.resolution`, `model.max_tokens`). Socket names inside dynamic/autogrow groups are dotted too (`model.images.image_1`, `images.image0`).
- Widgets that are also sockets (`node.inputs[i].widget.name` with a `link`) take the link, not the widget value.
- Fill missing required inputs with the schema default; normalize combo case (`True`/`true`).
- Some nodes store `widgets_values` as an object (VideoHelperSuite `VHS_VideoCombine`) and expose extra widgets not in object_info; map them by key.

Measured: a naive positional mapping from object_info agrees with `len(widgets_values)` on 10,132 of 11,853 nodes (85.5%). The disagreements are dynamic combos, output nodes with format widgets (SaveVideo, SaveImageAdvanced, SaveAudioAdvanced), CreateVideo, ImageCompare, TextGenerate, upload widgets and similar. That is why a plain port needs the special cases, and why an existing, tested implementation is the right base.

### Existing converters (nothing in npm)

| Name | Language | License | Notes |
|---|---|---|---|
| `SethRobinson/comfyui-workflow-to-api-converter-endpoint` (`workflow_converter.py`, 72 KB) | Python, in-process node registry | Unlicense (public domain), last push 2026-03 | The base everyone ports from. Handles nested subgraphs, GetNode/SetNode, Reroute, bypass tracing, control_after_generate, V3 dynamic combos, default fill, combo normalization. 1 MB request cap, depth cap 100. https://github.com/SethRobinson/comfyui-workflow-to-api-converter-endpoint |
| `Comfy-Org/comfy-cli` `comfy_cli/workflow_to_api.py` (114 KB) | Python, takes an `object_info` dict | GPL-3.0 | A port of Seth's, restructured for `object_info`; `comfy run --workflow` (v1.8.0+) converts UI format. Adds promoted widgets, autogrow, dynamic groups. Do not copy into an MIT app; use as a test oracle. `pip install comfy-cli` |
| `lalanikarim/comfyui-mcp`, `IO-AtelierTech/comfyui-mcp`, `chyueyi/ComfyUI-Magicframe` | | | Referenced in comfy-cli issue #446; not reviewed |
| npm (`comfyui-json`, `@saintno/comfyui-sdk`, `@stable-canvas/comfyui-client`) | | | API-format only; none converts |

Oracle test run (scratch venv, `comfy-cli 1.23.0`, Cloud object_info, Cloud's 695 workflows): converts 695 of 695 without exception in 0.8 s total. A structural check (unknown input names, missing required inputs, against object_info) is clean for 644 (93%); the 51 others are VHS_VideoCombine extra widgets (27), ImageBatchMulti dynamic `image_N` inputs (29), GLSLShader dynamic inputs, a LoadImage `button` widget, and a few bypass-trace misses (`video_wan_vace_inpainting` node `306:308`). So even the reference port is about 93% perfect before Cloud validation; expect to handle these in a Node port.

### Recommendation for plain Node

Primary: let Cloud convert (MCP, section 4). Zero conversion code, always in step with Cloud's node versions.
Fallback or offline: port Seth's algorithm to TypeScript (about 500 lines) with Cloud object_info; regression-test against the comfy-cli output on all 695 templates and against the MCP `get_template_schema.nodes` list (it returns the converted graph's node ids and literal inputs for templates without subgraph slots).

## 3. Comfy Cloud API facts for running a graph

Two surfaces. v1 (OpenAPI https://docs.comfy.org/openapi-cloud.yaml, X-API-Key header, marked deprecated in favor of v2 but still the only place for credits, models, queue) and v2 (`Authorization: Bearer <key>`, used by `@comfyorg/sdk`).

| Need | Endpoint | Tested |
|---|---|---|
| Submit | v1 `POST /api/prompt` `{prompt, extra_data}` -> `{prompt_id, number, node_errors}`; v2 `POST /api/v2/jobs` `{workflow, extra_data}` (header `Idempotency-Key`, single use, 24 h) -> 201 Job. Errors: 402 insufficient credits, 422 `invalid_workflow` (per-node details) / `workflow_format_ui` / `missing_asset`, 429 `queue_full` (SDK retries) | not called |
| Status | v1 `GET /api/job/{id}/status` (spec enum `waiting_to_dispatch|pending|in_progress|completed|error|cancelled`; a finished job actually answered `success`, so treat unknown values loosely), `GET /api/jobs/{id}` (full detail), `GET /api/history_v2/{id}`; v2 `GET /api/v2/jobs/{id}` (+ `/events` SSE, `/logs`, `/workflow`) | v1 status 200; v2 by id 200 and it works on jobs created via v1 ids (`outputs[]`, `metrics.execution_ms`, `metrics.queue_ms`) |
| Outputs | v2 `job.outputs[]` = `{id, node_id, name, type, content_type, size_bytes, hash, url}`; `url` is auth-only; `getDownloadUrl()` gives a signed URL valid about 6 h; job `expires_at` = created + 30 d. v1 `GET /api/view?filename=&subfolder=&type=` (redirect to signed storage) | docs |
| Inputs | v1 `POST /api/upload/image` multipart (`image`, `type`, `overwrite`); limits 50 MB, 16384 px per edge, 64 MP; `GET /api/features` says `max_upload_size 104857600`; storage is content-addressed (subfolder ignored). v2 `POST /api/v2/assets` (+ `from-hash`, `HEAD by-hash`); the SDK `client.assets.fromFile(path)` handle is turned into a `core/ASSET` reference at submit and `wf.setInput(loaderNodeId, "image"|"file", asset)` binds it | docs/SDK; no upload made |
| Model library | `GET /api/experiment/models` -> 136 folders; `GET /api/experiment/models/{folder}` -> `[{name, pathIndex}]` (diffusion_models 377, loras 652, checkpoints 75, vae 44, text_encoders 73). Loader widgets take the plain file name. Your imports: `GET /api/assets?include_tags=models` -> `loader_path` | 200 |
| Missing model | The job is rejected at submit: 422 `invalid_workflow` with a "value not in list" node error (`engine.ts` already maps it to "ComfyUI is missing a model"). Import: `POST /api/assets/download {source_url, tags:["models","<folder>"]}` (huggingface.co or civitai.com only) -> 200 or 202 `{task_id}`; poll `GET /api/tasks/{id}`. `server/cloud.ts` `CloudLibrary` already does this and rewrites loader names to `loader_path` | read |
| Partner nodes | Same Comfy key, no separate key. v1: `extra_data.api_key_comfy_org`; v2: SDK `client.submit(wf, {apiKey})`. Billed in credits from the account balance (prepaid, 402 when empty). `engine.ts` does not pass `apiKey` today: add it for partner graphs | docs/SDK |
| Cost before run | v1/v2 have none. Partner nodes: `object_info[node].price_badge = {engine:"jsonata", depends_on:{widgets,inputs,input_groups}, expr}`; expr returns `{type: usd|range_usd|list_usd|text, usd,...}` from widget values; evaluate with the `jsonata` npm package. Easier: MCP `estimate_credits` (tested: `api_nano_banana_2_1_image_edit` -> "GeminiNanoBanana2V2 ~12 credits/Image", LTX-2.3 -> "0 credits, no paid API nodes"). Excludes GPU time and storage. GPU time: use your own timings (`jobs[].execution_start_time/execution_end_time`, v2 `metrics.execution_ms`). Pricing table: https://docs.comfy.org/tutorials/partner-nodes/pricing | MCP tested |
| Balance | v1 `GET /api/billing/balance` (fields `amount_micros`, `cloud_credit_balance_micros`, `prepaid_balance_micros`, `effective_balance_micros`, `low_balance`), `GET /api/billing/usage/timeseries` | 200 |
| Queue / jobs / cancel | v1 `GET /api/queue` -> `{queue_pending, queue_running}`; `GET /api/jobs?status=&sort_by=&limit=&offset=` -> `{jobs[], pagination{total,next_cursor,...}}` (674 jobs on this account); cancel pending `POST /api/queue {delete:[ids]}` (or `{clear:true}`); cancel running `POST /api/interrupt` (kills all your running jobs); v2 `POST /api/v2/jobs/{id}/cancel` (SDK `job.cancel()`, what `engine.ts` uses). v2 `GET /api/v2/jobs` list returns 501 "Comfy Cloud does not list jobs yet" | 200 / 501 |
| Concurrency | `/api/features`: `max_concurrent_jobs: 3`. `engine.ts` serializes jobs on purpose | 200 |
| Access | Running needs an active Cloud subscription (new users: 5 free runs, `free_tier_offer.job_allowance 5`). Credits alone do not grant API access | docs |

### What to reuse from `server/engine.ts`

- `new Comfy({clientInfo})` client and `client.submit(client.workflows.fromJson(graph), {signal})` -> `job.events(signal)` loop (statusChange queued/running, progress, preview) -> `job.wait()` -> `job.getOutputs(nodeId)[i].toFile/toBytes`. For arbitrary templates use `job.outputs` (all outputs, each has `nodeId`, `name`, `type`, `contentType`, `sizeBytes`).
- `execute()/runJob()`: queue gate (`acquire/release`), abort -> `job.cancel()`, estimated progress from `timings.json` (`expected/learn`), preview frames (`previewImage`).
- `client.assets.fromFile(path)` for inputs: photos everywhere, and video too (`graph.video_in.inputs.file = asset` in `videoJob()` for `upscale-video.json`). The SDK scans the graph for asset handles and swaps them for `core/ASSET` references at submit; audio works the same way on a `LoadAudio.audio` input. This is the proven upload path, and it only works when you submit through the SDK (the local converter route).
- `prepare(graph)` -> `CloudLibrary.resolve(graph)` (model rename + the model-import code in `server/cloud.ts`; extend `IMPORTS` from a template's `properties.models`).
- Error mapping for missing models (line ~292).
- Gaps: no `apiKey` on submit (partner), and it assumes named output node ids (`"video"`, `"out"`); templates need "all outputs".

## 4. Cloud MCP server (the discovered shortcut)

`POST https://cloud.comfy.org/mcp`, Streamable HTTP, JSON-RPC, replies as `text/event-stream` (`event: message` / `data: {...}`). Auth: OAuth, or headless with header `X-API-Key` (verified: `initialize` returned 200, `serverInfo.version 0.71.3`, header `mcp-session-id`; send it plus `MCP-Protocol-Version: 2025-06-18` on the next calls, after `notifications/initialized`). Docs: https://docs.comfy.org/development/cloud/mcp-server. 41 tools. Relevant ones:

| Tool | Use for Utensils | Tested |
|---|---|---|
| `search_templates` {q, tag, media_type, model, limit<=100, offset, detail:"full"} | optional server-side search over 310+ matches | yes |
| `get_template_schema` {template_id} | The form. Returns `slots[]` `{address:"57.text", node_id, input_name, class_type, type, default, known, source: "subgraph_input"|"promoted_widget", route?, wired_to?{kind: model|media, node_id, inputs}}` for subgraph templates (`image_z_image_turbo`: text, width, height, seed, steps, unet_name, clip_name, vae_name). For templates without subgraph slots: `slots: []` plus `nodes[]` = the converted API graph `{id, class_type, inputs}` (shows `LoadImage.image`, the prompt, seed, dotted dynamic inputs). Budgeted: big manifests drop trailing slots into `dropped_addresses` | yes |
| `estimate_credits` {template_name} or {workflow} (API or save format) | Cost chip. Read-only | yes |
| `run_template` {name, slot_overrides, input_overrides {nodeId:{input:value}}, confirm, wait_for_output} | Converts and submits. `confirm:true` required when the graph has paid API nodes. Returns `prompt_id` | not called |
| `apply_slots` {workflow, overrides} | Preview an edited workflow without running | not called |
| `save_workflow` + `run_saved_workflow` | Convert and run any user-supplied editor JSON | not called |
| `get_job_status`, `wait_for_job`, `get_output`, `cancel_job`, `get_queue`, `upload_file`, `get_billing_status` | Overlap with REST/SDK; `upload_file` in a remote session only returns a PUT command for a shell, so upload through REST or the SDK instead | listed |

Open points to verify with one cheap run (needs a paid call, so not done here): (a) a job started by `run_template` can be followed with the SDK (`client.jobs.get(prompt_id)`); v2 GET by id works for old v1 jobs, so very likely. (b) The file name an SDK/REST upload returns is accepted as the `LoadImage.image` / `LoadVideo.file` / `LoadAudio.audio` value in `input_overrides` (content-addressed names; `upload_file` docs say to wire `name` into those inputs).

## 5. Recommended architecture

Server (new files; keep `engine.ts` as the executor):

1. `server/templates.ts` (catalog): fetch `https://cloud.comfy.org/templates/index.json` at start and daily; fallback jsDelivr tag. Flatten categories to `[{name,title,description,tags,models,logos,date,usage,openSource,isApp,requiresCustomNodes,io,category,type}]`; derive card facts: `api` = tag "API"; input kinds from `io.inputs[].mediaType` plus a scan of the workflow for `LoadImage/LoadVideo/LoadAudio/Load3D` and a prompt widget; output kinds from `io.outputs` or `Save*` node types. Cache to `data/templates/`. Serve thumbnails through `/api/templates/{name}/thumb` (proxy `.../templates/{name}-1.webp`, cache).
2. `server/templates-form.ts`: `GET /api/templates/{name}/form`: call MCP `get_template_schema`; if the workflow has `extra.linearData`, show only those widgets first (the author's own form), the rest under "Advanced". Enrich each field from the cached `object_info` of its `class_type`/input (min, max, step, options, tooltip, multiline, default) so the UI can draw sliders, selects, prompt boxes, seed with randomize, size pickers. Media slots (`wired_to.kind == "media"` or a Load* node) become upload fields (image/video/audio, limits 50 MB image, 100 MB upload). Model slots (`wired_to.kind == "model"`) stay hidden, with a "needs model X" warning from `properties.models` when absent from the shared library.
3. `POST /api/templates/{name}/estimate`: MCP `estimate_credits`; show "~N credits per unit" for partner nodes and "Cloud GPU time" from your own timings.
4. `POST /api/templates/{name}/run`: upload inputs (SDK/REST), call MCP `run_template` with `slot_overrides`/`input_overrides` (and `confirm:true` only after the user clicked past the credit prompt), take `prompt_id`, then track it like any engine job (SDK job events, cancel, previews), and save every `job.outputs[]` into the results library (re-host the bytes, do not keep signed URLs).
5. Fallback: local Node converter (section 2) feeding the existing `Engine.execute()`, selectable per template if the MCP is unavailable or returns an error.

Client: card grid (thumbnail, title, description, tags chips, models, input-kind icons, partner badge with credit estimate, usage), filters by category/tag/model/input kind/output kind/openSource, and the generated form plus a results panel.

## 6. Shortlist of 40 (full JSON in comfy-templates-shortlist.json)

All 40 are in Cloud's own index (695), have no loader model missing from Cloud's shared lists (checked against object_info combos), and convert without exception with the oracle.

| # | id | group | models | inputs | output | good for |
|---|---|---|---|---|---|---|
| 1 | image_z_image_turbo | Image | Z-Image-Turbo | text | image | fast text to image |
| 2 | image_flux2 | Image | FLUX.2 Dev | text, image | image | text to image, reference editing |
| 3 | image_qwen_image_edit_2509 | Image | Qwen-Image-Edit 2509 | image, text | image | image editing |
| 4 | flux_kontext_dev_basic | Image | Flux.1 Kontext Dev | image, text | image | image editing, restyle |
| 5 | image_flux2_klein_image_edit_9b_base | Image | FLUX.2 Klein 9B | image x2, text | image | image editing |
| 6 | image_qwen_image_edit_2509_relight | Image | Qwen-Image-Edit | image, text | image | relight |
| 7 | image_qwen_image_instantx_inpainting_controlnet | Image | Qwen-Image | image (+mask), text | image | inpaint, remove object |
| 8 | templates-1_click_multiple_character_angles-v1.0 | Image | Qwen-Image-Edit | image, text | image | character angles |
| 9 | video_ltx2_3_i2v | Video | LTX-2.3 | image, text | video (+sound) | image to video with audio |
| 10 | video_ltx2_3_t2v | Video | LTX-2.3 | text | video (+sound) | text to video with audio |
| 11 | video_wan2_2_14B_i2v | Video | Wan 2.2 14B | image, text | video | image to video |
| 12 | video_wan_animate2 | Video | Wan Animate 2 | image, video, text | video | motion transfer, character replacement |
| 13 | video_wan_vace_inpainting | Video | Wan2.1 VACE | image, video, text | video | video inpaint, remove object (mask) |
| 14 | video_wan_vace_14B_v2v | Video | Wan2.1 VACE | image, video, text | video | restyle, video to video |
| 15 | video_ltx2_3_ia2v | Video | LTX-2.3 | audio, image, text | video | lip sync |
| 16 | template_ltx2_3_obscura_remova_lora_remove_object_from_video | Video | LTX-2.3 + Obscura Remova LoRA | video, text | video | remove object by prompt |
| 17 | audio_ace_step1_5_xl_turbo | Audio | ACE-Step 1.5 XL | text | audio | music from text |
| 18 | audio_stable_audio_3_medium | Audio | Stable Audio 3.0 | text | audio | SFX, ambience, music |
| 19 | audio-chatterbox_tts | Audio | Chatterbox | audio, text | audio | voice from text, voice clone |
| 20 | audio-chatterbox_vc | Audio | Chatterbox | audio x2 | audio | voice conversion |
| 21 | audio_melbandroformer_audio_separation | Audio | MelBandRoFormer | audio | audio (2 stems) | stem split vocals/instrumental |
| 22 | 3d_hunyuan3d-v2.1 | 3D | Hunyuan3D 2.1 | image | 3d (glb) | image to 3D |
| 23 | 3d_triposplat_image_to_gaussian_splat | 3D | TripoSplat | image | 3d + turntable video | gaussian splat |
| 24 | 3d_hunyuan3d_multiview_to_model | 3D | Hunyuan3D 2.0 MV | image x4 | 3d | multiview to 3D |
| 25 | utility_birefnet_remove_background | Utility | BiRefNet | image | image | cutout |
| 26 | utility_seedvr2_7b_int8_upscale_image | Utility | SeedVR2 7B | image | image | upscale |
| 27 | utility_seedvr2_3b_int8_upscale_video | Utility | SeedVR2 3B | video | video | video upscale |
| 28 | utility_void_video_inpainting | Utility | VOID | video, text | video | remove object |
| 29 | utility_video_frame_interpolation | Utility | FILM, RIFE | video | video | interpolation, slow motion |
| 30 | utility_video_segment_sam3 | Utility | SAM3 | video, text | mask (preview only) | mask source |
| 31 | utility_image_segment_sam3 | Utility | SAM3 | image, text | image + mask preview | mask source |
| 32 | api_nano_banana_2_1_image_edit | Partner | Nano Banana 2.1 | image, text | image | edit, relight, restyle (about 12 credits/image) |
| 33 | api_bria_video_green_screen | Partner | Bria | video | video | green screen |
| 34 | api_bria_remove_video_background_transparent | Partner | Bria | video | video (alpha) | background removal |
| 35 | api_beeble_switchx_video_edit | Partner | Beeble SwitchX | image, video, text | video + alpha matte | relight, background swap |
| 36 | api_runway_aleph2_video_edit | Partner | Runway Aleph 2 | image, video, text | video | relight, restyle, weather |
| 37 | api_seedance2_5_video_editing | Partner | Seedance 2.5 | video, text | video | prompt-based video edit |
| 38 | api_elevenlabs_text_to_sound_effects | Partner | ElevenLabs | text | audio | SFX |
| 39 | api_sonilo_v2m | Partner | Sonilo | video, text | audio (+video) | music for video |
| 40 | api_elevenlabs_voice_isolation | Partner | ElevenLabs | audio | audio | voice cleanup |

Caveats: 13 needs a mask and has one bypass-trace conversion miss; 16, 19, 20, 21 name custom-node packs that Cloud has preinstalled (LTXVideo, KJNodes, VideoHelperSuite, Fill-Nodes Chatterbox, MelBandRoFormer); 30 and 31 only have Preview outputs (see risks). Not shortlisted because Cloud's shared library lacks their newest files: `image_qwen_image_2_1_*`, `video_minimax_h3_*`, `3d_pixal3d_*`, FLUX 3 Klein (37 templates, all importable, see risks).

## 7. VFX and SFX reality check

| Job | Official template or node on Cloud today | Closest alternative / free local approach |
|---|---|---|
| Remove object from video | Template: `utility_void_video_inpainting` (VOID, needs a mask or SAM3 prompt), `template_ltx2_3_obscura_remova_lora_remove_object_from_video` (prompt only), `video_wan_vace_inpainting`, `templates_shane_change_any_objects` (SAM3 + VACE). Partner node `BriaVideoEraser` (no template) | Partner prompt edit: `api_runway_aleph2_video_edit`, `api_kling_o3_video_edit`, `api_seedance2_5_video_editing` |
| Remove/replace video background | Partner templates: `api_bria_remove_video_background` (solid), `api_bria_remove_video_background_transparent` (alpha), `api_bria_video_replace_background`, `utility-bria_remove_video_background`. Open: `video_wan2.1_alpha_t2v_14B` makes new alpha video; nodes `RemoveBackground`, `LayerMask: BiRefNetUltra`, SAM3 video track exist (custom graph) | ffmpeg `colorkey` / `chromakey` + `alphamerge` when a mask video exists |
| Green-screen cutout | Partner `api_bria_video_green_screen` | ffmpeg `chromakey` on real green footage |
| Relight | Image: `image_qwen_image_edit_2509_relight` (open), `api_magnific_image_relight`, `api_beeble_switchx_image_edit`, `templates_rob_portrait_light_migration.app`. Video: `api_beeble_switchx_video_edit` (partner, alpha matte), `api_runway_aleph2_video_edit` | ffmpeg `eq`/`curves` for simple grading only; no open video relight template |
| Restyle video (anime, clay, noir) | Open: `video_wan_vace_14B_v2v`, `templates_shane_video_restyle`, `video_wan2_2_14B_fun_control`, `video_ltx2_3_ic_lora`. Partner: `api_runway_aleph2_video_edit`, `api_luma_ray3_2_video_edit`, `api_kling_o3_video_edit`, `api_flux_video_edit`, `api_grok_video_edit`, `api_wan2_7_video_edit` | Per-frame image restyle (`flux_kontext_dev_basic`) is heavy and flickers |
| Rain, snow, fog | No dedicated template | Prompt edit with the partner video-edit templates above; or ffmpeg `blend=screen` of stock particle footage |
| Stabilise | Not available on Cloud (only `INPAINT_StabilizeMask`, a mask node) | ffmpeg `vidstabdetect` + `vidstabtransform` (or `deshake`) |
| Frame interpolation / slow motion | `utility_video_frame_interpolation` (FILM or RIFE), `utility_gimm_frame_interpolation`, `utility-frame_interpolation-film` | ffmpeg `minterpolate` |
| Face retouch | Image: `api_magnific_skin_enhancer` (partner), `templates_hellorob_facegen_skindetail_upscale` (open), `utility_hitpaw_general_image_enhance`; node `FaceDetailer`. Video: `utility_hitpaw_video_enhance` (partner), `templates_liveportrait.app` (expressions) | No official video retouch template; ffmpeg `smartblur`/`hqdn3d` is crude |
| Colour grade / LUT | No template (`basic_image_color_adjustment` is an image showcase). Nodes exist: `ImageApplyLUT+`, `LayerColor: LUT Apply`, `RadianceLUTBlend`, `ColorMatch`, Film Grain | ffmpeg `lut3d` (.cube), `eq`, `colorbalance`, `curves`; best done locally |
| SFX from text | Partner `api_elevenlabs_text_to_sound_effects`; open `audio_stable_audio_3_medium` (SFX/music category), `audio_stable_audio_example` | None needed |
| Sound for a video (foley) | No foley/video-to-audio template or node (`WanVideoEmptyMMAudioLatents` is only part of Ovi). Partner `api_sonilo_v2m` makes music, not foley | Generate video with sound directly: `video_ltx2_3_i2v`, `api_kling2_6_t2v/i2v`; or ElevenLabs SFX per cue, then ffmpeg `adelay` + `amix` |
| Music from text | Open `audio_ace_step1_5_xl_turbo`, `audio_ace_step_1_5_*`, `audio_minimax_music_3`, `audio_yue2_text2music`, `audio_stable_audio_3_medium`; partner `api_sonilo_t2m` | |
| Voice from text | Partner `api_elevenlabs_v4_text_to_speech`, `api_fishaudio_text_to_speech`, `api_heygen_text_to_speech`; open `audio-chatterbox_tts_multilingual` | |
| Voice clone | Open `audio-chatterbox_tts`, `audio-chatterbox_vc`; partner `api_fishaudio_voice_clone_tts`, `api_elevenlabs_speech_to_speech`, `api_bytedance_seed_audio1_0_ta2a` | |
| Stem splitting | Open `utility-audioseparation` (vocals/bass/drums/other), `audio_melbandroformer_audio_separation` (vocals + instrumental) | |
| Audio denoise / cleanup | Partner `api_elevenlabs_voice_isolation` (voice only) | ffmpeg `afftdn`, `arnndn`, `highpass`/`lowpass` |
| Loudness mastering | No template. Nodes: `NormalizeAudioLoudness`, `AudioNormalize`, `AudioLoudnessMeter` | ffmpeg `loudnorm` (EBU R128, two pass); best done locally |
| Beat detection | No template. Nodes `AudioBPMDetector`, `FL_Audio_BPM_Analyzer`. The repo's own `workflows/jam-analyze.json` already returns bpm and beats | Local JS (`music-tempo`) or the existing workflow |

## 8. Risks

1. MCP is an agent product surface (server 0.71.3), not a versioned API. Wrap it in one module, keep the local converter as the fallback, and pin behaviour with tests on 5 templates.
2. Not verified (needs a paid call): following a `run_template` job through the SDK; using an SDK or REST upload name as `LoadVideo.file` / `LoadAudio.audio` in `input_overrides`; whether node ids like `57:12` are accepted by v2 `POST /api/v2/jobs` (the frontend sends them to v1).
3. Spending: partner nodes bill credits per unit (`list_usd`/`range_usd` price badges depend on duration, resolution, count). `estimate_credits` excludes GPU time and can lag live prices. Always show the estimate and require an explicit confirm; make `engine.ts` pass `apiKey` for partner graphs.
4. Subscription: API runs need an active Cloud plan (5 free runs for new users); credits alone are not enough.
5. Model gaps: 37 of 701 templates (36 in Cloud's index) name loader files that are not in Cloud's shared lists yet (newest Int8/convrot and Qwen Image 2.1, MiniMax H3, FLUX 3 Klein, Pixal3D, TRELLIS.2 files). All carry `properties.models` (Hugging Face URLs), so they can be imported with `POST /api/assets/download`, but each import is multi-GB, takes minutes, and uses workspace storage. Check each loader combo against `/api/experiment/models/{folder}` before enabling a card.
6. Preview-only outputs (SAM3 mask templates, MaskPreview, PreviewImage): committed job `outputs[]` may not include temp previews; fetch via `/api/view?type=temp` or hide those cards.
7. Catalog churn: Cloud lags GitHub (695 vs 701), 18 workflows differ, templates are added weekly and archived (`status`). Key everything by `name`, keep the index hash, and tolerate a missing template at run time.
8. Conversion fragility if you port locally: V3 dynamic combos and autogrow (dotted names), VHS dict widgets, bypass type matching, promoted subgraph widgets; the reference converter is about 93% structurally clean on the catalog.
9. Concurrency: Cloud allows 3 concurrent jobs per account, but `engine.ts` documents that two LTX jobs side by side came back bad; keep the serial gate.
10. Output lifetime: signed URLs last about 6 h, jobs 30 d; re-host results. Uploads: 50 MB per image, 100 MB per upload.
11. Legal: partner providers receive user content; keep an explicit "this sends your media to X" line on partner cards; Seedance `*_real_human` templates need KYC/asset ids; show creator `username`.
12. Size: `object_info` is 10.5 MB (985 KB gzipped, `no-store`); cache it and refresh on `cloud_version` change. Never vendor the repo's `input/` and `output/` folders (3.4 GB).

## 9. What was tested

GET: Cloud `/api/object_info`, `/api/features`, `/api/system_stats`, `/api/queue`, `/api/jobs`, `/api/history_v2`, `/api/workflow_templates`, `/api/assets`, `/api/experiment/models[/{folder}]`, `/api/billing/balance`, `/api/job/{id}/status`, `/api/v2/jobs/{id}`, `/api/v2/jobs` (501), `/templates/index.json`, `/templates/{name}.json`, thumbnails; GitHub API/raw; jsDelivr; PyPI; npm search; docs.comfy.org pages and `openapi-cloud.yaml`. MCP: `initialize`, `tools/list`, `search_templates`, `get_template_schema` (x2), `estimate_credits` (x2). Not called: any POST that submits, uploads, imports models or generates. Scratch data and the oracle venv are under the session scratchpad, not in the repo.

## Mini apps (added with the apps view)

What was found while turning templates into simple apps (server/comfy-templates.ts: `appsOf`, `splitSlots`):

- **`extra.linearData`** of the 18 `isApp` templates is `{ "inputs": [[nodeId, widget], ...], "outputs": [nodeId, ...] }`, not a bare list. The widget names are the loader's (`image`, `video`, `choose video to upload`, `videopreview`) or the interior widget's (`prompt`, `text`, `string_a`, `aspect_ratio`, `width`, `strength_model`). The node ids point into the template or into its subgraph, so they cannot be used as ids; the name a slot writes to (the tail of its address) is what matches them.
- **Promoted widgets.** `get_template_schema` lists the widgets a subgraph instance promotes onto its face with `source: "promoted_widget"` and `route: "input_overrides"`. Their address is not a valid `slot_overrides` address; the schema's note says to pass them to `run_template` as `input_overrides` keyed by the instance's `node_id`. Templates such as the object-removal one carry their prompt and seed only this way. Documented, not yet seen on a run.
- **Cloud MCP concurrency.** Every call was sent with the same JSON-RPC id (2). Calls made at once on one session were answered with each other's results: a form of another template, another's price. Every call now has its own id and the answer's id is checked; the old caches are not read (`credits-2.json`, `forms-2/`).
- **Apps that cannot be driven.** `templates_liveportrait.app` asks for a picture and a clip, but the clip's loader is a custom node's (`VHS_LoadVideo`) and the form has no slot for it; `templates_text_prompt_to_360hdr.app` lists one widget (`value`) that no slot of the form is. Run as they are, they would run on their sample, so they are not shown. The contact sheet is a chain of three steps (3, 2 and 7 pictures): not apps.
- **Models.** Every model named by the 37 apps' workflows is in Cloud's shared library today (checked against `/api/experiment/models/<folder>`), except the partner and custom-node ones, which name none.
- **Reading all of it** (a form, a price, two pictures per app, three at a time) takes about 25 seconds, free.
