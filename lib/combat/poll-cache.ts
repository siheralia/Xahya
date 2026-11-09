import { createHash } from "node:crypto";

/** The validator covers the actual personalized GET body, not only combat state.
 * Permissions, karma and the configurable statistics catalog can change too.
 */
export function combatSnapshotEtag(serializedBody: string): string {
  return '"' + createHash("sha256").update(serializedBody).digest("hex") + '"';
}

/** If-None-Match uses weak comparison for GET (RFC 9110, section 13.1.2). */
export function combatEtagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some(tag => {
    const value = tag.trim();
    return value === "*" || (value.startsWith("W/") ? value.slice(2) : value) === etag;
  });
}
