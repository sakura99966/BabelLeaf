const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateSettingsSnapshot(value: unknown): unknown {
  if (!object(value)) throw new Error('Invalid settings object');
  for (const key of ['globalViewSettings', 'globalReadSettings', 'aiSettings']) {
    if (value[key] !== undefined && !object(value[key]))
      throw new Error('Invalid settings section: ' + key);
  }
  if (
    value['version'] !== undefined &&
    (!Number.isSafeInteger(value['version']) || Number(value['version']) < 0)
  ) {
    throw new Error('Invalid settings version');
  }
  if (
    value['lastOpenBooks'] !== undefined &&
    (!Array.isArray(value['lastOpenBooks']) ||
      value['lastOpenBooks'].some((key) => typeof key !== 'string'))
  )
    throw new Error('Invalid last open books');
  return value;
}

export function validateLibrarySnapshot(value: unknown): unknown {
  if (!Array.isArray(value)) throw new Error('Invalid library array');
  for (const book of value) {
    if (
      !object(book) ||
      typeof book['hash'] !== 'string' ||
      !book['hash'] ||
      typeof book['format'] !== 'string'
    ) {
      throw new Error('Invalid library book');
    }
  }
  return value;
}
