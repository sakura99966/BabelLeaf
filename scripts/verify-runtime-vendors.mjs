import { fileURLToPath } from 'node:url';
import { verifyRuntimeVendorEvidence } from './runtime-vendors.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const index = process.argv.indexOf('--output-root');
if (index >= 0 && !process.argv[index + 1]) throw new Error('Missing --output-root value');
const evidence = await verifyRuntimeVendorEvidence(root, index >= 0
  ? { publicRoot: process.argv[index + 1], allowNextBundles: process.argv.includes('--bundled-output') } : {});
console.log('[BabelLeaf] verified runtime copies:', evidence.components.length,
  'components,', evidence.assets.length, 'assets,', evidence.totalBytes, 'bytes');
