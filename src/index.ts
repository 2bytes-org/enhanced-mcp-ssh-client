import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from 'ssh2';
import { z } from "zod";
import * as path from 'path';
import * as fs from 'fs';
import { secagent } from './secagent.js';
import { logError, logInfo, logSensitive } from './logger.js';
import { saveCheckpoint, loadCheckpoint, sessionManager } from './session.js';

const USER_AGENT = "sshclient-app/1.0";
const CONFIG_PATH = path.join(import.meta.dirname, '../secagentconfig.json');
const CHECKPOINT_PATH = path.join(import.meta.dirname, '../session_checkpoint.json');
const COMMAND_HISTORY_PATH = path.join(import.meta.dirname, '../command_history.json');
const OLLAMA_HOST = 'http://localhost:11434';
const CONNECTION_TIMEOUT = 120000; // 120 seconds (2 minutes) timeout for connections

// Create security agent with retry mechanism
const secAgent = new secagent(CONFIG_PATH, OLLAMA_HOST);

// Create sshclient MPC server instance
const server = new McpServer({
	name: "sshclient",
	version: "1.0.0",
});

// Initialize session manager
const session = new sessionManager();

// Create SSH client with proper error handling
const conn = new Client();
let isConnected = false;

// Load previous session if available
try {
	if (fs.existsSync(CHECKPOINT_PATH)) {
		const checkpoint = loadCheckpoint(CHECKPOINT_PATH);
		logInfo(`Loaded previous session from checkpoint: ${JSON.stringify(checkpoint, null, 2)}`);
		session.restoreFromCheckpoint(checkpoint);
	}
} catch (error) {
	logError("Failed to load previous session", error);
}

server.tool(
	"new-ssh-connection",
	"Create a new ssh connection to a server",
	{
		host: z.string().describe("Host of the server"),
		port: z.number().default(22).describe("Port of the server"),
		username: z.string().describe("Username for the connection"),
		password: z.string().describe("Password for the connection"),
	},
	async ({ host, port, username, password }) => {
		return new Promise((resolve, reject) => {
			// Save connection details securely (without password in logs)
			logSensitive("SSH connection attempt", { host, port, username });
			
			// Set timeout for connection
			const timeout = setTimeout(() => {
				reject({
					content: [
						{
							type: "text",
							text: `SSH connection to ${host} timed out after ${CONNECTION_TIMEOUT/1000} seconds`
						}
					]
				});
			}, CONNECTION_TIMEOUT);
			
			// Setup connection handlers
			conn.on('ready', () => {
				clearTimeout(timeout);
				isConnected = true;
				
				// Store session info without sensitive data
				session.setConnectionInfo({
					host,
					port,
					username,
					connectedAt: new Date().toISOString()
				});
				
				// Save checkpoint
				saveCheckpoint(CHECKPOINT_PATH, session.getCheckpoint());
				
				resolve({
					content: [
						{
							type: "text",
							text: `SSH connection to ${host} as ${username} established`
						}
					]
				});
			}).on('error', (err) => {
				clearTimeout(timeout);
				isConnected = false;
				logError(`SSH connection error to ${host}`, err);
				reject({
					content: [
						{
							type: "text",
							text: `SSH connection to ${host} failed: ${err.message}`
						}
					]
				});
			}).on('close', () => {
				isConnected = false;
				logInfo(`SSH connection to ${host} closed`);
			}).connect({
				host: host,
				port: port,
				username: username,
				password: password,
				readyTimeout: CONNECTION_TIMEOUT,
				keepaliveInterval: 60000 // Send keepalive every 60 seconds
			});
		});
	}
);

server.tool(
	"run-safe-command",
	"Run a safe command on the server through an ssh connection, if the command is unsafe it will not be run",
	{
		command: z.string().describe("Safe command to run on the server")
	},
	async ({ command }) => {
		// Check if we're connected
		if (!isConnected) {
			return {
				content: [
					{
						type: "text",
						text: "No active SSH connection. Please connect first using new-ssh-connection."
					}
				]
			};
		}
		
		return new Promise(async (resolve, reject) => {
			try {
				// Add command to history
				session.addCommand(command);
				
				// Save command history (without waiting for completion)
				fs.promises.writeFile(
					COMMAND_HISTORY_PATH, 
					JSON.stringify(session.getCommandHistory(), null, 2)
				).catch(err => logError("Failed to save command history", err));
				
				// Check command safety with SecAgent first with retry mechanism
				let isSafe = false;
				let retries = 3;
				
				while (retries > 0) {
					try {
						isSafe = await secAgent.checkCommandSafety(command);
						break;
					} catch (error) {
						retries--;
						if (retries === 0) throw error;
						logInfo(`Retrying command safety check, ${retries} attempts left`);
						// Small delay before retry
						await new Promise(r => setTimeout(r, 1000));
					}
				}
				
				if (!isSafe) {
					resolve({
						content: [
							{
								type: "text",
								text: "Command execution rejected as it is flagged as potentially unsafe"
							}
						]
					});
					return;
				}

				// Command execution with timeout
				const execTimeout = setTimeout(() => {
					reject({
						content: [
							{
								type: "text",
								text: `Command execution timed out after ${CONNECTION_TIMEOUT/1000} seconds`
							}
						]
					});
				}, CONNECTION_TIMEOUT);
				
				conn.exec(command, (err, stream) => {
					if (err) {
						clearTimeout(execTimeout);
						logError(`Failed to execute command: ${command}`, err);
						reject({
							content: [
								{
									type: "text",
									text: `Failed to execute command: ${err.message}`
								}
							]
						});
						return;
					}

					let stdout = '';
					let stderr = '';

					stream.on('close', (code: number, signal: string) => {
						clearTimeout(execTimeout);
						
						// Update command result in session
						session.setCommandResult(command, {
							exitCode: code,
							signal,
							stdout,
							stderr,
							completedAt: new Date().toISOString()
						});
						
						// Save checkpoint (without waiting for completion)
						saveCheckpoint(CHECKPOINT_PATH, session.getCheckpoint())
							.catch(err => logError("Failed to save checkpoint", err));
						
						resolve({
							content: [
								{
									type: "text",
									text: `Command executed with exit code ${code} and signal ${signal}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
								}
							]
						});
					}).on('data', (data: Buffer) => {
						stdout += data;
					}).stderr.on('data', (data) => {
						stderr += data;
					});
				});
			} catch (error) {
				logError("Unexpected error in run-safe-command", error);
				reject({
					content: [
						{
							type: "text",
							text: `An unexpected error occurred: ${error.message}`
						}
					]
				});
			}
		});
	}
);

// Add a tool to show command history
server.tool(
	"show-command-history",
	"Show the history of executed commands and their results",
	{},
	async () => {
		const history = session.getCommandHistory();
		
		if (history.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "No commands have been executed yet."
					}
				]
			};
		}
		
		let historyText = "Command History:\n\n";
		
		history.forEach((cmd, index) => {
			historyText += `${index + 1}. ${cmd.command}\n`;
			historyText += `   Executed at: ${cmd.executedAt}\n`;
			
			if (cmd.result) {
				historyText += `   Status: Completed (Exit code: ${cmd.result.exitCode})\n`;
				historyText += `   Completed at: ${cmd.result.completedAt}\n`;
			} else {
				historyText += `   Status: Running or interrupted\n`;
			}
			
			historyText += `\n`;
		});
		
		return {
			content: [
				{
					type: "text",
					text: historyText
				}
			]
		};
	}
);

// Add a tool to resume interrupted command
server.tool(
	"resume-session",
	"Resume a previously interrupted session",
	{},
	async () => {
		const checkpoint = session.getCheckpoint();
		
		if (!checkpoint || !checkpoint.connectionInfo) {
			return {
				content: [
					{
						type: "text",
						text: "No previous session to resume. Please connect first using new-ssh-connection."
					}
				]
			};
		}
		
		return {
			content: [
				{
					type: "text",
					text: `Session information recovered. Last connected to ${checkpoint.connectionInfo.host} as ${checkpoint.connectionInfo.username} at ${checkpoint.connectionInfo.connectedAt}.\n\nYou had executed ${checkpoint.commands.length} commands. Use the show-command-history tool to see details.\n\nPlease reconnect using new-ssh-connection to continue your work.`
				}
			]
		};
	}
);

// Add graceful shutdown handler
process.on('SIGINT', async () => {
	logInfo("Received SIGINT signal, shutting down gracefully...");
	
	if (isConnected) {
		try {
			// Save final checkpoint
			await saveCheckpoint(CHECKPOINT_PATH, session.getCheckpoint());
			logInfo("Session checkpoint saved");
			
			// Close SSH connection
			conn.end();
			logInfo("SSH connection closed");
		} catch (error) {
			logError("Error during shutdown", error);
		}
	}
	
	process.exit(0);
});

// Add auto-saving of checkpoint every 30 seconds
setInterval(async () => {
	if (isConnected) {
		try {
			await saveCheckpoint(CHECKPOINT_PATH, session.getCheckpoint());
			logInfo("Auto-saved session checkpoint");
		} catch (error) {
			logError("Failed to auto-save checkpoint", error);
		}
	}
}, 30000); // Auto-save every 30 seconds

async function main() {
	try {
		const transport = new StdioServerTransport();
		await server.connect(transport);
		logInfo("SSHClient MCP Server running on stdio");
		
		// Check if we have a previous session to restore
		if (fs.existsSync(CHECKPOINT_PATH)) {
			logInfo("Previous session checkpoint found. Use resume-session tool to view details.");
		}
	} catch (error) {
		logError("Error during startup", error);
		process.exit(1);
	}
}

main().catch((error) => {
	logError("Fatal error in main():", error);
	process.exit(1);
});