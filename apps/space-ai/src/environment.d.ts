/**
 * Secret bindings are provisioned by the production deployment workflow.
 * Their values are intentionally not required during Preview builds.
 */
interface Env {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  GITHUB_ACTIONS_TOKEN: string;
}
