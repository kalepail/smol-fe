<script lang="ts">
    import logger, { LogLevel, LogCategory } from "../../utils/debug-logger";
    import { userState } from "../../stores/user.svelte.ts";
    import { upgradesState } from "../../stores/upgrades.svelte.ts";
    import {
        balanceState,
        updateAllBalances,
    } from "../../stores/balance.svelte.ts";
    import { getRpcHealthStatus } from "../../utils/rpc";

    let isOpen = $state(false);
    let currentLevel = $state(logger.getLevel());
    let stats = $state({ total: 0, errors: 0, warnings: 0 });
    let recentLogs = $state<any[]>([]);
    let selectedCategory = $state<string>("ALL");
    let rpcHealth = $state<any[]>([]);

    function updateStats() {
        const currentStats = logger.getStats();
        stats = {
            total: currentStats.total,
            errors: currentStats.byLevel.ERROR || 0,
            warnings: currentStats.byLevel.WARN || 0,
        };
        recentLogs = logger.getLogs().slice(-10).reverse();
        rpcHealth = getRpcHealthStatus();
    }

    // Update stats periodically
    $effect(() => {
        updateStats(); // Initial call
        const interval = setInterval(updateStats, 1000);

        return () => clearInterval(interval);
    });

    function setLevel(level: LogLevel) {
        logger.setLevel(level);
        currentLevel = level;
    }

    function downloadLogs() {
        logger.downloadLogs();
    }

    function clearAllLogs() {
        if (
            confirm(
                "Are you sure you want to clear all logs from localStorage?",
            )
        ) {
            logger.clearLogs();
            updateStats();
            alert("Logs cleared.");
        }
    }

    // Helper to safely stringify objects, handling BigInt and circular references
    function safeStringify(obj: any, indent = 0) {
        const cache = new Set();
        return JSON.stringify(
            obj,
            (key, value) => {
                if (typeof value === "object" && value !== null) {
                    if (cache.has(value)) {
                        // Circular reference found, discard key
                        return;
                    }
                    // Store value in our collection
                    cache.add(value);
                }
                if (typeof value === "bigint") {
                    return value.toString() + "n"; // Append 'n' to indicate BigInt
                }
                return value;
            },
            indent,
        );
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
        navigator.clipboard.writeText(safeStringify(state, 2));
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

            // Logs (BigInt safe)
            logs: allLogs.map((l) => ({
                ...l,
                data: l.data ? JSON.parse(safeStringify(l.data)) : undefined,
            })),
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

        const json = safeStringify(rawState, 2);
        navigator.clipboard.writeText(json);
        alert(
            "Full debug report (including state and logs) copied to clipboard!",
        );
    }

    function copyLastXdr() {
        const logs = logger.getLogs();
        // Priority: Successful assembly > Pre-sim build
        const xdrLog =
            [...logs]
                .reverse()
                .find(
                    (l) =>
                        l.category === LogCategory.TRANSACTION &&
                        l.data?.xdr &&
                        l.message.includes("Assembled"),
                ) ||
            [...logs]
                .reverse()
                .find(
                    (l) =>
                        l.category === LogCategory.TRANSACTION &&
                        l.data?.xdr &&
                        l.message.includes("Pre-Sim"),
                );

        if (xdrLog?.data?.xdr) {
            navigator.clipboard.writeText(xdrLog.data.xdr);
            alert(`Copied XDR from: ${xdrLog.message}`);
        } else {
            alert("No transaction XDR found in recent logs.");
        }
    }

    function downloadLastXdr() {
        const logs = logger.getLogs();
        const lastTxLog = [...logs]
            .reverse()
            .find((l) => l.category === LogCategory.TRANSACTION && l.data?.xdr);

        if (lastTxLog && lastTxLog.data.xdr) {
            const blob = new Blob([lastTxLog.data.xdr], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `tx-${Date.now()}.xdr`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            alert("No transaction XDR found in logs.");
        }
    }

    function copyLastLoginProof() {
        const logs = logger.getLogs();
        const lastLoginLog = [...logs]
            .reverse()
            .find(
                (l) =>
                    l.category === LogCategory.AUTH &&
                    l.message === "Login Payload",
            );

        if (lastLoginLog && lastLoginLog.data) {
            navigator.clipboard.writeText(
                JSON.stringify(lastLoginLog.data, null, 2),
            );
            alert("Last login proof copied to clipboard!");
        } else {
            alert("No login proof found in logs.");
        }
    }

    function saveRelayerDump() {
        const logs = logger.getLogs();
        const relayerLog = [...logs]
            .reverse()
            .find((l) => l.category === "RELAYER");

        if (relayerLog?.data) {
            const json = safeStringify(relayerLog.data, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `relayer-debug-dump-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            alert("No relayer interaction logs found.");
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
                        <div class="stat">
                            <span class="label">Total Logs:</span>
                            <span class="value">{stats.total}</span>
                        </div>
                        <div class="stat">
                            <span class="label">Errors:</span>
                            <span class="value text-red-500"
                                >{stats.errors}</span
                            >
                        </div>
                        <div class="stat">
                            <span class="label">Warnings:</span>
                            <span class="value text-yellow-500"
                                >{stats.warnings}</span
                            >
                        </div>
                    </div>

                    <!-- RPC Health Table -->
                    <div class="section-title mt-4">RPC HEALTH</div>
                    <div
                        class="overflow-x-auto bg-black/40 rounded-lg border border-white/10 mb-4"
                    >
                        <table class="w-full text-[9px] text-left">
                            <thead>
                                <tr
                                    class="border-b border-white/10 uppercase text-white/40"
                                >
                                    <th class="p-2">Node</th>
                                    <th class="p-2">Status</th>
                                    <th class="p-2">Latency</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each rpcHealth as rpc}
                                    <tr
                                        class="border-b border-white/5 last:border-0"
                                    >
                                        <td
                                            class="p-2 font-mono truncate max-w-[120px]"
                                            >{rpc.url.replace(
                                                "https://",
                                                "",
                                            )}</td
                                        >
                                        <td class="p-2">
                                            <span
                                                class={rpc.healthy
                                                    ? "text-lime-400"
                                                    : "text-red-500"}
                                            >
                                                {rpc.healthy
                                                    ? "● ONLINE"
                                                    : "○ OFFLINE"}
                                            </span>
                                        </td>
                                        <td class="p-2 font-mono"
                                            >{rpc.averageLatency.toFixed(
                                                0,
                                            )}ms</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
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
                        <button
                            onclick={copyLastXdr}
                            class="secondary-action"
                            title="Find and copy the most recent transaction XDR"
                        >
                            🔑 Copy Last XDR
                        </button>
                        <button
                            onclick={downloadLastXdr}
                            class="secondary-action"
                            title="Download the most recent XDR as a file"
                        >
                            💾 Save Last XDR
                        </button>
                        <button
                            onclick={copyLastLoginProof}
                            class="secondary-action"
                            title="Copy the most recent login signature payload"
                        >
                            🔐 Copy Last Login Proof
                        </button>
                        <button
                            onclick={saveRelayerDump}
                            class="secondary-action"
                            title="Save the complete request/response of the last relayer attempt"
                        >
                            🐞 Save Relayer Dump
                        </button>
                        <button onclick={downloadLogs}>📥 Download Logs</button>
                        <button onclick={copyState}>📄 Copy State Only</button>
                        <button onclick={clearAllLogs} style="color: #ff4444;"
                            >🗑️ Clear All Logs</button
                        >
                        <button
                            onclick={copyAllLogs}
                            class="primary-action"
                            style="margin-top: 8px;"
                        >
                            📋 COPY FULL DEBUG REPORT
                        </button>
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

    .rpc-table {
        background: #0a0a0a;
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 4px;
    }

    .rpc-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10px;
        padding: 4px 0;
        border-bottom: 1px solid #1a1a1a;
    }

    .rpc-row:last-child {
        border-bottom: none;
    }

    .rpc-row.unhealthy {
        opacity: 0.5;
        color: #ff4444;
    }

    .rpc-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ff4444;
    }

    .rpc-dot.healthy {
        background: #00ff00;
        box-shadow: 0 0 4px #00ff00;
    }

    .rpc-url {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .rpc-latency {
        color: #888;
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

    .action-buttons button.secondary-action {
        background: #003300;
        color: #00ff00;
        border-color: #006600;
    }

    .action-buttons button.primary-action:hover {
        background: #00cc00;
        box-shadow: 0 4px 12px rgba(0, 255, 0, 0.5);
    }

    .action-buttons button.secondary-action:hover {
        background: #004400;
        border-color: #00cc00;
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
