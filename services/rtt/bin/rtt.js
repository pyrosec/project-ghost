const { run } = require('../lib/run');
const { logger } = require('../lib/logger');

(async () => {
  await run();
})().catch((err) => logger.error(err));
