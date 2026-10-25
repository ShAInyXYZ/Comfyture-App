# How judges will try Comfyture

*For Mounir, to choose how the judges get a working Comfyture, and for the agent who sets it up. Costs are as of 25 October 2026.*

What the submission form says about the live link: *"optional, but strongly encouraged. Will NOT be shared publicly.
Expect 5-10 runs for judging purposes"*, and *"We know a live link costs you money every time it runs … Feel free to rate-limit or
cap spending."* So the judges want to press a real button a handful of times, through a private link. That is cheap to give them.

## The recommendation

1. **Primary: the full app on a small server, in judge mode.** A VPS runs Comfyture with a Comfy Cloud key that only the server
   knows, open weights only, behind HTTPS and a password. Examples and tours are free; real runs are capped per visitor, per day
   and in total. About €8 for the month plus a few dollars of credits.
2. **Fallback: the static demo on GitHub Pages**, always up, where every product opens on its example and nothing renders.
   Plus the 5-minute local path in [JUDGES.md](JUDGES.md), and the video.

RunPod (a partner) is worth one afternoon to film the "your own GPU" beat, not for the live link: see option B2.

## The options side by side

| | A. Static demo (GitHub Pages) | B1. App on a VPS + Comfy Cloud, judge mode | B2. App + ComfyUI on a RunPod GPU | C. Judges run it locally |
|---|---|---|---|---|
| **What judges can do** | Open every product on its example, play the takes, films and songs, read every prompt and workflow, take the tours. Nothing renders, the pets cannot answer, no uploads. | Everything, within the caps: roll an LTX-2.5 shot, make a picture or a song, toast a clay set, run a Spice pass, ask any pet. Examples and tours are free. | The core renders on open weights (Kitchen, Mixer, Jam, Macaron, the Oven). Not what runs through Comfy Cloud's template runner (Spice's SAM3, depth and VOID passes, Toaster's 3D model, Jam's word listening, Utensils' templates) unless a Cloud key is added too. | Everything. With no key: examples and tours. With their own Comfy key: real runs on their credits. With their own GPU: comfy-api-proxy. |
| **Cost** | Free (Pages is free once the repo is public). | VPS about €6–8 a month (Hetzner, 2 vCPU, 4 GB, US region). Credits: 211 credits = $1; a 5-second LTX-2.5 shot is about 24 credits ($0.11), a picture 2–6, a Gemma 4 answer a few credits of GPU time. Ten judge runs cost about $1.50; cap the key at $15–20. The Comfy Cloud plan you already have. | A 48 GB GPU: A6000 or A40 $0.59/h, L40S $1.09/h (Secure Cloud). Always on for the judging week (30 Oct to 6 Nov, about 190 h): **$110–210**, plus about $10 of network volume for 100–150 GB of models. | Nothing for us. |
| **Effort** | Half a day: `scripts/demo-site.ts` only snapshots Kitchen today (see to-dos). | One day of code (judge mode and its tests) and 2–3 hours of server setup. | High: ComfyUI, two custom node packs, 100+ GB of models (`scripts/get-models.sh`), every workflow tested on that GPU. | An hour: README and JUDGES.md clear, one test on a clean machine. |
| **Reliability** | Very high. | Good. Shots take 40–110 s on Cloud; the caps and an alert cover the money; a health check covers downtime. | Medium: one GPU, cold starts, a pod can be lost. | Depends on the judge's machine: Node 22.18+, ffmpeg. |
| **Open weights story** | Shows it, runs nothing. | Open weights on rented GPUs (*"Rented GPUs still count"*, says the form). | The purest: our own ComfyUI, partner-free. | Their choice. |

## B1, step by step (primary)

### What the app needs first (to-dos, not built yet)

**Done on 25 October** (the rest of this table is still to do):
- `server/judge.ts` and its hook in `server/main.ts`: with `COMFYTURE_JUDGE=1` the key and where it renders cannot be changed from the
  page (the account window shows them read-only; no address can be probed: no server-side fetch for visitors), nothing kept can be
  deleted (projects, takes, reels, the Stage's stages, poses and models), each visitor's writing requests are paced (240 per 10 minutes),
  and `/api/info` says `judge: true`. **The spend gate** counts what costs credits where it leaves the server (the engine's ComfyUI jobs,
  the template runner, the partners' pictures, clips and words), against the visitor who started it, and refuses it past
  `COMFYTURE_JUDGE_RUNS` renders a visitor a day (12), `COMFYTURE_JUDGE_RUNS_DAY` for everyone (80) and `COMFYTURE_JUDGE_WORDS`
  answers a visitor a day (80); the account window says what is left. Tested in `tests/judge.test.ts`. Behind it, the separate key's
  small balance is the last cap. Not yet: a cap in credits rather than in runs, and the per-visitor cookie (a visitor is an address).
- `COMFYTURE_OPEN_WEIGHTS` makes the server refuse partner templates (`server/comfy-templates.ts`, tested); Spice and Utensils do not
  hide them yet (pressing one says why it is refused).
- `scripts/demo-site.ts` reads `COMFYTURE_DATA`, so it can be built from a clean folder the server has seeded with the examples
  (README: "A live demo without a server"). It still snapshots Kitchen's lists only.

| File | What it does |
|---|---|
| `server/judge.ts` (new) | Judge mode, on with `COMFYTURE_JUDGE=1`. **One spend gate** that every paid path calls before it submits: Comfy jobs from the engine (shots, pictures, songs, sounds, Gemma answers), the template runner, and Router calls (already off in open-weights mode). Limits from the environment: runs per visitor per day (a visitor is a cookie plus an IP), runs per day, a total credit budget, and a floor on the account's balance (`server/account.ts` already reads it). Judge-sized settings: one take, shots of 6 s at most, no Production quality. A friendly refusal: *"Today's judge runs are used up. Examples and tours still work, and the repo runs locally in five minutes."* |
| `server/main.ts` | Calls the gate; in judge mode refuses `POST`/`DELETE /api/account/key` (no key changes from the page) and deletes of projects (an example deleted by one judge stays there for the next); adds `GET /api/judge` (runs left) for the banner; rate-limits POSTs per IP. |
| `server/engine.ts`, `server/comfy-templates.ts`, `server/llm.ts`, `server/router-*.ts` | Ask the gate before submitting. `comfy-templates.ts` also refuses partner templates (`api_*`: Bria, Beeble, Nano Banana, ElevenLabs) when `COMFYTURE_OPEN_WEIGHTS` is set, and Spice and Utensils hide them; today they still run with the switch on. |
| `web/js/panels/judge.js` (new) | A thin banner: *"Judge mode · 7 runs left today · examples and tours are free"*; hides the key form and "Buy credits". |
| `tests/judge.test.ts` (new) | Caps, refusals, no key in any answer, partner templates refused. |
| `deploy/judge/README.md` (new) | These steps, for whoever redeploys. |
| `deploy/judge/comfyture.service` (new) | systemd unit: `User=comfyture`, `EnvironmentFile=/etc/comfyture/judge.env`, `Restart=always`, writes only under `/var/lib/comfyture`. |
| `deploy/judge/Caddyfile` (new) | HTTPS, a password, the proxy, progress events unbuffered. |
| `deploy/judge/judge.env.example` (new) | The variables below, without the key. |
| `deploy/judge/health.sh` (new) | Every 5 minutes: is it up, how much budget is left; posts to your ntfy at 50, 80 and 100 % and when it is down. |
| `deploy/judge/snapshot.sh` (new) | A daily copy of the data folder (copy, check the copy, keep three). |

### Setting it up

1. **A key for the judges only.** Make a new Comfy API key at platform.comfy.org. If the platform lets you put a limit on a key or a
   workspace, set it; if not, fund a separate account with only what you are ready to spend ($15–20). The server-side caps are the
   real guard either way.
2. **The server.** A Hetzner Cloud VPS (2 vCPU, 4 GB, 40 GB) in Ashburn or Hillsboro, Ubuntu 24.04. A `comfyture` user; the firewall
   open on 22, 80 and 443 only; unattended upgrades on.
3. **Software.** Node.js 22 (22.18 or newer), ffmpeg, Caddy, git.
4. **The app**, pinned to the submission tag:
   ```bash
   sudo git clone --depth 1 --branch submission https://github.com/ShAInyXYZ/Comfyture /opt/comfyture
   cd /opt/comfyture && sudo npm ci
   ```
5. **`/etc/comfyture/judge.env`** (mode 0600, never in the repo):
   ```bash
   COMFY_API_KEY=comfyui-…            # the judges' key
   COMFYTURE_OPEN_WEIGHTS=1           # no partner models
   COMFYTURE_JUDGE=1                  # the caps below
   COMFYTURE_JUDGE_PER_VISITOR=8      # runs per visitor per day
   COMFYTURE_JUDGE_PER_DAY=40         # runs per day, all visitors
   COMFYTURE_JUDGE_BUDGET=2000        # credits in total (about $9.50)
   COMFYTURE_DATA=/var/lib/comfyture/data
   HOST=127.0.0.1
   PORT=5177
   ```
   The data folder starts empty, so the server seeds every product's examples, and nothing of your own `data/` (the Giorno project,
   the trend runs) ever reaches it.
6. **Start it**: `sudo systemctl enable --now comfyture`, then `curl -s 127.0.0.1:5177/api/info` answers.
7. **Caddy**, on a subdomain you own (or the server's IP through sslip.io):
   ```
   judges.example.com {
     basic_auth {
       judge <bcrypt hash from `caddy hash-password`>
     }
     request_body {
       max_size 200MB
     }
     reverse_proxy 127.0.0.1:5177 {
       flush_interval -1
     }
   }
   ```
8. **Check it from outside**: open each product; roll one 5-second shot, make one picture, ask one pet; watch the budget go down;
   `curl -su judge:… https://judges.example.com/api/account | grep -c comfyui-` prints 0 (the key never leaves the server).
9. **Watch it**: the health script in cron, alerts on your phone. Daily snapshots.
10. **On the Typeform**: the link in "Live link", the user and password in "Anything else". After 6 November: stop the server,
    revoke the key.

## A, step by step (fallback)

To-dos first:

- `scripts/demo-site.ts` reads your own `data/` folder today and publishes **every finished take in it**. It must build from a clean
  folder instead: a temporary one seeded with `examples/` through `server/examples.ts`, never `data/`.
- It only snapshots Kitchen's endpoints (`info`, `presets`, `samples`, `runs`, `reels`, `photos`; see `web/js/api.js`). Add the
  other products' lists (stages, Spice shots, Jam videos and edits, brands, Toaster projects, songs) so every product opens on its
  example, and say "Rendering is off in the live demo" wherever a key is pressed.
- The build fails if any output file contains a key (`comfyui-` followed by 20+ characters).
- `.github/workflows/pages.yml`: build on the submission tag, publish to Pages.

Then: make the repo public (Pages is free for public repos), run the workflow (or `npm run demo-site && npx gh-pages -d site --dotfiles`),
set Pages to the `gh-pages` branch. The site works under the repository's sub-path, so it will be at
`https://shainyxyz.github.io/Comfyture/`.

## B2, RunPod (optional)

Rent an A6000 or A40 pod for two hours (about $1.20), install ComfyUI, ComfyUI-LTXVideo and comfyui_controlnet_aux, fetch the models
with `scripts/get-models.sh` onto a network volume, and run `comfy-api-proxy run` next to it. Point the app at it from the account
panel (**Renders on → Your ComfyUI**, the bridge's address). Film the "your own GPU" moment of the video there: one LTX-2.5 shot
rendered on a partner's GPU, no Comfy Cloud. Stop the pod after. Not worth keeping on for the judging week.

## C, the judges' own machine

The 5-minute path is in [JUDGES.md](JUDGES.md). What it needs from us: README's Quick start says Node 22.18+ and ffmpeg first,
says that `npm start` with no key opens every example and tour, and links JUDGES.md and [the local GPU guide](../guides/LOCAL-COMFYUI.md)
(the account panel links to it too); one test on a clean machine with no key.

## Security, in one list

- **A key never reaches a browser.** The static site has none by construction, and its build checks for one. On the judge server the
  key lives in `/etc/comfyture/judge.env` (0600); `/api/account` already shows only its last four characters; judge mode refuses key
  changes from the page.
- **Caps are on the server**, never in the page: per visitor, per day, a total, and a floor on the balance. Open weights only, so no
  partner prices can surprise you.
- **The link is private** (the form says so) and behind a password over HTTPS. The Node server listens on 127.0.0.1 only; the Blender
  MCP and the agents' MCP server are not started there.
- **No personal data on the server**: it starts from an empty data folder; uploads stay on it and are deleted after judging.
- **Never host from your desktop or the NAS**: your own data and other sessions live there.
- **After judging**, revoke the key and delete the server.
