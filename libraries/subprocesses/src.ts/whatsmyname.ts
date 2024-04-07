"use strict";

import { waitForExit, pipeToSend } from "./utils";
import path from "path";
import child_process from "child_process";

export default async function (username: string, send: any): Promise<string> {
  const dir = process.cwd();
  await waitForExit(
    child_process.spawn(
      "python3",
      [path.join(process.env.HOME, "WhatsMyName-Client", "wmnc.py"), "update"],
      { stdio: "pipe" },
    ),
  );
  return await pipeToSend(
    child_process.spawn(
      "python3",
      [
        path.join(process.env.HOME, "WhatsMyName-Client", "wmnc.py"),
        "find",
        username,
      ],
      { stdio: "pipe" },
    ),
    send,
  );
}
