/** Only a nonce-named temporary copy may receive a test-only WebView2 policy. */
export function makePackagedProbePolicy(name, port) {
  if (typeof name !== 'string' || !/^BabelLeafProbe-[a-f0-9]{32}\.exe$/.test(name)
    || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid disposable packaged-probe policy');
  return {
    key: 'SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments',
    name,
    value: '--remote-debugging-port=' + port + ' --remote-debugging-address=127.0.0.1',
  };
}

/** Strict input budget for the build-only packaged-runtime acceptance probe. */
export function validatePackagedLibraryTiming(value, launchedAt) {
  if (!value || !Number.isFinite(launchedAt) || launchedAt <= 0
    || !Number.isFinite(value.timeOrigin) || value.timeOrigin < launchedAt
    || !Number.isFinite(value.startTime) || value.startTime < 0
    || value.startTime > 60000 || value.marks !== 1 || value.enabledImportButton !== true)
    throw new Error('Invalid packaged library readiness timing');
  const elapsed = value.timeOrigin + value.startTime - launchedAt;
  if (elapsed < 0 || elapsed > 60000) throw new Error('Unbounded library readiness timing');
  return { launchToInteractiveMs: elapsed, navigationToInteractiveMs: value.startTime,
    scope: 'committed library after a paint opportunity' };
}

/** Strict input budget for the build-only packaged-runtime acceptance probe. */
export function validatePackagedRuntimeManifest(value) {
  const fail = () => { throw new Error('Invalid or unbounded packaged runtime manifest'); };
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.components)
    || !value.components.length || value.components.length > 64
    || !Array.isArray(value.assets) || !value.assets.length || value.assets.length > 4096) fail();
  const ids = new Set();
  for (const component of value.components) {
    if (!component || typeof component.id !== 'string' || !component.id || ids.has(component.id)
      || !['name', 'version', 'license'].every((key) =>
        typeof component[key] === 'string' && component[key].trim() && component[key] !== 'NOASSERTION')) fail();
    ids.add(component.id);
  }
  const paths = new Set();
  let total = 0;
  for (const asset of value.assets) {
    if (!asset || typeof asset.path !== 'string' || !/^(?:vendor|fonts)\/[a-z0-9/_.-]+$/i.test(asset.path)
      || asset.path.split('/').some((part) => !part || part === '.' || part === '..')
      || paths.has(asset.path.toLowerCase()) || !ids.has(asset.component)
      || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || asset.bytes > 64 * 1024 * 1024) fail();
    paths.add(asset.path.toLowerCase());
    total += asset.bytes;
    if (total > 256 * 1024 * 1024) fail();
  }
  if (total !== value.totalBytes) fail();
  return value;
}

/** Ignore unsolicited/malformed protocol events; only owned numeric calls run. */
export function dispatchPackagedProbeResponse(callbacks, message) {
  if (!message || typeof message !== 'object' || !Number.isSafeInteger(message.id)
    || message.id <= 0 || !callbacks.has(message.id)) return false;
  const handler = callbacks.get(message.id);
  if (typeof handler !== 'function') return false;
  callbacks.delete(message.id);
  handler(message);
  return true;
}
