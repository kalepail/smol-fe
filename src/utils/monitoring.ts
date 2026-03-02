export const CRITICAL_ERROR_EVENT = "smol:critical-error";

export interface CriticalErrorPayload {
    scope: string;
    code?: string;
    category?: string;
    severity?: string;
    message: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    timestamp: string;
}

function getMonitoringEndpoint(): string | null {
    const endpoint = import.meta.env?.PUBLIC_MONITORING_ENDPOINT;
    if (!endpoint || typeof endpoint !== "string") return null;
    const normalized = endpoint.trim();
    return normalized.length ? normalized : null;
}

function emitCriticalErrorEvent(payload: CriticalErrorPayload): void {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(
            new CustomEvent<CriticalErrorPayload>(CRITICAL_ERROR_EVENT, {
                detail: payload,
            }),
        );
    } catch (eventError) {
        console.warn("[Monitoring] Failed to dispatch critical error event", eventError);
    }
}

async function postCriticalError(payload: CriticalErrorPayload): Promise<void> {
    const endpoint = getMonitoringEndpoint();
    if (!endpoint || typeof fetch === "undefined") return;
    try {
        await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch (postError) {
        console.warn("[Monitoring] Failed to post critical error", postError);
    }
}

export function reportCriticalError(payload: CriticalErrorPayload): void {
    console.error("[Monitoring][Critical]", payload);
    emitCriticalErrorEvent(payload);
    void postCriticalError(payload);
}
