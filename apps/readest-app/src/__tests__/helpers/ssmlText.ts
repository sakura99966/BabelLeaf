/** Test assertion helper, not an HTML/SSML sanitizer or rendering boundary. */
export function ssmlText(ssml: string): string {
  const document = new DOMParser().parseFromString(ssml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length)
    throw new Error('Invalid generated SSML');
  return document.documentElement.textContent?.trim() ?? '';
}
