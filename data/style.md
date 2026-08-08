# style.md — Writing and Design Style Guide

**Modeled on:** *Reinforcement Learning: An Introduction* (2nd ed.), Sutton & Barto, Chapter 1.
**Purpose:** Any agent writing a chapter for this book should read this file first and imitate the style described here. This is not a summary of the book's content — it is a specification of *how the authors write*, extracted from close reading of Chapter 1.

---

## 1. The Voice

Write as **practitioners telling the story of their own field**, not as a textbook committee. The register is serious, warm, and confident without being showy.

- **Always "we."** First-person plural throughout: "In this book we explore…", "We take the position that…". The "we" is sometimes the authors, sometimes the authors + reader working through a problem together ("We then play many games against the opponent"). Both uses are deliberate — the reader is enlisted as a collaborator.
- **Own your opinions, and label them as opinions.** The authors say "In our opinion," "From our point of view, it was simply premature," "we do not consider evolutionary methods… to be especially well suited." Judgments are frequent but always attributed to the authors, never disguised as facts.
- **Be epistemically honest.** Hedge where the truth is genuinely uncertain: "We cannot be sure about what accounted for this separation, but its main cause was likely…", "to the best of our knowledge," "Minsky (1954) may have been the first." Never fake certainty; never hedge on things that are settled.
- **Enthusiasm is rare and therefore powerful.** Emotionally charged words appear perhaps once per section: "One of the most exciting aspects…", "a striking feature," "an uncanny similarity," "Minsky's paper is well worth reading today." One exclamation mark in 24 pages ("Credit is even given to moves that never occurred!") — and it lands precisely because it is the only one.
- **Generous with credit.** People are named, with dates, even for minor or failed contributions. History is told as a story of *people having ideas*, including near-misses and confusions, not as a list of citations.

## 2. The Fundamental Pedagogical Moves

These five moves recur constantly and are the core of the style. Use them.

### Move 1: Anchor in universal human experience before any jargon
The book's very first sentence is not about algorithms — it is about an infant waving its arms. Chapters and major ideas open with something the reader already knows from life (learning to drive a car, holding a conversation, pleasure and pain) and only then translate it into technical form. **Rule: the reader must feel the phenomenon before they see the formalism.**

### Move 2: Define by contrast
Almost nothing is defined in isolation. The subject is triangulated against its neighbors: RL vs. supervised learning, RL vs. unsupervised learning, value-function methods vs. evolutionary methods, model-free vs. model-based, "weak methods" vs. "strong methods." Each contrast gets its own full paragraph with the structure: *what the other thing is (fairly stated) → why it is genuinely valuable → why it nevertheless does not solve our problem.* The rival approach is always steelmanned before it is set aside.

### Move 3: Preempt the reader's specific misunderstanding
Many paragraphs exist purely to block a predictable wrong inference. Signature phrasings:
- "Although one might be tempted to think of reinforcement learning as a kind of unsupervised learning… it is trying to maximize a reward signal instead."
- "While this example illustrates some of the key features…, it is so simple that it might give the impression that reinforcement learning is more limited than it really is." (followed by a systematic list of every limitation the example might falsely suggest, each one explicitly cancelled).
- "failing to make this distinction is the source of many confusions."

**Rule: after every example or definition, ask "what wrong conclusion could a smart reader draw here?" and address it in the text.**

### Move 4: One extended example carries the conceptual load
Chapter 1 does not scatter ten toy examples — it invests ~7 pages in a single one (tic-tac-toe) and extracts everything from it. The extended-example arc is:
1. Pose the problem concretely, ending in a **direct question** ("How might we construct a player that will find the imperfections in its opponent's play…?").
2. Try the **obvious/classical approaches first** and show precisely where each falls short (minimax assumes a fixed opponent; dynamic programming needs a full opponent model; evolutionary search ignores what happens during games).
3. Present the new approach as a **step-by-step narrative in second-person-plural**: "First we would set up a table of numbers… We then play many games… While we are playing, we change the values…"
4. Introduce the **one equation** only after the idea has been fully stated in words, then immediately restate the equation in words again and name it.
5. **Zoom out**: what the example illustrates (a bulleted-in-prose "First, … Second, …" paragraph).
6. **Zoom out again**: what the example does *not* imply — one paragraph per false limitation, each opening with a concession ("Although tic-tac-toe is a two-person game…", "Tic-tac-toe has a relatively small, finite state set, whereas…").

### Move 5: Concrete examples span the whole space, then get synthesized
The Section 1.2 example list deliberately mixes: an expert human (chess master), industrial machinery (refinery controller), an animal (gazelle calf), a robot, and a mundane named human ("Phil prepares his breakfast"). The mundane example gets the *longest* treatment — the point is that ordinary life is secretly full of the phenomenon. The list is always followed by synthesis paragraphs that extract the shared features explicitly ("These examples share features that are so basic that they are easy to overlook. All involve…"), using **parallel construction** across all examples: "The chess player knows whether or not he wins, the refinery controller knows how much petroleum is being produced, the gazelle calf knows when it falls…"

## 3. Chapter Architecture (the template)

A chapter is built from these parts, in this order:

1. **Chapter opening (no heading, ~2 paragraphs).** Starts from lived experience or the previous chapter's cliffhanger; ends by stating what this chapter does and the perspective adopted. No bullet lists, no "In this chapter you will learn…" boilerplate — the roadmap is woven into prose.
2. **Numbered sections (X.1, X.2, …), each 1–4 pages.** Typical sequence for an introductory chapter: *define and position the idea → concrete examples → name the elements/vocabulary → limitations and scope (say what you will NOT cover, and why) → one extended worked example → summary → history.*
3. **A "Limitations and Scope" style section.** The authors explicitly fence off what the book will not address ("We do not address the issues of constructing, changing, or learning the state signal in this book") and — critically — give the *reason*: "not because we consider state representation to be unimportant, but in order to focus fully on the decision-making issues." Every exclusion gets a justification.
4. **Exercises embedded at the point of relevance,** not dumped at chapter end. Format: "**Exercise X.N: Short Title**" followed by an open-ended, Socratic prompt. They ask "what do you think would happen," not "compute the answer." The best ones contain a mid-exercise reversal: "…In what ways would this change improve the learning process? **Now think again.** Suppose the opponent did not take advantage of symmetries. In that case, should we?" Exercises teach the reader to distrust their first answer.
5. **Summary section (~3 short paragraphs).** Restates the chapter's claims in slightly more compressed and more confident language than the body. This is where "In our opinion…" positioning statements live. No new material.
6. **History / "Bibliographical Remarks" section.** A genuine narrative with named people, dates, primary-source block quotes (indented, with full citation appended in parentheses), dead ends, and confusions ("This began a pattern of confusion… Many researchers seemed to believe that they were studying reinforcement learning when they were actually studying supervised learning"). Organize history as *threads* that develop independently and then intertwine — announce the thread structure up front, then walk each thread, then show the convergence. Survey citations are batched in parentheses: "(surveyed by White, 1985, 1988, 1993)."
7. **Cross-references everywhere.** Forward references defer detail honestly ("The details of this formalization must wait until Chapter 3, but the basic idea is simply to…") — always accompanied by a one-line preview so the reader is never left empty-handed. Backward references reuse earlier examples as shared vocabulary ("such as that used in the tic-tac-toe example in this chapter"). Section-level pointers are precise: "(Section 16.1)", "(e.g., see Sections 9.5, 17.4, and 13.1)". Footnotes are almost never used — Chapter 1 has exactly one.

## 4. Paragraph Craft

- **One idea per paragraph, fully developed.** Paragraphs run 4–10 sentences. A new technical term never shares a paragraph with a second new term.
- **Topic sentence first, qualification last.** Paragraphs open with the claim ("A reward signal defines the goal of a reinforcement learning problem.") and close with the generalization or caveat ("In general, reward signals may be stochastic functions of the state…").
- **The primary/secondary pattern.** When two concepts relate hierarchically, state the hierarchy, then immediately complicate it: "Rewards are in a sense primary, whereas values, as predictions of rewards, are secondary. Without rewards there could be no values… **Nevertheless**, it is values with which we are most concerned…" The reader learns the rule and its inversion in the same breath.
- **Deliberate short-sentence punctuation.** Long flowing sentences (25–40 words, multiple clauses) are the default; a very short sentence is dropped in for emphasis roughly once per page: "Or the reverse could be true." / "This view is still common today, but not dominant." / "For the most part, this thread did not involve learning."
- **Paragraph-to-paragraph connective tissue.** Transitions carry logic, not decoration: "Whereas the reward signal indicates what is good in an immediate sense, a value function specifies…", "Reinforcement learning takes the opposite tack…", "Let us return now to the other major thread…", "On the other hand…". Never start consecutive paragraphs the same way; never use headers as a substitute for transitions.

## 5. Sentence-Level Style

- **Em-dash appositive definitions.** The signature construction: define a term inline the instant it appears — "Reinforcement learning is learning what to do—how to map situations to actions—so as to maximize a numerical reward signal." Also used for enumerations mid-sentence: "just these three aspects—sensation, action, and goal—in their simplest possible forms."
- **Introduce every term in italics, once, then use it plainly forever.** *policy*, *reward signal*, *value function*, *model*, *exploratory moves*, *step-size parameter*, *temporal-difference learning*. The italicized first use always sits inside a sentence that defines it. Terminology is rigorously consistent afterwards — no elegant variation on technical terms.
- **Calibrated hedges as precision instruments.** "Roughly speaking," "Informally," "in a sense," "arguably," "nominally" — these mark exactly where a statement is intuitive rather than formal, and they promise the formal version is coming ("The formal definition of state as we use it here is given by the framework of… Chapter 3").
- **Rhetorical questions open problems.** Used sparingly, always at a genuine decision point, always answered by the text that follows: "How do you distribute credit for success among the many decisions that may have been involved in producing it?"
- **Direct reader guidance.** "we encourage the reader to follow the informal meaning and think of the state as whatever information is available to the agent." The authors tell the reader *how to hold* a concept, not just what it is.
- **Everyday analogies for formal objects, immediately bounded.** Rewards ↔ pleasure and pain; values ↔ "a more refined and farsighted judgment." Analogies are flagged as analogies ("To make a human analogy…", "we might think of rewards as analogous to…") so they illuminate without being mistaken for definitions.
- **Concessive openings.** Sentences that grant the opposing point before the turn: "Although these approaches have yielded many useful results, their focus on isolated subproblems is a significant limitation." This is the default way to disagree.

## 6. Mathematics Policy

- **Words first, symbol second, words again.** In the entire introductory chapter there is exactly ONE displayed equation. It appears only after the mechanism has been fully described in prose, every symbol is introduced in the surrounding sentence ("If we let S_t denote the state before the greedy move…"), and the equation is immediately followed by a plain-language restatement and the *name* of the parameter and method.
- Math density should rise gradually across the book, but every chapter keeps the pattern: no symbol appears before its meaning; no equation is left unexplained after it appears.
- Prefer defining quantities operationally ("the value of a state is the total amount of reward an agent can expect to accumulate over the future, starting from that state") before writing them symbolically.

## 7. Figures and Visual Design

- **Figures are rare and load-bearing.** One figure in 24 pages. When a figure exists, the text depends on it ("as suggested by the arrows in Figure 1.1") and the caption is a self-contained multi-sentence explanation that could stand alone — it explains solid vs. dashed lines, names the semantic meaning of every visual element, and even adds a caveat that defers to the body text ("as detailed in the text").
- **Small inline/margin graphics** for tiny concrete objects (the tic-tac-toe board sits beside the wrapped paragraph that introduces the game), reserving full numbered figures for diagrams that carry an argument.
- **Layout conventions:** chapter number + title on its own page; sections numbered `X.Y` with descriptive titles (a title may promise an example: "An Extended Example: Tic-Tac-Toe"); running headers with chapter/section names and book page numbers; exercises terminated with a small box glyph (⇤/∎); block quotes indented with source citation in parentheses on the final line; optional/advanced sections starred (*) in the table of contents.
- **Bulleted lists are rare and only for parallel concrete items** (the five examples in 1.2). Argumentation is never bulleted — enumeration inside arguments is done in prose ("First, … Second, …").

## 8. What Makes This Book Stand Out (properties to preserve)

1. **Problem before solution.** The entire first chapter defines and motivates a *problem class* before presenting any method as "the answer." Methods are always evaluated relative to the problem, and the problem/method/field distinction is policed explicitly.
2. **The reader is treated as a future researcher, not a student.** Open problems are stated as open ("intensively studied by mathematicians for many decades, yet remains unresolved"), the authors' own uncertainty is visible, and exercises invite genuine speculation.
3. **Intellectual lineage as narrative.** The history section is not an obligation — it is some of the best writing in the chapter, full of characters (Thorndike, Turing, Michie's matchbox machine MENACE, Shannon's mouse Theseus), and it quietly teaches the field's key distinctions a second time through the story of people who confused them.
4. **Self-aware scoping.** The book repeatedly says what it will not do and why, which paradoxically increases trust in what it does do.
5. **A spiral, not a line.** Ideas are introduced informally, revisited formally, then revisited historically — the tic-tac-toe example is planted in Chapter 1 and explicitly harvested in later chapters. Plant such seeds deliberately.
6. **Humanity in the details.** A named ordinary person making breakfast; "Phil must watch the milk he pours into his cereal bowl to keep it from overflowing." Precision and warmth coexist in the same sentence.

## 9. Anti-Patterns (never do these)

- No "In this chapter, you will learn: •…" objective boxes, no key-takeaway callouts, no TL;DRs. Structure lives in prose.
- No hype adjectives ("powerful," "game-changing," "revolutionary") and no marketing tone. Excitement must be earned and specific.
- No undefined jargon, ever — and no defining two new terms in one sentence.
- No strawmen. Every rival method gets its honest best case before its limitation.
- No orphan equations (symbols before meaning, or equations without follow-up prose).
- No dense citation walls inside the main exposition — citations cluster in the history/bibliographical sections; the body text cites only when a specific person's specific contribution is being discussed.
- No second-person singular commands ("you should now implement…"). The collaborative "we" does the work.
- No emoji, no contractions in formal exposition, no rhetorical questions used as filler.

## 10. Quick Checklist for a New Chapter

Before submitting a chapter, verify:

- [ ] Opens from experience or continuity, not from a definition or a list.
- [ ] Every new term: italicized at first use, defined in the same sentence, one per paragraph.
- [ ] Main idea defined by contrast with at least one steelmanned alternative.
- [ ] At least one paragraph that explicitly cancels a predictable misreading.
- [ ] One extended example following the six-step arc (pose → classical attempts fail → narrative walkthrough → single gentle equation → what it shows → what it does not imply).
- [ ] Exercises embedded in context, open-ended, at least one with a "Now think again" reversal.
- [ ] A scope paragraph excluding something, with the reason for the exclusion.
- [ ] Summary section that restates, positions ("In our opinion…"), and adds nothing new.
- [ ] History/remarks section told as intertwining threads with named people, dates, and at most 1–2 short primary-source block quotes.
- [ ] Forward references with one-line previews; backward references that reuse earlier examples.
- [ ] Long/short sentence rhythm; at most one exclamation mark per chapter; hedges only where honestly needed.
- [ ] Figures: few, essential, with self-contained multi-sentence captions referenced from the body.
