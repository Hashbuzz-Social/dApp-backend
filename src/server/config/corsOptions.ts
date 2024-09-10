import cors from "cors";

const corsOptions: cors.CorsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: "GET, OPTIONS, POST, PUT, PATCH",
  credentials: true, // Allow credentials (cookies) to be sent
};

export default corsOptions;