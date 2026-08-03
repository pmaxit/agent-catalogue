/**
 * Writing theme personalities injected into agent prompts
 * and Quarto notebook presentation metadata.
 */

export type QuartoThemeMeta = {
  /** CSS class on the in-app notebook chrome */
  cssClass: string;
  /** Quarto HTML theme name (for .qmd YAML) */
  htmlTheme: string;
  toc: boolean;
  codeFold: boolean;
  /** Short blurb shown in notebook chrome */
  blurb: string;
};

export type ThemePlaybook = {
  id: string;
  label: string;
  /** Exact studio card `data-theme` when known */
  studioTheme?: string;
  guidance: string;
  quarto: QuartoThemeMeta;
};

const OREILLY_CHAPTER: ThemePlaybook = {
  id: "oreilly-book-chapter",
  label: "O'Reilly Book Chapter",
  studioTheme: "O'Reilly Book Chapter",
  quarto: {
    cssClass: "qmd-theme-oreilly",
    htmlTheme: "cosmo",
    toc: true,
    codeFold: false,
    blurb: "Full chapter · labs · Tip/Note/Warning callouts · exercises",
  },
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

const AGENTIC_COMMAND: ThemePlaybook = {
  id: "agentic-command",
  label: "Agentic Command",
  studioTheme: "Agentic Command",
  quarto: {
    cssClass: "qmd-theme-agentic",
    htmlTheme: "darkly",
    toc: true,
    codeFold: false,
    blurb: "Outcome-first · delegated flows · clear command surfaces",
  },
  guidance: `
THEME PERSONALITY — Agentic Command:
Write with precise, delegated, outcome-first voice. Prefer clear task flows,
traceable decisions, and concrete next actions over abstraction.
`.trim(),
};

const TECHNICAL_TRACE: ThemePlaybook = {
  id: "technical-trace",
  label: "Technical Trace",
  studioTheme: "Technical Trace",
  quarto: {
    cssClass: "qmd-theme-technical",
    htmlTheme: "solarized",
    toc: true,
    codeFold: false,
    blurb: "Evidence-first · code-dense · high-clarity engineering voice",
  },
  guidance: `
THEME PERSONALITY — Technical Trace:
Sharp, analytical, code-dense writing. Lead with evidence, traces, and
reproducible steps. Prefer precise terminology and worked listings.
`.trim(),
};

const EDITORIAL_SIGNAL: ThemePlaybook = {
  id: "editorial-signal",
  label: "Editorial Signal",
  studioTheme: "Editorial Signal",
  quarto: {
    cssClass: "qmd-theme-editorial",
    htmlTheme: "flatly",
    toc: true,
    codeFold: true,
    blurb: "Structured argument · formal scholarly cadence",
  },
  guidance: `
THEME PERSONALITY — Editorial Signal:
Authoritative, structured, reflective. Build arguments with clear claims,
evidence, and implications. Formal but readable.
`.trim(),
};

const NARRATIVE_PULSE: ThemePlaybook = {
  id: "narrative-pulse",
  label: "Narrative Pulse",
  studioTheme: "Narrative Pulse",
  quarto: {
    cssClass: "qmd-theme-narrative",
    htmlTheme: "journal",
    toc: false,
    codeFold: false,
    blurb: "Story hooks · imagery · memorable rhythm",
  },
  guidance: `
THEME PERSONALITY — Narrative Pulse:
Vivid, narrative-driven, punchy. Open with a scene or tension, keep rhythm
tight, and land memorable takeaways.
`.trim(),
};

const EXECUTIVE_CRISP: ThemePlaybook = {
  id: "executive-crisp",
  label: "Executive Crisp",
  studioTheme: "Executive Crisp",
  quarto: {
    cssClass: "qmd-theme-executive",
    htmlTheme: "cosmo",
    toc: false,
    codeFold: false,
    blurb: "Scannable · bold takeaways · zero fluff",
  },
  guidance: `
THEME PERSONALITY — Executive Crisp:
Concise, action-oriented, high impact. Lead with the answer, then supporting
bullets. No fluff; every sentence earns its place.
`.trim(),
};

const DEFAULT_THEME: ThemePlaybook = {
  id: "default",
  label: "Default",
  quarto: {
    cssClass: "qmd-theme-default",
    htmlTheme: "cosmo",
    toc: true,
    codeFold: false,
    blurb: "Follow selected tone and format",
  },
  guidance: `
THEME PERSONALITY — follow the selected Tone and Format closely.
Keep the piece complete for the requested format and length.
`.trim(),
};

const STUDIO_THEMES: ThemePlaybook[] = [
  AGENTIC_COMMAND,
  TECHNICAL_TRACE,
  EDITORIAL_SIGNAL,
  NARRATIVE_PULSE,
  EXECUTIVE_CRISP,
  OREILLY_CHAPTER,
];

export function listStudioThemePlaybooks(): ThemePlaybook[] {
  return STUDIO_THEMES;
}

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

  for (const playbook of STUDIO_THEMES) {
    if (
      playbook.studioTheme &&
      theme &&
      theme.toLowerCase() === playbook.studioTheme.toLowerCase()
    ) {
      return playbook;
    }
    if (hay.includes(playbook.id.replace(/-/g, " "))) {
      return playbook;
    }
  }

  if (hay.includes("agentic")) return AGENTIC_COMMAND;
  if (hay.includes("technical") || hay.includes("trace")) return TECHNICAL_TRACE;
  if (hay.includes("editorial")) return EDITORIAL_SIGNAL;
  if (hay.includes("narrative")) return NARRATIVE_PULSE;
  if (hay.includes("executive")) return EXECUTIVE_CRISP;

  return DEFAULT_THEME;
}

export function isOreillyChapterTheme(theme?: string, format?: string): boolean {
  return resolveThemePlaybook(theme, format).id === OREILLY_CHAPTER.id;
}
