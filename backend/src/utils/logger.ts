import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

// Clear all log files on startup for easier debugging
const logFiles = ['application.log', 'errors.log', 'transcription.log'];
logFiles.forEach(file => {
  const filePath = path.join(logsDir, file);
  try {
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '');
      console.log(`✅ Cleared ${file}`);
    }
  } catch (err) {
    console.error(`Failed to clear ${file}:`, err);
  }
});

// Configure Winston logger with file and console transports
export const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;
      if (Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta)}`;
      }
      return logMessage;
    })
  ),
  transports: [
    // Console output (colorized)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
    // File output - all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'application.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // File output - errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'errors.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),
    // File output - transcription specific
    new winston.transports.File({
      filename: path.join(logsDir, 'transcription.log'),
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});

// Helper functions for specific log types
export const logTranscription = {
  start: (provider: string, model: string, language: string, attendee: string) => {
    logger.info('🎤 TRANSCRIPTION START', {
      provider,
      model,
      language,
      attendee,
      timestamp: new Date().toISOString(),
    });
  },

  partial: (text: string, confidence?: number) => {
    logger.debug('📝 PARTIAL TRANSCRIPT', {
      text: text.substring(0, 100),
      confidence,
      length: text.length,
    });
  },

  final: (text: string, confidence?: number, latencyMs?: number) => {
    logger.info('✅ FINAL TRANSCRIPT', {
      text,
      confidence,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  },

  error: (error: string, details?: any) => {
    logger.error('❌ TRANSCRIPTION ERROR', {
      error,
      details,
      timestamp: new Date().toISOString(),
    });
  },

  latency: (stage: string, durationMs: number) => {
    logger.info('⏱️ LATENCY', {
      stage,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  },

  modelInfo: (provider: string, model: string, version?: string) => {
    logger.info('🔧 MODEL INFO', {
      provider,
      model,
      version,
      timestamp: new Date().toISOString(),
    });
  },
};

export default logger;
