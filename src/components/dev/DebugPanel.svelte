<script lang="ts">
    import logger, { LogLevel, LogCategory } from "../../utils/debug-logger";
    import { userState } from "../../stores/user.svelte";
    import { upgradesState } from "../../stores/upgrades.svelte";
    import { balanceState } from "../../stores/balance.svelte";

    let isOpen = $state(false);
    let currentLevel = $state(logger.getLevel());
    let stats = $state(logger.getStats());
    let recentLogs = $state<any[]>([]);
    let selectedCategory = $state<string>("ALL");

    // Update stats periodically
    $effect(() => {
        const interval = setInterval(() => {
            stats = logger.getStats();
            recentLogs = logger.getLogs().slice(-10).reverse();
        }, 1000);

        return () => clearInterval(interval);
    });

    function setLevel(level: LogLevel) {
        logger.setLevel(level);
        currentLevel = level;
    }

    function downloadLogs() {
        logger.downloadLogs();
    }

    function clearLogs() {
        if (confirm("Clear all logs?")) {
            logger.clearLogs();
            stats = logger.getStats();
            recentLogs = [];
        }
    }

    function copyState() {
        const state = {
            user: {
                contractId: userState.contractId,
                keyId: userState.keyId,
                walletConnected: userState.walletConnected,
            },
            upgrades: upgradesState,
            balance: {
                kale: balanceState.balance,
                xlm: balanceState.xlmBalance,
            },
            localStorage: {
                contractId: localStorage.getItem("smol:contractId"),
                keyId: localStorage.getItem("smol:keyId"),
            },
        };
        navigator.clipboard.writeText(JSON.stringify(state, null, 2));
        alert("State copied to clipboard!");
    }

    function copyAllLogs() {
        // Limit to last 200 logs and exclude TRACE (level 4)
        const allLogs = logger
            .getLogs()
            .filter((l) => l.level !== 4) // Exclude TRACE
            .slice(-200);

        const rawState = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,

            // Application State
            state: {
                user: {
                    contractId: userState.contractId,
                    keyId: userState.keyId,
                    walletConnected: userState.walletConnected,
                },
                upgrades: upgradesState,
                balance: {
                    kale: balanceState.balance,
                    xlm: balanceState.xlmBalance,
                },
            },

            // LocalStorage (sanitized)
            localStorage: Object.keys(localStorage).reduce(
                (acc, key) => {
                    if (
                        !key.includes("token") &&
                        !key.includes("private") &&
                        key !== "smol:debug:logs"
                    ) {
                        acc[key] = localStorage.getItem(key);
                    }
                    return acc;
                },
                {} as Record<string, string | null>,
            ),

            // Debug Logs
            logs: allLogs,
            logStats: logger.getStats(),

            // Performance
            performance: {
                memory: (performance as any).memory
                    ? {
                          usedJSHeapSize: (performance as any).memory
                              .usedJSHeapSize,
                          totalJSHeapSize: (performance as any).memory
                              .totalJSHeapSize,
                          jsHeapSizeLimit: (performance as any).memory
                              .jsHeapSizeLimit,
                      }
                    : "not available",
                navigation: performance.getEntriesByType("navigation")[0],
            },
        };

        try {
            // Use JSON.stringify replacer for safe, on-the-fly sanitization
            const replacer = (key: string, value: any) => {
                // Redact massive/sensitive keys
                if (key === "lyrics" || key === "audioData")
                    return "[Redacted Large Data]";

                // Truncate long strings
                if (typeof value === "string" && value.length > 500) {
                    return (
                        value.substring(0, 500) + `... (${value.length} chars)`
                    );
                }

                // Limit arrays
                if (Array.isArray(value) && value.length > 50) {
                    return value.slice(0, 50).concat(["... (truncated array)"]);
                }

                return value;
            };

            const reportStr = JSON.stringify(rawState, replacer, 2);

            navigator.clipboard
                .writeText(reportStr)
                .then(() =>
                    alert(
                        `✅ Debug report copied! Size: ${(reportStr.length / 1024).toFixed(1)}KB`,
                    ),
                )
                .catch(() =>
                    alert("❌ Failed to copy logs: Clipboard API error"),
                );
        } catch (e) {
            console.error("Failed to stringify debug report", e);
            alert(
                `❌ Failed to create report: ${e instanceof Error ? e.message : "Unknown error"}`,
            );
        }
    }

    function togglePanel() {
        isOpen = !isOpen;
    }
</script>

<!-- Only show in development or when ?debug=true -->
{#if import.meta.env.DEV || new URLSearchParams(window.location.search).has("debug")}
    <div class="debug-panel" class:open={isOpen}>
        <!-- Toggle Button -->
        <button class="debug-toggle" onclick={togglePanel} title="Debug Panel">
            🐛
        </button>

        <!-- Panel Content -->
        {#if isOpen}
            <div class="debug-content">
                <div class="debug-header">
                    <h3>🔍 Debug Panel</h3>
                    <button onclick={togglePanel}>✕</button>
                </div>

                <div class="debug-section">
                    <h4>Log Level</h4>
                    <div class="log-level-buttons">
                        <button
                            class:active={currentLevel === LogLevel.ERROR}
                            onclick={() => setLevel(LogLevel.ERROR)}
                        >
                            ERROR
                        </button>
                        <button
                            class:active={currentLevel === LogLevel.WARN}
                            onclick={() => setLevel(LogLevel.WARN)}
                        >
                            WARN
                        </button>
                        <button
                            class:active={currentLevel === LogLevel.INFO}
                            onclick={() => setLevel(LogLevel.INFO)}
                        >
                            INFO
                        </button>
                        <button
                            class:active={currentLevel === LogLevel.DEBUG}
                            onclick={() => setLevel(LogLevel.DEBUG)}
                        >
                            DEBUG
                        </button>
                        <button
                            class:active={currentLevel === LogLevel.TRACE}
                            onclick={() => setLevel(LogLevel.TRACE)}
                        >
                            TRACE
                        </button>
                    </div>
                </div>

                <div class="debug-section">
                    <h4>Stats</h4>
                    <div class="stats-grid">
                        <div>Total Logs: <strong>{stats.total}</strong></div>
                        <div>
                            Errors: <strong class="error"
                                >{stats.byLevel.ERROR || 0}</strong
                            >
                        </div>
                        <div>
                            Warnings: <strong class="warn"
                                >{stats.byLevel.WARN || 0}</strong
                            >
                        </div>
                    </div>
                </div>

                <div class="debug-section">
                    <h4>Recent Logs (Last 10)</h4>
                    <div class="recent-logs">
                        {#each recentLogs as log}
                            <div
                                class="log-entry"
                                class:error={log.level === 0}
                                class:warn={log.level === 1}
                            >
                                <span class="log-time"
                                    >{new Date(
                                        log.timestamp,
                                    ).toLocaleTimeString()}</span
                                >
                                <span class="log-category"
                                    >[{log.category}]</span
                                >
                                <span class="log-message">{log.message}</span>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="debug-section">
                    <h4>Actions</h4>
                    <div class="action-buttons">
                        <button
                            onclick={copyAllLogs}
                            class="primary-action"
                            title="Copy complete debug report including logs, state, network, performance"
                        >
                            📋 Copy FULL Report
                        </button>
                        <button onclick={downloadLogs}>📥 Download Logs</button>
                        <button onclick={copyState}>📄 Copy State Only</button>
                        <button onclick={clearLogs}>🗑️ Clear Logs</button>
                        <button onclick={() => logger.printSummary()}
                            >📊 Print Summary</button
                        >
                    </div>
                </div>

                <div class="debug-section">
                    <h4>State</h4>
                    <div class="state-display">
                        <div>
                            <strong>Contract ID:</strong>
                            {userState.contractId
                                ? `${userState.contractId.substring(0, 8)}...`
                                : "None"}
                        </div>
                        <div>
                            <strong>Wallet Connected:</strong>
                            {userState.walletConnected ? "✅" : "❌"}
                        </div>
                        <div>
                            <strong>KALE Balance:</strong>
                            {balanceState.balance !== null
                                ? `${balanceState.balance.toLocaleString()} KALE`
                                : "Loading..."}
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .debug-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: "Courier New", monospace;
        font-size: 12px;
    }

    .debug-toggle {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #1a1a1a;
        border: 2px solid #00ff00;
        color: #00ff00;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 255, 0, 0.3);
        transition: all 0.2s;
    }

    .debug-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 255, 0, 0.5);
    }

    .debug-content {
        position: absolute;
        bottom: 60px;
        right: 0;
        width: 400px;
        max-height: 600px;
        overflow-y: auto;
        background: #1a1a1a;
        border: 2px solid #00ff00;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
        color: #00ff00;
    }

    .debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        border-bottom: 1px solid #00ff00;
        background: #0a0a0a;
    }

    .debug-header h3 {
        margin: 0;
        font-size: 16px;
    }

    .debug-header button {
        background: none;
        border: none;
        color: #00ff00;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
    }

    .debug-section {
        padding: 12px;
        border-bottom: 1px solid #333;
    }

    .debug-section:last-child {
        border-bottom: none;
    }

    .debug-section h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #00ff00;
    }

    .log-level-buttons {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
    }

    .log-level-buttons button {
        flex: 1;
        min-width: 60px;
        padding: 6px 8px;
        background: #2a2a2a;
        border: 1px solid #444;
        color: #00ff00;
        cursor: pointer;
        border-radius: 4px;
        font-size: 11px;
        transition: all 0.2s;
    }

    .log-level-buttons button:hover {
        background: #333;
        border-color: #00ff00;
    }

    .log-level-buttons button.active {
        background: #00ff00;
        color: #000;
        border-color: #00ff00;
        font-weight: bold;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        font-size: 11px;
    }

    .stats-grid strong {
        color: #fff;
    }

    .stats-grid strong.error {
        color: #ff4444;
    }

    .stats-grid strong.warn {
        color: #ffaa00;
    }

    .recent-logs {
        max-height: 200px;
        overflow-y: auto;
        font-size: 10px;
        background: #0a0a0a;
        padding: 8px;
        border-radius: 4px;
    }

    .log-entry {
        margin-bottom: 4px;
        padding: 4px;
        border-left: 2px solid #00ff00;
        padding-left: 8px;
    }

    .log-entry.error {
        border-left-color: #ff4444;
        background: rgba(255, 68, 68, 0.1);
    }

    .log-entry.warn {
        border-left-color: #ffaa00;
        background: rgba(255, 170, 0, 0.1);
    }

    .log-time {
        color: #666;
        margin-right: 8px;
    }

    .log-category {
        color: #00ff00;
        margin-right: 8px;
        font-weight: bold;
    }

    .log-message {
        color: #aaa;
    }

    .action-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .action-buttons button {
        padding: 8px;
        background: #2a2a2a;
        border: 1px solid #444;
        color: #00ff00;
        cursor: pointer;
        border-radius: 4px;
        font-size: 11px;
        transition: all 0.2s;
    }

    .action-buttons button:hover {
        background: #333;
        border-color: #00ff00;
    }

    .action-buttons button.primary-action {
        grid-column: 1 / -1;
        background: #00ff00;
        color: #000;
        font-weight: bold;
        border-color: #00ff00;
        box-shadow: 0 2px 8px rgba(0, 255, 0, 0.3);
    }

    .action-buttons button.primary-action:hover {
        background: #00cc00;
        box-shadow: 0 4px 12px rgba(0, 255, 0, 0.5);
    }

    .state-display {
        font-size: 11px;
        line-height: 1.6;
    }

    .state-display strong {
        color: #00ff00;
    }

    /* Scrollbar styling */
    .debug-content::-webkit-scrollbar,
    .recent-logs::-webkit-scrollbar {
        width: 8px;
    }

    .debug-content::-webkit-scrollbar-track,
    .recent-logs::-webkit-scrollbar-track {
        background: #0a0a0a;
    }

    .debug-content::-webkit-scrollbar-thumb,
    .recent-logs::-webkit-scrollbar-thumb {
        background: #00ff00;
        border-radius: 4px;
    }
</style>
