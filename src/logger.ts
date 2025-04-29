import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(import.meta.dirname, '../sshclient.log');
const SENSITIVE_LOG_FILE = path.join(import.meta.dirname, '../sensitive.log');

// Regular log files are readable by everyone
const LOG_FILE_MODE = 0o644;

// Sensitive log files are only readable by the owner
const SENSITIVE_LOG_FILE_MODE = 0o600;

// Helper function to sanitize sensitive data for logging
function sanitizeData(data: any): any {
  if (!data) return data;
  
  if (typeof data === 'object') {
    const result: any = Array.isArray(data) ? [] : {};
    
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Replace password and token fields with asterisks
        if (
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')
        ) {
          result[key] = '********';
        } else {
          result[key] = sanitizeData(data[key]);
        }
      }
    }
    
    return result;
  }
  
  return data;
}

// Function to ensure log file exists with proper permissions
function ensureLogFile(filePath: string, mode: number): void {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // Create empty file
      fs.writeFileSync(filePath, '', { mode });
    } else {
      // Set permissions on existing file
      fs.chmodSync(filePath, mode);
    }
  } catch (err) {
    console.error(`Failed to ensure log file ${filePath}:`, err);
  }
}

// Initialize log files
ensureLogFile(LOG_FILE, LOG_FILE_MODE);
ensureLogFile(SENSITIVE_LOG_FILE, SENSITIVE_LOG_FILE_MODE);

export function logError(message: string, error?: any) {
  try {
    const timestamp = new Date().toISOString();
    const sanitizedError = error ? sanitizeData(error) : undefined;
    const logMessage = `[${timestamp}] ERROR: ${message}${sanitizedError ? '\n' + JSON.stringify(sanitizedError, null, 2) : ''}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (err) {
    console.error('Failed to write to error log:', err);
  }
}

export function logInfo(message: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
  } catch (err) {
    console.error('Failed to write to info log:', err);
  }
}

// Function for logging sensitive information (like credentials)
// This writes to a separate, more secured log file
export function logSensitive(message: string, data?: any) {
  try {
    const timestamp = new Date().toISOString();
    
    // For regular logs, sanitize the data
    const sanitizedData = data ? sanitizeData(data) : undefined;
    const regularLogMessage = `[${timestamp}] SENSITIVE: ${message}${sanitizedData ? ' ' + JSON.stringify(sanitizedData, null, 2) : ''}\n`;
    fs.appendFileSync(LOG_FILE, regularLogMessage);
    
    // For sensitive logs, include the actual data
    const sensitiveLogMessage = `[${timestamp}] SENSITIVE: ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
    fs.appendFileSync(SENSITIVE_LOG_FILE, sensitiveLogMessage);
  } catch (err) {
    console.error('Failed to write to sensitive log:', err);
  }
}