import passport from 'passport';
import axios from 'axios';
import { Strategy as GitHubStrategy, StrategyOptions } from 'passport-github2';
import logger from '../config/logger';
import express from 'express';
import { AppConfig } from '../@types/AppConfig';

interface GitHubProfile extends Express.User {
  username?: string;
  accessToken?: string;
}

type DoneCallback = (err: unknown | null, user?: Express.User | GitHubProfile | false, info?: unknown) => void;

export const configureGithubAuth = (config: AppConfig) => {
  const GITHUB_REPO = config.repo.repo;

  // Determine callbackURL behavior:
  // - If an explicit callback host is configured (config.app.xCallBackHost), build and pass
  //   an absolute callbackURL so GitHub redirects back to that host.
  // - If not configured, do NOT pass callbackURL. In that case GitHub will use the
  //   Authorization callback URL configured in your OAuth App settings. This avoids the
  //   "redirect_uri is not associated with this application" error when the registered
  //   callback is the correct target but a mismatched runtime URL would otherwise be sent.
  const callbackHost = config.app.xCallBackHost;
  const callbackURL = `${callbackHost.replace(/\/$/, '')}/auth/github/callback`;
  logger.info('GitHub OAuth callbackURL configured: ' + (callbackURL ?? '(none - using app-registered callback)'));

  // Build options with correct typing based on callbackURL presence
  const strategyOptions: StrategyOptions = {
    clientID: config.repo.repoClientID,
    clientSecret: config.repo.repoClientSecret,
    callbackURL: callbackURL // This will be undefined if not set, which is allowed by passport-github2
  };

  passport.use(new GitHubStrategy(strategyOptions,
      (accessToken: string, refreshToken: string, profile: GitHubProfile, done: DoneCallback) => {
        (async () => {
          try {
            await axios.get('https://api.github.com/user', {
              headers: { Authorization: `token ${accessToken}` }
            });

            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${String(profile.username)}`;
            logger.info('GitHub API URL: ' + apiUrl);

            const response = await axios.get(apiUrl, {
              headers: {
                Authorization: `token ${accessToken}`
              }
            });

            if (response.status === 204) {
              profile.accessToken = accessToken;
              return done(null, profile);
            }
            return done(null, false, { message: 'You do not have access to this repository.' });
          } catch (error) {
            if (axios.isAxiosError(error)) {
              logger.err('GitHub API error: ' + String(error.response?.data));
            } else {
              logger.err('Unexpected error: ' + String(error));
            }
            return done(null, false, { message: 'Error verifying repository access.' });
          }
        })();
      }
    )
  );

  passport.serializeUser((user: Express.User, done: DoneCallback) => done(null, user));
  passport.deserializeUser((obj: unknown, done: DoneCallback) => done(null, obj as Express.User));
};

export const githubRoutes = (app: express.Express) => {
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo'] }) as express.RequestHandler);

  app.get(
    '/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/non-allowed', failureMessage: true }) as express.RequestHandler,
    (req: express.Request, res: express.Response) => {
      const user = req.user;
      if (user && (user as unknown as { accessToken?: string }).accessToken) {
        // augment session type only where needed
        (req.session as unknown as Record<string, unknown>).accessToken = (user as unknown as { accessToken?: string }).accessToken;
      }
      logger.info('GitHub authentication successful, redirecting to API docs.');
      res.redirect('/api-docs');
    }
  );
};

export default configureGithubAuth;
