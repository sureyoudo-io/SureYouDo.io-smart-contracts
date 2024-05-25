import winston from "winston";

// Define the color mapping for different log levels
winston.addColors({
  error: "red",
  warn: "yellow",
  info: "cyan",
  debug: "green",
});

// Custom format to include file and line number
const customFormat = winston.format.printf(({ level, message }) => {
  return `${level}: ${message}`;
});

// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize({ all: true }), // Apply colors
    winston.format.timestamp(),
    customFormat,
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
