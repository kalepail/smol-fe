/**
 * Toast notification store using Svelte 5 runes
 * Manages toast notifications throughout the app
 */

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // ms, 0 = persistent
}

class ToastState {
  toasts = $state<Toast[]>([]);

  /**
   * Add a new toast notification
   */
  add(message: string, type: ToastType = 'info', duration = 5000) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const toast: Toast = { id, message, type, duration };

    this.toasts = [...this.toasts, toast];

    // Auto-dismiss if duration is set
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  /**
   * Dismiss a specific toast
   */
  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  /**
   * Clear all toasts
   */
  clear() {
    this.toasts = [];
  }

  // Convenience methods
  info(message: string, duration?: number) {
    return this.add(message, 'info', duration);
  }

  success(message: string, duration?: number) {
    return this.add(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    return this.add(message, 'error', duration);
  }

  warning(message: string, duration?: number) {
    return this.add(message, 'warning', duration);
  }
}

export const toastState = new ToastState();
