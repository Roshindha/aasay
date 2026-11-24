/**
 * Assay reports authorship signals so owners can disclose them accurately. It must never help conceal them.
 * `checkRequestPolicy` is applied to free-text requests (MCP tool input, API intent) before any work is done.
 */
export interface PolicyDecision { allowed: boolean; reason?: string }

export const REFUSAL_MESSAGE =
  "Assay will not remove, hide, rewrite or obfuscate authorship signals, rewrite commit history, or help a repository pass as human-written. " +
  "It reports signals so owners can disclose AI assistance accurately. If a signal is a false positive, explain that in your README; " +
  "I can draft an accurate \"How this was built\" section instead.";

const CONCEAL = "remov\\w*|delet\\w*|hid(?:e|ing|den)\\w*|strip\\w*|scrub\\w*|clean(?:ing)?(?: up| out)?|eras\\w*|purg\\w*|obfuscat\\w*|disguis\\w*|mask\\w*|conceal\\w*|rewrit\\w*|amend\\w*|filter(?:ing)? out|get(?:ting)? rid of|bypass\\w*|evad\\w*|squash\\w*|launder\\w*|sanitiz\\w*|redact\\w*";
const AI_OBJECT = "\\bai\\b|a\\.i\\.|claude|copilot|cursor|chatgpt|\\bgpt|co-?authored-?by|trailers?|generated with|authorship|attribution|signals?|markers?|fingerprints?|CLAUDE\\.md|AGENTS\\.md|\\.cursorrules|\\.claude|\\.cursor|copilot-instructions|windsurf";
const GOALS = [
  /\b(?:pass|passes|passing)\s+(?:it\s+|this\s+|the (?:repo|project|code)\s+)?(?:off\s+)?as\s+(?:a\s+)?(?:human|hand|manual)/i,
  /\b(?:look|looks|appear|appears|seem|seems|make it (?:look|seem|appear))\s+(?:like\s+)?(?:it\s+(?:was\s+)?)?(?:human|hand)[- ]?(?:written|made|coded|authored)?/i,
  /\b(?:evade|avoid|beat|fool|trick|bypass|defeat|dodge)\s+(?:the\s+)?(?:ai\s+)?(?:detect\w*|audit|checker|scanner|assay)/i,
  /\bundetectable\b|\bundetected\b/i,
  /\bwithout (?:anyone|people|them|reviewers?) (?:knowing|noticing|finding out)\b/i,
];
const HISTORY_REWRITE = /\b(?:rewrit\w*|amend\w*|filter-?branch|filter-?repo|force[- ]?push\w*|squash\w*|rebas\w*)\b[^.\n]{0,50}\b(?:history|commits?|messages?|trailers?)\b/i;

export function checkRequestPolicy(request: string): PolicyDecision {
  const text = request.trim();
  if (!text) return { allowed: true };
  const near = new RegExp(`(?:${CONCEAL})[^.\\n]{0,60}(?:${AI_OBJECT})|(?:${AI_OBJECT})[^.\\n]{0,60}(?:${CONCEAL})`, "i");
  const aiMention = new RegExp(AI_OBJECT, "i").test(text);
  if (near.test(text) || GOALS.some((g) => g.test(text)) || (HISTORY_REWRITE.test(text) && aiMention)) {
    return { allowed: false, reason: REFUSAL_MESSAGE };
  }
  return { allowed: true };
}
