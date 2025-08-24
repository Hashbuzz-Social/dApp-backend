import { NextFunction, Request, Response } from "express";
import axios from "axios";
import { getConfig } from "@appConfig";
import logger from "jet-logger";
import session from "express-session";

interface GitHubUser {
  username: string;
  [key: string]: any;
}

interface SessionWithToken extends session.Session {
  accessToken?: string;
}

const checkWritePermission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // First check if user is authenticated
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({
        error: true,
        message: "Authentication required"
      });
    }

    const config = await getConfig();
    const GITHUB_REPO = config.repo.repo;
    const user = req.user as GitHubUser;

    // If we have the access token from the session, use it to check permissions
    const session = req.session as SessionWithToken;
    if (session && session.accessToken) {
      const accessToken = session.accessToken;
      
      try {
        // Check if user has write access to the repository
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/collaborators/${user.username}/permission`;
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
          },
        });

        const permission = response.data.permission as string;
        
        // Write access includes: admin, maintain, write
        const hasWriteAccess = ['admin', 'maintain', 'write'].includes(permission);
        
        if (hasWriteAccess) {
          return next();
        } else {
          return res.status(403).json({
            error: true,
            message: "Write access required. You need write permissions to view logs."
          });
        }
      } catch (error) {
        logger.err('Error checking GitHub permissions:' + String(error));
        // Fallback: if we can't check permissions, deny access
        return res.status(403).json({
          error: true,
          message: "Unable to verify write permissions"
        });
      }
    } else {
      // If no access token in session, we can't verify permissions properly
      return res.status(403).json({
        error: true,
        message: "Unable to verify repository permissions"
      });
    }
  } catch (error) {
    logger.err('Error in write permission check:' + String(error));
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};

export default checkWritePermission;
