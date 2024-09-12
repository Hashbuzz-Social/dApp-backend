import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  headers: true, // Send rate limit headers
  // keyGenerator: (req) => req.ip, // Customize the key used for rate limiting
});

export default limiter;