/**
 * Assemble a markdown file with YAML frontmatter from wizard input.
 *
 * Strings get JSON-encoded so colons, quotes, and unicode are safe.
 * Booleans render as `true` / `false`. Optional flags are only emitted
 * when truthy — keeps the file clean for the common case.
 *
 * Output is intentionally minimal: order is name → description → flags
 * → body, matching the way humans read these files.
 */
export interface AssembleSkillInput {
  name: string;
  description: string;
  options: {
    disableModelInvocation: boolean;
    userInvocable: boolean;
  };
  body: string;
}

export function assembleFile(input: AssembleSkillInput): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${yamlString(input.name)}`);
  lines.push(`description: ${yamlString(input.description)}`);
  if (input.options.disableModelInvocation) {
    lines.push("disable-model-invocation: true");
  }
  if (input.options.userInvocable) {
    lines.push("user-invocable: true");
  }
  lines.push("---");
  lines.push("");
  const body = input.body.trim();
  if (body.length > 0) {
    lines.push(body);
    lines.push("");
  }
  return lines.join("\n");
}

function yamlString(value: string): string {
  // YAML 1.2 plain scalars are touchy — JSON encoding is the safe bet
  // for any value, and gray-matter on the server reads it back fine.
  return JSON.stringify(value);
}

export function buildSkillPath(directory: string, name: string): string {
  return `${directory}/${name}.md`;
}

const NAME_PATTERN = /^[a-z0-9_-]+$/;

export function sanitizeSkillName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSkillName(name: string): boolean {
  return NAME_PATTERN.test(name);
}
