const app = 'apps/readest-app/';
const pdf = 'packages/foliate-js/node_modules/pdfjs-dist/';

// Explicit copy policy. Unknown output files/directories fail verification.
// These are package-declared licenses plus preserved upstream notices, not a
// replacement for the owner's deferred legal/model/corpus approval.
export const RUNTIME_VENDORS = [
  {
    id: 'pdfjs', directory: 'vendor/pdfjs', manifest: pdf + 'package.json',
    sources: [
      { directory: pdf + 'legacy/build', files: ['pdf.min.mjs', 'pdf.worker.min.mjs', 'pdf.d.mts'] },
      { directory: pdf + 'wasm', all: true },
      { directory: pdf + 'cmaps', all: true, rename: { LICENSE: 'LICENSE_CMAPS' } },
      { directory: pdf + 'standard_fonts', all: true },
      { file: pdf + 'LICENSE', to: 'LICENSE_PDFJS' },
    ],
  },
  {
    id: 'pdfjs-styles', name: 'foliate-pdfjs-styles', directory: 'vendor/pdfjs',
    manifest: 'packages/foliate-js/package.json', gitDirectory: 'packages/foliate-js',
    versionFromGit: true, license: 'Apache-2.0',
    sources: ['annotation_layer_builder.css', 'text_layer_builder.css'].map((name) => ({
      file: 'packages/foliate-js/vendor/pdfjs/' + name, to: name, transform: 'postcss-nested',
    })),
  },
  {
    id: 'simplecc', directory: 'vendor/simplecc',
    manifest: 'packages/simplecc-wasm/package.json', gitDirectory: 'packages/simplecc-wasm',
    sources: [
      { directory: 'packages/simplecc-wasm/dist/web', all: true },
      { file: 'packages/simplecc-wasm/LICENSE', to: 'LICENSE' },
      { file: 'packages/simplecc-wasm/OpenCC/LICENSE', to: 'LICENSE_OPENCC' },
    ],
  },
  {
    id: 'jieba', directory: 'vendor/jieba', manifest: app + 'node_modules/jieba-wasm/package.json',
    sources: [
      { directory: app + 'node_modules/jieba-wasm/pkg/web', all: true },
      { file: app + 'node_modules/jieba-wasm/LICENSE', to: 'LICENSE' },
    ],
  },
  {
    id: 'tesseract', directory: 'vendor/tesseract',
    manifest: app + 'node_modules/tesseract-wasm/package.json',
    sources: [
      { directory: app + 'node_modules/tesseract-wasm/dist', files: ['tesseract-worker.js', 'tesseract-core.wasm', 'tesseract-core-fallback.wasm'] },
      { file: app + 'node_modules/tesseract-wasm/LICENSE.md', to: 'LICENSE.md' },
    ],
  },
  {
    id: 'onnxruntime', directory: 'vendor/onnxruntime',
    manifest: app + 'node_modules/onnxruntime-web/package.json',
    sources: [
      { directory: app + 'node_modules/onnxruntime-web/dist', files: ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'] },
      { file: 'licenses/runtime/onnxruntime-1.27.0-LICENSE.txt', to: 'LICENSE.txt' },
      { file: 'licenses/runtime/onnxruntime-1.27.0-ThirdPartyNotices.txt', to: 'ThirdPartyNotices.txt' },
    ],
  },
  {
    id: 'inter', directory: 'fonts',
    component: {
      name: 'Inter', version: '4.001+git.9221beed3', license: 'OFL-1.1',
      repository: 'https://github.com/rsms/inter/tree/9221beed3',
    },
    sources: [
      {
        directory: app + 'public/fonts',
        files: ['InterVariable.woff2', 'InterVariable-Italic.woff2'],
        expectedSha256: {
          'InterVariable.woff2': '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3',
          'InterVariable-Italic.woff2': 'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a',
        },
      },
      { file: 'licenses/runtime/Inter-4.001-OFL.txt', to: 'OFL.txt' },
    ],
  },
];
