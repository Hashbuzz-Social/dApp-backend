import { ParamSchema, Schema } from 'express-validator';

// 🔹 Helper function to generate validation rules dynamically
export const getValidationRules = <T extends Record<string, any>>(fields: {
  [K in keyof T]: ParamSchema;
}): Schema => fields;
