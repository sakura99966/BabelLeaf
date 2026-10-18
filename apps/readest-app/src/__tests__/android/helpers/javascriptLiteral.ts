/** Serialize test DATA only. The surrounding CDP source must be trusted code. */
export function javascriptLiteral(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Test data is not JSON serializable');
  // Also safe if a future harness puts the literal in an inline script.
  return serialized.replace(
    /[<>&/\u2028\u2029]/g,
    (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
