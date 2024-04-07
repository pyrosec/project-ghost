"use strict";

import path from "path";
import child_process from "child_process";
import { pipeToSend } from "./utils";

export default async function (username, send): Promise<string> {
  return await pipeToSend(
    child_process.spawn(
      "python3",
      [
        path.join(process.env.HOME, "sherlock", "sherlock", "sherlock.py"),
        "--print-found",
        username,
      ],
      { stdio: "pipe" },
    ),
    send,
  );
}
