import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import express from 'express';

export const setupSwagger = (app: express.Express, swaggerDefinitionFactory: (host?: string) => any) => {
  const options = {
    swaggerDefinition: swaggerDefinitionFactory(process.env.FRONTEND_URL),
    apis: ['./src/routes/*.ts']
  };
  const swaggerSpec = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

export default setupSwagger;
