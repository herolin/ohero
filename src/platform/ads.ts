// Advertising: when to show one, and the placement that shows it.
//
// DELIBERATELY INERT UNTIL CONFIGURED, exactly like `auth.ts`. `ADS_CONFIG` is
// empty, so nothing loads, nothing is counted against a real ad break and the
// player sees no difference at all. Filling in one publisher id turns it on
// everywhere. Shipping the placements now and the ads later is the whole point:
// getting an AdSense account approved is slow and may not happen, and this way
// nothing is waiting on it.
//
// WHY AN INTERSTITIAL AND NOT A "WATCH TO UNLOCK" GATE:
//
//   * A gate is only worth anything with server-side verification of the ad
//     view. These games are static files on GitHub Pages with no server, so
//     the unlock flag would live in localStorage and be worth exactly one
//     devtools edit — or one incognito window. All of the cost, none of the
//     protection.
//   * Incentivised viewing of ordinary display ads is against Google's rules
//     outright. Only a genuine rewarded format may be exchanged for something,
//     and a rewarded ad the player cannot decline is a grey area nobody needs
//     to walk into to get the same impression.
//   * An interstitial between plays is the ordinary, long-standing pattern for
//     exactly this, and needs no bookkeeping.
//
// The rules below exist to keep it from ruining the thing it is funding.

/** Publisher id, e.g. 'ca-pub-0000000000000000'. Empty means not configured. */
export const ADS_CONFIG = { client: '' };

export function isAdsConfigured(): boolean {
  return ADS_CONFIG.client.length > 0;
}

/**
 * Plays finished before the first ad.
 *
 * One. Someone arriving on a shared link gets a whole game before they are
 * asked for anything — an ad on the way in loses most of them before they have
 * seen what this is.
 */
export const FREE_PLAYS = 1;

/** Games between ads after that. Every other one, not every one. */
export const PLAYS_BETWEEN = 2;

/**
 * Floor on real time between two ads, in ms.
 *
 * The play counter alone is not enough: dying in four seconds is normal in
 * these games, so a player having a bad run could otherwise be shown an ad
 * every fifteen seconds. Whichever limit is stricter wins.
 */
export const MIN_GAP_MS = 90_000;

/** What the counter needs to remember, per game. */
export interface AdState {
  /** Runs finished. */
  plays: number;
  /** When the last interstitial was shown, epoch ms; 0 for never. */
  lastAdAt: number;
}

export function emptyState(): AdState {
  return { plays: 0, lastAdAt: 0 };
}

/**
 * Is an ad due before the next game?
 *
 * Pure, and separate from everything that touches storage or the network,
 * because the frequency rules are the part worth testing and the part most
 * likely to be argued about later.
 */
export function dueForInterstitial(state: AdState, now: number): boolean {
  if (state.plays < FREE_PLAYS) return false;
  if (state.lastAdAt > 0 && now - state.lastAdAt < MIN_GAP_MS) return false;
  return (state.plays - FREE_PLAYS) % PLAYS_BETWEEN === 0;
}

// ---- Storage ----
//
// Per game, unlike the player identity: someone who has played six games of
// snake has not thereby earned an ad in the tank game.

const KEY_PREFIX = 'ohero-ads-';

export function readState(game: string): AdState {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + game);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const s = parsed as Record<string, unknown>;
    const plays = typeof s.plays === 'number' && Number.isFinite(s.plays) ? s.plays : 0;
    const lastAdAt =
      typeof s.lastAdAt === 'number' && Number.isFinite(s.lastAdAt) ? s.lastAdAt : 0;
    return { plays: Math.max(0, Math.floor(plays)), lastAdAt: Math.max(0, lastAdAt) };
  } catch {
    // Private mode, or junk written by something else. An unreadable counter
    // must never stop anyone playing.
    return emptyState();
  }
}

function writeState(game: string, state: AdState): void {
  try {
    localStorage.setItem(KEY_PREFIX + game, JSON.stringify(state));
  } catch {
    /* ignore: the counter is best-effort, never load-bearing */
  }
}

/** Call once when a run ends. */
export function recordPlay(game: string): void {
  const state = readState(game);
  writeState(game, { ...state, plays: state.plays + 1 });
}

// ---- The placement ----

/** The H5 Games Ads placement API, present only once the script has loaded. */
type AdBreak = (opts: {
  type: string;
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: unknown) => void;
}) => void;

/**
 * How long to wait for the ad machinery to say anything at all.
 *
 * THE GAME MUST NEVER BE HELD HOSTAGE BY AN AD. Blockers are near-universal
 * among people who play browser games, and a script that is present but wedged
 * is just as bad as one that is missing. Either way this resolves and play
 * continues.
 */
const AD_TIMEOUT_MS = 5_000;

/**
 * Show an interstitial if one is due, then resolve. Never rejects.
 *
 * Resolves immediately when ads are not configured, which is every build until
 * a publisher id is filled in — so callers can await it unconditionally.
 */
export async function maybeShowInterstitial(game: string, now = Date.now()): Promise<void> {
  if (!isAdsConfigured()) return;
  if (!dueForInterstitial(readState(game), now)) return;

  // Recorded before showing rather than after. If the ad hangs, or the player
  // closes the tab mid-break, the gap should still count — the failure mode to
  // avoid is retrying an ad they have already sat through.
  writeState(game, { ...readState(game), lastAdAt: now });

  const adBreak = (window as unknown as { adBreak?: AdBreak }).adBreak;
  if (typeof adBreak !== 'function') return; // blocked, or not loaded yet

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(done, AD_TIMEOUT_MS);
    const finish = (): void => {
      clearTimeout(timer);
      done();
    };
    try {
      adBreak({ type: 'next', name: `between-games-${game}`, adBreakDone: finish });
    } catch {
      finish();
    }
  });
}
