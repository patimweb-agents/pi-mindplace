/**
 * Declaration forms of modern TypeScript: an arrow function and a plain value declared with
 * `const`, plus a function expression. The parser reports these as `lexical_declaration`.
 */

export const MAX_RETRIES = 3;

export const normalise = (value: string): string => value.trim().toLowerCase();

export const retry = async function (): Promise<void> {
  await Promise.resolve();
};
