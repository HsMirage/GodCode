import winston from 'winston'
import { LoggerService } from '../main/services/logger'

const isDevelopment = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL
const isRenderer = typeof window !== 'undefined'

const rendererFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
)

const rendererLogger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: rendererFormat,
  transports: [
    new winston.transports.Console({
      level: isDevelopment ? 'debug' : 'info',
      format: rendererFormat
    })
  ]
})

function getActiveLogger(): winston.Logger {
  return isRenderer ? rendererLogger : LoggerService.getInstance().getLogger()
}

export const logger = new Proxy(rendererLogger, {
  get(_target, property, receiver) {
    const activeLogger = getActiveLogger()
    const value = Reflect.get(activeLogger, property, receiver)
    return typeof value === 'function' ? value.bind(activeLogger) : value
  }
}) as winston.Logger
