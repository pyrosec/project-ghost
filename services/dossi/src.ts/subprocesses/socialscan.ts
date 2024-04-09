"use strict";

import { mkTmp, pipeToSend, tmpdir } from "./utils";
import child_process from "child_process";
import path from "path";

export default async function (username: string, send: any): Promise<string> {
  await mkTmp();
  return await pipeToSend(
    child_process.spawn(
      "socialscan",
      ["--json", path.join(tmpdir, username + ".json"), username],
      { stdio: "pipe" },
    ),
    send,
  );
}
