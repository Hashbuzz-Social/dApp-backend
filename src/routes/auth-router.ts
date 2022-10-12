import { Router, Response, Request } from "express";
import { twitterAuthUrl } from "@services/auth-service";
import HttpStatusCodes from "http-status-codes";
import prisma from "@shared/prisma";
import { user_user } from "@prisma/client";
import twitterAPI from "@shared/twitterAPI";
import userService from "@services/user-service";
import moment from "moment";
import { generateAccessToken, generateRefreshToken } from "@services/authToken-service";

const authRouter = Router();
const { OK  , TEMPORARY_REDIRECT} = HttpStatusCodes;

authRouter.get("/twitter-login", (req: Request, res: Response) => {
  (async () => {
    console.log("twitter-login:::")
    const url = await twitterAuthUrl(`${process.env.TWITTER_CALLBACK_HOST!}/auth/twitter-return/`);
    return res.status(OK).json({ url });
  })();
});

authRouter.get("/twitter-return", (req: Request, res: Response) => {
  (async () => {
    console.log({params:req.params, query:req.query})
    // Extract tokens from query string
    const oauth_token = req.query.oauth_token as any as string;
    const oauth_verifier = req.query.oauth_verifier as any as string;
    console.log("getting Token Token=::" , oauth_token);
    // Get the saved oauth_token_secret from session
    // const { oauth_token_secret } = req.session;
    const authtoken = await prisma.user_twitterlogintemp.findFirst({
      where: {
        oauth_token,
      },
    });

    const { oauth_token_secret } = authtoken!;

    console.log("getting oauth_token_secret=::" , oauth_token_secret);

    if (!oauth_token || !oauth_verifier || !oauth_token_secret) {
      return res.status(400).send("You denied the app or your session expired!");
    }

    // Obtain the persistent tokens
    // Create a client from temporary tokens
    const client = twitterAPI.tweeterApiForUser({ accessSecret: oauth_token_secret, accessToken: oauth_token });

    client
      .login(oauth_verifier)
      .then(async ({ client: loggedClient, accessToken, accessSecret }) => {
        const meUser = await client.v2.me();
        const { username, id } = meUser.data;
        let user: user_user;
        const existinguser = await userService.getUserByUserName(username);
        if (!existinguser) {
          user = await prisma.user_user.create({
            data: {
              personal_twitter_handle: username,
              username: username,
              personal_twitter_id: id,
              twitter_access_token: accessToken,
              twitter_access_token_secret: accessSecret,
              available_budget: 0,
              is_superuser: false,
              is_active: true,
              is_staff: false,
              first_name: "",
              last_name: "",
              email: "",
              password: "",
              date_joined: moment().toISOString(),
            },
          });
        } else {
          user = await prisma.user_user.update({
            where: {
              username,
            },
            data: {
              twitter_access_token: accessToken,
              twitter_access_token_secret: accessSecret,
            },
          });
        }
        // ?token={token.key}&user_id={user.id}
        const token = generateAccessToken(user);
        const refreshToken = await generateRefreshToken(user);
        res.writeHead( TEMPORARY_REDIRECT , {
          'Location':`${process.env.FRONTEND_URL!}?token=${token}&user_id=${user.id}&refresh_token=${refreshToken}`
        });
        res.end();
        //check user is existing or not;

        // loggedClient is an authenticated client in behalf of some user
        // Store accessToken & accessSecret somewhere
      })
      .catch((error) => {
        console.log(error);
       return res.status(403).send("Invalid verifier or access tokens!")
      });
  })();
});

export default authRouter;
