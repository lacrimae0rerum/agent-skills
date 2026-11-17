/**
 * send-check: the local confirmation step that runs before anything leaves this machine under the user's account.
 *
 * Adapted from MIT-licensed code (see LICENSE.txt). Proof receipts, output
 * ledgers, override tokens and event logging are dropped. What stays:
 *   1. a refusal to send text that carries an obvious secret, a private key, or the user's own home-directory path
 *      (printed as `SEND BLOCKED (<channel>) ... Nothing was sent.`), and
 *   2. an explicit `--yes` on every command that posts, publishes, replies, comments or deletes. The agent passes it
 *      only after the user has seen and confirmed the exact content (text, media, target account).
 */

import { homedir } from "node:os";

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["a private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an API secret key (sk-...)", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["an AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["a Slack token", /\bxox[abps]-[A-Za-z0-9-]{20,}/],
  ["a live Stripe key", /\b[rs]k_live_[A-Za-z0-9]{20,}/],
];

/** What in `text` must never be posted: secret-shaped strings and the user's home-directory path. */
export function sendFindings(text: string): string[] {
  const found: string[] = [];
  for (const [label, rx] of SECRET_PATTERNS) if (rx.test(text)) found.push(`looks like ${label}`);
  const home = homedir();
  if (home.length > 1 && text.includes(home)) found.push(`contains your home-directory path (${home})`);
  return found;
}

/** Throws a `SEND BLOCKED` error naming each finding; nothing is sent when it throws. */
export function assertSendable(channel: string, text: string): void {
  const found = sendFindings(text);
  if (found.length) {
    throw new Error(
      `SEND BLOCKED (${channel}): the text ${found.join("; ")}. Remove it and run the same command again. Nothing was sent.`,
    );
  }
}

/** The flag that records the user's confirmation of the exact action. */
export const CONFIRM_FLAG = "--yes";

export function isConfirmed(argv: string[]): boolean {
  return argv.includes(CONFIRM_FLAG);
}

/** The message printed when a sending command runs without `--yes`. */
export function notConfirmedMessage(action: string): string {
  return (
    `NOT SENT: ${action} needs the user's explicit confirmation. Show the user the exact content above ` +
    `(text, media, target account), and only after they confirm, run the same command again with ${CONFIRM_FLAG}.`
  );
}
