import { piplQueryToObject, parseConfiguration } from "../lib/parsers";
import fs from "fs-extra";
import path from "path";
import util from "util";
import { expect } from "chai";

describe('dossi parsers', () => {
  it('should parse sip accounts', async () => {
    const parsed = parseConfiguration(await fs.readFile(path.join(__dirname, 'sip.test.conf'), 'utf8'));
    console.log(util.inspect(parsed, { colors: true, depth: 15 }));
  });
  it('should parse pipl object', async () => {
    const parsed = piplQueryToObject('name:"Andrew Panknen:" citystatezip:"Alexandria, VA"');
    expect(parsed).to.eql({
      name: 'Andrew Panknen',
      citystatezip: 'Alexandria, VA'
    });
  });
});
