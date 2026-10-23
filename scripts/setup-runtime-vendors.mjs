import { fileURLToPath } from 'node:url';
import { prepareRuntimeVendors } from './runtime-vendors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = await prepareRuntimeVendors(root);
console.log('[BabelLeaf] runtime copies prepared:', evidence.components.length,
  'components,', evidence.assets.length, 'assets,', evidence.totalBytes, 'bytes');
