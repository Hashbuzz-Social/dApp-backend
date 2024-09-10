import session from "express-session";
import crypto from "crypto";

const generateRandomString = (length: number) => {
  return crypto.randomBytes(length).toString("hex");
};

const sessionSecret = process.env.SESSION_SECRET || generateRandomString(32);

const sessionConfig = session({
  secret: sessionSecret,
  resave: true, // Resave sessions to track issues
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === "production" },
});

export default sessionConfig;