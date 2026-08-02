/**
 * Channel names are stored with their `#` (`"# infra"`) in both the Sample fixture and the Local
 * ledger. Surfaces that already draw their own hash chip render the bare name so it is not doubled.
 */
export function roomsChannelDisplayName(name: string): string {
  return name.replace(/^#\s*/, "");
}
