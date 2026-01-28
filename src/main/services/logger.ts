import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

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

    if (!isDevelopment) {
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
