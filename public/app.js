// Quill Studio — webflow (WordPress-inspired white) dashboard app logic
// Bound Open Design: design-systems/webflow + design-templates/dashboard

document.addEventListener("DOMContentLoaded", () => {
  const menuNewPiece = document.getElementById("menu-new-piece");
  const menuPublishToggle = document.getElementById("menu-publish-toggle");
  const menuAddBlock = document.getElementById("menu-add-block");
  const menuExport = document.getElementById("menu-export");
  const menuToggleConsole = document.getElementById("menu-toggle-console");

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
  let isPublished = false;
  let blocks = [];
  let criterionThreshold = 0.75;

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

  menuNewPiece.addEventListener("click", () => {
    briefInput.value = "";
    wizardSection.scrollIntoView({ behavior: "smooth" });
    briefInput.focus();
  });

  menuPublishToggle.addEventListener("click", () => {
    if (currentDraftText) enablePublishMode();
    else
      window.alert(
        "Run the agent pipeline to generate a draft before publishing.",
      );
  });

  menuAddBlock.addEventListener("click", () => {
    if (!isPublished) enablePublishMode();
    if (isPublished) addNewBlockBelow(blocks.length - 1);
  });

  menuExport.addEventListener("click", triggerDownload);

  menuToggleConsole.addEventListener("click", () => {
    consolePanel.hidden = !consolePanel.hidden;
    workspaceGrid.style.gridTemplateColumns = consolePanel.hidden
      ? "1fr"
      : "420px 1fr";
  });

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
          currentDraftText = event.output;
          renderRawDraft(event.output);
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
          renderRawDraft(event.draft);
        }
        break;
      default:
        break;
    }
  }

  function renderRawDraft(text) {
    const html = escapeHtml(text)
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      .replace(/\n\n/g, "</p><p>");
    articleCanvas.innerHTML = `<p>${html}</p>`;
  }

  publishBtn.addEventListener("click", enablePublishMode);
  addBlockBtn.addEventListener("click", () => addNewBlockBelow(blocks.length - 1));

  function enablePublishMode() {
    if (!currentDraftText) {
      window.alert("No draft content available to publish.");
      return;
    }
    isPublished = true;
    publishedBadge.hidden = false;
    editorBar.hidden = false;
    articleCanvas.classList.add("block-editor-active");
    addLog("PUBLISH", "Article published. Block editor active.", "finish");

    const rawParagraphs = currentDraftText
      .split(/\n\s*\n/)
      .filter((p) => p.trim());
    blocks = rawParagraphs.map((pText, idx) => {
      let type = "paragraph";
      if (pText.startsWith("# ")) type = "h1";
      else if (pText.startsWith("## ")) type = "h2";
      else if (pText.startsWith("### ")) type = "h3";
      else if (pText.startsWith("> ")) type = "blockquote";
      const cleanText = pText.replace(/^#{1,3}\s+/, "").replace(/^>\s+/, "");
      return { id: idx + 1, type, text: cleanText };
    });
    renderBlockEditor();
  }

  function renderBlockEditor() {
    articleCanvas.innerHTML = "";
    blocksCount.textContent = `${blocks.length} blocks`;

    blocks.forEach((block, index) => {
      const blockItem = document.createElement("div");
      blockItem.className = "block-item";

      const controls = document.createElement("div");
      controls.className = "block-controls";
      controls.innerHTML = `
        <button type="button" class="block-btn edit-btn">Edit</button>
        <button type="button" class="block-btn up-btn">Up</button>
        <button type="button" class="block-btn down-btn">Down</button>
        <button type="button" class="block-btn add-btn">Add</button>
        <button type="button" class="block-btn del-btn">Delete</button>
      `;

      let contentElem;
      if (block.type === "h1") contentElem = document.createElement("h1");
      else if (block.type === "h2") contentElem = document.createElement("h2");
      else if (block.type === "h3") contentElem = document.createElement("h3");
      else if (block.type === "blockquote")
        contentElem = document.createElement("blockquote");
      else contentElem = document.createElement("p");

      contentElem.className = "block-content";
      contentElem.contentEditable = "true";
      contentElem.innerHTML = escapeHtml(block.text);
      contentElem.addEventListener("input", () => {
        blocks[index].text = contentElem.innerText;
      });

      controls.querySelector(".edit-btn").addEventListener("click", () =>
        contentElem.focus(),
      );
      controls.querySelector(".up-btn").addEventListener("click", () => {
        if (index > 0) {
          [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
          renderBlockEditor();
        }
      });
      controls.querySelector(".down-btn").addEventListener("click", () => {
        if (index < blocks.length - 1) {
          [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
          renderBlockEditor();
        }
      });
      controls
        .querySelector(".add-btn")
        .addEventListener("click", () => addNewBlockBelow(index));
      controls.querySelector(".del-btn").addEventListener("click", () => {
        blocks.splice(index, 1);
        renderBlockEditor();
      });

      blockItem.appendChild(controls);
      blockItem.appendChild(contentElem);
      articleCanvas.appendChild(blockItem);
    });
  }

  function addNewBlockBelow(index) {
    blocks.splice(index + 1, 0, {
      id: Date.now(),
      type: "paragraph",
      text: "Write your new paragraph content here…",
    });
    renderBlockEditor();
  }

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
    if (isPublished && blocks.length > 0) {
      return blocks.map((b) => b.text).join("\n\n");
    }
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
    a.download = `quill-article-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadBtn.addEventListener("click", triggerDownload);
});
