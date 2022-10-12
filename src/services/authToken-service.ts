import jwt from "jsonwebtoken";
import { user_user } from "@prisma/client";
import prisma from "@shared/prisma";
const accessSecret = process.env.J_ACCESS_TOKEN_SECRET;
const refreshSecret = process.env.J_REFRESH_TOKEN_SECRET;

export const generateAccessToken = (user: user_user) => {
  const { id, username, personal_twitter_id } = user;
  return jwt.sign({ id, username, personal_twitter_id }, accessSecret!, { expiresIn: "20m" });
};

export const generateRefreshToken = async (user: user_user) => {
  const { id, username, personal_twitter_id } = user;
  const refreshToken = jwt.sign({ id, username, personal_twitter_id }, refreshSecret!, { expiresIn: "30m" });
  await prisma.authtoken_token.create({
    data: {
      user_id: id,
      key: refreshToken,
      created: new Date().toISOString(),
    },
  });

  return refreshToken;
};

export const validateToken = (token: string) => {
  jwt.verify(token, accessSecret!, (err, payload) => {
    if (err) throw err;
    return payload;
  }); //end of jwt.verify()
}; //end of function
