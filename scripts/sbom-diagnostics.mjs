export function reportSbomGaps(gaps, strict, report = console.error) {
  if (gaps.length === 0) return 0;
  // One physical log line prevents dependency diagnostics from becoming
  // additional workflow commands while preserving the complete gap in JSON.
  report(`[BabelLeaf] SBOM gaps: ${JSON.stringify(gaps)}`);
  return strict ? 2 : 0;
}
