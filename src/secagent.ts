import { Ollama } from 'ollama';
import * as fs from 'fs';
import { logError, logInfo, logSensitive } from './logger.js';

// Constants for retry mechanism
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 5000;

// Fallback models in case the primary model is unavailable
const FALLBACK_MODELS = ['llama2', 'llama2-uncensored', 'mistral', 'gemma'];

export class secagent {
	private ollama: Ollama;
	private secagentconfig: any;
	private availableModels: string[] = [];
	
	constructor(configfilepath: string, ollamaHost: string) {
		try {
			this.secagentconfig = JSON.parse(fs.readFileSync(configfilepath, 'utf-8'));
			this.ollama = new Ollama({
				host: ollamaHost
			});
			
			// Initialize by checking available models
			this.initializeAsync();
		} catch (error) {
			logError("Failed to initialize security agent", error);
			// Set default security config if loading fails
			this.secagentconfig = {
				ENABLE_SECAGENT: false,
				SECURITY_POLICY: "Only 'ls' command is safe"
			};
		}
	}
	
	// Asynchronous initialization function
	private async initializeAsync(): Promise<void> {
		try {
			// Check which models are available
			const modelsResponse = await this.ollama.list();
			this.availableModels = modelsResponse.models.map(model => model.name);
			logInfo(`Available models: ${this.availableModels.join(", ")}`);
		} catch (error) {
			logError("Failed to list available models", error);
			// If we can't list models, assume none are available
			this.availableModels = [];
		}
	}
	
	// Get the first available model from our list of candidates
	private getAvailableModel(): string {
		for (const model of FALLBACK_MODELS) {
			if (this.availableModels.includes(model)) {
				return model;
			}
		}
		// Default to llama2 if no models found
		return 'llama2';
	}
	
	// Function to check if a command is safe
	async checkCommandSafety(command: string): Promise<boolean> {
		// If security agent is disabled, all commands are considered safe
		if (this.secagentconfig.ENABLE_SECAGENT !== true) {
			logInfo(`Security Agent is disabled, skipping safety check for "${command}"`);
			return true;
		}
		
		// Static check for obviously unsafe commands
		if (this.isObviouslyUnsafe(command)) {
			logInfo(`Command detected as obviously unsafe by static check: "${command}"`);
			return false;
		}
		
		// If static checks only mode is enabled, skip LLM checks
		if (this.secagentconfig.USE_STATIC_CHECKS_ONLY === true) {
			logInfo(`Using static checks only mode for command: "${command}"`);
			return this.isStaticallySafe(command);
		}
		
		// If not using local LLM, use only static checks
		if (this.secagentconfig.USE_LOCAL_LLM !== true) {
			logInfo(`Local LLM is disabled, using static checks only for command: "${command}"`);
			return this.isStaticallySafe(command);
		}
		
		// If no models are available, fall back to static checks only
		if (this.availableModels.length === 0) {
			logInfo(`No LLM models available, falling back to static checks for "${command}"`);
			return this.isStaticallySafe(command);
		}
		
		// Attempt to check command safety with retry mechanism
		let lastError = null;
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				logInfo(`Checking command safety: "${command}" (Attempt ${attempt}/${MAX_RETRIES})`);
				
				// Choose an available model
				const model = this.getAvailableModel();
				logInfo(`Using model: ${model} for safety check`);
				
				// Create a timeout promise
				const timeoutPromise = new Promise<{response: string}>((_resolve, reject) => {
					setTimeout(() => reject(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
				});
				
				// Create the actual request promise
				const requestPromise = this.ollama.generate({
					model: model,
					prompt: `Using the following security policy "${this.secagentconfig.SECURITY_POLICY}". 
					The command is "${command}". Only respond with "SAFE" or "UNSAFE" and do not repeat the security policy.`,
					stream: false
				});
				
				// Race between timeout and actual request
				const response = await Promise.race([requestPromise, timeoutPromise]) as {response: string};
				
				const isSafe = !response.response.trim().toUpperCase().includes('UNSAFE');
				
				logInfo(`Safety check result for "${command}": ${isSafe ? 'SAFE' : 'UNSAFE'}`);
				logInfo(`Response from model: ${response.response.trim()}`);
				
				return isSafe;
			} catch (error) {
				lastError = error;
				logError(`Attempt ${attempt}/${MAX_RETRIES} failed to check command safety for "${command}"`, error);
				
				// Wait before retrying (except on last attempt)
				if (attempt < MAX_RETRIES) {
					await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
				}
			}
		}
		
		// All retries failed, fall back to static checks
		logInfo(`All ${MAX_RETRIES} attempts failed, falling back to static checks for "${command}"`);
		return this.isStaticallySafe(command);
	}
	
	// Simple static check for obviously unsafe commands
	private isObviouslyUnsafe(command: string): boolean {
		const unsafe_patterns = [
			/rm\s+(-[\w]+\s+)*\//, // Removing root or system directories
			/chmod\s+777\b/, // Overly permissive chmod
			/mkfs/, // Formatting drives
			/dd\s+if=.+of=\/dev/, // Writing directly to devices
			/:(){:|:&};:/, // Fork bomb
			/wget.+\|\s*sh/, // Download and pipe to shell
			/curl.+\|\s*sh/, // Download and pipe to shell
			/sudo\s+rm\s+-rf\s+\/\*/ // Dangerous sudo rm command
		];
		
		return unsafe_patterns.some(pattern => pattern.test(command));
	}
	
	// Simple static safety check for common safe commands
	private isStaticallySafe(command: string): boolean {
		const safe_commands = [
			/^ls(\s+-[a-zA-Z]+)*$/, // ls with options
			/^pwd$/, // print working directory
			/^echo\s+[^|>;]*$/, // simple echo without redirection or pipes
			/^cd\s+[\w\/._-]+$/, // cd to normal directory
			/^cat\s+[\w\/._-]+$/, // cat normal files
			/^mkdir\s+-?p?\s+[\w\/._-]+$/, // mkdir
			/^cp\s+-?r?\s+[\w\/._-]+\s+[\w\/._-]+$/, // simple copy
			/^df\s+-[a-zA-Z]+$/, // df with options
			/^du\s+-[a-zA-Z]+$/, // du with options
			/^ps\s+[auxef]+$/, // process status
			/^grep\s+-?[a-zA-Z]*\s+"[^"]+"\s+[\w\/._-]+$/, // grep in quotes
			/^ping\s+-c\s+\d+\s+[\w\.-]+$/, // ping with count
			/^uname\s+-[a-zA-Z]+$/, // uname with options
			/^whoami$/, // who am i
			/^date$/, // date
			/^apt\s+(update|list|search\s+[\w-]+)$/ // safe apt commands
		];
		
		return safe_commands.some(pattern => pattern.test(command));
	}
}