export const config = {
  port: parseInt(process.env.PORT || '8080'),

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ghost:ghost@postgres:5432/ghost',

  // Redis
  redisUri: process.env.REDIS_URI || 'redis://redis:6379',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',

  // API Keys
  apiKeyPrefix: process.env.API_KEY_PREFIX || 'gapi_',

  // Superusers (comma-separated)
  superuserExtensions: (process.env.SUPERUSER_EXTENSIONS || '555').split(',').map(s => s.trim()),

  // Asterisk
  asteriskConfigPath: process.env.ASTERISK_CONFIG_PATH || '/asterisk-config',
  pjsipConf: process.env.PJSIP_CONF || '/asterisk-config/pjsip.conf',
  voicemailConf: process.env.VOICEMAIL_CONF || '/asterisk-config/voicemail.conf',
  managerConf: process.env.MANAGER_CONF || '/asterisk-config/manager.conf',

  // AMI (Asterisk Manager Interface)
  ami: {
    host: process.env.AMI_HOST || process.env.ASTERISK_HOST || 'asterisk',
    port: parseInt(process.env.AMI_PORT || '5038'),
    username: process.env.AMI_USERNAME || 'ghost-api',
    password: process.env.AMI_PASSWORD || '',
  },

  // Rate limiting
  rateLimitWindowMs: 60 * 1000, // 1 minute
  rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
  loginRateLimitRequests: parseInt(process.env.LOGIN_RATE_LIMIT_REQUESTS || '10'),

  // Kubernetes
  k8sNamespace: process.env.K8S_NAMESPACE || 'ghost',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
