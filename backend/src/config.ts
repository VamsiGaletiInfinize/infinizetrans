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
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
    provider: process.env.TRANSCRIPTION_PROVIDER || 'deepgram', // 'deepgram' or 'aws'
  },
  novaSonic: {
    modelId: process.env.NOVA_SONIC_MODEL_ID || 'amazon.nova-sonic-v1:0',
    region: process.env.NOVA_SONIC_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  pipeline: {
    // 'nova-sonic' or 'legacy' (Deepgram+Translate+Polly)
    provider: process.env.TRANSLATION_PIPELINE || 'nova-sonic',
  },
};
