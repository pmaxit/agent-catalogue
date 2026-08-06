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
  const agentRosterGrid = document.getElementById("agent-roster-grid");
  const agentRosterMeta = document.getElementById("agent-roster-meta");
  const suggestBanner = document.getElementById("suggest-banner");
  const suggestRationale = document.getElementById("suggest-rationale");
  const suggestStatus = document.getElementById("suggest-status");
  const suggestBannerLabel = document.getElementById("suggest-banner-label");
  const suggestAcceptBtn = document.getElementById("suggest-accept-btn");
  const suggestDismissBtn = document.getElementById("suggest-dismiss-btn");
  const paramsRow = document.getElementById("params-row");
  const saveStatusEl = document.getElementById("save-status");
  const criteriaSelector = document.getElementById("criteria-selector");
  const criteriaCount = document.getElementById("criteria-count");
  const selectedThemeLabel = document.getElementById("selected-theme-label");
  const selectedAudienceLabel = document.getElementById("selected-audience-label");
  const briefReadiness = document.getElementById("brief-readiness");

  let currentGoal = "Thought Leadership & Opinion Essay";
  let currentTheme = "Agentic Command";
  let currentDraftText = "";
  let currentArticleId = null;
  let currentArticleSlug = null;
  let currentBookId = null;
  let currentBookSlug = null;
  let currentBookTitle = "";
  let currentBookSynopsis = "";
  let currentChapterId = null;
  let currentChapterSlug = null;
  let currentChapterTitle = "";
  let bookChapters = [];
  let composingChapter = false;
  let composingChapterNumber = null;
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
  const agentCards = new Map();
  let pendingSuggestion = null;
  let suggestAbort = null;
  let suggestTimer = null;
  let suggestFlashTimer = null;
  let lastDismissedSuggestKey = "";
  let userEditedBriefAfterSuggest = false;
  let suggestUndoSnapshot = null;
  let suggestMode = "idle"; // idle | loading | ready | applied
  let chapterDirty = false;
  let lastAutosaveAt = 0;
  /** Railway data API origin when local studio must not use in-memory/local SQLite. */
  let dataApiBase =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "https://writing-agent-production-b61f.up.railway.app"
      : "";

  function selectedCriteria() {
    return [...(criteriaSelector?.querySelectorAll("input:checked") || [])].map(
      (input) => input.dataset.criterion,
    );
  }

  function updateBriefReadiness() {
    const ready = [Boolean(currentTheme), Boolean(briefInput?.value.trim()), selectedCriteria().length > 0].filter(Boolean).length;
    if (briefReadiness) briefReadiness.textContent = `${ready} of 3 ready`;
    if (criteriaCount) criteriaCount.textContent = `${selectedCriteria().length} selected`;
    if (selectedThemeLabel) selectedThemeLabel.textContent = currentTheme;
    if (selectedAudienceLabel) selectedAudienceLabel.textContent = audienceInput?.value || "Audience not set";
  }

  function dataUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${dataApiBase}${p}`;
  }

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

      dataApiBase = String(config.dataApiBase || health.dataApiBase || "").replace(
        /\/$/,
        "",
      );

      const mock = Boolean(health.mock ?? config.mock);
      modeBadge.textContent = mock ? "STATUS: MOCK" : "STATUS: LIVE";
      modelBadge.textContent = `MODEL: ${(config.defaults?.model || "—").toUpperCase()}`;
      if (dataApiBase) {
        healthPill.textContent = mock
          ? "Mock · Railway DB"
          : "API · Railway DB";
        healthPill.title = `Books/chapters save to ${dataApiBase}`;
      } else {
        healthPill.textContent = mock ? "Mock mode" : "API connected";
        healthPill.title = "Same-origin SQLite (Railway volume)";
      }
      healthPill.classList.toggle("mock", mock);
      healthPill.classList.toggle("live", !mock);

      const agentCount = Array.isArray(config.agents) ? config.agents.length : 4;
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setText("kpi-agents", String(agentCount));
      setText("kpi-iters", String(config.goal?.max_iterations ?? 5));
      setText("max-iter-val", String(config.goal?.max_iterations ?? 5));

      const thresholds = (config.goal?.criteria || []).map((c) => c.threshold);
      if (thresholds.length) {
        criterionThreshold = Math.min(...thresholds);
        setText("kpi-threshold", criterionThreshold.toFixed(2));
        setText("threshold-val", `${criterionThreshold}+`);
      }

      setText("kpi-runtime", mock ? "mock" : config.defaults?.runtime || "api");
      setText(
        "kpi-runtime-delta",
        dataApiBase
          ? `Data → ${dataApiBase.replace(/^https?:\/\//, "")}`
          : mock
            ? "Local mock runner active"
            : "Cursor Cloud Agents API",
      );
    } catch (err) {
      healthPill.textContent = "Offline";
      modeBadge.textContent = "STATUS: ERROR";
      console.error(err);
    }
  }

  function resetEditorCanvas(message = "Waiting for draft") {
    currentDraftText = "";
    blocks = [];
    selectedBlockIds = new Set();
    pendingProposals = [];
    pendingProposalMarkdown = "";
    awaitingBlockApply = false;
    isPublished = false;
    chapterDirty = false;
    publishedBadge.hidden = true;
    editorBar.hidden = true;
    if (blockReviseBar) blockReviseBar.hidden = true;
    if (applyPanel) applyPanel.hidden = true;
    if (articleMeta) articleMeta.textContent = "";
    articleCanvas.classList.remove("block-editor-active");
    articleCanvas.innerHTML = `<div class="placeholder-notice empty-state"><h3>${escapeHtml(message)}</h3><p>Fire agents after setting the brief, theme, and length.</p></div>`;
    setSaveStatus("");
    updateDocumentActions();
  }

  function startNewArticle() {
    currentArticleId = null;
    currentArticleSlug = null;
    currentChapterId = null;
    currentChapterSlug = null;
    currentChapterTitle = "";
    composingChapter = false;
    composingChapterNumber = null;
    // Leave book rail open, but write standalone articles unless user starts a chapter
    briefInput.value = "";
    resetEditorCanvas();
    setActivity("compose");
    wizardSection.scrollIntoView({ behavior: "smooth" });
    briefInput.focus();
    updateDocumentActions();
  }

  function closeNewMenu() {
    if (!newMenuPop || !newMenuBtn) return;
    newMenuPop.hidden = true;
    newMenuBtn.setAttribute("aria-expanded", "false");
  }

  function isMacStudio() {
    return Boolean(document.querySelector(".mac-app, .mac-window"));
  }

  function setActivity(name) {
    document.querySelectorAll(".rail-btn[data-activity]").forEach((btn) => {
      const on = btn.dataset.activity === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    // macOS shell keeps the library source list always visible
    if (!isMacStudio()) {
      document.querySelectorAll(".drawer-panel").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== name;
      });
    }
    if (name === "compose") {
      window.setQuillCenterTab?.("brief");
      wizardSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (name === "run") {
      window.setQuillCenterTab?.("pipeline");
      if (workspaceSection) workspaceSection.hidden = false;
      workspaceSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setLibraryTab(tab) {
    libraryTabs?.querySelectorAll(".library-tab").forEach((btn) => {
      const on = btn.dataset.libTab === tab;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".library-pane").forEach((pane) => {
      const on = pane.dataset.libPane === tab;
      pane.hidden = !on;
      pane.style.display = on ? "" : "none";
    });
    // Book chapter rail is retired in macOS outline sidebar
    if (bookRail) bookRail.hidden = true;
    if (tab === "articles") void refreshArticlesList();
  }

  function toggleConsole() {
    if (!consolePanel) return;
    consolePanel.hidden = !consolePanel.hidden;
    if (workspaceGrid) {
      workspaceGrid.style.gridTemplateColumns = consolePanel.hidden
        ? "1fr"
        : "420px 1fr";
    }
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

      const res = await fetch(dataUrl("/api/books"), {
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
    composingChapterNumber = n;
    currentChapterTitle = `Chapter ${n}`;
    briefInput.value = `Write chapter ${n} of “${currentBookTitle}”. Cover the next practical topic a reader needs after the previous chapters.`;
    lengthInput.value = "4000–5500 words (full book chapter)";
    userEditedBriefAfterSuggest = false;
    resetEditorCanvas(`Chapter ${n} draft`);
    if (articleMeta) {
      articleMeta.textContent = `New chapter · ${currentBookTitle}`;
    }
    wizardSection.scrollIntoView({ behavior: "smooth" });
    briefInput.focus();
    addLog("BOOK", `Composing chapter ${n} for “${currentBookTitle}”`, "system");
    updateDocumentActions();
    scheduleBriefSuggestions({ reason: "new-chapter" });
  }

  // ——— Simplified sidepanel with edit capability ———
  let editingBookId = null;

  async function saveBookEdit(bookId, newTitle, newSynopsis) {
    if (!newTitle.trim()) {
      window.alert("Title is required");
      return;
    }
    try {
      const res = await fetch(dataUrl(`/api/books/${bookId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          synopsis: newSynopsis.trim(),
          overviewMarkdown: newSynopsis.trim()
            ? `# ${newTitle.trim()}\n\n${newSynopsis.trim()}`
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save book");
      editingBookId = null;
      if (bookId === currentBookId) {
        currentBookTitle = data.book.title;
        currentBookSynopsis = data.book.synopsis || "";
        if (bookRailTitle) bookRailTitle.textContent = data.book.title;
      }
      addLog("BOOK", `Updated “${data.book.title}”`, "finish");
      await refreshBooksList();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function renderBookEditForm(container, book) {
    container.innerHTML = "";
    const form = document.createElement("div");
    form.className = "book-edit-form";
    form.innerHTML = `
      <input class="book-edit-title" type="text" value="${escapeHtml(book.title)}" placeholder="Book title" />
      <textarea class="book-edit-synopsis" rows="2" placeholder="Synopsis (optional)">${escapeHtml(book.synopsis || "")}</textarea>
      <div class="book-edit-actions">
        <button type="button" class="btn btn-primary sm btn-save">Save</button>
        <button type="button" class="btn btn-ghost sm btn-cancel">Cancel</button>
      </div>
    `;
    const titleInput = form.querySelector(".book-edit-title");
    const synInput = form.querySelector(".book-edit-synopsis");
    form.querySelector(".btn-save").addEventListener("click", () => {
      saveBookEdit(book.id, titleInput.value, synInput.value);
    });
    form.querySelector(".btn-cancel").addEventListener("click", () => {
      editingBookId = null;
      refreshBooksList();
    });
    container.appendChild(form);
    titleInput.focus();
    titleInput.select();
  }

  async function refreshBooksList() {
    if (!booksList) return;
    try {
      const res = await fetch(dataUrl("/api/books"));
      if (!res.ok) throw new Error("Failed to list books");
      const data = await res.json();
      const books = data.books || [];
      if (!books.length) {
        booksList.innerHTML = `<div class="empty-books"><p class="side-hint">No books yet</p><button type="button" class="btn btn-primary sm" id="empty-new-book">New Book</button></div>`;
        document.getElementById("empty-new-book")?.addEventListener("click", createBookFlow);
        return;
      }
      booksList.innerHTML = "";
      for (const b of books) {
        const wrap = document.createElement("div");
        const selected = b.id === currentBookId;
        wrap.className = `book-simple-item${selected ? " active" : ""}${selected ? " expanded" : ""}`;
        wrap.dataset.bookId = b.id;

        if (editingBookId === b.id) {
          const editContainer = document.createElement("div");
          editContainer.className = "book-simple-row editing";
          renderBookEditForm(editContainer, b);
          wrap.appendChild(editContainer);
          booksList.appendChild(wrap);
          continue;
        }

        const row = document.createElement("div");
        row.className = `book-simple-row${selected ? " active" : ""}`;

        const disc = document.createElement("button");
        disc.type = "button";
        disc.className = `book-disc${selected ? " open" : ""}`;
        disc.setAttribute("aria-label", selected ? "Collapse chapters" : "Expand chapters");
        disc.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M3.2 1.5l4 3.5-4 3.5z"/></svg>`;
        disc.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selected) {
            // collapse: deselect book context but keep list
            wrap.classList.toggle("expanded");
            disc.classList.toggle("open");
            const ch = wrap.querySelector(".book-simple-chapters");
            if (ch) ch.hidden = !wrap.classList.contains("expanded");
          } else {
            loadBook(b.id).catch((err) => window.alert(err.message));
          }
        });

        const main = document.createElement("button");
        main.type = "button";
        main.className = "book-simple-main";
        main.title = b.synopsis || b.title;
        main.innerHTML = `
          <span class="book-simple-title">${escapeHtml(b.title)}</span>
          <span class="book-simple-count">${b.chapterCount || 0}</span>
        `;
        main.addEventListener("click", () => {
          loadBook(b.id).catch((err) => window.alert(err.message));
        });

        const actions = document.createElement("div");
        actions.className = "book-simple-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "book-action-btn edit";
        editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-7 7H4.5v-2l7-7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        editBtn.title = "Rename";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          editingBookId = b.id;
          refreshBooksList();
        });

        const ext = document.createElement("a");
        ext.className = "book-action-btn open";
        ext.href = b.url || `/books/${b.slug}`;
        ext.target = "_blank";
        ext.rel = "noopener";
        ext.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10M9 2h5v5M7 9l7-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        ext.title = "Open public page";

        actions.appendChild(editBtn);
        actions.appendChild(ext);
        row.appendChild(disc);
        row.appendChild(main);
        row.appendChild(actions);
        wrap.appendChild(row);

        if (selected) {
          const ul = document.createElement("ul");
          ul.className = "book-simple-chapters";
          if (bookChapters.length) {
            bookChapters.forEach((c, i) => {
              const li = document.createElement("li");
              li.className = c.id === currentChapterId ? "active" : "";
              const btn = document.createElement("button");
              btn.type = "button";
              btn.innerHTML = `<span class="ch-num">${i + 1}</span><span class="ch-title">${escapeHtml(c.title)}</span>`;
              btn.addEventListener("click", () => {
                loadChapter(c.id).catch((err) => window.alert(err.message));
              });
              li.appendChild(btn);
              ul.appendChild(li);
            });
          } else {
            const empty = document.createElement("li");
            empty.className = "chapter-empty";
            empty.textContent = "No chapters yet";
            ul.appendChild(empty);
          }
          const addLi = document.createElement("li");
          addLi.className = "chapter-add";
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.innerHTML = `<span class="ch-num">+</span><span class="ch-title">New Chapter</span>`;
          addBtn.addEventListener("click", () => startNewChapter());
          addLi.appendChild(addBtn);
          ul.appendChild(addLi);
          wrap.appendChild(ul);
        }
        booksList.appendChild(wrap);
      }
    } catch (err) {
      booksList.innerHTML = `<p class="side-hint">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadBook(id) {
    const res = await fetch(dataUrl(`/api/books/${id}`));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Load book failed");
    const book = data.book;
    currentBookId = book.id;
    currentBookSlug = book.slug;
    currentBookTitle = book.title;
    currentBookSynopsis = book.synopsis || "";
    bookChapters = book.chapters || [];
    if (menuNewChapter) menuNewChapter.hidden = false;
    // macOS sidebar uses outline chapters under the book row — keep legacy rail hidden
    if (bookRail) bookRail.hidden = true;
    if (bookRailTitle) bookRailTitle.textContent = book.title;
    if (bookRailMeta) {
      bookRailMeta.textContent = `${bookChapters.length} chapter${bookChapters.length === 1 ? "" : "s"}`;
    }
    setActivity("library");
    setLibraryTab("books");
    if (bookPublicLink) {
      bookPublicLink.href = `/books/${book.slug}`;
      bookPublicLink.textContent = "Open";
    }
    renderBookChapterList();
    if (book.theme) currentTheme = book.theme;
    if (book.goal) currentGoal = book.goal;
    await refreshBooksList();
    const crumbBook = document.getElementById("crumb-book");
    const crumbChapter = document.getElementById("crumb-chapter");
    if (crumbBook) crumbBook.textContent = book.title;
    if (crumbChapter) crumbChapter.textContent = "Select a chapter";
    addLog("BOOK", `Opened “${book.title}”`, "system");
    scheduleBriefSuggestions({ reason: "book" });
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
    const res = await fetch(dataUrl(`/api/chapters/${id}`));
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
    currentChapterTitle = chapter.title || "";
    composingChapter = false;
    composingChapterNumber = chapter.sort_order ?? null;
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
    userEditedBriefAfterSuggest = false;
    renderBlockEditor();
    renderBookChapterList();
    await refreshBooksList();
    setActivity("library");
    const crumbBook = document.getElementById("crumb-book");
    const crumbChapter = document.getElementById("crumb-chapter");
    if (crumbBook) crumbBook.textContent = currentBookTitle || "Library";
    if (crumbChapter) crumbChapter.textContent = chapter.title || "Chapter";
    window.setQuillCenterTab?.("brief");
    addLog("BOOK", `Loaded chapter “${chapter.title}”`, "system");
    // Don't overwrite a saved chapter brief — only suggest when empty/placeholder
    if (!chapter.brief || isPlaceholderBrief(chapter.brief)) {
      scheduleBriefSuggestions({ reason: "chapter" });
    } else {
      hideSuggestBanner();
    }
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
    updateBriefReadiness();
  });

  criteriaSelector?.addEventListener("change", () => {
    const inputs = [...criteriaSelector.querySelectorAll("input")];
    if (!selectedCriteria().length) {
      const changed = inputs.find((input) => input === document.activeElement);
      if (changed) changed.checked = true;
      return;
    }
    updateBriefReadiness();
  });

  briefInput?.addEventListener("input", updateBriefReadiness);
  audienceInput?.addEventListener("input", updateBriefReadiness);

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
    updateBriefReadiness();
  });

  updateBriefReadiness();

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

  function updateAgentRosterMeta() {
    if (!agentRosterMeta) return;
    const statuses = [...agentCards.values()].map((card) => card.status);
    if (!statuses.length) {
      agentRosterMeta.textContent = "Idle";
      return;
    }
    const active = statuses.filter((status) =>
      ["queued", "running", "streaming"].includes(status),
    ).length;
    const failed = statuses.filter((status) => status === "error").length;
    const completed = statuses.filter((status) => status === "done").length;
    agentRosterMeta.textContent = failed
      ? `${failed} error${failed === 1 ? "" : "s"}`
      : active
        ? `${active} active`
        : `${completed}/${statuses.length} done`;
  }

  function renderAgentRoster(agents) {
    if (!agentRosterGrid) return;
    agentCards.clear();
    agentRosterGrid.innerHTML = "";
    for (const agent of agents) {
      const key = `${agent.nodeId}:${agent.agentId}`;
      const card = document.createElement("article");
      card.className = "agent-card";
      card.dataset.status = "idle";
      const name = document.createElement("strong");
      name.className = "agent-card-name";
      name.textContent = agent.agentName;
      const role = document.createElement("span");
      role.className = "agent-card-role";
      role.textContent = agent.role;
      const status = document.createElement("span");
      status.className = "agent-card-status";
      status.textContent = "Idle";
      const detail = document.createElement("span");
      detail.className = "agent-card-detail";
      detail.textContent = "Waiting for turn";
      card.append(name, role, status, detail);
      agentRosterGrid.appendChild(card);
      agentCards.set(key, { card, status: "idle", statusLabel: status, detail });
    }
    updateAgentRosterMeta();
  }

  function updateAgentStatus(event) {
    const key = `${event.nodeId}:${event.agentId}`;
    const entry = agentCards.get(key);
    if (!entry) return;
    entry.status = event.status;
    entry.card.dataset.status = event.status;
    entry.statusLabel.textContent = event.status;
    entry.detail.textContent = event.detail || "";
    updateAgentRosterMeta();
  }

  agentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const brief = briefInput.value.trim();
    if (!brief) {
      briefInput.focus();
      window.setQuillCenterTab?.("brief");
      return;
    }

    window.setQuillCenterTab?.("pipeline");
    if (workspaceSection) workspaceSection.hidden = false;
    workspaceSection?.scrollIntoView({ behavior: "smooth" });

    if (currentBookId) ensureComposingChapter();

    fireBtn.disabled = true;
    const label = fireBtn.querySelector("span");
    if (label) label.textContent = "Agents running…";
    streamBox.innerHTML = "";
    if (agentRosterGrid) {
      agentRosterGrid.innerHTML =
        `<p class="side-hint">Loading the live agent roster…</p>`;
    }
    agentCards.clear();
    if (agentRosterMeta) agentRosterMeta.textContent = "Starting";
    articleCanvas.innerHTML = `<div class="placeholder-notice empty-state"><h3>Pipeline started</h3><p>Planner is shaping the strategy for this brief…</p></div>`;
    criteriaGrid.innerHTML = "";
    iterationBadge.textContent = "Loop: 1";
    publishedBadge.hidden = true;
    editorBar.hidden = true;
    isPublished = false;
    // Keep chapter identity when regenerating a chapter in a book
    if (!isBookChapterContext()) {
      currentArticleId = null;
      currentArticleSlug = null;
    }
    blocks = [];
    chapterDirty = false;
    setSaveStatus(isBookChapterContext() ? "Drafting…" : "");
    if (articleMeta) articleMeta.textContent = "";
    if (historyPanel) historyPanel.hidden = true;
    articleCanvas.classList.remove("block-editor-active");
    streamStatus.textContent = "Pipeline active";
    liveDot.classList.add("pulsating");
    liveDot.style.backgroundColor = "";
    updateDocumentActions();

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
          judgingCriteria: selectedCriteria(),
          bookTitle: currentBookTitle || undefined,
          chapterTitle:
            currentChapterTitle ||
            bookChapters.find((c) => c.id === currentChapterId)?.title ||
            undefined,
          chapterNumber: currentBookId
            ? composingChapterNumber ||
              (bookChapters.findIndex((c) => c.id === currentChapterId) >= 0
                ? bookChapters.findIndex((c) => c.id === currentChapterId) + 1
                : bookChapters.length + 1)
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
      updateDocumentActions();
    }
  });

  function handlePipelineEvent(event) {
    switch (event.type) {
      case "pipeline_started":
        addLog("PIPELINE", `Workflow "${event.workflow}" started`, "system");
        break;
      case "agents_roster":
        renderAgentRoster(event.agents);
        break;
      case "agent_status":
        updateAgentStatus(event);
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
            updateDocumentActions();
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
          chapterDirty = true;
          if (awaitingBlockApply) {
            showApplyProposals(event.draft);
          } else {
            renderRawDraft(event.draft);
          }
        }
        updateDocumentActions();
        if (
          isBookChapterContext() &&
          currentDraftText?.trim() &&
          !awaitingBlockApply &&
          (event.status === "completed" || event.status === "max_iterations")
        ) {
          addLog(
            "BOOK",
            "Chapter draft ready — autosaving into the book…",
            "finish",
          );
          void autosaveChapterDraft("Autosave after pipeline").then((saved) => {
            if (saved) {
              addLog(
                "BOOK",
                `Autosaved “${saved.title}” · r${saved.revision}`,
                "finish",
              );
            }
          });
        }
        break;
      default:
        break;
    }
  }

  function themeNotebookClass(theme) {
    const t = String(theme || "").toLowerCase();
    if (t.includes("o'reilly") || t.includes("oreilly") || t.includes("book chapter")) {
      return "qmd-theme-oreilly";
    }
    if (t.includes("technical") || t.includes("trace")) return "qmd-theme-technical";
    if (t.includes("editorial")) return "qmd-theme-editorial";
    if (t.includes("narrative")) return "qmd-theme-narrative";
    if (t.includes("executive")) return "qmd-theme-executive";
    if (t.includes("agentic")) return "qmd-theme-agentic";
    return "qmd-theme-default";
  }

  function draftDisplayTitle() {
    if (currentChapterTitle) return currentChapterTitle;
    if (composingChapter && composingChapterNumber) {
      return `Chapter ${composingChapterNumber}`;
    }
    if (currentBookTitle) return currentBookTitle;
    const h1 = String(currentDraftText || "").match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
    return "Untitled draft";
  }

  function inlineFormatHtml(escaped) {
    return escaped
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>");
  }

  function splitTableRow(line) {
    let row = line.trim();
    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|")) row = row.slice(0, -1);
    return row.split("|").map((c) => c.trim());
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return (
      cells.length > 0 &&
      cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))
    );
  }

  function isTableRow(line) {
    const t = line.trim();
    return t.includes("|") && !t.startsWith("```");
  }

  function markdownTableToHtml(tableMarkdown) {
    const lines = tableMarkdown
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim());
    if (lines.length < 2) {
      return `<p>${inlineFormatHtml(escapeHtml(tableMarkdown))}</p>`;
    }
    const header = splitTableRow(lines[0]);
    let bodyLines = lines.slice(1);
    if (bodyLines[0] && isTableSeparator(bodyLines[0])) {
      bodyLines = bodyLines.slice(1);
    }
    const thead = `<thead><tr>${header
      .map((c) => `<th>${inlineFormatHtml(escapeHtml(c))}</th>`)
      .join("")}</tr></thead>`;
    const tbody = `<tbody>${bodyLines
      .map((line) => {
        const cells = splitTableRow(line);
        while (cells.length < header.length) cells.push("");
        return `<tr>${cells
          .slice(0, Math.max(header.length, cells.length))
          .map((c) => `<td>${inlineFormatHtml(escapeHtml(c))}</td>`)
          .join("")}</tr>`;
      })
      .join("")}</tbody>`;
    return `<div class="qmd-table-wrap"><table class="qmd-table">${thead}${tbody}</table></div>`;
  }

  function renderCodeBlockHtml(lang, code) {
    const language = String(lang || "").trim();
    const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
    const label = language
      ? `<div class="qmd-code-label">${escapeHtml(language)}</div>`
      : "";
    return `<div class="qmd-code">${label}<pre><code${cls}>${escapeHtml(String(code).replace(/\n$/, ""))}</code></pre></div>`;
  }

  /** Studio draft markdown → HTML (code fences, tables, lists, callouts). */
  function markdownToPreviewHtml(markdown) {
    let text = String(markdown || "").replace(/\r\n/g, "\n");
    const placeholders = [];
    const hold = (html) => {
      placeholders.push(html);
      return `\n\n%%HOLD_${placeholders.length - 1}%%\n\n`;
    };

    text = text.replace(
      /```(?:drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi,
      (_m, xml) => {
        const encoded = "R" + encodeURIComponent(String(xml).trim());
        const viewer = `https://viewer.diagrams.net/?highlight=0000ff&edit=_blank&layers=1&nav=1&title=Diagram#${encoded}`;
        const editor = `https://app.diagrams.net/?splash=0&libs=general;flowchart#${encoded}`;
        return hold(`<figure class="diagram-figure" data-diagram="drawio">
          <div class="diagram-toolbar">
            <span class="mono-stamp">draw.io</span>
            <a class="diagram-link" href="${editor}" target="_blank" rel="noopener">Open in draw.io</a>
          </div>
          <iframe class="diagram-frame" title="draw.io diagram" src="${viewer}" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </figure>`);
      },
    );

    text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      hold(renderCodeBlockHtml(lang, code)),
    );

    const lines = text.split("\n");
    const outLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        isTableRow(line) &&
        i + 1 < lines.length &&
        (isTableSeparator(lines[i + 1]) || isTableRow(lines[i + 1]))
      ) {
        const tableLines = [line];
        i += 1;
        while (i < lines.length && isTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i += 1;
        }
        i -= 1;
        outLines.push(hold(markdownTableToHtml(tableLines.join("\n"))));
      } else {
        outLines.push(line);
      }
    }
    text = outLines.join("\n");

    const chunks = text.split(/\n{2,}/);
    const htmlParts = [];
    for (const rawChunk of chunks) {
      const chunk = rawChunk.trim();
      if (!chunk) continue;
      const holdOnly = chunk.match(/^%%HOLD_(\d+)%%$/);
      if (holdOnly) {
        htmlParts.push(placeholders[Number(holdOnly[1])] || "");
        continue;
      }
      if (/%%HOLD_\d+%%/.test(chunk)) {
        htmlParts.push(
          chunk.replace(
            /%%HOLD_(\d+)%%/g,
            (_m, idx) => placeholders[Number(idx)] || "",
          ),
        );
        continue;
      }

      const chunkLines = chunk.split("\n");
      if (/^### /.test(chunk)) {
        htmlParts.push(
          `<h3>${inlineFormatHtml(escapeHtml(chunk.replace(/^### /, "")))}</h3>`,
        );
        continue;
      }
      if (/^## /.test(chunk)) {
        htmlParts.push(
          `<h2>${inlineFormatHtml(escapeHtml(chunk.replace(/^## /, "")))}</h2>`,
        );
        continue;
      }
      if (/^# /.test(chunk)) {
        htmlParts.push(
          `<h1>${inlineFormatHtml(escapeHtml(chunk.replace(/^# /, "")))}</h1>`,
        );
        continue;
      }

      if (chunkLines.every((l) => /^>\s?/.test(l) || l.trim() === "")) {
        const body = chunkLines
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        const note = body.match(/^\*\*(Note|Tip|Warning):\*\*\s*([\s\S]*)$/i);
        if (note) {
          htmlParts.push(
            `<aside class="qmd-callout qmd-callout-${note[1].toLowerCase()}"><strong>${escapeHtml(note[1])}</strong><p>${inlineFormatHtml(escapeHtml(note[2].trim()))}</p></aside>`,
          );
        } else {
          htmlParts.push(
            `<blockquote>${body
              .split("\n")
              .map((l) => `<p>${inlineFormatHtml(escapeHtml(l))}</p>`)
              .join("")}</blockquote>`,
          );
        }
        continue;
      }

      if (chunkLines.filter((l) => l.trim()).every((l) => /^[-*]\s+/.test(l))) {
        htmlParts.push(
          `<ul>${chunkLines
            .filter((l) => l.trim())
            .map(
              (l) =>
                `<li>${inlineFormatHtml(escapeHtml(l.replace(/^[-*]\s+/, "")))}</li>`,
            )
            .join("")}</ul>`,
        );
        continue;
      }

      if (
        chunkLines.filter((l) => l.trim()).every((l) => /^\d+\.\s+/.test(l))
      ) {
        htmlParts.push(
          `<ol>${chunkLines
            .filter((l) => l.trim())
            .map(
              (l) =>
                `<li>${inlineFormatHtml(escapeHtml(l.replace(/^\d+\.\s+/, "")))}</li>`,
            )
            .join("")}</ol>`,
        );
        continue;
      }

      htmlParts.push(
        `<p>${inlineFormatHtml(escapeHtml(chunk)).replace(/\n/g, "<br />")}</p>`,
      );
    }
    return htmlParts.join("\n");
  }

  function renderRawDraft(text) {
    const bodyHtml = markdownToPreviewHtml(text);
    const title = draftDisplayTitle();
    const subtitle =
      currentBookTitle && currentBookTitle !== title ? currentBookTitle : "";
    const themeClass = themeNotebookClass(currentTheme);
    articleCanvas.innerHTML = `<article class="qmd-notebook ${themeClass}" data-theme="${escapeHtml(currentTheme)}">
      <header class="qmd-notebook-chrome">
        <div class="qmd-chrome-row">
          <span class="mono-stamp">Quarto notebook · .qmd</span>
          <span class="qmd-theme-label">${escapeHtml(currentTheme)}</span>
        </div>
        <h1 class="qmd-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="qmd-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        <div class="qmd-yaml-chips">
          <span class="qmd-chip">${escapeHtml(formatInput.value || "html")}</span>
          <span class="qmd-chip">${escapeHtml(lengthInput.value || "")}</span>
        </div>
      </header>
      <div class="qmd-body">${bodyHtml}</div>
    </article>`;
  }

  publishBtn.addEventListener("click", () => enablePublishMode(true));
  saveBtn?.addEventListener("click", () => {
    void persistArticle(
      isBookChapterContext() ? "Save chapter" : "Manual save",
    );
  });
  historyBtn?.addEventListener("click", loadHistory);
  closeHistoryBtn?.addEventListener("click", () => {
    historyPanel.hidden = true;
  });
  addBlockBtn.addEventListener("click", () => addNewBlockBelow(blocks.length - 1));

  function isBookChapterContext() {
    return Boolean(
      currentBookId && (composingChapter || currentChapterId),
    );
  }

  function ensureComposingChapter() {
    if (!currentBookId) return;
    if (currentChapterId) return;
    if (!composingChapter) {
      composingChapter = true;
      composingChapterNumber = bookChapters.length + 1;
      if (!currentChapterTitle) {
        currentChapterTitle = `Chapter ${composingChapterNumber}`;
      }
    }
  }

  function setSaveStatus(text) {
    if (saveStatusEl) saveStatusEl.textContent = text || "";
  }

  function canPersistDocument() {
    const hasBody = Boolean(
      (blocks.length && blocksToMarkdown(blocks).trim()) ||
        currentDraftText?.trim(),
    );
    if (!hasBody) return false;
    if (isBookChapterContext()) return true;
    if (currentArticleId) return true;
    return Boolean(currentDraftText?.trim() || blocks.length);
  }

  function updateDocumentActions() {
    const isChapterCtx = isBookChapterContext();
    const hasDraft = Boolean(currentDraftText?.trim() || blocks.length);
    if (publishBtn) {
      if (isChapterCtx) {
        publishBtn.textContent = "Edit blocks";
        publishBtn.title =
          "Save the chapter (if needed) and open the block editor";
      } else {
        publishBtn.textContent = currentArticleId ? "Publish update" : "Publish";
        publishBtn.title =
          "Publish to the article library and open the block editor";
      }
      publishBtn.disabled = !hasDraft;
      publishBtn.hidden = false;
    }
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.textContent = isChapterCtx ? "Save chapter" : "Save";
      saveBtn.title = isChapterCtx
        ? "Save this draft into the open book"
        : "Save article draft";
      saveBtn.disabled = !canPersistDocument();
    }
    if (historyBtn) {
      historyBtn.hidden = !(currentChapterId || currentArticleId);
    }
  }

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
        if (b.type === "code") {
          const nl = text.indexOf("\n");
          const lang = nl >= 0 ? text.slice(0, nl) : "";
          const body = nl >= 0 ? text.slice(nl + 1) : text;
          return "```" + lang + "\n" + body + "\n```";
        }
        if (b.type === "table") return text;
        return text;
      })
      .join("\n\n");
  }

  function scheduleSave(summary = "Autosave") {
    if (!canPersistDocument()) return;
    if (isBookChapterContext()) ensureComposingChapter();
    if (!currentArticleId && !currentChapterId && !composingChapter) return;
    chapterDirty = true;
    setSaveStatus("Unsaved changes…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void persistArticle(summary);
    }, 900);
  }

  async function autosaveChapterDraft(reason = "Autosave chapter draft") {
    if (!isBookChapterContext()) return null;
    if (!currentDraftText?.trim() && !blocks.length) return null;
    ensureComposingChapter();
    return persistArticle(reason);
  }

  function setLibraryUi(article) {
    currentArticleId = article.id;
    currentArticleSlug = article.slug;
    currentChapterId = null;
    currentChapterSlug = null;
    composingChapter = false;
    if (articleMeta) {
      const url = `/articles/${article.slug}`;
      articleMeta.innerHTML = `<a href="${url}" target="_blank" rel="noopener">/${escapeHtml(article.slug)}</a> · r${article.revision}`;
    }
    updateDocumentActions();
  }

  function setChapterUi(chapter) {
    currentChapterId = chapter.id;
    currentChapterSlug = chapter.slug;
    currentArticleId = null;
    currentArticleSlug = null;
    composingChapter = false;
    if (articleMeta) {
      articleMeta.innerHTML = `<a href="${escapeHtml(chapter.url)}" target="_blank" rel="noopener">${escapeHtml(chapter.url)}</a> · r${chapter.revision}`;
    }
    publishedBadge.hidden = false;
    publishedBadge.textContent = "Chapter · saved";
    updateDocumentActions();
  }

  async function refreshArticlesList() {
    if (!articlesList) return;
    try {
      const res = await fetch(dataUrl("/api/articles"));
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
      if (!String(changeSummary).toLowerCase().includes("autosave")) {
        window.alert("Nothing to publish yet.");
      }
      return null;
    }

    if (isBookChapterContext()) {
      ensureComposingChapter();
      return persistChapter(changeSummary, bodyMarkdown);
    }

    saving = true;
    setSaveStatus("Saving…");
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
          ? dataUrl(`/api/articles/${currentArticleId}`)
          : dataUrl("/api/articles"),
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
      chapterDirty = false;
      setSaveStatus(`Saved · r${article.revision}`);
      addLog(
        "DB",
        `Saved “${article.title}” as revision ${article.revision}`,
        "finish",
      );
      await refreshArticlesList();
      updateDocumentActions();
      return article;
    } catch (err) {
      setSaveStatus("Save failed");
      addLog("ERROR", err.message, "eval");
      if (!String(changeSummary).toLowerCase().includes("autosave")) {
        window.alert(err.message);
      }
      return null;
    } finally {
      saving = false;
    }
  }

  async function persistChapter(changeSummary, bodyMarkdown) {
    saving = true;
    setSaveStatus("Saving chapter…");
    try {
      const inferredTitle =
        bodyMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
        currentChapterTitle ||
        `Chapter ${composingChapterNumber || bookChapters.length + 1}`;
      const payload = {
        id: currentChapterId || undefined,
        bookId: currentBookId,
        title: inferredTitle,
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
          ? dataUrl(`/api/chapters/${currentChapterId}`)
          : dataUrl("/api/chapters"),
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
      currentChapterTitle = chapter.title || currentChapterTitle;
      if (Array.isArray(chapter.blocks) && chapter.blocks.length) {
        blocks = chapter.blocks;
      }
      chapterDirty = false;
      lastAutosaveAt = Date.now();
      setSaveStatus(`Saved · r${chapter.revision}`);
      addLog(
        "BOOK",
        `Saved chapter “${chapter.title}” r${chapter.revision}`,
        "finish",
      );
      // Refresh chapter list without re-triggering AI suggestions
      await refreshBookChaptersQuiet();
      currentChapterId = chapter.id;
      currentChapterSlug = chapter.slug;
      renderBookChapterList();
      updateDocumentActions();
      return chapter;
    } catch (err) {
      setSaveStatus("Save failed");
      addLog("ERROR", err.message, "eval");
      if (!String(changeSummary).toLowerCase().includes("autosave")) {
        window.alert(err.message);
      }
      return null;
    } finally {
      saving = false;
    }
  }

  async function refreshBookChaptersQuiet() {
    if (!currentBookId) return;
    try {
      const res = await fetch(dataUrl(`/api/books/${currentBookId}`));
      const data = await res.json();
      if (!res.ok) return;
      bookChapters = data.book?.chapters || [];
      if (bookRailMeta) {
        bookRailMeta.textContent = `${bookChapters.length} chapter${bookChapters.length === 1 ? "" : "s"} · expand in Library rail`;
      }
      await refreshBooksList();
    } catch {
      /* ignore */
    }
  }

  async function loadArticle(id) {
    try {
      const res = await fetch(dataUrl(`/api/articles/${id}`));
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
      ? dataUrl(`/api/chapters/${currentChapterId}`)
      : currentArticleId
        ? dataUrl(`/api/articles/${currentArticleId}`)
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
      ? dataUrl(`/api/chapters/${currentChapterId}`)
      : currentArticleId
        ? dataUrl(`/api/articles/${currentArticleId}`)
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
      // Prefer server-parity parse via markdown patterns (code + tables + drawio)
      const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
      const fences = [];
      let m;
      while ((m = fenceRe.exec(currentDraftText)) !== null) {
        fences.push({
          start: m.index,
          end: m.index + m[0].length,
          lang: (m[1] || "").trim(),
          body: m[2].replace(/\n$/, ""),
        });
      }
      const pushProse = (chunk) => {
        if (!chunk?.trim()) return;
        // Reuse preview splitter for tables by converting through simple heuristics
        const parts = [];
        const lines = chunk.replace(/\r\n/g, "\n").split("\n");
        let i = 0;
        let buf = [];
        const flush = () => {
          const pText = buf.join("\n").trim();
          buf = [];
          if (!pText) return;
          parts.push(pText);
        };
        while (i < lines.length) {
          const line = lines[i];
          if (
            isTableRow(line) &&
            i + 1 < lines.length &&
            (isTableSeparator(lines[i + 1]) || isTableRow(lines[i + 1]))
          ) {
            flush();
            const tableLines = [line];
            i += 1;
            while (i < lines.length && isTableRow(lines[i])) {
              tableLines.push(lines[i]);
              i += 1;
            }
            blocks.push({
              id: newId(),
              type: "table",
              text: tableLines.join("\n"),
            });
            continue;
          }
          if (line.trim() === "") {
            flush();
            i += 1;
            continue;
          }
          buf.push(line);
          i += 1;
        }
        flush();
        for (const pText of parts) {
          let type = "paragraph";
          let cleanText = pText;
          if (pText.startsWith("# ")) {
            type = "h1";
            cleanText = pText.replace(/^#\s+/, "");
          } else if (pText.startsWith("## ")) {
            type = "h2";
            cleanText = pText.replace(/^##\s+/, "");
          } else if (pText.startsWith("### ")) {
            type = "h3";
            cleanText = pText.replace(/^###\s+/, "");
          } else if (pText.startsWith("> ")) {
            type = "blockquote";
            cleanText = pText.replace(/^>\s+/gm, "");
          }
          blocks.push({ id: newId(), type, text: cleanText });
        }
      };
      if (!fences.length) {
        pushProse(currentDraftText);
      } else {
        let last = 0;
        for (const f of fences) {
          pushProse(currentDraftText.slice(last, f.start));
          const langLower = f.lang.toLowerCase();
          if (
            langLower === "drawio" ||
            langLower === "diagrams.net" ||
            langLower === "mxfile"
          ) {
            blocks.push({ id: newId(), type: "drawio", text: f.body.trim() });
          } else {
            blocks.push({
              id: newId(),
              type: "code",
              text: `${f.lang}\n${f.body}`,
            });
          }
          last = f.end;
        }
        pushProse(currentDraftText.slice(last));
      }
    }
    renderBlockEditor();
    if (persist) {
      const saved = await persistArticle(
        isBookChapterContext()
          ? currentChapterId
            ? "Save chapter with block editor"
            : "Initial chapter save"
          : currentArticleId
            ? "Republish with edits"
            : "Initial publish",
      );
      if (saved) {
        const label = saved.slug || saved.title || "document";
        addLog("PUBLISH", `Stored in SQLite · ${label}`, "finish");
      }
    } else {
      addLog("PUBLISH", "Block editor active.", "finish");
    }
    updateDocumentActions();
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
      } else if (block.type === "code") {
        contentElem = document.createElement("div");
        contentElem.className = "block-content code-block";
        const nl = String(block.text || "").indexOf("\n");
        const lang = nl >= 0 ? block.text.slice(0, nl) : "";
        const body = nl >= 0 ? block.text.slice(nl + 1) : block.text || "";
        contentElem.innerHTML = `
          <div class="qmd-code-label">${escapeHtml(lang || "code")}</div>
          <textarea class="code-block-editor" rows="8" spellcheck="false" aria-label="Code block">${escapeHtml(body)}</textarea>
        `;
        const ta = contentElem.querySelector(".code-block-editor");
        ta.addEventListener("input", () => {
          blocks[index].text = `${lang}\n${ta.value}`;
          scheduleSave();
        });
      } else if (block.type === "table") {
        contentElem = document.createElement("div");
        contentElem.className = "block-content table-block";
        contentElem.innerHTML = `
          <div class="qmd-code-label">table</div>
          <div class="table-block-preview">${markdownTableToHtml(block.text || "")}</div>
          <textarea class="table-block-editor" rows="6" spellcheck="false" aria-label="Table markdown">${escapeHtml(block.text || "")}</textarea>
        `;
        const ta = contentElem.querySelector(".table-block-editor");
        const preview = contentElem.querySelector(".table-block-preview");
        ta.addEventListener("input", () => {
          blocks[index].text = ta.value;
          preview.innerHTML = markdownTableToHtml(ta.value);
          scheduleSave();
        });
      } else if (block.type === "h1") contentElem = document.createElement("h1");
      else if (block.type === "h2") contentElem = document.createElement("h2");
      else if (block.type === "h3") contentElem = document.createElement("h3");
      else if (block.type === "blockquote")
        contentElem = document.createElement("blockquote");
      else contentElem = document.createElement("p");

      if (
        block.type !== "drawio" &&
        block.type !== "code" &&
        block.type !== "table"
      ) {
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
          chapterTitle:
            currentChapterTitle ||
            bookChapters.find((c) => c.id === currentChapterId)?.title,
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
      const res = await fetch(dataUrl(`/api/chapters/${currentChapterId}/apply-blocks`), {
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
      const res = await fetch(dataUrl(`/api/articles/${currentArticleId}/apply-blocks`), {
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

  function suggestContextKey() {
    return [
      currentBookId || "",
      currentBookTitle || "",
      currentChapterId || "",
      currentChapterTitle || "",
      composingChapterNumber || "",
    ].join("|");
  }

  function isPlaceholderBrief(text) {
    const t = (text || "").trim();
    if (!t) return true;
    return /^Write chapter \d+ of [“"'].+[”"']. Cover the next practical topic/i.test(
      t,
    );
  }

  function captureSuggestSnapshot() {
    return {
      brief: briefInput?.value ?? "",
      audience: audienceInput?.value ?? "",
      tone: toneInput?.value ?? "",
      format: formatInput?.value ?? "",
      length: lengthInput?.value ?? "",
      theme: currentTheme,
      goal: currentGoal,
    };
  }

  function restoreSuggestSnapshot(snapshot) {
    if (!snapshot) return;
    if (briefInput) briefInput.value = snapshot.brief;
    if (audienceInput) audienceInput.value = snapshot.audience;
    if (toneInput) toneInput.value = snapshot.tone;
    if (formatInput) formatInput.value = snapshot.format;
    if (lengthInput) lengthInput.value = snapshot.length;
    if (snapshot.theme) selectThemeCard(snapshot.theme);
    if (snapshot.goal) selectGoalCard(snapshot.goal);
    if (snapshot.tone && toneInput) toneInput.value = snapshot.tone;
    if (snapshot.format && formatInput) formatInput.value = snapshot.format;
    if (snapshot.length && lengthInput) lengthInput.value = snapshot.length;
  }

  function hideSuggestBanner() {
    if (suggestBanner) {
      suggestBanner.hidden = true;
      suggestBanner.classList.remove("is-loading", "is-ready", "is-applied");
    }
    pendingSuggestion = null;
    suggestUndoSnapshot = null;
    suggestMode = "idle";
    if (suggestAcceptBtn) suggestAcceptBtn.textContent = "Accept";
  }

  function flashSuggestedFields(suggestion) {
    const targets = [briefInput, paramsRow].filter(Boolean);
    if (suggestion?.theme && themesSelector) {
      const themeCard = [...themesSelector.querySelectorAll(".theme-card")].find(
        (c) => c.dataset.theme === suggestion.theme,
      );
      if (themeCard) targets.push(themeCard);
    }
    if (suggestion?.goal && goalsSelector) {
      const goalCard = [...goalsSelector.querySelectorAll(".option-card")].find(
        (c) => c.dataset.goal === suggestion.goal,
      );
      if (goalCard) targets.push(goalCard);
    }
    for (const el of targets) {
      el.classList.remove("suggest-flash");
      // Force restart animation if re-applied quickly
      void el.offsetWidth;
      el.classList.add("suggest-flash");
    }
    if (suggestFlashTimer) clearTimeout(suggestFlashTimer);
    suggestFlashTimer = setTimeout(() => {
      for (const el of targets) el.classList.remove("suggest-flash");
    }, 1200);
  }

  function selectThemeCard(themeName) {
    if (!themesSelector || !themeName) return;
    const card = [...themesSelector.querySelectorAll(".theme-card")].find(
      (c) => c.dataset.theme === themeName,
    );
    if (card) card.click();
    else currentTheme = themeName;
  }

  function selectGoalCard(goalName) {
    if (!goalsSelector || !goalName) return;
    const card = [...goalsSelector.querySelectorAll(".option-card")].find(
      (c) => c.dataset.goal === goalName,
    );
    if (card) card.click();
    else currentGoal = goalName;
  }

  function fillSuggestionFields(suggestion) {
    if (!suggestion) return;
    if (suggestion.brief) briefInput.value = suggestion.brief;
    if (suggestion.audience) audienceInput.value = suggestion.audience;
    if (suggestion.tone) toneInput.value = suggestion.tone;
    if (suggestion.format) formatInput.value = suggestion.format;
    if (suggestion.length) lengthInput.value = suggestion.length;
    if (suggestion.theme) selectThemeCard(suggestion.theme);
    if (suggestion.goal) selectGoalCard(suggestion.goal);
    // Theme card click overwrites tone/format/length — re-apply suggestion values
    if (suggestion.tone) toneInput.value = suggestion.tone;
    if (suggestion.format) formatInput.value = suggestion.format;
    if (suggestion.length) lengthInput.value = suggestion.length;
    if (suggestion.brief && briefInput) {
      const text = String(suggestion.brief);
      const hardLines = text.split(/\n/).length;
      const wrapLines = Math.ceil(text.length / 72);
      briefInput.rows = Math.min(14, Math.max(6, hardLines, wrapLines));
    }
  }

  function showSuggestBanner(suggestion, { applied = false } = {}) {
    pendingSuggestion = suggestion;
    if (!suggestBanner) return;
    suggestBanner.hidden = false;
    suggestBanner.classList.remove("is-loading", "is-ready", "is-applied");
    suggestBanner.classList.add(applied ? "is-applied" : "is-ready");
    suggestMode = applied ? "applied" : "ready";
    if (suggestStatus) suggestStatus.hidden = true;
    if (suggestAcceptBtn) {
      suggestAcceptBtn.hidden = false;
      suggestAcceptBtn.textContent = applied ? "Undo" : "Accept";
    }
    if (suggestDismissBtn) suggestDismissBtn.hidden = false;
    const labelBits = [currentBookTitle, currentChapterTitle].filter(Boolean);
    if (suggestBannerLabel) {
      const prefix = applied ? "AI suggestions applied" : "AI suggestions ready";
      suggestBannerLabel.textContent = labelBits.length
        ? `${prefix} · ${labelBits.join(" / ")}`
        : prefix;
    }
    if (suggestRationale) {
      suggestRationale.textContent =
        suggestion.rationale ||
        (applied
          ? "Brief, audience, tone, format, length, theme, and goal were filled from book/chapter context."
          : "Suggested brief and parameters based on book and chapter titles.");
    }
    suggestBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function applySuggestion(suggestion, { auto = false } = {}) {
    if (!suggestion) return;
    if (auto || !suggestUndoSnapshot) {
      suggestUndoSnapshot = captureSuggestSnapshot();
    }
    fillSuggestionFields(suggestion);
    userEditedBriefAfterSuggest = false;
    showSuggestBanner(suggestion, { applied: true });
    flashSuggestedFields(suggestion);
    addLog(
      "SUGGEST",
      auto
        ? "Applied AI brief & parameter suggestions"
        : "Accepted AI brief & parameter suggestions",
      "finish",
    );
  }

  function undoSuggestion() {
    if (!suggestUndoSnapshot) {
      hideSuggestBanner();
      return;
    }
    restoreSuggestSnapshot(suggestUndoSnapshot);
    suggestUndoSnapshot = null;
    pendingSuggestion = null;
    if (suggestBanner) {
      suggestBanner.classList.remove("is-loading", "is-ready", "is-applied");
      suggestBanner.hidden = true;
    }
    suggestMode = "idle";
    if (suggestAcceptBtn) suggestAcceptBtn.textContent = "Accept";
    addLog("SUGGEST", "Undid AI brief suggestions", "system");
  }

  function scheduleBriefSuggestions() {
    if (!currentBookTitle && !currentChapterTitle) return;
    const key = suggestContextKey();
    if (key === lastDismissedSuggestKey) return;
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => {
      void requestBriefSuggestions();
    }, 400);
  }

  async function requestBriefSuggestions() {
    if (!currentBookTitle && !currentChapterTitle) return;
    const key = suggestContextKey();
    if (key === lastDismissedSuggestKey) return;
    if (userEditedBriefAfterSuggest && pendingSuggestion) return;

    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();
    suggestMode = "loading";

    if (suggestBanner) {
      suggestBanner.hidden = false;
      suggestBanner.classList.remove("is-ready", "is-applied");
      suggestBanner.classList.add("is-loading");
      if (suggestRationale) suggestRationale.textContent = "";
      if (suggestStatus) {
        suggestStatus.hidden = false;
        suggestStatus.textContent =
          "Generating suggestions from book and chapter titles…";
      }
      if (suggestBannerLabel) {
        const labelBits = [currentBookTitle, currentChapterTitle].filter(Boolean);
        suggestBannerLabel.textContent = labelBits.length
          ? `Generating AI suggestions · ${labelBits.join(" / ")}`
          : "Generating AI suggestions";
      }
      if (suggestAcceptBtn) {
        suggestAcceptBtn.hidden = true;
        suggestAcceptBtn.textContent = "Accept";
      }
      if (suggestDismissBtn) suggestDismissBtn.hidden = true;
      suggestBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    try {
      const res = await fetch("/api/suggest-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: suggestAbort.signal,
        body: JSON.stringify({
          bookTitle: currentBookTitle || undefined,
          bookSynopsis: currentBookSynopsis || undefined,
          chapterTitle: currentChapterTitle || undefined,
          chapterNumber: composingChapterNumber || undefined,
          existingTheme: currentTheme,
          existingGoal: currentGoal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggest failed");
      if (suggestContextKey() !== key) return;
      const suggestion = data.suggestion;
      // Apply by default unless the user already edited the brief while waiting
      if (userEditedBriefAfterSuggest) {
        pendingSuggestion = suggestion;
        showSuggestBanner(suggestion, { applied: false });
        addLog(
          "SUGGEST",
          "Ready — Accept or Dismiss AI brief suggestions",
          "system",
        );
      } else {
        applySuggestion(suggestion, { auto: true });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      hideSuggestBanner();
      addLog("SUGGEST", err.message || "Could not suggest brief", "eval");
    }
  }

  suggestAcceptBtn?.addEventListener("click", () => {
    if (suggestMode === "applied") {
      undoSuggestion();
      return;
    }
    applySuggestion(pendingSuggestion, { auto: false });
  });
  suggestDismissBtn?.addEventListener("click", () => {
    lastDismissedSuggestKey = suggestContextKey();
    hideSuggestBanner();
    addLog("SUGGEST", "Dismissed AI suggestions for this chapter context", "system");
  });
  briefInput?.addEventListener("input", () => {
    if (
      suggestMode === "loading" ||
      suggestMode === "ready" ||
      suggestMode === "applied" ||
      pendingSuggestion ||
      (suggestBanner && !suggestBanner.hidden)
    ) {
      userEditedBriefAfterSuggest = true;
    }
  });

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

  async function triggerDownload() {
    const text = getLatestArticleText();
    if (!text) {
      window.alert("Nothing to export yet.");
      return;
    }
    try {
      const res = await fetch("/api/export/qmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: text,
          title: draftDisplayTitle(),
          bookTitle: currentBookTitle || undefined,
          theme: currentTheme,
          format: formatInput.value,
          audience: audienceInput.value,
          tone: toneInput.value,
          length: lengthInput.value,
          goal: currentGoal,
          slug: currentChapterSlug || currentArticleSlug || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Export failed (${res.status})`);
      }
      const qmd = await res.text();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `quill-${Date.now()}.qmd`;
      const blob = new Blob([qmd], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err.message || "Export failed");
    }
  }

  downloadBtn.addEventListener("click", () => {
    void triggerDownload();
  });
  void hydrateConfig().then(() => {
    refreshArticlesList();
    refreshBooksList();
  });
});
