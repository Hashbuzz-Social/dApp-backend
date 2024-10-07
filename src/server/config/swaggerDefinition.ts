// Swagger definition
const swaggerDefinition = {
    openapi: "3.0.0",
    info: {
      title: "Hashbuzz dApp API with Swagger",
      version: "1.0.0",
      description: "This is the API documentation for the Hashbuzz dApp API. You can use this API to interact with the Hashbuzz dApp.",
    },
    servers: [
      {
        url: process.env.TWITTER_CALLBACK_HOST ?? "http://localhost:4000",
      },
    ],
    components: {
      securitySchemes: {
        OAuth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://github.com/login/oauth/authorize",
              tokenUrl: "https://github.com/login/oauth/access_token",
              scopes: {
                repo: "Access to your repositories",
                "user:email": "Access to your email address",
              },
            },
          },
        },
      },
    },
    security: [
      {
        OAuth2: ["repo", "user:email"],
      },
    ],
  };

  export default swaggerDefinition;