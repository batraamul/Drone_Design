/**
 * Modal dialogs built on the native <dialog> element (focus containment, Escape
 * handling and inert background are provided by the browser).
 */
import { h } from '../utils/dom.js';
import { icon } from './icons.js';

let dialogCounter = 0;

/**
 * Open a modal dialog.
 * @param {{title: string, body?: Node|Node[]|string, actions?: {label: string, value: string, variant?: string, autofocus?: boolean}[],
 *          size?: 'sm'|'md'|'lg', dismissible?: boolean, onSubmit?: (value: string, form: HTMLFormElement) => boolean|void|Promise<boolean|void>,
 *          description?: string}} options
 * @returns {Promise<string|null>} the value of the action used, or null if dismissed
 */
export function openDialog({ title, body, actions = [{ label: 'Close', value: 'close', variant: 'primary' }], size = 'md', dismissible = true, onSubmit, description }) {
  return new Promise((resolve) => {
    dialogCounter += 1;
    const titleId = `dialog-title-${dialogCounter}`;
    const descriptionId = description ? `dialog-desc-${dialogCounter}` : undefined;
    const errorBox = h('p', { class: 'dialog__error', role: 'alert', hidden: true });
    const form = h(
      'form',
      { method: 'dialog', class: 'dialog__form', novalidate: true },
      h(
        'header',
        { class: 'dialog__header' },
        h('h2', { id: titleId, class: 'dialog__title' }, title),
        dismissible
          ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close dialog', value: '', dataset: { dismiss: 'true' } }, icon('close'))
          : null,
      ),
      h(
        'div',
        { class: 'dialog__body' },
        description ? h('p', { id: descriptionId, class: 'dialog__description' }, description) : null,
        body ?? null,
        errorBox,
      ),
      h(
        'footer',
        { class: 'dialog__footer' },
        actions.map((action) =>
          h(
            'button',
            {
              type: action.value === 'cancel' ? 'button' : 'submit',
              value: action.value,
              class: ['btn', action.variant ? `btn--${action.variant}` : null],
              autofocus: action.autofocus ? true : undefined,
              dataset: action.value === 'cancel' ? { dismiss: 'true' } : undefined,
            },
            action.label,
          ),
        ),
      ),
    );
    const dialog = h('dialog', { class: ['dialog', `dialog--${size}`], 'aria-labelledby': titleId, 'aria-describedby': descriptionId }, form);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };

    form.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-dismiss]') : null;
      if (target) {
        event.preventDefault();
        finish(null);
      }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = event.submitter?.value ?? actions.find((a) => a.variant === 'primary')?.value ?? 'ok';
      errorBox.hidden = true;
      if (onSubmit) {
        try {
          const result = await onSubmit(value, form);
          if (result === false) return;
        } catch (error) {
          errorBox.textContent = error.message ?? String(error);
          errorBox.hidden = false;
          return;
        }
      }
      finish(value);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dismissible) finish(null);
    });
    dialog.addEventListener('close', () => finish(dialog.returnValue || null));
    document.body.append(dialog);
    dialog.showModal();
    const autofocus = dialog.querySelector('[autofocus]') ?? dialog.querySelector('input, select, textarea');
    autofocus?.focus();
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, details }) {
  const result = await openDialog({
    title,
    size: 'sm',
    body: [h('p', null, message), details ? h('p', { class: 'muted' }, details) : null],
    actions: [
      { label: cancelLabel, value: 'cancel' },
      { label: confirmLabel, value: 'confirm', variant: danger ? 'danger' : 'primary', autofocus: !danger },
    ],
  });
  return result === 'confirm';
}

/** Ask for a single line of text. Resolves with the trimmed text, or null if cancelled. */
export async function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'OK', maxLength = 200, validate, hint }) {
  const input = h('input', { class: 'input', type: 'text', value, placeholder, maxlength: maxLength, autocomplete: 'off', id: `prompt-${dialogCounter + 1}`, autofocus: true });
  let text = null;
  const result = await openDialog({
    title,
    size: 'sm',
    body: h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input, hint ? h('span', { class: 'field__hint' }, hint) : null),
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: confirmLabel, value: 'ok', variant: 'primary' },
    ],
    onSubmit: () => {
      const trimmed = input.value.trim();
      const message = validate ? validate(trimmed) : trimmed ? null : 'Enter a value';
      if (message) throw new Error(message);
      text = trimmed;
      return true;
    },
  });
  return result === 'ok' ? text : null;
}
