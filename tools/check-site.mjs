// Is the assembled Pages site whole?
//
// pages.yml builds two games here and copies every other game in from
// games/, then adds the menu. Nothing looked at the result before it went
// live — and from the environments these games are built in, the live site
// cannot be opened at all (the agent proxy refuses herolin.github.io), so
// "the deploy job succeeded" was the only evidence anyone had. A job that
// copies a folder to the wrong slug, a menu card pointing at a game that is
// not there, or a build that references `/assets/...` from the domain root
// all deploy "successfully" and all 404 for every player.
//
// This runs in pages.yml after the tree is assembled and before it is
// uploaded, with no dependencies, and fails the deploy on any of:
//
//   * a link in the game menu that does not lead to a directory with an
//     index.html;
//   * a relative src/href in a game's index.html that points at a file that
//     is not there;
//   * a ROOT-absolute src/href ("/assets/x.js"). The site is served under
//     /ohero/, so a root path resolves outside it — the exact failure Vite's
//     `base: './'` exists to prevent, and the one a local `vite preview` at
//     the root can never show.
//
//   node tools/check-site.mjs site

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'site';
const problems = [];

/** Every src= and href= value in an HTML document. */
function references(html) {
  return [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
}

/** Only what the site itself serves: no scheme, no data:, no fragment, no mailto. */
function isLocal(ref) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) && ref !== '';
}

function check(file, ref) {
  const clean = ref.split(/[?#]/)[0];
  if (clean === '') return;
  if (clean.startsWith('/')) {
    problems.push(`${file}: "${ref}" is root-absolute — under /ohero/ it resolves outside the site`);
    return;
  }
  let target = normalize(join(dirname(file), clean));
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
  if (!existsSync(target)) problems.push(`${file}: "${ref}" -> ${target} does not exist`);
}

// 1. The menu: every game card must lead somewhere real.
const menu = join(root, 'games', 'index.html');
if (!existsSync(menu)) {
  problems.push(`${menu} is missing — the games menu was not assembled`);
} else {
  for (const ref of references(readFileSync(menu, 'utf8')).filter(isLocal)) check(menu, ref);
}

// 2. Every game: its own page and what that page loads.
const gamesDir = join(root, 'games');
const games = existsSync(gamesDir)
  ? readdirSync(gamesDir).filter((d) => statSync(join(gamesDir, d)).isDirectory())
  : [];
for (const game of games) {
  const page = join(gamesDir, game, 'index.html');
  if (!existsSync(page)) {
    problems.push(`${join(gamesDir, game)}/ has no index.html`);
    continue;
  }
  for (const ref of references(readFileSync(page, 'utf8')).filter(isLocal)) check(page, ref);
}

if (problems.length > 0) {
  console.error(`SITE NOT WHOLE (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`site: whole (${games.length} games, menu and every page's assets present)`);
