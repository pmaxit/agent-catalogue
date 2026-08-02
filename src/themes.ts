/**
 * Writing theme personalities injected into agent prompts.
 */

export type ThemePlaybook = {
  id: string;
  label: string;
  guidance: string;
};

const OREILLY_CHAPTER: ThemePlaybook = {
  id: "oreilly-book-chapter",
  label: "O'Reilly Book Chapter",
  guidance: `
THEME PERSONALITY — O'Reilly Book Chapter (mandatory when this theme is active):

Write like a classic O'Reilly technical book chapter: practical, example-first,
authoritative but approachable, speaking directly to "you" (the practitioner).
Ship a FULL chapter — not a blog post, not a summary.

Voice:
- Clear, direct, slightly conversational technical English
- Prefer concrete verbs and working examples over abstraction
- Teach by doing: concept → tiny example → explanation of output → next step
- Use callouts in markdown as:
  > **Note:** …
  > **Tip:** …
  > **Warning:** …

Required chapter structure (use these H2s, adapt titles to the brief):
1. # Chapter N (or title): <chapter title>
2. ## A Warm-Up Problem — motivate with a real failure or itch
3. ## What You Will Build / Learn — outcomes checklist
4. ## Core Concepts — precise definitions before deep dives
5. ## Hands-On: Walkthrough — step-by-step with code + output + explanation
6. ## How It Fits Together — draw.io architecture/workflow diagram + image brief
7. ## Common Pitfalls — mistakes practitioners make (Warning callouts)
8. ## Putting It Into Practice — a longer worked example
9. ## Exercises — 2–4 practice prompts (optional answers brief)
10. ## Summary — recap bullets + what to read/do next

Length & completeness:
- Target a FULL chapter: roughly 3,500–6,000 words unless the brief says otherwise
- Multiple code listings (not just one), each with Output + Explanation
- At least one draw.io diagram that maps the chapter's system/flow
- Do not stop at an outline — write the complete chapter body

Anti-patterns for this theme:
- Marketing fluff, listicles, or "10 tips" blog shape
- Code without shown output
- Skipping exercises/summary
- Academic jargon without a worked example
`.trim(),
};

const DEFAULT_THEME: ThemePlaybook = {
  id: "default",
  label: "Default",
  guidance: `
THEME PERSONALITY — follow the selected Tone and Format closely.
Keep the piece complete for the requested format and length.
`.trim(),
};

export function resolveThemePlaybook(
  theme?: string,
  format?: string,
): ThemePlaybook {
  const hay = `${theme ?? ""} ${format ?? ""}`.toLowerCase();
  if (
    hay.includes("o'reilly") ||
    hay.includes("oreilly") ||
    hay.includes("book chapter") ||
    hay.includes("animal book")
  ) {
    return OREILLY_CHAPTER;
  }
  return DEFAULT_THEME;
}

export function isOreillyChapterTheme(theme?: string, format?: string): boolean {
  return resolveThemePlaybook(theme, format).id === OREILLY_CHAPTER.id;
}
