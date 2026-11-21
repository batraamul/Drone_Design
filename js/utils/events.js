/**
 * Minimal synchronous event emitter used by the store, project manager and UI services.
 * Listener errors are isolated so one faulty subscriber cannot break the others.
 */
export class Emitter {
  #listeners = new Map();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    this.#listeners.get(event)?.delete(listener);
  }

  emit(event, payload) {
    const listeners = this.#listeners.get(event);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch (error) {
        // Surface listener failures without interrupting other listeners.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
}
