/**
 * Notifications: transient toasts plus a session notification centre (bell menu).
 */
import { Emitter } from '../utils/events.js';
import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { formatTime } from '../utils/format.js';

const LEVEL_ICON = { info: 'info', success: 'checkCircle', warning: 'warning', error: 'error' };

export class Notifications extends Emitter {
  #root;
  #items = [];
  #unread = 0;
  #sequence = 0;
  #toasts = new Map();

  constructor({ toastRoot }) {
    super();
    this.#root = toastRoot;
  }

  get items() {
    return this.#items.slice().reverse();
  }

  get unread() {
    return this.#unread;
  }

  /**
   * @param {{level?: 'info'|'success'|'warning'|'error', title: string, message?: string,
   *          actions?: {label: string, run: () => void}[], timeout?: number, persistent?: boolean, toast?: boolean}} n
   */
  notify({ level = 'info', title, message = '', actions = [], timeout, persistent = false, toast = true }) {
    const item = { id: ++this.#sequence, level, title: String(title ?? ''), message: String(message ?? ''), actions, time: new Date().toISOString(), read: false };
    this.#items.push(item);
    if (this.#items.length > 100) this.#items.shift();
    this.#unread += 1;
    this.emit('change', { unread: this.#unread });
    if (toast) this.#showToast(item, persistent ? 0 : timeout ?? (level === 'error' ? 10000 : actions.length ? 9000 : 5000));
    return item.id;
  }

  #showToast(item, timeout) {
    const close = () => this.dismissToast(item.id);
    const toast = h(
      'div',
      { class: ['toast', `toast--${item.level}`], role: item.level === 'error' ? 'alert' : 'status', dataset: { toastId: item.id } },
      h('span', { class: 'toast__icon' }, icon(LEVEL_ICON[item.level] ?? 'info', { size: 18 })),
      h(
        'div',
        { class: 'toast__body' },
        h('p', { class: 'toast__title' }, item.title),
        item.message ? h('p', { class: 'toast__message' }, item.message) : null,
        item.actions.length
          ? h(
              'div',
              { class: 'toast__actions' },
              item.actions.map((action) =>
                h('button', {
                  type: 'button',
                  class: 'btn btn--sm btn--ghost',
                  onClick: () => {
                    close();
                    action.run();
                  },
                }, action.label),
              ),
            )
          : null,
      ),
      h('button', { type: 'button', class: 'icon-btn icon-btn--sm toast__close', 'aria-label': 'Dismiss notification', onClick: close }, icon('close', { size: 16 })),
    );
    this.#root.append(toast);
    const timer = timeout > 0 ? setTimeout(close, timeout) : null;
    this.#toasts.set(item.id, { toast, timer });
    while (this.#toasts.size > 4) this.dismissToast(this.#toasts.keys().next().value);
  }

  dismissToast(id) {
    const entry = this.#toasts.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.toast.classList.add('toast--leaving');
    setTimeout(() => entry.toast.remove(), 160);
    this.#toasts.delete(id);
  }

  markAllRead() {
    for (const item of this.#items) item.read = true;
    this.#unread = 0;
    this.emit('change', { unread: 0 });
  }

  clear() {
    this.#items = [];
    this.#unread = 0;
    this.emit('change', { unread: 0 });
  }

  /** Content for the notification centre popover. */
  renderPanel({ onClose }) {
    const list = this.items;
    return h(
      'div',
      { class: 'popover__inner' },
      h(
        'div',
        { class: 'popover__header' },
        h('h2', { class: 'popover__title' }, 'Notifications'),
        list.length
          ? h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onClick: () => { this.clear(); onClose(); } }, 'Clear all')
          : null,
      ),
      list.length === 0
        ? h('p', { class: 'popover__empty' }, 'No notifications in this session.')
        : h(
            'ul',
            { class: 'notification-list' },
            list.map((item) =>
              h(
                'li',
                { class: ['notification', `notification--${item.level}`, item.read ? null : 'notification--unread'] },
                h('span', { class: 'notification__icon' }, icon(LEVEL_ICON[item.level] ?? 'info', { size: 16 })),
                h(
                  'div',
                  null,
                  h('p', { class: 'notification__title' }, item.title),
                  item.message ? h('p', { class: 'notification__message' }, item.message) : null,
                  h('time', { class: 'notification__time', datetime: item.time }, formatTime(item.time)),
                ),
              ),
            ),
          ),
    );
  }
}
