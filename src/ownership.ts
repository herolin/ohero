// Ownership: attribution, a build fingerprint, and an off-site notice.
//
// WHAT THIS IS NOT: protection. A static front-end has to hand the browser
// every byte it needs to run, so anyone can save the page and re-host it. The
// hostname check below is removed by deleting one function. Treat all of this
// as deterrence and as evidence, never as a lock.
//
// What it is actually for:
//   * attribution travels with the files, so a copy is visibly a copy;
//   * the fingerprint identifies WHICH build a copy came from, which is the
//     difference between "someone wrote a similar game" and "someone took
//     this exact build";
//   * the notice catches the download-and-re-upload case, which is nearly all
//     of them, without breaking local development or offline play.

const YEAR = '2026';

export const OWNER = 'herolin';
export const GAME = 'Minesweeper';
export const SLUG = 'g002-bomb-mp';
export const HOME = 'https://herolin.github.io/ohero/games/g002-bomb-mp/';

/** Injected at build time by vite.config.ts. */
declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** The string that identifies this exact build if it turns up elsewhere. */
export const SIGNATURE = `${GAME} (${SLUG}) © ${YEAR} ${OWNER} · build ${BUILD_ID} · ${HOME}`;

/** Hosts that are allowed to serve this without the notice. */
const OFFICIAL_HOSTS = ['herolin.github.io'];
/** Development and offline use must never be nagged. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', ''];

export function isOfficialHost(hostname: string): boolean {
  return OFFICIAL_HOSTS.includes(hostname) || LOCAL_HOSTS.includes(hostname);
}

/**
 * Stamp the fingerprint somewhere it survives minification and is findable.
 * SIGNATURE has to be *referenced* here, not merely exported — an exported
 * constant nobody reads gets tree-shaken straight out of the bundle, which
 * would leave the build with no fingerprint at all.
 */
function stampFingerprint(): void {
  try {
    document.documentElement.setAttribute('data-build', BUILD_ID);
    Object.defineProperty(window, '__OHERO__', {
      value: Object.freeze({
        owner: OWNER,
        game: GAME,
        slug: SLUG,
        build: BUILD_ID,
        home: HOME,
        signature: SIGNATURE,
      }),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch {
    /* a re-run in the same page, or a locked-down environment */
  }
}

/** Fill the footer that index.html ships with. */
function fillFooter(): void {
  const el = document.querySelector('.site-note');
  if (!el) return;
  el.innerHTML =
    `© ${YEAR} ${OWNER} · <a href="${HOME}" rel="noopener">${GAME}</a> · ` +
    `<span class="build">${BUILD_ID}</span>`;
}

/**
 * A dismissible bar, shown only when this is being served from somewhere it
 * should not be. Deliberately NOT a block: breaking the game would punish a
 * player who did nothing wrong, and would break offline use too.
 */
function showOffSiteNotice(): void {
  const bar = document.createElement('div');
  bar.className = 'offsite-notice';
  bar.innerHTML =
    `<span>Unofficial copy. The original is at <a href="${HOME}" rel="noopener">${HOME}</a></span>` +
    `<button type="button" aria-label="dismiss">×</button>`;
  bar.querySelector('button')?.addEventListener('click', () => bar.remove());
  document.body.prepend(bar);
}

export function installOwnership(): void {
  stampFingerprint();
  fillFooter();
  if (typeof location !== 'undefined' && !isOfficialHost(location.hostname)) {
    showOffSiteNotice();
  }
}
