// Signing in.
//
// DELIBERATELY EMPTY OF A PROVIDER. Google sign-in is only worth anything
// alongside a backend that can store scores against the account — an account
// whose scores stay on this device is just a longer way to type a name. So
// this module reports honestly that it is not configured rather than shipping
// a button that appears to work.
//
// To wire it up (see PLATFORM.md for the full sequence):
//   1. create the project and enable Google sign-in;
//   2. put the web config in `AUTH_CONFIG` below;
//   3. implement `signInWithGoogle` to call the provider and hand the result
//      to `signIn({ id, name })` from identity.ts.
//
// Nothing outside this file needs to change when that happens — that is the
// point of routing every read through `getPlayer()`.

import { signIn } from './identity';

/** Filled in once a backend exists. Empty means "not configured". */
export const AUTH_CONFIG: Record<string, string> = {};

export function isAuthConfigured(): boolean {
  return Object.keys(AUTH_CONFIG).length > 0;
}

/**
 * @returns true if a player was signed in.
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  // Provider call goes here, then:
  //   signIn({ id: credential.uid, name: credential.displayName });
  void signIn;
  return false;
}
