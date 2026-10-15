// FORK: Railway infrastructure for this fork's test site. See "Deployment" in FORK.md.
import { defineRailway, github, mongo, preserve, project, service } from 'railway/iac';

export default defineRailway(() => {
  const db = mongo('mongo');

  const librechat = service('librechat', {
    source: github('jasonsims/LibreChat', { branch: 'deploy' }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 5 },
    healthcheck: '/health',
    healthcheckTimeout: 300,
    env: {
      MONGO_URI: db.env.MONGO_URL,
      // Matches the Dockerfile's EXPOSE and the public domain's target port.
      PORT: '3080',
      DOMAIN_CLIENT: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      DOMAIN_SERVER: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      TRUST_PROXY: '1',
      NO_INDEX: 'true',

      // Email and password only, open sign-up, no email verification. The bots depend on this.
      ALLOW_EMAIL_LOGIN: 'true',
      ALLOW_REGISTRATION: 'true',
      ALLOW_UNVERIFIED_EMAIL_LOGIN: 'true',
      ALLOW_SOCIAL_LOGIN: 'false',
      ALLOW_SOCIAL_REGISTRATION: 'false',
      ALLOW_PASSWORD_RESET: 'false',

      // No Meilisearch service, so conversation search stays off.
      SEARCH: 'false',

      ANTHROPIC_API_KEY: preserve(),
      ANTHROPIC_MODELS: 'claude-haiku-5-5',

      // Secrets are set once by hand (FORK.md) and kept out of source.
      JWT_SECRET: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      CREDS_KEY: preserve(),
      CREDS_IV: preserve(),
    },
  });

  return project('librechat', { resources: [librechat, db] });
});
