export function resolveRoomsInternalHref(route: string, protocol?: string): string {
  const resolvedProtocol =
    protocol ??
    (typeof globalThis.location === "undefined" ? undefined : globalThis.location.protocol);
  return resolvedProtocol === "t3code-dev:" || resolvedProtocol === "threadspace-dev:"
    ? `#${route}`
    : route;
}
