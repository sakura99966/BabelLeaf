import {
  createTranslationArtifact,
  parseTranslationArtifact,
  type TranslationArtifact,
  type TranslationSegment,
  type TranslationSegmentStatus,
} from './artifacts';
import {
  createTranslationGlossary,
  parseTranslationGlossary,
  type GlossaryEntry,
  type TranslationGlossary,
} from './glossary';
import {
  getTranslationMemoryKey,
  parseTranslationMemory,
  type TranslationMemoryData,
  type TranslationMemoryEntry,
} from './memory';
import { parseTranslationSourceAnchor } from './anchors';

/** Versioned, credential-free interchange formats owned by BabelLeaf. */
export const TRANSLATION_INTERCHANGE_SCHEMA_VERSION = 1 as const;
export const MAX_INTERCHANGE_BYTES = 8 * 1024 * 1024;
export const MAX_INTERCHANGE_ROWS = 20_000;
export const MAX_INTERCHANGE_FIELD_CHARS = 500_000;

export type TranslationInterchangeFormat = 'json' | 'tsv' | 'tmx' | 'tbx' | 'xliff';

export const getTranslationInterchangeFormat = (filename: string): TranslationInterchangeFormat => {
  const extension = filename.trim().toLowerCase().split('.').pop();
  if (extension === 'tsv' || extension === 'tab') return 'tsv';
  if (extension === 'tmx') return 'tmx';
  if (extension === 'tbx' || extension === 'tbx-b') return 'tbx';
  if (extension === 'xlf' || extension === 'xliff') return 'xliff';
  return 'json';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid interchange field: ${field}`);
  }
  if (value.length > MAX_INTERCHANGE_FIELD_CHARS) {
    throw new Error(
      `Interchange field exceeds the ${MAX_INTERCHANGE_FIELD_CHARS}-character limit: ${field}`,
    );
  }
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid interchange field: ${field}`);
  }
  return value;
};

const assertPayload = (payload: string): void => {
  if (payload.length > MAX_INTERCHANGE_BYTES) {
    throw new Error(`Interchange file exceeds the ${MAX_INTERCHANGE_BYTES}-character limit`);
  }
  // External entities and doctypes are not part of the BabelLeaf formats.
  // Reject them before handing XML to a browser parser so hostile fixtures
  // fail explicitly instead of depending on parser implementation details.
  if (/<!doctype|<!entity/i.test(payload)) {
    throw new Error('External XML entities and doctypes are not supported');
  }
};

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const unescapeTsv = (value: string): string =>
  value.replace(/\\([\\tnr])/g, (_match, code: string) => {
    if (code === 't') return '\t';
    if (code === 'n') return '\n';
    if (code === 'r') return '\r';
    return '\\';
  });

const escapeTsv = (value: string): string =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n');

const parseJson = (payload: string): unknown => {
  assertPayload(payload);
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new Error('Invalid interchange JSON');
  }
};

const parseXml = (payload: string): XMLDocument => {
  assertPayload(payload);
  if (typeof DOMParser === 'undefined')
    throw new Error('XML interchange is unavailable on this platform');
  const document = new DOMParser().parseFromString(payload, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Invalid XML interchange document');
  if (document.getElementsByTagName('*').length > MAX_INTERCHANGE_ROWS * 4) {
    throw new Error('XML interchange document has too many elements');
  }
  return document;
};

const getXmlAttribute = (element: Element, name: string): string | undefined => {
  const direct = element.getAttribute(name);
  if (direct !== null) return direct;
  if (name === 'xml:lang') {
    const namespaced = element.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
    return namespaced || undefined;
  }
  return undefined;
};

const childElements = (element: Element, tag: string): Element[] =>
  Array.from(element.children).filter((child) => child.localName === tag || child.tagName === tag);

const firstChildElement = (element: Element, tag: string): Element | undefined =>
  childElements(element, tag)[0];

const textOf = (element: Element | undefined, field: string): string =>
  requiredString(element?.textContent ?? '', field);

const withEnvelope = <T>(format: string, data: T, extra: Record<string, unknown> = {}) => ({
  format,
  schemaVersion: TRANSLATION_INTERCHANGE_SCHEMA_VERSION,
  exportedAt: Date.now(),
  ...extra,
  data,
});

const unwrapEnvelope = (value: unknown, format: string): unknown => {
  if (!isRecord(value)) throw new Error('Invalid interchange envelope');
  if (value['format'] === format) {
    if (value['schemaVersion'] !== TRANSLATION_INTERCHANGE_SCHEMA_VERSION) {
      throw new Error('Unsupported interchange schema version');
    }
    return value['data'];
  }
  // Version 1 application JSON stores were already credential-free. Accepting
  // their raw payloads keeps existing exports importable during migration.
  return value;
};

const serializeTsv = (header: string, fields: string[], rows: string[][]): string =>
  [header, fields.join('\t'), ...rows.map((row) => row.map(escapeTsv).join('\t'))].join('\n') +
  '\n';

const parseTsv = (
  payload: string,
  expectedHeader: string,
  expectedFields: string[],
): string[][] => {
  assertPayload(payload);
  const lines = payload.split(/\r?\n/).filter((line) => line.length > 0);
  const headerIndex = lines.indexOf(expectedHeader);
  if (headerIndex < 0 || lines[headerIndex + 1] !== expectedFields.join('\t')) {
    throw new Error('Unsupported TSV interchange header');
  }
  const rows = lines.slice(headerIndex + 2).filter((line) => !line.startsWith('#'));
  if (rows.length > MAX_INTERCHANGE_ROWS) throw new Error('TSV interchange has too many rows');
  return rows.map((line, index) => {
    const columns = line.split('\t').map(unescapeTsv);
    if (columns.length !== expectedFields.length) {
      throw new Error(`Invalid TSV interchange row: ${index + 1}`);
    }
    return columns;
  });
};

const parseBooleanCell = (value: string, field: string): boolean | undefined => {
  if (!value) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid TSV boolean field: ${field}`);
};

const parseNumberCell = (value: string, field: string, minimum = 0): number => {
  const parsed = Number(value);
  return finiteInteger(parsed, field, minimum);
};

const glossaryToRows = (glossary: TranslationGlossary): string[][] =>
  glossary.entries.map((entry) => [
    entry.id,
    entry.source,
    entry.target,
    entry.sourceLang ?? '',
    entry.targetLang ?? '',
    entry.caseSensitive === undefined ? '' : String(entry.caseSensitive),
    entry.enabled === undefined ? '' : String(entry.enabled),
    entry.notes ?? '',
    String(entry.updatedAt),
  ]);

const parseGlossaryRows = (rows: string[][], updatedAt = Date.now()): TranslationGlossary =>
  createTranslationGlossary(
    rows.map((row, index) => ({
      id: requiredString(row[0], `rows[${index}].id`),
      source: requiredString(row[1], `rows[${index}].source`),
      target: requiredString(row[2], `rows[${index}].target`),
      ...(row[3] ? { sourceLang: row[3] } : {}),
      ...(row[4] ? { targetLang: row[4] } : {}),
      ...(parseBooleanCell(row[5]!, `rows[${index}].caseSensitive`) === undefined
        ? {}
        : { caseSensitive: parseBooleanCell(row[5]!, `rows[${index}].caseSensitive`) }),
      ...(parseBooleanCell(row[6]!, `rows[${index}].enabled`) === undefined
        ? {}
        : { enabled: parseBooleanCell(row[6]!, `rows[${index}].enabled`) }),
      ...(row[7] ? { notes: row[7] } : {}),
      updatedAt: parseNumberCell(row[8]!, `rows[${index}].updatedAt`),
    })),
    updatedAt,
  );

const GLOSSARY_TSV_HEADER = '# BabelLeaf glossary TSV v1';
const GLOSSARY_TSV_FIELDS = [
  'id',
  'source',
  'target',
  'sourceLang',
  'targetLang',
  'caseSensitive',
  'enabled',
  'notes',
  'updatedAt',
];

export const serializeGlossaryInterchange = (
  glossary: TranslationGlossary,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'tbx'> = 'json',
): string => {
  const normalized = parseTranslationGlossary(glossary);
  if (format === 'json') {
    return JSON.stringify(withEnvelope('babelleaf.glossary', normalized), null, 2);
  }
  if (format === 'tsv') {
    return `# updatedAt=${normalized.updatedAt}\n${serializeTsv(GLOSSARY_TSV_HEADER, GLOSSARY_TSV_FIELDS, glossaryToRows(normalized))}`;
  }

  const sourceLang = normalized.entries.find((entry) => entry.sourceLang)?.sourceLang ?? '';
  const targetLang = normalized.entries.find((entry) => entry.targetLang)?.targetLang ?? '';
  const entries = normalized.entries
    .map((entry) => {
      const sourceLangXml = escapeXml(entry.sourceLang || sourceLang || 'und');
      const targetLangXml = escapeXml(entry.targetLang || targetLang || 'und');
      const flags = [
        entry.caseSensitive === undefined
          ? ''
          : `<descrip type="caseSensitive">${entry.caseSensitive}</descrip>`,
        entry.enabled === undefined ? '' : `<descrip type="enabled">${entry.enabled}</descrip>`,
        `<descrip type="updatedAt">${entry.updatedAt}</descrip>`,
      ].join('');
      return `<termEntry id="${escapeXml(entry.id)}"><langSet xml:lang="${sourceLangXml}"><tig><term>${escapeXml(entry.source)}</term></tig></langSet><langSet xml:lang="${targetLangXml}"><tig><term>${escapeXml(entry.target)}</term></tig></langSet>${entry.notes ? `<note>${escapeXml(entry.notes)}</note>` : ''}<descripGrp>${flags}</descripGrp></termEntry>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<martif type="TBX-Basic" xmlns:xml="http://www.w3.org/XML/1998/namespace" data-babelleaf-schema="1" data-updated-at="${normalized.updatedAt}" data-source-lang="${escapeXml(sourceLang)}" data-target-lang="${escapeXml(targetLang)}"><martifHeader><fileDesc><sourceDesc><p>BabelLeaf glossary export</p></sourceDesc></fileDesc></martifHeader><text><body>${entries}</body></text></martif>`;
};

export const parseGlossaryInterchange = (
  payload: string,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'tbx'> = 'json',
): TranslationGlossary => {
  if (format === 'json')
    return parseTranslationGlossary(unwrapEnvelope(parseJson(payload), 'babelleaf.glossary'));
  if (format === 'tsv') {
    const metadata = payload.match(/^# updatedAt=(\d+)$/m)?.[1];
    return parseGlossaryRows(
      parseTsv(payload, GLOSSARY_TSV_HEADER, GLOSSARY_TSV_FIELDS),
      metadata ? parseNumberCell(metadata, 'updatedAt') : Date.now(),
    );
  }

  const document = parseXml(payload);
  const root = document.documentElement;
  if (root.localName !== 'martif' || root.getAttribute('data-babelleaf-schema') !== '1') {
    throw new Error('Unsupported TBX interchange document');
  }
  const defaultSourceLang = root.getAttribute('data-source-lang') || undefined;
  const defaultTargetLang = root.getAttribute('data-target-lang') || undefined;
  const entries: GlossaryEntry[] = [];
  for (const [index, termEntry] of Array.from(root.getElementsByTagName('termEntry')).entries()) {
    const langSets = Array.from(termEntry.children).filter(
      (child) => child.localName === 'langSet',
    );
    if (langSets.length < 2)
      throw new Error(`TBX entry has fewer than two language sets: ${index}`);
    const sourceSet = langSets[0]!;
    const targetSet = langSets[1]!;
    const source = textOf(
      firstChildElement(firstChildElement(sourceSet, 'tig')!, 'term'),
      `termEntry[${index}].source`,
    );
    const target = textOf(
      firstChildElement(firstChildElement(targetSet, 'tig')!, 'term'),
      `termEntry[${index}].target`,
    );
    const descriptions = Array.from(termEntry.getElementsByTagName('descrip'));
    const valueByType = new Map(
      descriptions.map((node) => [node.getAttribute('type'), node.textContent || '']),
    );
    const caseSensitiveValue = valueByType.get('caseSensitive');
    const enabledValue = valueByType.get('enabled');
    entries.push({
      id: requiredString(
        termEntry.getAttribute('id') || `glossary-${index + 1}`,
        `termEntry[${index}].id`,
      ),
      source,
      target,
      sourceLang: getXmlAttribute(sourceSet, 'xml:lang') || defaultSourceLang,
      targetLang: getXmlAttribute(targetSet, 'xml:lang') || defaultTargetLang,
      ...(caseSensitiveValue === undefined ? {} : { caseSensitive: caseSensitiveValue === 'true' }),
      ...(enabledValue === undefined ? {} : { enabled: enabledValue === 'true' }),
      ...(termEntry.getElementsByTagName('note')[0]?.textContent
        ? { notes: termEntry.getElementsByTagName('note')[0]!.textContent! }
        : {}),
      updatedAt: valueByType.get('updatedAt')
        ? parseNumberCell(valueByType.get('updatedAt')!, `termEntry[${index}].updatedAt`)
        : Date.now(),
    });
  }
  return createTranslationGlossary(
    entries,
    root.getAttribute('data-updated-at')
      ? parseNumberCell(root.getAttribute('data-updated-at')!, 'data-updated-at')
      : Date.now(),
  );
};

const memoryToRows = (memory: TranslationMemoryData): string[][] =>
  memory.entries.map((entry) => [
    entry.key,
    entry.sourceText,
    entry.translatedText,
    entry.sourceLang,
    entry.targetLang,
    entry.provider,
    entry.model ?? '',
    entry.glossaryVersion === undefined ? '' : String(entry.glossaryVersion),
    String(entry.updatedAt),
    String(entry.hits),
  ]);

const MEMORY_TSV_HEADER = '# BabelLeaf translation memory TSV v1';
const MEMORY_TSV_FIELDS = [
  'key',
  'sourceText',
  'translatedText',
  'sourceLang',
  'targetLang',
  'provider',
  'model',
  'glossaryVersion',
  'updatedAt',
  'hits',
];

const parseMemoryRows = (rows: string[][]): TranslationMemoryData => {
  const entries: TranslationMemoryEntry[] = rows.map((row, index) => {
    const query = {
      sourceText: requiredString(row[1], `rows[${index}].sourceText`),
      sourceLang: requiredString(row[3], `rows[${index}].sourceLang`),
      targetLang: requiredString(row[4], `rows[${index}].targetLang`),
      provider: requiredString(row[5], `rows[${index}].provider`),
      ...(row[6] ? { model: row[6] } : {}),
      ...(row[7]
        ? { glossaryVersion: parseNumberCell(row[7], `rows[${index}].glossaryVersion`) }
        : {}),
    };
    const key = requiredString(row[0], `rows[${index}].key`);
    if (key !== getTranslationMemoryKey(query)) throw new Error(`Memory key mismatch: ${index}`);
    return {
      key,
      ...query,
      translatedText: requiredString(row[2], `rows[${index}].translatedText`),
      updatedAt: parseNumberCell(row[8]!, `rows[${index}].updatedAt`),
      hits: parseNumberCell(row[9]!, `rows[${index}].hits`),
    };
  });
  return parseTranslationMemory({ schemaVersion: 1, updatedAt: Date.now(), entries });
};

export const serializeMemoryInterchange = (
  memory: TranslationMemoryData,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'tmx'> = 'json',
): string => {
  const normalized = parseTranslationMemory(memory);
  if (format === 'json')
    return JSON.stringify(withEnvelope('babelleaf.translation-memory', normalized), null, 2);
  if (format === 'tsv') {
    return `# updatedAt=${normalized.updatedAt}\n${serializeTsv(MEMORY_TSV_HEADER, MEMORY_TSV_FIELDS, memoryToRows(normalized))}`;
  }

  const tus = normalized.entries
    .map((entry) => {
      const properties = [
        ['provider', entry.provider],
        ['model', entry.model],
        [
          'glossaryVersion',
          entry.glossaryVersion === undefined ? undefined : String(entry.glossaryVersion),
        ],
        ['hits', String(entry.hits)],
        ['updatedAt', String(entry.updatedAt)],
      ]
        .filter((pair): pair is [string, string] => Boolean(pair[1]))
        .map(([name, value]) => `<prop type="x-babelleaf-${name}">${escapeXml(value)}</prop>`)
        .join('');
      return `<tu tuid="${escapeXml(entry.key)}">${properties}<tuv xml:lang="${escapeXml(entry.sourceLang)}"><seg>${escapeXml(entry.sourceText)}</seg></tuv><tuv xml:lang="${escapeXml(entry.targetLang)}"><seg>${escapeXml(entry.translatedText)}</seg></tuv></tu>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tmx version="1.4" data-babelleaf-schema="1" data-updated-at="${normalized.updatedAt}"><header creationtool="BabelLeaf" segtype="paragraph" adminlang="en" srclang="*" datatype="PlainText"/><body>${tus}</body></tmx>`;
};

export const parseMemoryInterchange = (
  payload: string,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'tmx'> = 'json',
): TranslationMemoryData => {
  if (format === 'json')
    return parseTranslationMemory(
      unwrapEnvelope(parseJson(payload), 'babelleaf.translation-memory'),
    );
  if (format === 'tsv') {
    const metadata = payload.match(/^# updatedAt=(\d+)$/m)?.[1];
    const parsed = parseMemoryRows(parseTsv(payload, MEMORY_TSV_HEADER, MEMORY_TSV_FIELDS));
    return {
      ...parsed,
      updatedAt: metadata ? parseNumberCell(metadata, 'updatedAt') : parsed.updatedAt,
    };
  }

  const document = parseXml(payload);
  const root = document.documentElement;
  if (root.localName !== 'tmx' || root.getAttribute('data-babelleaf-schema') !== '1') {
    throw new Error('Unsupported TMX interchange document');
  }
  const entries: TranslationMemoryEntry[] = [];
  for (const [index, tu] of Array.from(root.getElementsByTagName('tu')).entries()) {
    const tuvs = Array.from(tu.children).filter((child) => child.localName === 'tuv');
    if (tuvs.length < 2) throw new Error(`TMX entry has fewer than two language units: ${index}`);
    const source = tuvs[0]!;
    const target = tuvs[1]!;
    const sourceLang = requiredString(
      getXmlAttribute(source, 'xml:lang'),
      `tu[${index}].sourceLang`,
    );
    const targetLang = requiredString(
      getXmlAttribute(target, 'xml:lang'),
      `tu[${index}].targetLang`,
    );
    const sourceText = textOf(firstChildElement(source, 'seg'), `tu[${index}].sourceText`);
    const translatedText = textOf(firstChildElement(target, 'seg'), `tu[${index}].translatedText`);
    const properties = new Map(
      Array.from(tu.getElementsByTagName('prop')).map((prop) => [
        prop.getAttribute('type') || '',
        prop.textContent || '',
      ]),
    );
    const provider = requiredString(
      properties.get('x-babelleaf-provider'),
      `tu[${index}].provider`,
    );
    const model = properties.get('x-babelleaf-model') || undefined;
    const glossaryVersion = properties.get('x-babelleaf-glossaryVersion');
    const query = {
      sourceText,
      sourceLang,
      targetLang,
      provider,
      ...(model ? { model } : {}),
      ...(glossaryVersion
        ? { glossaryVersion: parseNumberCell(glossaryVersion, `tu[${index}].glossaryVersion`) }
        : {}),
    };
    const key = requiredString(tu.getAttribute('tuid'), `tu[${index}].key`);
    if (key !== getTranslationMemoryKey(query))
      throw new Error(`TMX memory key mismatch: ${index}`);
    entries.push({
      key,
      ...query,
      translatedText,
      updatedAt: properties.get('x-babelleaf-updatedAt')
        ? parseNumberCell(properties.get('x-babelleaf-updatedAt')!, `tu[${index}].updatedAt`)
        : Date.now(),
      hits: properties.get('x-babelleaf-hits')
        ? parseNumberCell(properties.get('x-babelleaf-hits')!, `tu[${index}].hits`)
        : 0,
    });
  }
  return parseTranslationMemory({
    schemaVersion: 1,
    updatedAt: root.getAttribute('data-updated-at')
      ? parseNumberCell(root.getAttribute('data-updated-at')!, 'data-updated-at')
      : Date.now(),
    entries,
  });
};

const reviewToRows = (artifact: TranslationArtifact): string[][] =>
  artifact.segments.map((segment) => [
    segment.id,
    segment.sourceText,
    segment.translatedText ?? '',
    segment.machineTranslatedText ?? '',
    segment.sourceLang,
    segment.targetLang,
    segment.status,
    segment.chapterId ?? '',
    segment.sourceLocator ?? '',
    segment.sourceAnchor ? JSON.stringify(segment.sourceAnchor) : '',
    segment.error ?? '',
    String(segment.updatedAt),
  ]);

const REVIEW_TSV_HEADER = '# BabelLeaf review TSV v1';
const REVIEW_TSV_FIELDS = [
  'id',
  'sourceText',
  'translatedText',
  'machineTranslatedText',
  'sourceLang',
  'targetLang',
  'status',
  'chapterId',
  'sourceLocator',
  'sourceAnchor',
  'error',
  'updatedAt',
];

const parseStatus = (value: string, field: string): TranslationSegmentStatus => {
  if (!['pending', 'translated', 'reviewed', 'failed'].includes(value))
    throw new Error(`Invalid review status: ${field}`);
  return value as TranslationSegmentStatus;
};

const parseReviewRows = (rows: string[][], metadata: TranslationArtifact): TranslationArtifact =>
  parseTranslationArtifact({
    ...metadata,
    segments: rows.map((row, index) => ({
      id: requiredString(row[0], `rows[${index}].id`),
      sourceText: requiredString(row[1], `rows[${index}].sourceText`),
      ...(row[2] ? { translatedText: row[2] } : {}),
      ...(row[3] ? { machineTranslatedText: row[3] } : {}),
      sourceLang: requiredString(row[4], `rows[${index}].sourceLang`),
      targetLang: requiredString(row[5], `rows[${index}].targetLang`),
      status: parseStatus(row[6]!, `rows[${index}].status`),
      ...(row[7] ? { chapterId: row[7] } : {}),
      ...(row[8] ? { sourceLocator: row[8] } : {}),
      ...(row[9] ? { sourceAnchor: parseTranslationSourceAnchor(parseJson(row[9]!)) } : {}),
      ...(row[10] ? { error: row[10] } : {}),
      updatedAt: parseNumberCell(row[11]!, `rows[${index}].updatedAt`),
    })),
  });

export const serializeReviewInterchange = (
  artifact: TranslationArtifact,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'xliff'> = 'json',
): string => {
  const normalized = parseTranslationArtifact(artifact);
  if (format === 'json')
    return JSON.stringify(withEnvelope('babelleaf.review', normalized), null, 2);
  if (format === 'tsv') {
    const metadata = `# bookHash=${escapeTsv(normalized.bookHash)}\n# provider=${escapeTsv(normalized.provider)}\n# model=${escapeTsv(normalized.model ?? '')}\n# promptVersion=${escapeTsv(normalized.promptVersion)}\n# sourceLang=${escapeTsv(normalized.sourceLang)}\n# targetLang=${escapeTsv(normalized.targetLang)}\n# glossaryVersion=${normalized.glossaryVersion ?? ''}\n# sourceFingerprint=${escapeTsv(normalized.sourceFingerprint ?? '')}\n# updatedAt=${normalized.updatedAt}`;
    return `${metadata}\n${serializeTsv(REVIEW_TSV_HEADER, REVIEW_TSV_FIELDS, reviewToRows(normalized))}`;
  }

  const attrs = [
    ['data-book-hash', normalized.bookHash],
    ['srcLang', normalized.sourceLang],
    ['trgLang', normalized.targetLang],
    ['data-provider', normalized.provider],
    ['data-model', normalized.model],
    ['data-prompt-version', normalized.promptVersion],
    [
      'data-glossary-version',
      normalized.glossaryVersion === undefined ? undefined : String(normalized.glossaryVersion),
    ],
    ['data-source-fingerprint', normalized.sourceFingerprint],
    ['data-updated-at', String(normalized.updatedAt)],
  ]
    .filter((pair): pair is [string, string] => Boolean(pair[1]))
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(' ');
  const units = normalized.segments
    .map((segment) => {
      const props = [
        ['machineTranslatedText', segment.machineTranslatedText],
        ['chapterId', segment.chapterId],
        ['sourceLocator', segment.sourceLocator],
        ['sourceAnchor', segment.sourceAnchor ? JSON.stringify(segment.sourceAnchor) : undefined],
        ['error', segment.error],
      ]
        .filter((pair): pair is [string, string] => Boolean(pair[1]))
        .map(([name, value]) => `<prop key="${escapeXml(name)}">${escapeXml(value)}</prop>`)
        .join('');
      return `<unit id="${escapeXml(segment.id)}"><metadata>${props}</metadata><segment><source>${escapeXml(segment.sourceText)}</source>${segment.translatedText ? `<target state="${escapeXml(segment.status)}">${escapeXml(segment.translatedText)}</target>` : '<target state="initial"></target>'}</segment></unit>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0"><file id="babelleaf-review" ${attrs}>${units}</file></xliff>`;
};

const parseReviewMetadata = (file: Element): TranslationArtifact =>
  createTranslationArtifact({
    bookHash: requiredString(file.getAttribute('data-book-hash'), 'file.data-book-hash'),
    provider: requiredString(file.getAttribute('data-provider'), 'file.data-provider'),
    sourceLang: requiredString(file.getAttribute('srcLang'), 'file.srcLang'),
    targetLang: requiredString(file.getAttribute('trgLang'), 'file.trgLang'),
    promptVersion: requiredString(
      file.getAttribute('data-prompt-version'),
      'file.data-prompt-version',
    ),
    ...(file.getAttribute('data-model') ? { model: file.getAttribute('data-model')! } : {}),
    ...(file.getAttribute('data-glossary-version')
      ? {
          glossaryVersion: parseNumberCell(
            file.getAttribute('data-glossary-version')!,
            'file.data-glossary-version',
          ),
        }
      : {}),
    ...(file.getAttribute('data-source-fingerprint')
      ? { sourceFingerprint: file.getAttribute('data-source-fingerprint')! }
      : {}),
    ...(file.getAttribute('data-updated-at')
      ? {
          updatedAt: parseNumberCell(file.getAttribute('data-updated-at')!, 'file.data-updated-at'),
        }
      : {}),
  });

export const parseReviewInterchange = (
  payload: string,
  format: Extract<TranslationInterchangeFormat, 'json' | 'tsv' | 'xliff'> = 'json',
): TranslationArtifact => {
  if (format === 'json')
    return parseTranslationArtifact(unwrapEnvelope(parseJson(payload), 'babelleaf.review'));
  if (format === 'tsv') {
    assertPayload(payload);
    const metadata = new Map(
      payload
        .split(/\r?\n/)
        .filter((line) => line.startsWith('# ') && line.includes('='))
        .map((line) => line.slice(2).split(/=(.*)/s).slice(0, 2) as [string, string]),
    );
    const artifact = createTranslationArtifact({
      bookHash: requiredString(unescapeTsv(metadata.get('bookHash') || ''), 'bookHash'),
      provider: requiredString(unescapeTsv(metadata.get('provider') || ''), 'provider'),
      sourceLang: requiredString(unescapeTsv(metadata.get('sourceLang') || ''), 'sourceLang'),
      targetLang: requiredString(unescapeTsv(metadata.get('targetLang') || ''), 'targetLang'),
      promptVersion: requiredString(
        unescapeTsv(metadata.get('promptVersion') || ''),
        'promptVersion',
      ),
      ...(metadata.get('model') ? { model: unescapeTsv(metadata.get('model')!) } : {}),
      ...(metadata.get('glossaryVersion')
        ? { glossaryVersion: parseNumberCell(metadata.get('glossaryVersion')!, 'glossaryVersion') }
        : {}),
      ...(metadata.get('sourceFingerprint')
        ? { sourceFingerprint: unescapeTsv(metadata.get('sourceFingerprint')!) }
        : {}),
      ...(metadata.get('updatedAt')
        ? { updatedAt: parseNumberCell(metadata.get('updatedAt')!, 'updatedAt') }
        : {}),
    });
    return parseReviewRows(parseTsv(payload, REVIEW_TSV_HEADER, REVIEW_TSV_FIELDS), artifact);
  }

  const document = parseXml(payload);
  const root = document.documentElement;
  if (root.localName !== 'xliff' || root.getAttribute('version') !== '2.0')
    throw new Error('Unsupported XLIFF interchange document');
  const file = Array.from(root.getElementsByTagName('file'))[0];
  if (!file) throw new Error('XLIFF document has no file');
  const metadata = parseReviewMetadata(file);
  const segments: TranslationSegment[] = [];
  for (const [index, unit] of Array.from(file.getElementsByTagName('unit')).entries()) {
    const segment = firstChildElement(unit, 'segment');
    if (!segment) throw new Error(`XLIFF unit has no segment: ${index}`);
    const source = textOf(firstChildElement(segment, 'source'), `unit[${index}].source`);
    const targetElement = firstChildElement(segment, 'target');
    const target = targetElement?.textContent?.trim() || undefined;
    const properties = new Map(
      Array.from(unit.getElementsByTagName('prop')).map((prop) => [
        prop.getAttribute('key') || '',
        prop.textContent || '',
      ]),
    );
    const status = targetElement?.getAttribute('state') || 'pending';
    segments.push({
      id: requiredString(unit.getAttribute('id'), `unit[${index}].id`),
      sourceText: source,
      ...(target ? { translatedText: target } : {}),
      ...(properties.get('machineTranslatedText')
        ? { machineTranslatedText: properties.get('machineTranslatedText') }
        : {}),
      sourceLang: metadata.sourceLang,
      targetLang: metadata.targetLang,
      status: parseStatus(status, `unit[${index}].status`),
      ...(properties.get('chapterId') ? { chapterId: properties.get('chapterId') } : {}),
      ...(properties.get('sourceLocator')
        ? { sourceLocator: properties.get('sourceLocator') }
        : {}),
      ...(properties.get('sourceAnchor')
        ? { sourceAnchor: parseTranslationSourceAnchor(parseJson(properties.get('sourceAnchor')!)) }
        : {}),
      ...(properties.get('error') ? { error: properties.get('error') } : {}),
      updatedAt: Date.now(),
    });
  }
  return parseTranslationArtifact({ ...metadata, segments });
};

export const getInterchangeMimeType = (format: TranslationInterchangeFormat): string => {
  switch (format) {
    case 'tsv':
      return 'text/tab-separated-values';
    case 'tmx':
      return 'application/x-tmx';
    case 'tbx':
      return 'application/x-tbx';
    case 'xliff':
      return 'application/xliff+xml';
    default:
      return 'application/json';
  }
};
