export const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.debug(...args);
};

export const devCount = (label: string) => {
  if (import.meta.env.DEV) console.count(label);
};

export const devWarn = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.warn(...args);
};

export const devError = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.error(...args);
};
