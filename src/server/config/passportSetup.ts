import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import axios from "axios";

const GITHUB_REPO = process.env.GITHUB_REPO || "owner/repo"; // Replace with your repo

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: "http://localhost:4000/auth/github/callback",
    },
    async (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any, info?: any) => void) => {
      try {
        // console.log("GitHub profile:", profile);
        // console.log("Access token:", accessToken);
        // console.log("GITHUB_REPO:", GITHUB_REPO);

        // Verify token scopes
        const tokenInfo = await axios.get("https://api.github.com/user", {
          headers: { Authorization: `token ${accessToken}` },
        });
        // console.log("Token scopes:", tokenInfo.headers["x-oauth-scopes"]);

        // Construct the API URL
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${profile.username}`;
        // console.log("GitHub API URL:", apiUrl);

        // Verify if the user has access to the specified repository
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
          },
        });

        if (response.status === 204) {
          // console.log("User has access to the repository.");
          return done(null, profile);
        } else {
          // console.log("User does not have access to the repository.");
          return done(null, false, { message: "You do not have access to this repository." });
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          // console.error("GitHub API error:", error.response?.data);
        } else {
          // console.error("Unexpected error:", error);
        }
        return done(null, false, { message: "Error verifying repository access." });
      }
    }
  )
);

passport.serializeUser((user: Express.User, done: (err: any, id?: any) => void) => {
  done(null, user);
});

passport.deserializeUser((obj: any, done: (err: any, user?: any) => void) => {
  done(null, obj);
});

export default passport;