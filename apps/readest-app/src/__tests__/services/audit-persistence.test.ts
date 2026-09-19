import { expect, it } from 'vitest';
import { safeLoadJSON, safeSaveJSON, updateJSON } from '@/services/persistence';

it('does not replace main when preserving its backup fails', async () => {
  const files = new Map([['state.json', '{"revision":1}']]);
  const fs = {
    readFile: async (name: string) => files.get(name) ?? '',
    writeFile: async (name: string, _base: unknown, value: string | ArrayBuffer | File) => {
      if (name.endsWith('.bak')) throw new Error('backup denied');
      files.set(name, String(value));
    },
  };
  await expect(safeSaveJSON(fs, 'state.json', 'Data', { revision: 2 })).rejects.toThrow();
  expect(JSON.parse(files.get('state.json')!)).toEqual({ revision: 1 });
});

it('keeps the readable backup when replacing a corrupt main', async () => {
  const files = new Map([
    ['state.json', 'corrupt'],
    ['state.json.bak', '{"revision":1}'],
  ]);
  const fs = {
    readFile: async (name: string) => files.get(name) ?? '',
    writeFile: async (name: string, _base: unknown, value: string | ArrayBuffer | File) => {
      files.set(name, String(value));
    },
  };
  await safeSaveJSON(fs, 'state.json', 'Data', { revision: 2 });
  expect(JSON.parse(files.get('state.json.bak')!)).toEqual({ revision: 1 });
});

it.each([
  'save',
  'update',
] as const)('preserves committed recovery data after %s fails', async (mode) => {
  const files = new Map([
    ['state.json', '{"revision":1}'],
    ['state.json.bak', '{"revision":0}'],
  ]);
  let fail = true;
  const fs = {
    readFile: async (name: string) => files.get(name) ?? '',
    writeFile: async (name: string, _base: unknown, value: string | ArrayBuffer | File) => {
      if (name === 'state.json' && fail) throw new Error('disk failure');
      files.set(name, String(value));
    },
  };
  const save = () =>
    mode === 'save'
      ? safeSaveJSON(fs, 'state.json', 'Data', { revision: 2 })
      : updateJSON(fs, 'state.json', 'Data', () => ({ revision: 2 }));
  await expect(save()).rejects.toThrow();
  expect(JSON.parse(files.get('state.json.bak')!)).toEqual({ revision: 1 });
  fail = false;
  await save();
  expect(JSON.parse(files.get('state.json')!)).toEqual({ revision: 2 });
  expect(JSON.parse(files.get('state.json.bak')!)).toEqual({ revision: 1 });
  files.set('state.json', 'corrupt');
  expect(await safeLoadJSON(fs, 'state.json', 'Data', null)).toEqual({ revision: 1 });
});

it('recovers a schema-invalid main file from a schema-valid backup', async () => {
  const files = new Map([
    ['state.json', '{"revision":"bad"}'],
    ['state.json.bak', '{"revision":2}'],
  ]);
  const fs = {
    readFile: async (name: string) => files.get(name) ?? '',
    writeFile: async (name: string, _base: unknown, value: string | ArrayBuffer | File) => {
      files.set(name, String(value));
    },
  };
  const validate = (value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('revision' in value) ||
      typeof value.revision !== 'number'
    )
      throw new Error('Invalid revision');
    return value as { revision: number };
  };
  expect(await safeLoadJSON(fs, 'state.json', 'Data', null, validate)).toEqual({ revision: 2 });
});

it('serializes saves so an older write cannot overwrite a newer snapshot', async () => {
  const files = new Map<string, string>();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fs = {
    readFile: async (name: string) => files.get(name) ?? '',
    writeFile: async (name: string, _base: unknown, content: string | ArrayBuffer | File) => {
      const data = String(content);
      if (name === 'state.json' && JSON.parse(data).revision === 1) {
        entered();
        await blocked;
      }
      files.set(name, data);
    },
  };
  const first = safeSaveJSON(fs, 'state.json', 'Data', { revision: 1 });
  await started;
  const second = safeSaveJSON(fs, 'state.json', 'Data', { revision: 2 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  await Promise.all([first, second]);
  expect(await safeLoadJSON(fs, 'state.json', 'Data', null)).toEqual({ revision: 2 });
});
