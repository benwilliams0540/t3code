import rawWorkspaceReadV1 from "./workspace-read-v1.json";
import rawWorkspaceReadV1Schema from "./workspace-read-v1.schema.json";
import rawWorkspaceReadV2 from "./workspace-read-v2.json";
import rawWorkspaceReadV2Schema from "./workspace-read-v2.schema.json";

import {
  decodeRoomsWorkspaceRead,
  decodeRoomsWorkspaceReadV1,
  decodeRoomsWorkspaceReadV2,
} from "../model/workspace-v2";

export const roomsWorkspaceFixtureV1 = decodeRoomsWorkspaceReadV1(
  rawWorkspaceReadV1,
  rawWorkspaceReadV1Schema,
);

export const roomsWorkspaceFixture = decodeRoomsWorkspaceReadV2(
  rawWorkspaceReadV2,
  rawWorkspaceReadV2Schema,
);

export function decodeRoomsWorkspaceFixture(document: unknown) {
  return decodeRoomsWorkspaceRead(document, {
    v1: rawWorkspaceReadV1Schema,
    v2: rawWorkspaceReadV2Schema,
  });
}

export { rawWorkspaceReadV1Schema, rawWorkspaceReadV2Schema };
