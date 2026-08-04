// @effect-diagnostics nodeBuiltinImport:off - Temporary files exercise the local cursor boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { CursorStoreError, DeliveryCursorStore } from "../src/cursorStore.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

const filename = (): string => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-host-cursor-"));
  directories.push(directory);
  return NodePath.join(directory, "cursor.sqlite");
};

describe("delivery cursor store", () => {
  it("persists one monotonic pinned cursor across restart", () => {
    const path = filename();
    const first = new DeliveryCursorStore(path);
    expect(first.peek()).toBeNull();
    expect(first.initialize(41)).toBe(41);
    expect(first.checkpoint(41, 44)).toBe(44);
    expect(() => first.checkpoint(41, 45)).toThrowError(CursorStoreError);
    first.close();

    expect(NodeFS.statSync(path).mode & 0o777).toBe(0o600);
    const reopened = new DeliveryCursorStore(path);
    expect(reopened.initialize(0)).toBe(44);
    reopened.close();
  });

  it("fails closed when the persisted delivery contract pin is corrupted", () => {
    const path = filename();
    const store = new DeliveryCursorStore(path);
    store.initialize(1);
    store.close();
    const database = new NodeSqlite.DatabaseSync(path);
    database.prepare("UPDATE delivery_cursor SET schema_sha256 = ?").run("0".repeat(64));
    database.close();

    expect(() => new DeliveryCursorStore(path)).toThrowError(/contract pin/u);
  });
});
