import fs from 'fs'
import path from 'path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

// Mock app for scripts
let app: { getPath: (name: string) => string }
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron')
  app = electron.app
} catch (error) {
  app = {
    getPath: (name: string) => {
      const cwd = process.cwd()
      if (name === 'userData') return path.join(cwd, 'dev-data')
      return cwd
    }
  }
}

const isDevelopment = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
)

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

export class LoggerService {
  private static instance: LoggerService
  private logger: winston.Logger

  private constructor() {
    const logDir = path.join(app.getPath('userData'), 'logs')

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const transports: winston.transport[] = []

    if (isDevelopment) {
      transports.push(
        new winston.transports.Console({
          level: 'debug',
          format: consoleFormat
        })
      )
    } else {
      transports.push(
        new DailyRotateFile({
          dirname: logDir,
          filename: 'app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '14d',
          level: 'info'
        })
      )
    }

    this.logger = winston.createLogger({
      level: isDevelopment ? 'debug' : 'info',
      format: isDevelopment ? consoleFormat : fileFormat,
      transports
    })
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService()
    }
    return LoggerService.instance
  }

  getLogger(): winston.Logger {
    return this.logger
  }
}
