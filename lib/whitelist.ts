/**
 * RuythaCloud is gated to a hand-picked list of emails, set via
 * CLOUD_WHITELIST_EMAILS in your env (comma-separated, no spaces).
 * This is checked server-side on every upload — never trust the client.
 */
export function isWhitelisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.CLOUD_WHITELIST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
