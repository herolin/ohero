# Building, publishing and verifying

## The architecture

`herolin/ohero` is the **only** public site (GitHub Pages). It holds the hub pages and
the **compiled static output** of every game. It does not build games.

| Path | Content |
|---|---|
| `https://herolin.github.io/ohero/` | Hub home |
| `https://herolin.github.io/ohero/games/` | Game menu |
| `https://herolin.github.io/ohero/games/<slug>/` | One game |

The hub's `.github/workflows/pages.yml` uploads the repo's static content as-is. Pages
Source is set to **GitHub Actions**. Each push to the hub triggers one deploy, which
takes well under a minute.

## Two publishing mechanisms

**A — automatic (the intended end state).** The game repo's own CI builds and pushes
`dist/` into `ohero/games/<slug>/` using a fine-grained PAT stored in that repo as
`OHERO_DEPLOY_TOKEN` (scope: Contents read+write on `herolin/ohero`). The template is
`templates/deploy-game.yml` in the hub — copy it into the game repo, set `GAME_SLUG` at
the top. It includes rebase-retry for concurrent pushes.

**B — assisted (current practice).** Build in the game repo, copy `dist/` into
`ohero/games/<slug>/`, commit and push the hub. This is what happens today because the
PAT is not yet configured. It is a one-time setup task for the repo owner, not something
to work around.

## The sync procedure for mechanism B

```bash
cd <game-repo>
npx tsc --noEmit && npm test && npm run build

cd <hub>
git pull --ff-only origin main
rm -rf games/<slug>            # remove first: stale hashed assets otherwise linger
cp -r <game-repo>/dist games/<slug>
git add -A && git commit -m "sync <slug>: <what changed, in one line>"
git push -u origin main
```

`rm -rf` before copying matters: Vite emits content-hashed filenames, so a plain copy
leaves the previous build's orphaned assets in place forever.

Push with retry on **network** failure only (2s, 4s, 8s, 16s). Do not retry an
organisation policy denial (403/407) — those are decisions, not transient errors.

## Verifying a publish

Pages deploys asynchronously, so a push is not a publish. Confirm the workflow run
actually succeeded for **your** commit SHA rather than assuming:

```
mcp__github__actions_list  method=list_workflow_runs  owner=herolin  repo=ohero
```

Match `head_sha` to your commit and check `conclusion: "success"`.

Be precise about what that proves. A successful deploy means *the files were published*.
It does not mean you looked at the page. In this environment the agent proxy may return
403 for `herolin.github.io` (organisation policy), in which case fetching the live page
is impossible — say so plainly rather than implying you verified the rendered result.

## Browser verification before publishing

Verify in a real browser **before** the sync, on a local preview, where you do have
access. Chromium is pre-installed; Playwright is configured to find it. Never run
`playwright install`.

```js
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({
  viewport: { width: 412, height: 892 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
```

An empty `errors` array is part of the result — report it. Also check, in both
orientations: no horizontal overflow, the board sits inside the first screen, and presses
actually register.

### Pixel evidence beats description

Screenshots are useful, but a **numeric diff** is what turns "looks right" into a
finding. To confirm that eating one item disturbs only its own column:

```python
from PIL import Image, ImageChops, ImageStat
a = Image.open('before.png').convert('RGB')
b = Image.open('after.png').convert('RGB')
# per-cell mean absolute difference over the grid
m = sum(ImageStat.Stat(ImageChops.difference(a.crop(box), b.crop(box))).mean) / 3
```

That produced the decisive evidence for one bug here: 60ms and 120ms after a press,
exactly **1 of 35 cells** differed, then only that column fell. Note `numpy` is not
always available; `PIL.ImageStat` is enough.

Playwright screenshots also work well as a contact sheet for judging an effect's
readability across frames — but keep the frames large enough to actually read, and prefer
a numeric check for anything you intend to claim.

## Content rules

- `UNLICENSED` + `private: true` in every game's `package.json`.
- **No original game assets of any kind** — no sprites, level data, music or audio.
  Items are glyphs or drawn shapes, sound is synthesised at runtime, levels are generated.
- Public paths, titles, menu cards and meta must not contain an original game's name and
  must not describe the game as a clone.
- Repo names, published paths, hub folders and menu links: **all lowercase**.

## Adding a new game to the hub

1. Create the game repo (Vite + TypeScript, `base: './'`, output to `dist/`).
2. Copy `templates/deploy-game.yml` into it and set `GAME_SLUG` — or use mechanism B.
3. Add `OHERO_DEPLOY_TOKEN` to the game repo's secrets (for mechanism A).
4. Sync the build into `ohero/games/<slug>/`.
5. Add a card to the hub's game menu.
6. Update the route table in the hub's `DEPLOY.md` and the rollout table in
   `PLATFORM.md`. These tables are how anyone finds out what is live; a game missing from
   them is a game nobody maintains.

## Git conventions

- Game repos: develop on `main`. Do **not** open a pull request unless asked.
- Commit messages explain **why**, not just what. Where a change was driven by a
  measurement, put the number in the message — that is what makes the history usable
  later, and several decisions in this project were only reversible because the original
  figures were recorded.
- Never put a model identifier in a commit message, PR body, code comment or any other
  pushed artefact.
