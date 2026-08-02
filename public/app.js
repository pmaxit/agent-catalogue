// Quill Studio — webflow (WordPress-inspired white) dashboard app logic
// Bound Open Design: design-systems/webflow + design-templates/dashboard

document.addEventListener("DOMContentLoaded", () => {
  const menuNewPiece = document.getElementById("menu-new-piece");
  const menuNewPieceCompose = document.getElementById("menu-new-piece-compose");
  const menuNewBook = document.getElementById("menu-new-book");
  const menuNewChapter = document.getElementById("menu-new-chapter");
  const menuPublishToggle = document.getElementById("menu-publish-toggle");
  const menuToggleConsole = document.getElementById("menu-toggle-console");
  const toggleConsoleDraft = document.getElementById("toggle-console-draft");
  const newMenuBtn = document.getElementById("new-menu-btn");
  const newMenuPop = document.getElementById("new-menu-pop");
  const booksList = document.getElementById("books-list");
  const bookRail = document.getElementById("book-rail");
  const bookRailTitle = document.getElementById("book-rail-title");
  const bookRailMeta = document.getElementById("book-rail-meta");
  const bookChapterList = document.getElementById("book-chapter-list");
  const bookPublicLink = document.getElementById("book-public-link");
  const bookAddChapterBtn = document.getElementById("book-add-chapter-btn");
  const blockReviseBar = document.getElementById("block-revise-bar");
  const selectAllBlocks = document.getElementById("select-all-blocks");
  const selectedBlocksCount = document.getElementById("selected-blocks-count");
  const reviseInstruction = document.getElementById("revise-instruction");
  const reviseBlocksBtn = document.getElementById("revise-blocks-btn");
  const toggleReviseBtn = document.getElementById("toggle-revise-btn");
  const applyPanel = document.getElementById("apply-panel");
  const applyList = document.getElementById("apply-list");
  const applySelectAllBtn = document.getElementById("apply-select-all-btn");
  const applySelectedBtn = document.getElementById("apply-selected-btn");
  const dismissApplyBtn = document.getElementById("dismiss-apply-btn");
  const activityRail = document.querySelector(".activity-rail");
  const libraryTabs = document.querySelector(".library-tabs");

  const goalsSelector = document.getElementById("goals-selector");
  const themesSelector = document.getElementById("themes-selector");
  const agentForm = document.getElementById("agent-form");
  const briefInput = document.getElementById("brief-input");
  const audienceInput = document.getElementById("audience-input");
  const toneInput = document.getElementById("tone-input");
  const formatInput = document.getElementById("format-input");
  const lengthInput = document.getElementById("length-input");
  const fireBtn = document.getElementById("fire-btn");
  const resetBtn = document.getElementById("reset-btn");

  const wizardSection = document.getElementById("wizard-section");
  const workspaceSection = document.getElementById("workspace-section");
  const workspaceGrid = document.getElementById("workspace-grid");
  const consolePanel = document.getElementById("console-panel");
  const streamBox = document.getElementById("stream-box");
  const streamStatus = document.getElementById("stream-status");
  const liveDot = document.getElementById("live-dot");
  const articleCanvas = document.getElementById("article-canvas");
  const criteriaGrid = document.getElementById("criteria-card-grid");
  const iterationBadge = document.getElementById("iteration-badge");
  const publishedBadge = document.getElementById("published-badge");
  const publishBtn = document.getElementById("publish-btn");
  const saveBtn = document.getElementById("save-btn");
  const historyBtn = document.getElementById("history-btn");
  const closeHistoryBtn = document.getElementById("close-history-btn");
  const historyPanel = document.getElementById("history-panel");
  const historyList = document.getElementById("history-list");
  const articlesList = document.getElementById("articles-list");
  const articleMeta = document.getElementById("article-meta");
  const copyBtn = document.getElementById("copy-btn");
  const downloadBtn = document.getElementById("download-btn");
  const editorBar = document.getElementById("editor-bar");
  const blocksCount = document.getElementById("blocks-count");
  const addBlockBtn = document.getElementById("add-block-btn");
  const modeBadge = document.getElementById("mode-badge");
  const modelBadge = document.getElementById("model-badge");
  const healthPill = document.getElementById("health-pill");
  const studioSearch = document.getElementById("studio-search");

  let currentGoal = "Thought Leadership & Opinion Essay";
  let currentTheme = "Agentic Command";
  let currentDraftText = "";
  let currentArticleId = null;
  let currentArticleSlug = null;
  let currentBookId = null;
  let currentBookSlug = null;
  let currentBookTitle = "";
  let currentChapterId = null;
  let currentChapterSlug = null;
  let bookChapters = [];
  let composingChapter = false;
  let isPublished = false;
  let blocks = [];
  let selectedBlockIds = new Set();
  let pendingProposals = [];
  let pendingProposalMarkdown = "";
  let reviseModeActive = false;
  let awaitingBlockApply = false;
  let criterionThreshold = 0.75;
  let saveTimer = null;
  let saving = false;

  const newId = () =>
    crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random()}`;

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  async function hydrateConfig() {
    try {
      const [healthRes, configRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/config"),
      ]);
      if (!healthRes.ok || !configRes.ok) throw new Error("Config fetch failed");
      const health = await healthRes.json();
      const config = await configRes.json();

      const mock = Boolean(health.mock ?? config.mock);
      modeBadge.textContent = mock ? "STATUS: MOCK" : "STATUS: LIVE";
      modelBadge.textContent = `MODEL: ${(config.defaults?.model || "—").toUpperCase()}`;
      healthPill.textContent = mock ? "Mock mode" : "API connected";
      healthPill.classList.toggle("mock", mock);
      healthPill.classList.toggle("live", !mock);

      const agentCount = Array.isArray(config.agents) ? config.agents.length : 4;
      document.getElementById("kpi-agents").textContent = String(agentCount);
      document.getElementById("kpi-iters").textContent = String(
        config.goal?.max_iterations ?? 5,
      );
      document.getElementById("max-iter-val").textContent = String(
        config.goal?.max_iterations ?? 5,
      );

      const thresholds = (config.goal?.criteria || []).map((c) => c.threshold);
      if (thresholds.length) {
        criterionThreshold = Math.min(...thresholds);
        document.getElementById("kpi-threshold").textContent =
          criterionThreshold.toFixed(2);
        document.getElementById("threshold-val").textContent =
          `${criterionThreshold}+`;
      }

      document.getElementById("kpi-runtime").textContent = mock
        ? "mock"
        : config.defaults?.runtime || "api";
      document.getElementById("kpi-runtime-delta").textContent = mock
        ? "Local mock runner active"
        : "Cursor Cloud Agents API";
    } catch (err) {
      healthPill.textContent = "Offline";
      modeBadge.textContent = "STATUS: ERROR";
      console.error(err);
    }
  }

  hydrateConfig();

  function resetEditorCanvas(message = "Waiting for draft") {
    currentDraftText = "";
    blocks = [];
    selectedBlockIds = new Set();
    pendingProposals = [];
    pendingProposalMarkdown = "";
    awaitingBlockApply = false;
    isPublished = false;
    publishedBadge.hidden = true;
    editorBar.hidden = true;
    if (blockReviseBar) blockReviseBar.hidden = true;
    if (applyPanel) applyPanel.hidden = true;
    if (saveBtn) saveBtn.hidden = true;
    if (historyBtn) historyBtn.hidden = true;
    if (articleMeta) articleMeta.textContent = "";
    articleCanvas.classList.remove("block-editor-active");
    articleCanvas.innerHTML = `<div class="placeholder-notice empty-state"><h3>${escapeHtml(message)}</h3><p>Fire agents after setting the brief, theme, and length.</p></div>`;
  }

  function startNewArticle() {
    currentArticleId = null;
    currentArticleSlug = null;
    currentChapterId = null;
    currentChapterSlug = null;
    composingChapter = false;
    briefInput.value = "";
    resetEditorCanvas();
    setActivity("compose");
    wizardSection.scrollIntoView({ behavior: "smooth" });
    briefInput.focus();
  }

  function closeNewMenu() {
    if (!newMenuPop || !newMenuBtn) return;
    newMenuPop.hidden = true;
    newMenuBtn.setAttribute("aria-expanded", "false");
  }

  function setActivity(name) {
    document.querySelectorAll(".rail-btn[data-activity]").forEach((btn) => {
      const on = btn.dataset.activity === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".drawer-panel").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
    if (name === "compose") {
      wizardSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (name === "run") {
      workspaceSection.hidden = false;
      workspaceSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setLibraryTab(tab) {
    libraryTabs?.querySelectorAll(".library-tab").forEach((btn) => {
      const on = btn.dataset.libTab === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".library-pane").forEach((pane) => {
      pane.hidden = pane.dataset.libPane !== tab;
    });
  }

  function toggleConsole() {
    consolePanel.hidden = !consolePanel.hidden;
    workspaceGrid.style.gridTemplateColumns = consolePanel.hidden
      ? "1fr"
      : "420px 1fr";
  }

  menuNewPiece?.addEventListener("click", () => {
    closeNewMenu();
    startNewArticle();
  });
  menuNewPieceCompose?.addEventListener("click", startNewArticle);
  menuNewBook?.addEventListener("click", () => {
    closeNewMenu();
    createBookFlow();
  });
  menuNewChapter?.addEventListener("click", () => {
    closeNewMenu();
    startNewChapter();
  });
  bookAddChapterBtn?.addEventListener("click", () => startNewChapter());

  newMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!newMenuPop) return;
    const open = newMenuPop.hidden;
    newMenuPop.hidden = !open;
    newMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.("#new-menu")) closeNewMenu();
  });

  activityRail?.addEventListener("click", (e) => {
    const btn = e.target.closest(".rail-btn[data-activity]");
    if (!btn) return;
    setActivity(btn.dataset.activity);
  });

  libraryTabs?.addEventListener("click", (e) => {
    const tab = e.target.closest(".library-tab");
    if (!tab) return;
    setLibraryTab(tab.dataset.libTab);
  });

  document.getElementById("nav-compose-brief")?.addEventListener("click", () => {
    setActivity("compose");
    briefInput?.focus();
    wizardSection?.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("nav-compose-theme")?.addEventListener("click", () => {
    setActivity("compose");
    themesSelector?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("nav-pipeline")?.addEventListener("click", () => {
    setActivity("run");
  });
  document.getElementById("nav-draft")?.addEventListener("click", () => {
    setActivity("run");
    document.getElementById("draft-panel")?.scrollIntoView({ behavior: "smooth" });
  });

  async function createBookFlow() {
    const title = window.prompt("Book title");
    if (!title?.trim()) return;
    const synopsis =
      window.prompt("Short synopsis (optional)", "")?.trim() || "";
    try {
      const oreillyCard = themesSelector?.querySelector(
        '[data-theme="O\'Reilly Book Chapter"]',
      );
      if (oreillyCard) oreillyCard.click();
      const bookGoal = goalsSelector?.querySelector(
        '[data-goal="O\'Reilly-Style Technical Book Chapter"]',
      );
      if (bookGoal) bookGoal.click();

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          synopsis,
          overviewMarkdown: synopsis
            ? `# ${title.trim()}\n\n${synopsis}`
            : `# ${title.trim()}\n\nA practical technical book drafted in Quill.`,
          theme: currentTheme,
          goal: currentGoal,
          audience: audienceInput.value,
          tone: toneInput.value,
          format: formatInput.value,
          length: lengthInput.value,
          status: "published",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create book");
      await loadBook(data.book.id);
      addLog("BOOK", `Started “${data.book.title}”`, "finish");
      startNewChapter();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function startNewChapter() {
    if (!currentBookId) {
      window.alert("Start or open a book first.");
      return;
    }
    currentArticleId = null;
    currentArticleSlug = null;
    currentChapterId = null;
    currentChapterSlug = null;
    composingChapter = true;
    const n = bookChapters.length + 1;
    briefInput.value = `Write chapter ${n} of “${currentBookTitle}”. Cover the next practical topic a reader needs after the previous chapters.`;
    lengthInput.value = "4000–5500 words (full book chapter)";
    resetEditorCanvas(`Chapter ${n} draft`);
    if (articleMeta) {
      articleMeta.textContent = `New chapter · ${currentBookTitle}`;
    }
    wizardSection.scrollIntoView({ behavior: "smooth" });
    briefInput.focus();
    addLog("BOOK", `Composing chapter ${n} for “${currentBookTitle}”`, "system");
  }

  async function refreshBooksList() {
    if (!booksList) return;
    try {
      const res = await fetch("/api/books");
      if (!res.ok) throw new Error("Failed to list books");
      const data = await res.json();
      const books = data.books || [];
      if (!books.length) {
        booksList.innerHTML = `<p class="side-hint">No books yet — use + New</p>`;
        return;
      }
      booksList.innerHTML = "";
      for (const b of books) {
        const wrap = document.createElement("div");
        wrap.className = `book-tree-item${b.id === currentBookId ? " open" : ""}`;
        const row = document.createElement("div");
        row.className = `article-link-row${b.id === currentBookId ? " active" : ""}`;
        const open = document.createElement("button");
        open.type = "button";
        open.className = "article-link";
        open.innerHTML = `
          <span class="article-link-title">${escapeHtml(b.title)}</span>
          <span class="article-link-meta">/${escapeHtml(b.slug)} · ${b.chapterCount || 0} ch</span>
        `;
        open.addEventListener("click", () => loadBook(b.id));
        const ext = document.createElement("a");
        ext.className = "article-edit-btn";
        ext.href = b.url || `/books/${b.slug}`;
        ext.target = "_blank";
        ext.rel = "noopener";
        ext.textContent = "↗";
        ext.title = "Open public URL";
        row.appendChild(open);
        row.appendChild(ext);
        wrap.appendChild(row);

        if (b.id === currentBookId && bookChapters.length) {
          const ul = document.createElement("ul");
          ul.className = "book-tree-chapters";
          bookChapters.forEach((c, i) => {
            const li = document.createElement("li");
            li.className = c.id === currentChapterId ? "active" : "";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = `${i + 1}. ${c.title}`;
            btn.addEventListener("click", () => loadChapter(c.id));
            li.appendChild(btn);
            ul.appendChild(li);
          });
          wrap.appendChild(ul);
        }
        booksList.appendChild(wrap);
      }
    } catch (err) {
      booksList.innerHTML = `<p class="side-hint">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadBook(id) {
    const res = await fetch(`/api/books/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Load book failed");
    const book = data.book;
    currentBookId = book.id;
    currentBookSlug = book.slug;
    currentBookTitle = book.title;
    bookChapters = book.chapters || [];
    if (menuNewChapter) menuNewChapter.hidden = false;
    if (bookRail) bookRail.hidden = false;
    if (bookRailTitle) bookRailTitle.textContent = book.title;
    if (bookRailMeta) {
      bookRailMeta.textContent = `${bookChapters.length} chapter${bookChapters.length === 1 ? "" : "s"} · expand in Library rail`;
    }
    setActivity("library");
    setLibraryTab("books");
    if (bookPublicLink) {
      bookPublicLink.href = `/books/${book.slug}`;
      bookPublicLink.textContent = `/books/${book.slug}`;
    }
    renderBookChapterList();
    if (book.theme) currentTheme = book.theme;
    if (book.goal) currentGoal = book.goal;
    await refreshBooksList();
    addLog("BOOK", `Opened “${book.title}”`, "system");
  }

  function renderBookChapterList() {
    if (!bookChapterList) return;
    bookChapterList.innerHTML = "";
    if (!bookChapters.length) {
      bookChapterList.innerHTML = `<li class="side-hint">No chapters yet — add one and fire agents.</li>`;
      return;
    }
    bookChapters.forEach((c, i) => {
      const li = document.createElement("li");
      li.className = c.id === currentChapterId ? "active" : "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chapter-pick";
      btn.innerHTML = `<span>Ch. ${i + 1}</span><strong>${escapeHtml(c.title)}</strong>`;
      btn.addEventListener("click", () => loadChapter(c.id));
      li.appendChild(btn);
      bookChapterList.appendChild(li);
    });
  }

  async function loadChapter(id) {
    const res = await fetch(`/api/chapters/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Load chapter failed");
    const chapter = data.chapter;
    if (chapter.book?.id && chapter.book.id !== currentBookId) {
      await loadBook(chapter.book.id);
    }
    currentArticleId = null;
    currentArticleSlug = null;
    currentChapterId = chapter.id;
    currentChapterSlug = chapter.slug;
    composingChapter = false;
    workspaceSection.hidden = false;
    currentDraftText = chapter.body_markdown;
    blocks = Array.isArray(chapter.blocks)
      ? chapter.blocks.map((b) => ({ ...b, id: b.id ?? newId() }))
      : [];
    isPublished = true;
    publishedBadge.hidden = false;
    publishedBadge.textContent = "Chapter · block editor";
    editorBar.hidden = false;
    articleCanvas.classList.add("block-editor-active");
    if (saveBtn) saveBtn.hidden = false;
    if (historyBtn) historyBtn.hidden = false;
    if (articleMeta) {
      articleMeta.innerHTML = `<a href="${escapeHtml(chapter.url)}" target="_blank" rel="noopener">${escapeHtml(chapter.url)}</a> · r${chapter.revision}`;
    }
    if (chapter.theme) currentTheme = chapter.theme;
    if (chapter.goal) currentGoal = chapter.goal;
    if (chapter.brief) briefInput.value = chapter.brief;
    if (chapter.audience) audienceInput.value = chapter.audience;
    if (chapter.tone) toneInput.value = chapter.tone;
    if (chapter.format) formatInput.value = chapter.format;
    if (chapter.length) lengthInput.value = chapter.length;
    if (applyPanel) applyPanel.hidden = true;
    if (blockReviseBar) blockReviseBar.hidden = true;
    reviseModeActive = false;
    renderBlockEditor();
    renderBookChapterList();
    await refreshBooksList();
    setActivity("library");
    addLog("BOOK", `Loaded chapter “${chapter.title}”`, "system");
    workspaceSection.scrollIntoView({ behavior: "smooth" });
  }

  menuPublishToggle?.addEventListener("click", () => {
    if (currentDraftText) enablePublishMode(true);
    else
      window.alert(
        "Run the agent pipeline to generate a draft before publishing.",
      );
  });

  menuToggleConsole?.addEventListener("click", toggleConsole);
  toggleConsoleDraft?.addEventListener("click", toggleConsole);

  goalsSelector.addEventListener("click", (e) => {
    const card = e.target.closest(".option-card");
    if (!card) return;
    goalsSelector.querySelectorAll(".option-card").forEach((c) => {
      c.classList.remove("active");
      c.setAttribute("aria-selected", "false");
    });
    card.classList.add("active");
    card.setAttribute("aria-selected", "true");
    currentGoal = card.dataset.goal;
  });

  themesSelector.addEventListener("click", (e) => {
    const card = e.target.closest(".theme-card");
    if (!card) return;
    themesSelector.querySelectorAll(".theme-card").forEach((c) =>
      c.classList.remove("active"),
    );
    card.classList.add("active");
    currentTheme = card.dataset.theme;
    toneInput.value = card.dataset.tone;
    formatInput.value = card.dataset.format;
    if (card.dataset.length) lengthInput.value = card.dataset.length;
  });

  if (studioSearch) {
    studioSearch.addEventListener("input", () => {
      const q = studioSearch.value.trim().toLowerCase();
      goalsSelector.querySelectorAll(".option-card").forEach((card) => {
        const hay = `${card.dataset.goal} ${card.textContent}`.toLowerCase();
        card.hidden = Boolean(q) && !hay.includes(q);
      });
      themesSelector.querySelectorAll(".theme-card").forEach((card) => {
        const hay = `${card.dataset.theme} ${card.textContent}`.toLowerCase();
        card.hidden = Boolean(q) && !hay.includes(q);
      });
      booksList?.querySelectorAll(".book-tree-item").forEach((item) => {
        const hay = item.textContent.toLowerCase();
        item.hidden = Boolean(q) && !hay.includes(q);
      });
      articlesList?.querySelectorAll(".article-link-row").forEach((row) => {
        const hay = row.textContent.toLowerCase();
        row.hidden = Boolean(q) && !hay.includes(q);
      });
    });
  }

  resetBtn.addEventListener("click", () => {
    briefInput.value = "";
    briefInput.focus();
  });

  const addLog = (tag, msg, tagClass = "system") => {
    const timeStr = new Date().toTimeString().split(" ")[0];
    const row = document.createElement("div");
    row.className = "stream-log-entry";
    row.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-tag ${tagClass}">${tag}</span> <span class="log-msg">${escapeHtml(msg)}</span>`;
    streamBox.appendChild(row);
    streamBox.scrollTop = streamBox.scrollHeight;
  };

  const setNodeState = (nodeId, state) => {
    const nodeElem = document.getElementById(`node-${nodeId}`);
    if (!nodeElem) return;
    nodeElem.classList.remove("active", "completed");
    const statusText = nodeElem.querySelector(".node-status");
    if (state === "active") {
      nodeElem.classList.add("active");
      statusText.textContent = "Running…";
    } else if (state === "completed") {
      nodeElem.classList.add("completed");
      statusText.textContent = "Done";
    } else {
      statusText.textContent = "Pending";
    }
  };

  agentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const brief = briefInput.value.trim();
    if (!brief) {
      briefInput.focus();
      return;
    }

    workspaceSection.hidden = false;
    workspaceSection.scrollIntoView({ behavior: "smooth" });

    fireBtn.disabled = true;
    const label = fireBtn.querySelector("span");
    if (label) label.textContent = "Agents running…";
    streamBox.innerHTML = "";
    articleCanvas.innerHTML = `<div class="placeholder-notice empty-state"><h3>Pipeline started</h3><p>Planner is shaping the strategy for this brief…</p></div>`;
    criteriaGrid.innerHTML = "";
    iterationBadge.textContent = "Loop: 1";
    publishedBadge.hidden = true;
    editorBar.hidden = true;
    isPublished = false;
    currentArticleId = null;
    currentArticleSlug = null;
    blocks = [];
    if (saveBtn) saveBtn.hidden = true;
    if (historyBtn) historyBtn.hidden = true;
    if (articleMeta) articleMeta.textContent = "";
    if (historyPanel) historyPanel.hidden = true;
    articleCanvas.classList.remove("block-editor-active");
    streamStatus.textContent = "Pipeline active";
    liveDot.classList.add("pulsating");
    liveDot.style.backgroundColor = "";

    ["plan", "research", "write", "manage"].forEach((id) =>
      setNodeState(id, "pending"),
    );
    addLog(
      "INIT",
      `Firing pipeline · Goal: "${currentGoal}" · Theme: "${currentTheme}"`,
      "system",
    );

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          audience: audienceInput.value,
          tone: toneInput.value,
          format: formatInput.value,
          length: lengthInput.value,
          theme: currentTheme,
          goal: currentGoal,
          bookTitle: currentBookTitle || undefined,
          chapterTitle: currentChapterSlug
            ? bookChapters.find((c) => c.id === currentChapterId)?.title
            : undefined,
          chapterNumber: currentBookId
            ? (bookChapters.findIndex((c) => c.id === currentChapterId) + 1) ||
              bookChapters.length + 1
            : undefined,
        }),
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const match = line.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
          if (!match) continue;
          const [, , eventData] = match;
          try {
            handlePipelineEvent(JSON.parse(eventData));
          } catch (err) {
            console.error("SSE JSON parse error", err);
          }
        }
      }
    } catch (err) {
      addLog("ERROR", err.message, "eval");
      streamStatus.textContent = "Pipeline failed";
      liveDot.classList.remove("pulsating");
      liveDot.style.backgroundColor = "var(--danger)";
      articleCanvas.innerHTML = `<div class="placeholder-notice empty-state"><h3>Run failed</h3><p>${escapeHtml(err.message)}. Check the console stream and retry.</p></div>`;
    } finally {
      fireBtn.disabled = false;
      if (label) label.textContent = "Fire agents";
    }
  });

  function handlePipelineEvent(event) {
    switch (event.type) {
      case "pipeline_started":
        addLog("PIPELINE", `Workflow "${event.workflow}" started`, "system");
        break;
      case "node_started":
        addLog("NODE", `Started ${event.agentId} (${event.nodeId})`, "node");
        setNodeState(event.nodeId, "active");
        iterationBadge.textContent = `Loop: ${event.iteration + 1}`;
        break;
      case "agent_created":
        addLog(
          "AGENT",
          `Spawned Cursor agent ${String(event.cursorAgentId).slice(0, 8)}…`,
          "node",
        );
        break;
      case "assistant_delta":
        if (event.nodeId === "write") {
          addLog("WRITE", `${String(event.text).slice(0, 80)}…`, "delta");
        }
        break;
      case "node_finished":
        setNodeState(event.nodeId, "completed");
        addLog("DONE", `Completed ${event.agentId}`, "finish");
        if (event.outputKey === "draft" && event.output) {
          if (awaitingBlockApply) {
            // Keep living draft intact until user applies selected proposals
            addLog("WRITE", "Revision draft ready for selective apply", "delta");
          } else {
            currentDraftText = event.output;
            renderRawDraft(event.output);
          }
        }
        if (event.evaluation) renderEvaluation(event.evaluation);
        break;
      case "route":
        addLog(
          "ROUTE",
          `${event.from} → ${event.to}. ${event.reason || ""}`,
          "node",
        );
        break;
      case "pipeline_finished":
        if (event.status === "completed") {
          addLog("SUCCESS", "Quality thresholds met. Pipeline completed.", "finish");
          streamStatus.textContent = "Completed";
          liveDot.classList.remove("pulsating");
          liveDot.style.backgroundColor = "var(--success)";
        } else if (event.status === "max_iterations") {
          addLog("WARN", "Reached max iteration limit.", "node");
          streamStatus.textContent = "Max loops";
        } else if (event.status === "error") {
          addLog("ERROR", event.error || "Pipeline error", "eval");
          streamStatus.textContent = "Error";
          liveDot.classList.remove("pulsating");
          liveDot.style.backgroundColor = "var(--danger)";
        }
        if (event.draft) {
          currentDraftText = event.draft;
          if (awaitingBlockApply) {
            showApplyProposals(event.draft);
          } else {
            renderRawDraft(event.draft);
          }
        }
        break;
      default:
        break;
    }
  }

  function renderRawDraft(text) {
    const withDiagrams = text.replace(
      /```(?:drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi,
      (_m, xml) => {
        const encoded = "R" + encodeURIComponent(String(xml).trim());
        const viewer = `https://viewer.diagrams.net/?highlight=0000ff&edit=_blank&layers=1&nav=1&title=Diagram#${encoded}`;
        const editor = `https://app.diagrams.net/?splash=0&libs=general;flowchart#${encoded}`;
        return `<figure class="diagram-figure" data-diagram="drawio">
          <div class="diagram-toolbar">
            <span class="mono-stamp">draw.io</span>
            <a class="diagram-link" href="${editor}" target="_blank" rel="noopener">Open in draw.io</a>
          </div>
          <iframe class="diagram-frame" title="draw.io diagram" src="${viewer}" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </figure>`;
      },
    );
    const html = escapeHtml(withDiagrams)
      .replace(
        /&lt;figure class="diagram-figure"[\s\S]*?&lt;\/figure&gt;/g,
        (escaped) =>
          escaped
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&"),
      )
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/^&gt; (.*$)/gim, "<blockquote>$1</blockquote>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>");
    articleCanvas.innerHTML = `<p>${html}</p>`;
  }

  publishBtn.addEventListener("click", () => enablePublishMode(true));
  saveBtn?.addEventListener("click", () => persistArticle("Manual save"));
  historyBtn?.addEventListener("click", loadHistory);
  closeHistoryBtn?.addEventListener("click", () => {
    historyPanel.hidden = true;
  });
  addBlockBtn.addEventListener("click", () => addNewBlockBelow(blocks.length - 1));

  function blocksToMarkdown(list) {
    return list
      .map((b) => {
        const text = b.text ?? "";
        if (b.type === "h1") return `# ${text}`;
        if (b.type === "h2") return `## ${text}`;
        if (b.type === "h3") return `### ${text}`;
        if (b.type === "blockquote")
          return text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        if (b.type === "list")
          return text
            .split("\n")
            .filter(Boolean)
            .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
            .join("\n");
        if (b.type === "drawio") return "```drawio\n" + text + "\n```";
        return text;
      })
      .join("\n\n");
  }

  function scheduleSave() {
    if (!currentArticleId && !currentChapterId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistArticle("Autosave edit"), 900);
  }

  function setLibraryUi(article) {
    currentArticleId = article.id;
    currentArticleSlug = article.slug;
    currentChapterId = null;
    currentChapterSlug = null;
    composingChapter = false;
    if (saveBtn) saveBtn.hidden = false;
    if (historyBtn) historyBtn.hidden = false;
    if (articleMeta) {
      const url = `/articles/${article.slug}`;
      articleMeta.innerHTML = `<a href="${url}" target="_blank" rel="noopener">/${escapeHtml(article.slug)}</a> · r${article.revision}`;
    }
  }

  function setChapterUi(chapter) {
    currentChapterId = chapter.id;
    currentChapterSlug = chapter.slug;
    currentArticleId = null;
    currentArticleSlug = null;
    composingChapter = false;
    if (saveBtn) saveBtn.hidden = false;
    if (historyBtn) historyBtn.hidden = false;
    if (articleMeta) {
      articleMeta.innerHTML = `<a href="${escapeHtml(chapter.url)}" target="_blank" rel="noopener">${escapeHtml(chapter.url)}</a> · r${chapter.revision}`;
    }
    publishedBadge.hidden = false;
    publishedBadge.textContent = "Chapter · block editor";
  }

  async function refreshArticlesList() {
    if (!articlesList) return;
    try {
      const res = await fetch("/api/articles");
      if (!res.ok) throw new Error("Failed to list articles");
      const data = await res.json();
      const articles = (data.articles || []).filter(
        (a) => a.status === "published",
      );
      if (!articles.length) {
        articlesList.innerHTML = `<p class="side-hint">No published articles yet</p>`;
        return;
      }
      articlesList.innerHTML = "";
      for (const a of articles) {
        const row = document.createElement("div");
        row.className = `article-link-row${a.id === currentArticleId ? " active" : ""}`;

        const open = document.createElement("a");
        open.className = "article-link";
        open.href = a.url || `/articles/${a.slug}`;
        open.target = "_blank";
        open.rel = "noopener";
        open.innerHTML = `
          <span class="article-link-title">${escapeHtml(a.title)}</span>
          <span class="article-link-meta">/${escapeHtml(a.slug)} · r${a.revision}</span>
        `;

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "article-edit-btn";
        edit.textContent = "Edit";
        edit.title = "Load in studio editor";
        edit.addEventListener("click", () => loadArticle(a.id));

        row.appendChild(open);
        row.appendChild(edit);
        articlesList.appendChild(row);
      }
    } catch (err) {
      articlesList.innerHTML = `<p class="side-hint">${escapeHtml(err.message)}</p>`;
    }
  }

  async function persistArticle(changeSummary = "Publish") {
    if (saving) return null;
    const bodyMarkdown =
      blocks.length > 0 ? blocksToMarkdown(blocks) : currentDraftText;
    if (!bodyMarkdown?.trim()) {
      window.alert("Nothing to publish yet.");
      return null;
    }

    if (currentBookId && (currentChapterId || composingChapter)) {
      return persistChapter(changeSummary, bodyMarkdown);
    }

    saving = true;
    try {
      const payload = {
        id: currentArticleId || undefined,
        title: bodyMarkdown.match(/^#\s+(.+)$/m)?.[1] || undefined,
        bodyMarkdown,
        blocks: blocks.length ? blocks.map((b) => ({ ...b, id: b.id ?? newId() })) : undefined,
        brief: briefInput.value,
        audience: audienceInput.value,
        tone: toneInput.value,
        format: formatInput.value,
        length: lengthInput.value,
        theme: currentTheme,
        goal: currentGoal,
        changeSummary,
        status: "published",
      };
      const res = await fetch(
        currentArticleId
          ? `/api/articles/${currentArticleId}`
          : "/api/articles",
        {
          method: currentArticleId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const article = data.article;
      setLibraryUi(article);
      currentDraftText = article.body_markdown;
      if (Array.isArray(article.blocks) && article.blocks.length) {
        blocks = article.blocks;
      }
      addLog(
        "DB",
        `Saved “${article.title}” as revision ${article.revision}`,
        "finish",
      );
      await refreshArticlesList();
      return article;
    } catch (err) {
      addLog("ERROR", err.message, "eval");
      window.alert(err.message);
      return null;
    } finally {
      saving = false;
    }
  }

  async function persistChapter(changeSummary, bodyMarkdown) {
    saving = true;
    try {
      const payload = {
        id: currentChapterId || undefined,
        bookId: currentBookId,
        title: bodyMarkdown.match(/^#\s+(.+)$/m)?.[1] || `Chapter ${bookChapters.length + 1}`,
        bodyMarkdown,
        blocks: blocks.length
          ? blocks.map((b) => ({ ...b, id: b.id ?? newId() }))
          : undefined,
        brief: briefInput.value,
        audience: audienceInput.value,
        tone: toneInput.value,
        format: formatInput.value,
        length: lengthInput.value,
        theme: currentTheme,
        goal: currentGoal,
        changeSummary,
        status: "published",
      };
      const res = await fetch(
        currentChapterId
          ? `/api/chapters/${currentChapterId}`
          : "/api/chapters",
        {
          method: currentChapterId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chapter save failed");
      const chapter = data.chapter;
      setChapterUi(chapter);
      currentDraftText = chapter.body_markdown;
      if (Array.isArray(chapter.blocks) && chapter.blocks.length) {
        blocks = chapter.blocks;
      }
      addLog(
        "BOOK",
        `Saved chapter “${chapter.title}” r${chapter.revision}`,
        "finish",
      );
      await loadBook(currentBookId);
      currentChapterId = chapter.id;
      currentChapterSlug = chapter.slug;
      renderBookChapterList();
      return chapter;
    } catch (err) {
      addLog("ERROR", err.message, "eval");
      window.alert(err.message);
      return null;
    } finally {
      saving = false;
    }
  }

  async function loadArticle(id) {
    try {
      const res = await fetch(`/api/articles/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      const article = data.article;
      workspaceSection.hidden = false;
      currentDraftText = article.body_markdown;
      blocks = Array.isArray(article.blocks) ? article.blocks : [];
      isPublished = true;
      publishedBadge.hidden = false;
      editorBar.hidden = false;
      articleCanvas.classList.add("block-editor-active");
      setLibraryUi(article);
      if (article.theme) currentTheme = article.theme;
      if (article.goal) currentGoal = article.goal;
      if (article.brief) briefInput.value = article.brief;
      if (article.audience) audienceInput.value = article.audience;
      if (article.tone) toneInput.value = article.tone;
      if (article.format) formatInput.value = article.format;
      if (article.length) lengthInput.value = article.length;
      renderBlockEditor();
      historyPanel.hidden = true;
      addLog("DB", `Loaded “${article.title}” (r${article.revision})`, "system");
      workspaceSection.scrollIntoView({ behavior: "smooth" });
      await refreshArticlesList();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function loadHistory() {
    const base = currentChapterId
      ? `/api/chapters/${currentChapterId}`
      : currentArticleId
        ? `/api/articles/${currentArticleId}`
        : null;
    if (!base) return;
    try {
      const res = await fetch(`${base}/history`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "History failed");
      historyList.innerHTML = "";
      for (const rev of data.revisions || []) {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <strong>r${rev.revision}</strong>
            <div class="article-link-meta">${escapeHtml(rev.change_summary || "Revision")} · ${escapeHtml(rev.created_at)}</div>
          </div>
        `;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Restore";
        btn.addEventListener("click", () => restoreRevision(rev.revision));
        li.appendChild(btn);
        historyList.appendChild(li);
      }
      historyPanel.hidden = false;
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function restoreRevision(revision) {
    const base = currentChapterId
      ? `/api/chapters/${currentChapterId}`
      : currentArticleId
        ? `/api/articles/${currentArticleId}`
        : null;
    if (!base) return;
    try {
      const res = await fetch(`${base}/revisions/${revision}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revision load failed");
      const rev = data.revision;
      blocks = Array.isArray(rev.blocks) ? rev.blocks : [];
      currentDraftText = rev.body_markdown;
      renderBlockEditor();
      await persistArticle(`Restored from revision ${revision}`);
      addLog("DB", `Restored r${revision} as a new revision`, "finish");
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function enablePublishMode(persist = true) {
    if (!currentDraftText) {
      window.alert("No draft content available to publish.");
      return;
    }
    isPublished = true;
    publishedBadge.hidden = false;
    editorBar.hidden = false;
    articleCanvas.classList.add("block-editor-active");

    if (!blocks.length) {
      const fenceRe = /```(?:drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi;
      const fences = [];
      let m;
      while ((m = fenceRe.exec(currentDraftText)) !== null) {
        fences.push({ start: m.index, end: m.index + m[0].length, xml: m[1].trim() });
      }
      const pushProse = (chunk) => {
        chunk
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .forEach((pText) => {
            let type = "paragraph";
            if (pText.startsWith("# ")) type = "h1";
            else if (pText.startsWith("## ")) type = "h2";
            else if (pText.startsWith("### ")) type = "h3";
            else if (pText.startsWith("> ")) type = "blockquote";
            const cleanText = pText
              .replace(/^#{1,3}\s+/, "")
              .replace(/^>\s+/gm, "");
            blocks.push({ id: newId(), type, text: cleanText });
          });
      };
      if (!fences.length) {
        pushProse(currentDraftText);
      } else {
        let last = 0;
        for (const f of fences) {
          pushProse(currentDraftText.slice(last, f.start));
          blocks.push({ id: newId(), type: "drawio", text: f.xml });
          last = f.end;
        }
        pushProse(currentDraftText.slice(last));
      }
    }
    renderBlockEditor();
    if (persist) {
      const article = await persistArticle(
        currentArticleId ? "Republish with edits" : "Initial publish",
      );
      if (article) {
        addLog("PUBLISH", `Stored in SQLite · ${article.slug}`, "finish");
      }
    } else {
      addLog("PUBLISH", "Block editor active.", "finish");
    }
  }

  function updateSelectedCount() {
    if (selectedBlocksCount) {
      selectedBlocksCount.textContent = `${selectedBlockIds.size} selected`;
    }
    if (selectAllBlocks) {
      selectAllBlocks.checked =
        blocks.length > 0 && selectedBlockIds.size === blocks.length;
    }
  }

  function renderBlockEditor() {
    articleCanvas.innerHTML = "";
    blocksCount.textContent = `${blocks.length} blocks`;
    blocks = blocks.map((b) => ({ ...b, id: b.id ?? newId() }));

    blocks.forEach((block, index) => {
      const blockItem = document.createElement("div");
      blockItem.className = "block-item";
      if (selectedBlockIds.has(String(block.id))) {
        blockItem.classList.add("selected-for-revise");
      }

      const controls = document.createElement("div");
      controls.className = "block-controls";
      controls.innerHTML = `
        <label class="block-pick" title="Select for agent update">
          <input type="checkbox" class="block-select" ${selectedBlockIds.has(String(block.id)) ? "checked" : ""} />
        </label>
        <button type="button" class="block-btn edit-btn">Edit</button>
        <button type="button" class="block-btn up-btn">Up</button>
        <button type="button" class="block-btn down-btn">Down</button>
        <button type="button" class="block-btn add-btn">Add</button>
        <button type="button" class="block-btn del-btn">Delete</button>
      `;

      let contentElem;
      if (block.type === "drawio") {
        contentElem = document.createElement("div");
        contentElem.className = "block-content diagram-block";
        const encoded = "R" + encodeURIComponent(block.text || "");
        const viewer = `https://viewer.diagrams.net/?highlight=0000ff&edit=_blank&layers=1&nav=1&title=Diagram#${encoded}`;
        const editor = `https://app.diagrams.net/?splash=0&libs=general;flowchart#${encoded}`;
        contentElem.innerHTML = `
          <div class="diagram-toolbar">
            <span class="mono-stamp">draw.io block</span>
            <a class="diagram-link" href="${editor}" target="_blank" rel="noopener">Edit in draw.io</a>
          </div>
          <iframe class="diagram-frame" title="draw.io diagram" src="${viewer}" loading="lazy" referrerpolicy="no-referrer"></iframe>
          <textarea class="diagram-xml" rows="4" aria-label="draw.io XML">${escapeHtml(block.text)}</textarea>
        `;
        const ta = contentElem.querySelector(".diagram-xml");
        ta.addEventListener("input", () => {
          blocks[index].text = ta.value;
          scheduleSave();
        });
      } else if (block.type === "h1") contentElem = document.createElement("h1");
      else if (block.type === "h2") contentElem = document.createElement("h2");
      else if (block.type === "h3") contentElem = document.createElement("h3");
      else if (block.type === "blockquote")
        contentElem = document.createElement("blockquote");
      else contentElem = document.createElement("p");

      if (block.type !== "drawio") {
        contentElem.className = "block-content";
        contentElem.contentEditable = "true";
        contentElem.innerHTML = escapeHtml(block.text);
        contentElem.addEventListener("input", () => {
          blocks[index].text = contentElem.innerText;
          scheduleSave();
        });
      }

      controls.querySelector(".block-select").addEventListener("change", (e) => {
        const on = e.target.checked;
        if (on) selectedBlockIds.add(String(block.id));
        else selectedBlockIds.delete(String(block.id));
        blockItem.classList.toggle("selected-for-revise", on);
        updateSelectedCount();
      });
      controls.querySelector(".edit-btn").addEventListener("click", () =>
        contentElem.focus(),
      );
      controls.querySelector(".up-btn").addEventListener("click", () => {
        if (index > 0) {
          [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
          renderBlockEditor();
          scheduleSave();
        }
      });
      controls.querySelector(".down-btn").addEventListener("click", () => {
        if (index < blocks.length - 1) {
          [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
          renderBlockEditor();
          scheduleSave();
        }
      });
      controls
        .querySelector(".add-btn")
        .addEventListener("click", () => addNewBlockBelow(index));
      controls.querySelector(".del-btn").addEventListener("click", () => {
        selectedBlockIds.delete(String(blocks[index].id));
        blocks.splice(index, 1);
        renderBlockEditor();
        scheduleSave();
      });

      blockItem.appendChild(controls);
      blockItem.appendChild(contentElem);
      articleCanvas.appendChild(blockItem);
    });
    updateSelectedCount();
  }

  function addNewBlockBelow(index) {
    blocks.splice(index + 1, 0, {
      id: newId(),
      type: "paragraph",
      text: "Write your new paragraph content here…",
    });
    renderBlockEditor();
    scheduleSave();
  }

  function parseMarkedBlocksClient(markdown) {
    const re =
      /<!--\s*quill-block\s+id=["']([^"']+)["']\s*(?:type=["']([^"']*)["'])?\s*-->([\s\S]*?)<!--\s*\/quill-block\s*-->/gi;
    const found = [];
    let m;
    while ((m = re.exec(markdown)) !== null) {
      found.push({
        id: m[1],
        type: (m[2] || "paragraph").trim() || "paragraph",
        text: m[3].trim(),
        apply: true,
      });
    }
    return found;
  }

  function showApplyProposals(draftMarkdown) {
    pendingProposalMarkdown = draftMarkdown;
    let proposals = parseMarkedBlocksClient(draftMarkdown);
    if (!proposals.length) {
      // Fallback: map by selected order / index
      const selected = blocks.filter((b) =>
        selectedBlockIds.has(String(b.id)),
      );
      proposals = selected.map((b) => ({
        id: b.id,
        type: b.type,
        text: draftMarkdown.trim(),
        apply: true,
        wholeDraftFallback: selected.length === 1,
      }));
      if (selected.length !== 1) {
        // If many selected and no markers, offer full draft as one unit per selected
        proposals = selected.map((b) => ({
          id: b.id,
          type: b.type,
          text: `*(Agent returned an unmarked draft — review before apply)*\n\n${draftMarkdown.trim()}`,
          apply: false,
        }));
      }
    }
    pendingProposals = proposals;
    awaitingBlockApply = false;
    if (!applyPanel || !applyList) {
      renderRawDraft(draftMarkdown);
      return;
    }
    applyList.innerHTML = "";
    for (const p of pendingProposals) {
      const row = document.createElement("label");
      row.className = "apply-row";
      row.innerHTML = `
        <input type="checkbox" class="apply-check" data-id="${escapeHtml(String(p.id))}" ${p.apply ? "checked" : ""} />
        <div>
          <strong>${escapeHtml(p.type)} · ${escapeHtml(String(p.id).slice(0, 8))}</strong>
          <pre>${escapeHtml(String(p.text).slice(0, 480))}${String(p.text).length > 480 ? "…" : ""}</pre>
        </div>
      `;
      applyList.appendChild(row);
    }
    applyPanel.hidden = false;
    renderRawDraft(draftMarkdown);
    addLog(
      "APPLY",
      `${pendingProposals.length} proposed block update(s) ready — choose which to merge`,
      "finish",
    );
  }

  async function runBlockRevision() {
    const selected = blocks.filter((b) => selectedBlockIds.has(String(b.id)));
    if (!selected.length) {
      window.alert("Select one or more blocks (or use All blocks).");
      return;
    }
    const instruction =
      reviseInstruction?.value?.trim() ||
      "Improve clarity, tighten examples, and keep the same intent.";
    const label = fireBtn.querySelector("span");
    fireBtn.disabled = true;
    if (label) label.textContent = "Updating…";
    workspaceSection.hidden = false;
    streamStatus.textContent = "Block update pipeline";
    liveDot.classList.add("pulsating");
    awaitingBlockApply = true;
    addLog(
      "REVISE",
      `Updating ${selected.length} block(s): ${instruction}`,
      "system",
    );
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: instruction,
          reviseInstruction: instruction,
          mode: "revise_blocks",
          existingDraft: blocksToMarkdown(blocks),
          selectedBlocks: selected.map((b) => ({
            id: b.id,
            type: b.type,
            text: b.text,
          })),
          audience: audienceInput.value,
          tone: toneInput.value,
          format: formatInput.value,
          length: "match selected blocks",
          theme: currentTheme,
          goal: currentGoal,
          bookTitle: currentBookTitle || undefined,
          chapterTitle: bookChapters.find((c) => c.id === currentChapterId)
            ?.title,
        }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const match = line.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
          if (!match) continue;
          try {
            handlePipelineEvent(JSON.parse(match[2]));
          } catch (err) {
            console.error(err);
          }
        }
      }
    } catch (err) {
      awaitingBlockApply = false;
      addLog("ERROR", err.message, "eval");
      window.alert(err.message);
    } finally {
      fireBtn.disabled = false;
      if (label) label.textContent = "Fire agents";
    }
  }

  async function applySelectedProposals() {
    if (!pendingProposals.length) return;
    const checks = applyList?.querySelectorAll(".apply-check") || [];
    const selectedIds = [];
    const updates = [];
    checks.forEach((el) => {
      if (!el.checked) return;
      const id = el.dataset.id;
      selectedIds.push(id);
      const prop = pendingProposals.find((p) => String(p.id) === String(id));
      if (prop) updates.push({ id: prop.id, type: prop.type, text: prop.text });
    });
    if (!updates.length) {
      window.alert("Select at least one proposed update to apply.");
      return;
    }

    if (currentChapterId) {
      const res = await fetch(`/api/chapters/${currentChapterId}/apply-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          selectedIds,
          changeSummary: "Selective block update from agents",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      blocks = data.chapter.blocks;
      currentDraftText = data.chapter.body_markdown;
      setChapterUi(data.chapter);
    } else if (currentArticleId) {
      const res = await fetch(`/api/articles/${currentArticleId}/apply-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          selectedIds,
          changeSummary: "Selective block update from agents",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      blocks = data.article.blocks;
      currentDraftText = data.article.body_markdown;
      setLibraryUi(data.article);
    } else {
      // Local merge before first publish
      const byId = new Map(updates.map((u) => [String(u.id), u]));
      blocks = blocks.map((b) => {
        const u = byId.get(String(b.id));
        return u ? { ...b, type: u.type || b.type, text: u.text } : b;
      });
      currentDraftText = blocksToMarkdown(blocks);
    }

    pendingProposals = [];
    pendingProposalMarkdown = "";
    if (applyPanel) applyPanel.hidden = true;
    selectedBlockIds = new Set();
    renderBlockEditor();
    if (currentChapterId || currentArticleId) {
      await refreshArticlesList();
      if (currentBookId) await loadBook(currentBookId);
    }
    addLog("APPLY", `Merged ${updates.length} block update(s)`, "finish");
  }

  toggleReviseBtn?.addEventListener("click", () => {
    reviseModeActive = !reviseModeActive;
    if (blockReviseBar) blockReviseBar.hidden = !reviseModeActive;
    if (reviseModeActive && !selectedBlockIds.size) {
      // default: none selected — user chooses all or some
    }
  });
  selectAllBlocks?.addEventListener("change", () => {
    selectedBlockIds = new Set();
    if (selectAllBlocks.checked) {
      blocks.forEach((b) => selectedBlockIds.add(String(b.id)));
    }
    renderBlockEditor();
  });
  reviseBlocksBtn?.addEventListener("click", () => {
    runBlockRevision().catch((err) => window.alert(err.message));
  });
  applySelectAllBtn?.addEventListener("click", () => {
    applyList
      ?.querySelectorAll(".apply-check")
      .forEach((el) => {
        el.checked = true;
      });
  });
  applySelectedBtn?.addEventListener("click", () => {
    applySelectedProposals().catch((err) => window.alert(err.message));
  });
  dismissApplyBtn?.addEventListener("click", () => {
    if (applyPanel) applyPanel.hidden = true;
    pendingProposals = [];
    awaitingBlockApply = false;
  });

  function renderEvaluation(evaluation) {
    if (!evaluation?.scores) return;
    criteriaGrid.innerHTML = "";
    for (const [key, score] of Object.entries(evaluation.scores)) {
      const pass = score >= criterionThreshold;
      const card = document.createElement("div");
      card.className = "criterion-card";
      card.innerHTML = `
        <span class="crit-label">${escapeHtml(key)}</span>
        <span class="crit-score ${pass ? "pass" : "fail"}">${(score * 100).toFixed(0)}%</span>
      `;
      criteriaGrid.appendChild(card);
    }
  }

  function getLatestArticleText() {
    if (isPublished && blocks.length > 0) return blocksToMarkdown(blocks);
    return currentDraftText;
  }

  copyBtn.addEventListener("click", async () => {
    const text = getLatestArticleText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 2000);
  });

  function triggerDownload() {
    const text = getLatestArticleText();
    if (!text) {
      window.alert("Nothing to export yet.");
      return;
    }
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quill-article-${currentArticleSlug || Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadBtn.addEventListener("click", triggerDownload);
  refreshArticlesList();
  refreshBooksList();
});
