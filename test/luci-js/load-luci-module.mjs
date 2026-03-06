import fs from 'node:fs';
import path from 'node:path';

function defaultTranslate(message) {
  return message;
}

function installFormatShim() {
  if (String.prototype.format) {
    return;
  }

  Object.defineProperty(String.prototype, 'format', {
    value(...args) {
      let index = 0;
      return this.replace(/%s/g, () => String(args[index++]));
    },
    configurable: true,
    writable: true,
  });
}

export function loadLuciModule(relativePath, context = {}) {
  installFormatShim();

  const filePath = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const runtime = {
    _: defaultTranslate,
    E: (...args) => ({ tag: args[0], attrs: args[1], children: args[2] }),
    L: {
      bind: (fn, self, ...preset) => fn.bind(self, ...preset),
      resolveDefault: (value, fallback) => Promise.resolve(value).catch(() => fallback),
      ui: {
        hideModal: () => 'hideModal',
      },
    },
    URL,
    ...context,
  };

  const keys = Object.keys(runtime);
  const values = Object.values(runtime);
  const factory = new Function(...keys, source);
  return factory(...values);
}
