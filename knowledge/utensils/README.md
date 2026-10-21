# Utensils' knowledge

What every Utensils tool and every Library workflow is, how it works, what it takes and gives, what it costs, and what goes before and after it. Truffle reads it to suggest the tools and workflows for a job (her guide), and the Library and the guide show it.

| File | What it holds | Made by |
|---|---|---|
| `tools.json` | one entry per tool in the Utensils registry (`TOOLS` and `registerTool` in `web/js/utensils*.js`), except the mini apps (`app-*`), which are workflows | written by hand: every field is curated |
| `workflows.json` | one entry per workflow in the Comfy Cloud catalogue (`data/templates/index.json`) | built by `scripts/utensils-knowledge.ts` |
| `curated.json` | hand-written `what`, `how`, `goodFor` and `limits` for the most used workflows, the mini apps and every workflow with a tutorial, by id | written by hand |

## An entry

```
{ id, kind: "tool" | "workflow", name, section, category, what, how, takes, gives, goodFor, limits, use, models,
  cost: "free" | "gpu" | "partner", credits, before, after, tutorial, open, keywords, curated }
```

- `id`: the tool's id (`cutout`), or `wf:<template name>` (`wf:video_ltx2_3_i2v`).
- `section`: `picture`, `video`, `audio`, `vfx` or `edit` for tools; `library` for workflows.
- `takes` / `gives`: from `image`, `video`, `audio`, `words`, `3d`, `mask`, `none`.
- `credits`: about what one run costs in Comfy credits, or `null` when it is priced at the run (partner models) or unknown.
- `before` / `after`: ids of up to four tools or workflows that commonly come before or after it.
- `open`: where it opens: `{ workspace, tool }` for a tool, `{ workspace: "templates", workflow }` for a workflow. `templates` is the Library's workspace id today; the page maps it if the Library gets its own id.
- `curated`: the fields written by hand. A rebuild never overwrites them.

## Rebuilding `workflows.json`

```
node scripts/utensils-knowledge.ts            # fetches missing graphs and tutorials (free GETs), then builds
node scripts/utensils-knowledge.ts --offline  # builds from what is already in data/templates/
```

The script reads the catalogue (`data/templates/index.json`), each workflow's graph (`data/templates/graphs/<name>.json`, from cloud.comfy.org/templates), its tutorial when it has one (`data/templates/tutorials/`, the docs.comfy.org page as Markdown), and the credit estimates (`data/templates/credits*.json`). From the graph it reads what the workflow does (the models, partner nodes, a prompt writer, ControlNet, masks, LoRAs, what it saves) and writes `what`, `how`, `use`, `goodFor`, `limits`, `before` and `after` in plain sentences. Then `curated.json` is laid over it, and any field an entry of the current file lists in `curated` is kept as it is. It never runs a workflow.

To improve an entry by hand: add it to `curated.json` (or edit it in `workflows.json` and add the field's name to its `curated` list), then rebuild.

## Reading it

- Server: `server/utensils-knowledge.ts`: `loadKnowledge()`, `searchKnowledge(query, { k, kinds, sections })` (BM25 over name, keywords, good-for, what, how and category, with plurals and synonyms), `knowledgeById(id)`.
- HTTP: `GET api/utensils/knowledge?q=&k=&kind=` gives `{ items: [entry + score] }`; `GET api/utensils/knowledge/<id>` gives one entry (404 when there is none).
- Page: `web/js/utensils-knowledge.js`: `searchKnowledge(q, opts)`, `knowledgeOf(id)` (fetched once and kept), `entryFor(toolOrTemplate)`.
- Truffle: each time she is asked, the best matches for the job go into her prompt as CANDIDATES FOR THIS JOB; her `guide` op names steps from them only (`server/utensils-assist.ts`).

Tests: `node --test tests/utensils-knowledge.test.ts`.
