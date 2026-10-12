export * from "@t3tools/client-runtime/rooms/server-profile";

export function roomsDeviceLabel(): string {
  return typeof window !== "undefined" && window.desktopBridge
    ? "ThreadSpace desktop"
    : "ThreadSpace web";
}
