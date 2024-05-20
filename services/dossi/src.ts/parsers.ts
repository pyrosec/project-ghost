import fs from "fs-extra";
export const parseConfiguration = (s) => {
  return s.match(/\[[^\[]+/gm).map((v) => ({
    section: ((s) => s.substr(1, s.length - 2))(v.match(/\[(?:[^\]]+)\]/g)[0]),
    modifier: ((s) => s && s[0].substr(1))(v.match(/\((?:[^\)]+)/g)),
    fields: v
      .split("\n")
      .slice(1)
      .reduce((r, v) => {
        const split = v.split("=");
        if (split[0][0] && split[0][0] !== ";") {
          r.push([split[0], split[1]]);
        }
        return r;
      }, []),
  }));
};

export const parseVoicemail = (s): any => {
  const fields = s
    .split("\n")
    .filter(Boolean)
    .filter((v) => v[0] !== ";");
  const result = {};
  let tag = "";
  fields.forEach((v) => {
    if (v[0] === "[") {
      tag = v.substr(1, v.length - 2);
      result[tag] = [];
    } else {
      if (v.match("=>")) {
        result[tag].push({
          type: "mapping",
          key: v.split("=>")[0].trim(),
          value: v.split("=>")[1].trim().split(",").filter(Boolean),
        });
      } else {
        result[tag].push({
          type: "field",
          key: v.split("=")[0].trim(),
          value: v.split("=")[1].trim(),
        });
      }
    }
  });
  return result;
};

export const buildVoicemail = (voicemailAccounts) => {
  return Object.entries(voicemailAccounts)
    .map(([section, rows]: any) => {
      return [
        "[" + section + "]",
        ...rows.map((v) =>
          v.type === "field"
            ? v.key + " = " + v.value
            : v.key + " => " + v.value.join(","),
        ),
      ].join("\n");
    })
    .join("\n\n");
};

export const buildConfiguration = (o) => {
  return o
    .map((v) =>
      [
        "[" + v.section + "]" + (v.modifier ? "(" + v.modifier + ")" : ""),
        ...v.fields.map(([k, v]) => String(k) + "=" + String(v)),
      ].join("\n"),
    )
    .join("\n\n");
};

export const readVoicemail = async () => {
  return parseVoicemail(
    await fs.readFile("/etc/asterisk/voicemail.conf", "utf8"),
  );
};

export const writeVoicemail = async (voicemailAccounts) => {
  await fs.writeFile(
    "/etc/asterisk/voicemail.conf",
    buildVoicemail(voicemailAccounts),
  );
};

export const readSipAccounts = async () => {
  return parseConfiguration(
    await fs.readFile("/etc/asterisk/sip.conf", "utf8"),
  );
};

export const piplQueryToObject = (query: string): any => {
  try {
    return query
      .match(/([^\s:]+):(?:["”]((?:[^”"\\]|\\[^”"])*)[”"])|(?:\S+)/g)
      .map((v) =>
        v.split(":").map((v) => v.replace(/[”"]/g, '')).filter(Boolean)
      ).filter(Boolean)
      .reduce((r, [key, value]) => {
        r[key] = value;
        return r;
      }, {});
  } catch (e) {
    return {};
  }
};
