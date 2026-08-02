/**
 * Pluggable dictionary provider model.
 *
 * Importable providers (StarDict, MDict, DICT, and Slob) implement
 * {@link DictionaryProvider}. The
 * {@link DictionaryPopup} renders one tab per enabled provider in user-defined
 * order; each provider writes lookup output into a per-tab container.
 */

export type DictionaryProviderKind = 'stardict' | 'mdict' | 'dict' | 'slob';

export interface DictionaryLookupContext {
  /** Source language hint, e.g. book primary language code (`en`, `zh`). */
  lang?: string;
  /** Cancel signal for in-flight network/IO. */
  signal: AbortSignal;
  /** Tab pane to render into. Provider populates this; never touch `document` selectors. */
  container: HTMLElement;
  /**
   * Called when the provider intercepts an in-popup link click and wants the
   * shell to navigate (push to per-tab history). Optional — providers without
   * cross-link navigation can ignore it.
   */
  onNavigate?(word: string): void;
  /**
   * Theme hint forwarded by the shell. Providers that inject styles into a
   * shadow root (MDict) use this to pick blend modes / overrides that match
   * the current app theme. Optional — defaults to light treatment.
   */
  isDarkMode?: boolean;
  /** Theme background color (e.g. `#ffffff`). Forwarded into shadow-scoped CSS. */
  bg?: string;
  /** Theme foreground color (e.g. `#1a1a1a`). Forwarded into shadow-scoped CSS. */
  fg?: string;
}

export type DictionaryLookupOutcome =
  | { ok: true; headword?: string; sourceLabel?: string }
  | { ok: false; reason: 'empty' | 'unsupported' | 'error'; message?: string };

export interface DictionaryProvider {
  /** Stable id, e.g. `stardict:abc123` or `mdict:xyz`. */
  id: string;
  kind: DictionaryProviderKind;
  /** Localized label shown in the tab strip. */
  label: string;
  /** Optional eager init (parse index/keylist). Called once on first activation. */
  init?(): Promise<void>;
  /** Look up a word; populate `ctx.container`; return outcome. */
  lookup(word: string, ctx: DictionaryLookupContext): Promise<DictionaryLookupOutcome>;
  /** Release object URLs / caches. Called when the provider is removed or replaced. */
  dispose?(): void;
}

/**
 * Persisted local metadata for an imported dictionary. The binary files live on disk
 * under {@link BaseDir} `'Dictionaries'`/<id>/; this metadata stays in local
 * application settings.
 */
export interface ImportedDictionary {
  id: string;
  kind: 'stardict' | 'mdict' | 'dict' | 'slob';
  /** Display name, derived from `.ifo` `bookname`, `.mdx` `Title`, slob `label`, or DICT `00databaseshort`. */
  name: string;
  /**
   * Stable content hash derived from
   * `partialMD5(primary) + byteSize + sortedFilenames`. It is used for local
   * duplicate detection and remains optional for legacy imports.
   */
  contentId?: string;
  /** Subdirectory under `'Dictionaries'` containing this bundle's files. */
  bundleDir: string;
  /** Filenames inside `bundleDir`. The exact set varies by `kind`. */
  files: {
    // StarDict bundle.
    ifo?: string;
    idx?: string;
    dict?: string;
    syn?: string;
    /**
     * Pre-computed offsets sidecar for `.idx`. Generated at import time;
     * lets `StarDictReader.load` skip the full `.idx` scan. Optional —
     * existing imports without it fall back to the in-init scan path.
     */
    idxOffsets?: string;
    /** Same idea for `.syn`. */
    synOffsets?: string;
    // MDict bundle.
    mdx?: string;
    mdd?: string[];
    /**
     * Loose `.css` files imported alongside the `.mdx`/`.mdd` (matched by
     * stem at import time). Applied as scoped stylesheets inside the card's
     * shadow root at lookup time, in addition to any `<link
     * rel="stylesheet">` references resolved from the MDD bundle.
     */
    css?: string[];
    // DICT (dictd) bundle. `dict` above doubles as the body filename
    // (`name.dict` or `name.dict.dz`); `index` is the dictd `.index` file.
    index?: string;
    // Slob bundle: a single self-contained `.slob` file.
    slob?: string;
  };
  /** Source language code if known. */
  lang?: string;
  /** Wall-clock time of import (ms since epoch). */
  addedAt: number;
  /** Legacy soft-delete marker. Tombstoned records are discarded during local hydration. */
  deletedAt?: number;
  /**
   * True when persisted metadata remains but the local binary bundle is missing.
   * The settings UI surfaces a "Re-import" affordance; the popup hides the provider.
   */
  unavailable?: boolean;
  /**
   * True when the bundle imports cleanly but the dictionary format is outside
   * v1 scope (e.g. multi-type StarDict, raw `.dict` instead of `.dict.dz`,
   * encrypted MDX). Provider returns `{ ok: false, reason: 'unsupported' }`.
   */
  unsupported?: boolean;
  /** Human-readable reason when `unsupported` is true. */
  unsupportedReason?: string;
}

/** Persisted display settings for local and system dictionaries. */
export interface DictionarySettings {
  /** Provider id order shown in the popup. Includes the system sentinel. */
  providerOrder: string[];
  /** Per-id enable flag. */
  providerEnabled: Record<string, boolean>;
  /** Last-used tab id; `undefined` falls back to first enabled provider. */
  defaultProviderId?: string;
  /**
   * Font-size multiplier for the dictionary popup content (independent of the
   * main reading view, #4443). `1` = the default sizes; larger values scale
   * every provider's rendered definition up. Drives the `--dict-font-scale`
   * CSS variable on the popup content root, which feeds the light-DOM
   * `font-size` rules and the MDict shadow `::part(dict-content)` rule alike.
   */
  fontScale?: number;
}

/** Stable ids for the built-in providers. */
export const BUILTIN_PROVIDER_IDS = {
  /**
   * "Sentinel" id for the OS-native dictionary (macOS Dictionary.app via the
   * `dict://` URL scheme; iOS `UIReferenceLibraryViewController`; Android
   * `ACTION_PROCESS_TEXT`). The provider has no `lookup`-time UI: when this
   * is the only enabled provider, the annotator's "Dictionary" button skips
   * the in-app popup entirely and hands the selection to the OS. The
   * settings UI enforces single-select between this id and any other
   * provider so the popup either always opens (no system) or never opens
   * (system only).
   */
  systemDictionary: 'builtin:system',
} as const;

export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[keyof typeof BUILTIN_PROVIDER_IDS];
