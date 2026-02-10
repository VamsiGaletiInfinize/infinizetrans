import dotenv from 'dotenv';
dotenv.config();

export const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3002',
  },
  dynamodb: {
    tableName: process.env.DYNAMODB_TABLE_NAME || 'infinize-meetings',
  },
};
