"use strict";

import { pipeToSend } from "./utils";
import path from "path";
import child_process from "child_process";

export const stripUsed = (s) => {
  return s
    .split("\n")
    .filter((v) => v.match("[+]"))
    .join("\n");
};

export default async function (username: string, send: any): Promise<string> {
  return await pipeToSend(
    child_process.spawn("holehe", [username, "--only-used", "--no-color"], {
      stdio: "pipe",
    }),
    (v) => send(stripUsed(v)),
  );
}
