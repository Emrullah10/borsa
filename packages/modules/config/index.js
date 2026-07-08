// 12factor-style config loader.
// Each field: { default?, env?, type?, values? }
// env var overrides default when present.

function loadConfig(schema) {
  const result = {};
  for (const [key, def] of Object.entries(schema)) {
    let value = def.default;
    if (def.env && process.env[def.env] !== undefined) {
      value = process.env[def.env];
    }
    if (value === undefined) {
      throw new Error(`Config missing: ${key} (env: ${def.env ?? 'none'})`);
    }
    if (def.type === 'number') value = Number(value);
    if (def.type === 'boolean') value = value === 'true' || value === true;
    if (def.type === 'enum' && !def.values.includes(value)) {
      throw new Error(`Config invalid value: ${key}=${value}, expected: ${def.values}`);
    }
    result[key] = value;
  }
  return result;
}

export default loadConfig;
