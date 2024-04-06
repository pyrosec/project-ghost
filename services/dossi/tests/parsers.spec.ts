import { parseConfiguration } from "../lib/parsers";
import fs from "fs-extra";
import path from "path";
import util from "util";

describe('dossi parsers', () => {
  it('should parse sip accounts', async () => {
    const parsed = parseConfiguration(await fs.readFile(path.join(__dirname, 'sip.test.conf'), 'utf8'));
    console.log(util.inspect(parsed, { colors: true, depth: 15 }));
  });
});
