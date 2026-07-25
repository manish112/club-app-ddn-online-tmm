// Dumb {{placeholder}} substitution. Any {{token}} is replaced with vars[token]
// (or an empty string when not supplied) so no raw braces leak into the email.

export type TemplateVars = Record<string, string>;

export function fillTemplate(str: string, vars: TemplateVars): string {
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
    key in vars ? vars[key] : '',
  );
}
