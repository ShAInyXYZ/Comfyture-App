# Rules for every session in this repo

These are standing rules. Follow them without being reminded.

## Commit and push as you go

- **Commit each finished step on its own**, as soon as it works and its tests pass: one topic per commit, never a day's work in one lump, never left uncommitted at the end of a turn.
- **Push at the end of every turn that made commits**, to both remotes:
  `git push origin main` (GitHub, ShAInyXYZ/Comfyture) and `git push nas main` (the NAS backup).
  Then `git status -sb` must not say "ahead". If a push fails, say so in your reply; never leave it silently unpushed.
- **Work on `main`**, no branches, unless the user asks for one.
- **Identity**: the repo's own config, `ShAInyXYZ (Mounir Belahbib) <info@shinystudio.xyz>`. Never the `Sh-AI-ny` account (that is the user's employer's).
- **Message**: one plain sentence on what changed, for the user (this repo's style: "Utensils' Library is a frame in front of everything, opened from any workspace…"), then a blank line and the `Co-Authored-By:` trailer the session gives.
- **Dates are real**. A commit made right after its work carries the time it was made. Work left uncommitted (by you or another session) is committed in its own topic commits, each dated by the newest modification time of its files, with both dates set:
  `GIT_AUTHOR_DATE="2026-10-19T13:17:00" GIT_COMMITTER_DATE="2026-10-19T13:17:00" git commit -m "…"`.
  Commit them oldest first, and never mix another session's files into your own commit.
- **Stage explicit paths** (`git add <files>`), never `git add -A` or `git add .`; check `git status` and `git diff --cached --stat` before committing.
- **Tests before committing code**: `node --test tests/*.test.ts tests/*.test.mjs` passes. The browser tests (`tests/*.browser.mjs`) stand in for paid calls; run the ones that touch what you changed.

## What never goes in the history

- Secrets: `.env`, keys, tokens (scan a big push for them first).
- Other people's media: downloaded videos or frames of other creators (TikTok references and the like), other sites' documentation copies, reference images (`ref-*`). They stay on disk; `.gitignore` and `.git/info/exclude` list them.
- Heavy test renders (iteration videos of tens of MB): they stay on disk. Commit their prompts, settings, stills and the final pick instead.
- Generated data: `data/` (the app's own folder) is ignored.

## Other standing rules here

- Never spend Comfy Cloud or Comfy Router credits on tests, repairs or experiments without asking. Development images come from Codex's GPT Image (free), not from the app's paid models.
- The app server on port 5177 is the user's. Restart it only when no run is in progress, and say so. Leave other sessions' servers (other ports) alone.
- Never drive the user's live desktop GUI. Test in a headless browser.
