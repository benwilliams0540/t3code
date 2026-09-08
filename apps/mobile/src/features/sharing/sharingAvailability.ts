export function shouldIngestNativeShares(platform: string, iosPersonalTeamBuild: unknown): boolean {
  if (platform === "android") return true;
  if (platform !== "ios") return false;
  return iosPersonalTeamBuild !== true;
}

export function isMissingShareAppGroupError(cause: unknown): boolean {
  const message = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return (
    message.includes("FailedToResolveAppGroupIdException") ||
    message.includes("failed to fetch the app group id")
  );
}
