import { describe, expect, it, vi } from 'vitest';
import { reportSbomGaps } from '../../../../../scripts/sbom-diagnostics.mjs';

describe('incomplete SBOM graph diagnostics', () => {
  it('fails strict validation and reports escaped missing-dependency diagnostics on one line', () => {
    const gaps = ['cargo metadata failed: missing crate\nnetwork disabled by --offline'];
    const report = vi.fn();
    expect(reportSbomGaps(gaps, true, report)).toBe(2);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      `[BabelLeaf] SBOM gaps: ${JSON.stringify(gaps)}`,
    );
    expect(report.mock.calls[0]?.[0]).not.toContain('\n');
    expect(gaps).toEqual(['cargo metadata failed: missing crate\nnetwork disabled by --offline']);
  });

  it('accepts a complete graph without a warning or a nonzero exit', () => {
    const report = vi.fn();
    expect(reportSbomGaps([], true, report)).toBe(0);
    expect(report).not.toHaveBeenCalled();
  });

  it('keeps a source-only gap visible without presenting it as strict qualification', () => {
    const report = vi.fn();
    expect(reportSbomGaps(['cargo metadata failed'], false, report)).toBe(0);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      '[BabelLeaf] SBOM gaps: ["cargo metadata failed"]',
    );
  });
});
