import swaggerJsdoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Hashbuzz dApp API with Swagger",
    version: "1.0.0",
    description: "This is the API documentation for the Hashbuzz dApp API. You can use this API to interact with the Hashbuzz dApp. There is a lot of information here, so make sure to read it all! For authentication, JWT token-based authentication is used for APIs.",
  },
  servers: [
    {
      url: process.env.TWITTER_CALLBACK_HOST?? "http://localhost:4000",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token-based authentication. Use the token provided after login to access the API.",
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ["./src/routes/**/*.ts"], // Include all files in routes directory and subdirectories
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
