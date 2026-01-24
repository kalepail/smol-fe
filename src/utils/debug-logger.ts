/**
 * Comprehensive Debug Logging System
 *
 * Provides verbose, structured logging for all critical flows with:
 * - Verbosity levels (ERROR, WARN, INFO, DEBUG, TRACE)
 * - Categorized logging (AUTH, WALLET, TX, HORIZON, RPC, etc.)
 * - Timestamp tracking
 * - Performance measurement
 * - Error stack traces
 * - Automatic log persistence to localStorage
 * - Easy log export for debugging
 */

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export enum LogCategory {
    AUTH = 'AUTH',
    WALLET = 'WALLET',
    TRANSACTION = 'TX',
    HORIZON = 'HORIZON',
    RPC = 'RPC',
    PASSKEY = 'PASSKEY',
    BALANCE = 'BALANCE',
    VALIDATION = 'VALIDATION',
    GENERAL = 'GENERAL'
}

interface LogEntry {
    timestamp: number;
    level: LogLevel;
    category: LogCategory;
    message: string;
    data?: any;
    stack?: string;
    duration?: number;
}

class DebugLogger {
    private logs: LogEntry[] = [];
    private maxLogs = 1000; // Keep last 1000 logs
    private currentLevel: LogLevel = LogLevel.INFO;
    private persistKey = 'smol:debug:logs';
    private timers: Map<string, number> = new Map();

    constructor() {
        // Load verbosity from localStorage
        if (typeof localStorage !== 'undefined') {
            const savedLevel = localStorage.getItem('smol:debug:level');
            if (savedLevel !== null) {
                this.currentLevel = parseInt(savedLevel, 10);
            }

            // Load persisted logs
            this.loadLogs();
        }
    }

    /**
     * Set logging verbosity level
     * ERROR (0) - Only errors
     * WARN (1) - Errors and warnings
     * INFO (2) - Errors, warnings, and info (default)
     * DEBUG (3) - Everything above + debug messages
     * TRACE (4) - Everything including trace (super verbose)
     */
    setLevel(level: LogLevel): void {
        this.currentLevel = level;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('smol:debug:level', level.toString());
        }
        this.info(LogCategory.GENERAL, `Log level set to: ${LogLevel[level]}`);
    }

    getLevel(): LogLevel {
        return this.currentLevel;
    }

    /**
     * Start a performance timer
     */
    startTimer(label: string): void {
        this.timers.set(label, performance.now());
        this.trace(LogCategory.GENERAL, `Timer started: ${label}`);
    }

    /**
     * End a performance timer and log duration
     */
    endTimer(label: string, category: LogCategory = LogCategory.GENERAL): number | null {
        const start = this.timers.get(label);
        if (!start) {
            this.warn(LogCategory.GENERAL, `Timer not found: ${label}`);
            return null;
        }

        const duration = performance.now() - start;
        this.timers.delete(label);
        this.debug(category, `Timer ${label} completed`, { durationMs: duration.toFixed(2) });
        return duration;
    }

    private shouldLog(level: LogLevel): boolean {
        return level <= this.currentLevel;
    }

    private truncateData(data: any): any {
        if (!data) return data;

        // Deep clone to avoid mutating original data
        // Handle simple types first
        if (typeof data === 'string') {
            // If the string itself is massive (e.g. log message payload), truncate it
            if (data.length > 500) return data.substring(0, 500) + '... (truncated)';
            return data;
        }

        if (typeof data !== 'object') return data;

        // Recursively handle arrays
        if (Array.isArray(data)) {
            return data.map(item => this.truncateData(item));
        }

        const sanitized: any = {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];

                // Truncate lyrics specifically
                if (key.toLowerCase().includes('lyrics') && typeof value === 'string') {
                    sanitized[key] = value.length > 100
                        ? value.substring(0, 100) + `... (${value.length} chars truncated)`
                        : value;
                } else {
                    sanitized[key] = this.truncateData(value);
                }
            }
        }
        return sanitized;
    }

    private log(level: LogLevel, category: LogCategory, message: string, data?: any, error?: Error): void {
        if (!this.shouldLog(level)) return;

        // Truncate huge fields (like lyrics) in data object to prevent 3MB log files
        const sanitizedData = data ? this.truncateData(data) : undefined;

        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data: sanitizedData
        };

        if (error) {
            entry.stack = error.stack;
        }

        this.logs.push(entry);

        // Trim logs if too many
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Console output with colors
        const levelName = LogLevel[level];
        const emoji = this.getLevelEmoji(level);
        const color = this.getLevelColor(level);
        const timestamp = new Date(entry.timestamp).toISOString().substr(11, 12);

        const prefix = `${emoji} [${timestamp}] [${category}]`;

        if (sanitizedData !== undefined || error) {
            console.log(
                `%c${prefix} ${message}`,
                `color: ${color}; font-weight: bold;`,
                sanitizedData !== undefined ? sanitizedData : '',
                error || ''
            );
        } else {
            console.log(
                `%c${prefix} ${message}`,
                `color: ${color}; font-weight: bold;`
            );
        }

        // Persist to localStorage periodically
        if (this.logs.length % 10 === 0) {
            this.saveLogs();
        }
    }

    private getLevelEmoji(level: LogLevel): string {
        switch (level) {
            case LogLevel.ERROR: return '🔴';
            case LogLevel.WARN: return '🟡';
            case LogLevel.INFO: return '🔵';
            case LogLevel.DEBUG: return '🟣';
            case LogLevel.TRACE: return '⚪';
        }
    }

    private getLevelColor(level: LogLevel): string {
        switch (level) {
            case LogLevel.ERROR: return '#ff4444';
            case LogLevel.WARN: return '#ffaa00';
            case LogLevel.INFO: return '#4444ff';
            case LogLevel.DEBUG: return '#aa44ff';
            case LogLevel.TRACE: return '#888888';
        }
    }

    error(category: LogCategory, message: string, data?: any, error?: Error): void {
        this.log(LogLevel.ERROR, category, message, data, error);
    }

    warn(category: LogCategory, message: string, data?: any): void {
        this.log(LogLevel.WARN, category, message, data);
    }

    info(category: LogCategory, message: string, data?: any): void {
        this.log(LogLevel.INFO, category, message, data);
    }

    debug(category: LogCategory, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, category, message, data);
    }

    trace(category: LogCategory, message: string, data?: any): void {
        this.log(LogLevel.TRACE, category, message, data);
    }

    /**
     * Get all logs
     */
    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    /**
     * Get logs filtered by category
     */
    getLogsByCategory(category: LogCategory): LogEntry[] {
        return this.logs.filter(log => log.category === category);
    }

    /**
     * Get logs filtered by level
     */
    getLogsByLevel(level: LogLevel): LogEntry[] {
        return this.logs.filter(log => log.level === level);
    }

    /**
     * Export logs as JSON for debugging
     */
    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    /**
     * Export logs as formatted text
     */
    exportLogsText(): string {
        return this.logs.map(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            const level = LogLevel[log.level].padEnd(5);
            const category = log.category.padEnd(10);
            const data = log.data ? `\n  Data: ${JSON.stringify(log.data)}` : '';
            const stack = log.stack ? `\n  Stack: ${log.stack}` : '';
            return `[${timestamp}] [${level}] [${category}] ${log.message}${data}${stack}`;
        }).join('\n');
    }

    /**
     * Download logs as file
     */
    downloadLogs(filename: string = `smol-debug-${Date.now()}.json`): void {
        const blob = new Blob([this.exportLogs()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.info(LogCategory.GENERAL, `Logs downloaded: ${filename}`);
    }

    /**
     * Clear all logs
     */
    clearLogs(): void {
        this.logs = [];
        this.saveLogs();
        console.clear();
        this.info(LogCategory.GENERAL, 'Logs cleared');
    }

    /**
     * Save logs to localStorage
     */
    private saveLogs(): void {
        if (typeof localStorage === 'undefined') return;

        try {
            // Only save last 500 logs to localStorage (size limit)
            const logsToSave = this.logs.slice(-500);
            localStorage.setItem(this.persistKey, JSON.stringify(logsToSave));
        } catch (e) {
            console.error('Failed to save logs to localStorage:', e);
        }
    }

    /**
     * Load logs from localStorage
     */
    private loadLogs(): void {
        if (typeof localStorage === 'undefined') return;

        try {
            const saved = localStorage.getItem(this.persistKey);
            if (saved) {
                this.logs = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load logs from localStorage:', e);
        }
    }

    /**
     * Get summary statistics
     */
    getStats(): {
        total: number;
        byLevel: Record<string, number>;
        byCategory: Record<string, number>;
        oldestTimestamp: number | null;
        newestTimestamp: number | null;
    } {
        const stats = {
            total: this.logs.length,
            byLevel: {} as Record<string, number>,
            byCategory: {} as Record<string, number>,
            oldestTimestamp: this.logs[0]?.timestamp || null,
            newestTimestamp: this.logs[this.logs.length - 1]?.timestamp || null
        };

        this.logs.forEach(log => {
            const levelName = LogLevel[log.level];
            stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
        });

        return stats;
    }

    /**
     * Print summary to console
     */
    printSummary(): void {
        const stats = this.getStats();
        console.group('📊 Debug Log Summary');
        console.log('Total logs:', stats.total);
        console.log('By level:', stats.byLevel);
        console.log('By category:', stats.byCategory);
        if (stats.oldestTimestamp && stats.newestTimestamp) {
            console.log('Time range:', {
                oldest: new Date(stats.oldestTimestamp).toISOString(),
                newest: new Date(stats.newestTimestamp).toISOString(),
                spanMs: stats.newestTimestamp - stats.oldestTimestamp
            });
        }
        console.groupEnd();
    }
}

// Singleton instance
const logger = new DebugLogger();

// Expose to window for easy console access
if (typeof window !== 'undefined') {
    (window as any).smolLogger = logger;
    (window as any).smolLogLevel = LogLevel;
    (window as any).smolLogCategory = LogCategory;
}

export default logger;

/**
 * Helper function to create scoped loggers for specific categories
 */
export function createScopedLogger(category: LogCategory) {
    return {
        error: (message: string, data?: any, error?: Error) => logger.error(category, message, data, error),
        warn: (message: string, data?: any) => logger.warn(category, message, data),
        info: (message: string, data?: any) => logger.info(category, message, data),
        debug: (message: string, data?: any) => logger.debug(category, message, data),
        trace: (message: string, data?: any) => logger.trace(category, message, data),
        startTimer: (label: string) => logger.startTimer(label),
        endTimer: (label: string) => logger.endTimer(label, category)
    };
}
