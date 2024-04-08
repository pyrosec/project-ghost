import mkdirp from "mkdirp";
import tmpdir from "tmpdir";
import path from "path";
import fs from "fs-extra";

export function ansiRegex({ onlyFirst = false } = {}) {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  ].join("|");

  return new RegExp(pattern, onlyFirst ? undefined : "g");
}
const regex = ansiRegex();

export { tmpdir };

export const readResult = async (query) => {
  const result = JSON.parse(
    (await fs.readFile(path.join(tmpdir, query + ".json"), "utf8")).trim(),
  );
  return result;
};

export const readResultRaw = async (query) => {
  const result = (
    await fs.readFile(path.join(tmpdir, query + ".json"), "utf8")
  ).trim();
  return result;
};

export const mkTmp = async () => {
  await mkdirp(tmpdir);
};

export const waitForExit = async (proc) => {
  return await new Promise((resolve, reject) => {
    proc.on("error", (err) => reject(err));
    proc.on("exit", (code) => resolve(code));
  });
};

export async function pipeToSend(proc, send): Promise<string> {
  var data = "";
  return await new Promise((resolve, reject) => {
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (_data) => {
      const stripped = stripAnsi(_data);
      data += stripped;
      send(stripped);
    });
    proc.stderr.on("data", (_data) => {
      const stripped = stripAnsi(_data);
      send(stripped);
    });
    proc.on("exit", (code) => resolve(data));
    proc.on("error", (err) => reject(err));
  });
}

export default function stripAnsi(string) {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }
  return string.replace(regex, "");
}
