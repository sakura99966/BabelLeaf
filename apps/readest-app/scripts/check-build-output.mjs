import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const mode = process.argv[2];

const checks = {
  translations: {
    label: 'untranslated strings',
    roots: ['public/locales'],
    pattern: /__STRING_NOT_TRANSLATED__/g,
  },
  'lookbehind-regex': {
    label: 'lookbehind regular expressions',
    roots: ['.next/static/chunks', 'out/_next/static/chunks'],
    pattern: /\(\?<(?=[!=])/g,
  },
};

const check = checks[mode];
if (!check) {
  console.error(`Unknown build-output check: ${mode ?? '<missing>'}`);
  process.exit(2);
}

const filesUnder = (root) => {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
};

let matches = 0;
for (const relativeRoot of check.roots) {
  for (const file of filesUnder(resolve(process.cwd(), relativeRoot))) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    matches += source.match(check.pattern)?.length ?? 0;
  }
}

if (matches > 0) {
  console.error(`Found ${matches} ${check.label}.`);
  process.exitCode = 1;
} else {
  console.log(`No ${check.label} found.`);
}
