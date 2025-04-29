import * as fs from 'fs';
import { logError, logInfo } from './logger.js';

// Interface for command information
interface CommandInfo {
  command: string;
  executedAt: string;
  result?: {
    exitCode: number;
    signal: string;
    stdout: string;
    stderr: string;
    completedAt: string;
  };
}

// Interface for connection information
interface ConnectionInfo {
  host: string;
  port: number;
  username: string;
  connectedAt: string;
}

// Interface for session checkpoint
interface SessionCheckpoint {
  connectionInfo?: ConnectionInfo;
  commands: CommandInfo[];
}

// Session manager class
export class sessionManager {
  private connectionInfo?: ConnectionInfo;
  private commands: CommandInfo[] = [];

  constructor() {}

  // Set connection information
  setConnectionInfo(info: ConnectionInfo): void {
    this.connectionInfo = info;
  }

  // Add command to history
  addCommand(command: string): void {
    this.commands.push({
      command,
      executedAt: new Date().toISOString()
    });
  }

  // Set command result
  setCommandResult(command: string, result: any): void {
    // Find the command in history
    const cmdIndex = this.commands.findIndex(cmd => cmd.command === command);
    
    if (cmdIndex !== -1) {
      this.commands[cmdIndex].result = result;
    }
  }

  // Get command history
  getCommandHistory(): CommandInfo[] {
    return this.commands;
  }

  // Get session checkpoint for saving
  getCheckpoint(): SessionCheckpoint {
    return {
      connectionInfo: this.connectionInfo,
      commands: this.commands
    };
  }
  
  // Restore session from checkpoint
  restoreFromCheckpoint(checkpoint: SessionCheckpoint): void {
    if (checkpoint.connectionInfo) {
      this.connectionInfo = checkpoint.connectionInfo;
    }
    
    if (checkpoint.commands && Array.isArray(checkpoint.commands)) {
      this.commands = checkpoint.commands;
    }
    
    logInfo(`Restored session with ${this.commands.length} commands`);
  }
}

// Function to save checkpoint to file
export async function saveCheckpoint(filePath: string, checkpoint: SessionCheckpoint): Promise<void> {
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
    logInfo(`Checkpoint saved to ${filePath}`);
  } catch (error) {
    logError(`Failed to save checkpoint to ${filePath}`, error);
    throw error;
  }
}

// Function to load checkpoint from file
export function loadCheckpoint(filePath: string): SessionCheckpoint {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const checkpoint = JSON.parse(data) as SessionCheckpoint;
    logInfo(`Checkpoint loaded from ${filePath}`);
    return checkpoint;
  } catch (error) {
    logError(`Failed to load checkpoint from ${filePath}`, error);
    throw error;
  }
}