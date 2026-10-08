/* eslint-disable no-console */
/**
 * Child-process probe for the cookie policy boot gate.
 *
 * Importing `config/env` is what a real deployment does at startup, and that import
 * is where a contradictory `COOKIE_SAMESITE` / `COOKIE_SECURE` pair is refused.
 * Printing a single marker lets the caller distinguish "the process booted" from
 * "the process refused to boot" without reading any value out of the environment.
 *
 * Never run this by hand as a test - `npm run cookie:policy-tests` spawns it with
 * the pairs it wants to prove are refused, and only checks the exit status and the
 * variable name in the error.
 */
import '../config/env';

console.log('ENV_BOOT_ACCEPTED');
