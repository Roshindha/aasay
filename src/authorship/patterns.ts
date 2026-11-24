/** Names of AI coding tools and how to recognise them in free text, author names and emails. */
export const AI_TOOLS: Array<{ tool: string; re: RegExp }> = [
  { tool: "Claude", re: /\bclaude\b|anthropic/i },
  { tool: "GitHub Copilot", re: /copilot/i },
  { tool: "ChatGPT / OpenAI", re: /chatgpt|openai|\bgpt-?\d|\bcodex\b/i },
  { tool: "Cursor", re: /\bcursor(?:agent)?\b/i },
  { tool: "Gemini", re: /\bgemini\b/i },
  { tool: "Windsurf / Codeium", re: /windsurf|codeium/i },
  { tool: "Devin", re: /\bdevin\b/i },
  { tool: "Aider", re: /\baider\b/i },
];

/** Automation that is not AI authorship: never reported. */
export const NON_AI_BOTS = /dependabot|renovate|github-actions|greenkeeper|snyk|semantic-release|pre-commit-ci|all-contributors|allcontributors|web-flow|imgbot|mergify/i;

export function identifyTool(text: string): string | null {
  if (!text || NON_AI_BOTS.test(text)) return null;
  for (const { tool, re } of AI_TOOLS) if (re.test(text)) return tool;
  return null;
}

/** AI-tool configuration files and folders (PLAN: strong signals). `dir` rules match any path inside that folder. */
export const TOOL_FILE_RULES: Array<{ ref: string; tool: string; match: (p: string) => boolean }> = [
  { ref: "CLAUDE.md", tool: "Claude", match: (p) => /(^|\/)CLAUDE\.md$/.test(p) },
  { ref: "AGENTS.md", tool: "AI coding agents (AGENTS.md convention)", match: (p) => /(^|\/)AGENTS\.md$/.test(p) },
  { ref: ".cursorrules", tool: "Cursor", match: (p) => /(^|\/)\.cursorrules$/.test(p) },
  { ref: ".cursor/", tool: "Cursor", match: (p) => /(^|\/)\.cursor\//.test(p) },
  { ref: ".claude/", tool: "Claude", match: (p) => /(^|\/)\.claude\//.test(p) },
  { ref: ".github/copilot-instructions.md", tool: "GitHub Copilot", match: (p) => /(^|\/)\.github\/copilot-instructions\.md$/.test(p) },
  { ref: ".windsurfrules", tool: "Windsurf / Codeium", match: (p) => /(^|\/)\.windsurfrules$/.test(p) },
];

const TOOL_WORDS = "AI|A\\.I\\.|artificial intelligence|LLMs?|Claude(?: Code)?|ChatGPT|GPT-?\\d?|Copilot|Cursor|Gemini|Codex|Windsurf|an? (?:AI )?(?:coding )?(?:assistant|agent)|generative AI|language models?";

/** README/docs statements about how the project was built. Negated forms are handled separately. */
export const AI_CLAIM_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:built|written|developed|created|coded|made|generated|authored|drafted)\\s+(?:with|using|by|via|alongside|with the help of|with help from|in collaboration with)\\s+(?:${TOOL_WORDS})`, "i"),
  /\bAI[- ](?:assisted|generated|written|authored|powered development)\b/i,
  /\bvibe[- ]?cod(?:ed|ing)\b/i,
  new RegExp(`\\bpair[- ]programm(?:ed|ing)\\s+with\\s+(?:${TOOL_WORDS})`, "i"),
  new RegExp(`\\b(?:assisted|helped|co-?authored)\\s+(?:by|with)\\s+(?:${TOOL_WORDS})`, "i"),
  new RegExp(`\\b(?:${TOOL_WORDS})\\s+(?:wrote|generated|helped write|assisted with)\\b`, "i"),
];

export const HUMAN_CLAIM_PATTERNS: RegExp[] = [
  /\bhand[- ]?written\b/i,
  /\b100\s?%\s+(?:human|hand|manual)/i,
  /\bhuman[- ]written\b/i,
  /\bwritten (?:entirely )?by (?:a )?(?:human|hand|me|myself)\b/i,
  /\b(?:no|zero)\s+(?:AI|LLM|generated code)\b/i,
  /\bAI[- ]free\b/i,
  /\bwithout (?:any )?(?:AI|LLMs?|generative AI|Copilot|ChatGPT)\b/i,
  /\bnot (?:written|generated|built|made|created) (?:with|by|using) (?:an? )?(?:AI|LLM|ChatGPT|Copilot|Claude)\b/i,
];

/** A phrase like "not built with AI" must not count as an AI claim. */
export const NEGATION_BEFORE = /\b(?:not|never|no|without|isn'?t|wasn'?t|nor)\b[^.\n]{0,24}$/i;
