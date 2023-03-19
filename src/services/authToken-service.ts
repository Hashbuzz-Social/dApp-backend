import jwt from "jsonwebtoken";
import { user_user } from "@prisma/client";
import prisma from "@shared/prisma";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;
const refreshSecret = process.env.J_REFRESH_TOKEN_SECRET;

export const generateAccessToken = (user: user_user) => {
  const { id, username, personal_twitter_id } = user;
  return jwt.sign({ id: id.toString(), username, personal_twitter_id }, accessSecret!, { expiresIn: "20m" });
};

export const generateRefreshToken = async (user: user_user) => {
  const { id, username, personal_twitter_id } = user;
  const refreshToken = jwt.sign({ id: id.toString(), username, personal_twitter_id }, refreshSecret!, { expiresIn: "30m" });
  await prisma.authtoken_token.upsert({
    where: { user_id: id },
    create: {
      user_id: id,
      key: refreshToken,
      created: new Date().toISOString(),
    },
    update: {
      key: refreshToken,
    },
  });

  return refreshToken;
};

export const generateAdminToken = (user: user_user) => {
  const { id, username, personal_twitter_id , role } = user;
  return jwt.sign({ id: id.toString(), username, personal_twitter_id , role}, accessSecret!, { expiresIn: "24h" });
};

// export const validateToken = (token: string) => {
//   let user:Partial<user_user>;
//   const user = jwt.verify(token, accessSecret!, (err, payload) => {
//     if (err) throw err;
//     user = payload as any as {id:bigint, username:string, personal_twitter_id:string}
//     return payload;
//   }); //end of jwt.verify()
//   return user;
// }; //end of function
