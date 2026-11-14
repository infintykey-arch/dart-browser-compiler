export const node = (type, fields = {}) => ({ type, ...fields });

export function toTree(value) {
  if (Array.isArray(value)) return value.map(toTree);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'token') continue;
    out[key] = toTree(item);
  }
  return out;
}
