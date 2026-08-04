// @effect-diagnostics nodeBuiltinImport:off - This executable owns a narrow SQLite persistence boundary.
import * as NodeFS from "node:fs";
import * as NodeSqlite from "node:sqlite";

import { ROOMS_DELIVERIES_CONTRACT } from "./deliveryClient.ts";

export class CursorStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CursorStoreError";
    this.code = code;
  }
}

interface CursorRow {
  readonly cursor_value: number;
  readonly contract_id: string;
  readonly contract_version: number;
  readonly schema_sha256: string;
}

export class DeliveryCursorStore {
  readonly #database: NodeSqlite.DatabaseSync;
  readonly #filename: string;

  constructor(filename: string) {
    this.#filename = filename;
    this.#database = new NodeSqlite.DatabaseSync(filename);
    NodeFS.chmodSync(filename, 0o600);
    try {
      this.#database.exec(
        "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
      );
      const version = Number(
        (this.#database.prepare("PRAGMA user_version").get() as { readonly user_version: number })
          .user_version,
      );
      const tables = Number(
        (
          this.#database
            .prepare(
              "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .get() as { readonly count: number }
        ).count,
      );
      if ((version === 0 && tables > 0) || (version !== 0 && version !== 1)) {
        throw new CursorStoreError(
          "cursor_schema_unsupported",
          "Delivery cursor state uses an unsupported schema.",
        );
      }
      this.#database.exec(`
        CREATE TABLE IF NOT EXISTS delivery_cursor (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          cursor_value INTEGER NOT NULL CHECK (cursor_value >= 0),
          contract_id TEXT NOT NULL,
          contract_version INTEGER NOT NULL,
          schema_sha256 TEXT NOT NULL CHECK (length(schema_sha256) = 64)
        );
        PRAGMA user_version = 1;
      `);
      this.#validate(this.#row());
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  close(): void {
    this.#database.close();
    NodeFS.chmodSync(this.#filename, 0o600);
  }

  peek(): number | null {
    const row = this.#row();
    this.#validate(row);
    return row?.cursor_value ?? null;
  }

  initialize(initialCursor: number): number {
    if (!Number.isSafeInteger(initialCursor) || initialCursor < 0) {
      throw new CursorStoreError("cursor_invalid", "Initial delivery cursor is invalid.");
    }
    this.#database
      .prepare(
        `INSERT OR IGNORE INTO delivery_cursor (
          singleton, cursor_value, contract_id, contract_version, schema_sha256
        ) VALUES (1, ?, ?, ?, ?)`,
      )
      .run(
        initialCursor,
        ROOMS_DELIVERIES_CONTRACT.id,
        ROOMS_DELIVERIES_CONTRACT.version,
        ROOMS_DELIVERIES_CONTRACT.schemaSha256,
      );
    const cursor = this.peek();
    if (cursor === null) {
      throw new CursorStoreError("cursor_write_failed", "Delivery cursor was not initialized.");
    }
    return cursor;
  }

  checkpoint(expected: number, next: number): number {
    if (
      !Number.isSafeInteger(expected) ||
      !Number.isSafeInteger(next) ||
      expected < 0 ||
      next < expected
    ) {
      throw new CursorStoreError("cursor_invalid", "Delivery cursor checkpoint is invalid.");
    }
    const result = this.#database
      .prepare(
        `UPDATE delivery_cursor SET cursor_value = ?
         WHERE singleton = 1 AND cursor_value = ? AND contract_id = ?
           AND contract_version = ? AND schema_sha256 = ?`,
      )
      .run(
        next,
        expected,
        ROOMS_DELIVERIES_CONTRACT.id,
        ROOMS_DELIVERIES_CONTRACT.version,
        ROOMS_DELIVERIES_CONTRACT.schemaSha256,
      );
    if (Number(result.changes) !== 1) {
      throw new CursorStoreError(
        "cursor_checkpoint_conflict",
        "Delivery cursor changed concurrently or its contract pin drifted.",
      );
    }
    return next;
  }

  #row(): CursorRow | null {
    return (
      (this.#database.prepare("SELECT * FROM delivery_cursor WHERE singleton = 1").get() as
        | CursorRow
        | undefined) ?? null
    );
  }

  #validate(row: CursorRow | null): void {
    if (row === null) return;
    if (
      !Number.isSafeInteger(row.cursor_value) ||
      row.cursor_value < 0 ||
      row.contract_id !== ROOMS_DELIVERIES_CONTRACT.id ||
      row.contract_version !== ROOMS_DELIVERIES_CONTRACT.version ||
      row.schema_sha256 !== ROOMS_DELIVERIES_CONTRACT.schemaSha256
    ) {
      throw new CursorStoreError(
        "cursor_contract_drift",
        "Delivery cursor contract pin is invalid.",
      );
    }
  }
}
