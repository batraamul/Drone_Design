/** File download and upload helpers (all local; nothing leaves the browser). */

export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(filename, data) {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
}

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Ask the user for a file. Resolves with the File or null if cancelled. */
export function pickFile({ accept = '.json,application/json' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    input.dataset.role = 'file-picker';
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}

export async function readFileText(file) {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`File is too large (${Math.round(file.size / 1e6)} MB). The limit is ${MAX_IMPORT_BYTES / 1e6} MB.`);
  }
  return file.text();
}

export function timestampForFile(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
