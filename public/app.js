// Atelier Zero — Writing Agent Studio App Logic with Visual Block Editor & Hamburger Drawer

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const sideDrawer = document.getElementById('side-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');

  // Menu items
  const menuNewPiece = document.getElementById('menu-new-piece');
  const menuPublishToggle = document.getElementById('menu-publish-toggle');
  const menuAddBlock = document.getElementById('menu-add-block');
  const menuExport = document.getElementById('menu-export');
  const menuToggleConsole = document.getElementById('menu-toggle-console');
  const menuThemeQuick = document.getElementById('menu-theme-quick');

  const goalsSelector = document.getElementById('goals-selector');
  const themesSelector = document.getElementById('themes-selector');
  const agentForm = document.getElementById('agent-form');
  const briefInput = document.getElementById('brief-input');
  const audienceInput = document.getElementById('audience-input');
  const toneInput = document.getElementById('tone-input');
  const formatInput = document.getElementById('format-input');
  const lengthInput = document.getElementById('length-input');
  const fireBtn = document.getElementById('fire-btn');
  const resetBtn = document.getElementById('reset-btn');

  const wizardSection = document.getElementById('wizard-section');
  const workspaceSection = document.getElementById('workspace-section');
  const workspaceGrid = document.getElementById('workspace-grid');
  const consolePanel = document.getElementById('console-panel');
  const streamBox = document.getElementById('stream-box');
  const streamStatus = document.getElementById('stream-status');
  const liveDot = document.getElementById('live-dot');
  const articleCanvas = document.getElementById('article-canvas');
  const criteriaGrid = document.getElementById('criteria-card-grid');
  const iterationBadge = document.getElementById('iteration-badge');
  const publishedBadge = document.getElementById('published-badge');
  const publishBtn = document.getElementById('publish-btn');
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const editorBar = document.getElementById('editor-bar');
  const blocksCount = document.getElementById('blocks-count');
  const addBlockBtn = document.getElementById('add-block-btn');

  // App State
  let currentGoal = 'Thought Leadership & Opinion Essay';
  let currentTheme = 'Atelier Editorial';
  let currentDraftText = '';
  let isPublished = false;
  let blocks = [];
  let activeEventSource = null;

  // 1. Hamburger Drawer Toggle Logic
  const openDrawer = () => {
    sideDrawer.hidden = false;
    drawerOverlay.hidden = false;
  };

  const closeDrawer = () => {
    sideDrawer.hidden = true;
    drawerOverlay.hidden = true;
  };

  hamburgerBtn.addEventListener('click', openDrawer);
  closeDrawerBtn.addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  // Drawer Menu Actions
  menuNewPiece.addEventListener('click', () => {
    closeDrawer();
    briefInput.value = '';
    wizardSection.scrollIntoView({ behavior: 'smooth' });
    briefInput.focus();
  });

  menuPublishToggle.addEventListener('click', () => {
    closeDrawer();
    if (currentDraftText) {
      enablePublishMode();
    } else {
      alert('Please run the agent pipeline to generate a draft before publishing!');
    }
  });

  menuAddBlock.addEventListener('click', () => {
    closeDrawer();
    if (!isPublished) enablePublishMode();
    addNewBlockBelow(blocks.length - 1);
  });

  menuExport.addEventListener('click', () => {
    closeDrawer();
    triggerDownload();
  });

  menuToggleConsole.addEventListener('click', () => {
    closeDrawer();
    consolePanel.hidden = !consolePanel.hidden;
    workspaceGrid.style.gridTemplateColumns = consolePanel.hidden ? '1fr' : '440px 1fr';
  });

  menuThemeQuick.addEventListener('click', () => {
    closeDrawer();
    themesSelector.scrollIntoView({ behavior: 'smooth' });
  });

  // 2. Goal Selector Handler
  goalsSelector.addEventListener('click', (e) => {
    const card = e.target.closest('.option-card');
    if (!card) return;
    goalsSelector.querySelectorAll('.option-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    currentGoal = card.dataset.goal;
  });

  // 3. Theme Selector Handler
  themesSelector.addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (!card) return;
    themesSelector.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');

    currentTheme = card.dataset.theme;
    toneInput.value = card.dataset.tone;
    formatInput.value = card.dataset.format;
  });

  resetBtn.addEventListener('click', () => {
    briefInput.value = '';
    briefInput.focus();
  });

  // 4. Helper Log Writer
  const addLog = (tag, msg, tagClass = 'system') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const row = document.createElement('div');
    row.className = 'stream-log-entry';
    row.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-tag ${tagClass}">${tag}</span> <span class="log-msg">${escapeHtml(msg)}</span>`;
    streamBox.appendChild(row);
    streamBox.scrollTop = streamBox.scrollHeight;
  };

  const escapeHtml = (str) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 5. Stage Node Manager
  const setNodeState = (nodeId, state) => {
    const nodeElem = document.getElementById(`node-${nodeId}`);
    if (!nodeElem) return;
    nodeElem.classList.remove('active', 'completed');
    const statusText = nodeElem.querySelector('.node-status');

    if (state === 'active') {
      nodeElem.classList.add('active');
      statusText.textContent = 'Running...';
    } else if (state === 'completed') {
      nodeElem.classList.add('completed');
      statusText.textContent = 'Done ✓';
    } else {
      statusText.textContent = 'Pending';
    }
  };

  // 6. Form Submission (Fire Agents)
  agentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const brief = briefInput.value.trim();
    if (!brief) return;

    workspaceSection.hidden = false;
    workspaceSection.scrollIntoView({ behavior: 'smooth' });

    fireBtn.disabled = true;
    fireBtn.querySelector('span:nth-child(2)').textContent = 'Agents Running...';
    streamBox.innerHTML = '';
    articleCanvas.innerHTML = `<div class="placeholder-notice"><p>Firing Planner agent to generate initial strategy...</p></div>`;
    criteriaGrid.innerHTML = '';
    iterationBadge.textContent = 'Loop: 1';
    publishedBadge.hidden = true;
    editorBar.hidden = true;
    isPublished = false;
    articleCanvas.classList.remove('block-editor-active');

    ['plan', 'research', 'writer', 'manager'].forEach((id) => setNodeState(id, 'pending'));

    addLog('INIT', `Firing pipeline with Goal: "${currentGoal}" & Theme: "${currentTheme}"`, 'system');

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const match = line.match(/^event:\s*(.+)\ndata:\s*(.+)$/s);
          if (match) {
            const [, eventType, eventData] = match;
            try {
              const data = JSON.parse(eventData);
              handlePipelineEvent(data);
            } catch (err) {
              console.error('SSE JSON parse error', err);
            }
          }
        }
      }
    } catch (err) {
      addLog('ERROR', err.message, 'eval');
      streamStatus.textContent = 'Pipeline Failed';
      liveDot.classList.remove('pulsating');
      liveDot.style.backgroundColor = '#ef4444';
    } finally {
      fireBtn.disabled = false;
      fireBtn.querySelector('span:nth-child(2)').textContent = 'Fire Agents & Start Pipeline';
    }
  });

  // 7. Event Handler
  function handlePipelineEvent(event) {
    switch (event.type) {
      case 'pipeline_started':
        addLog('PIPELINE', `Workflow "${event.workflow}" started`, 'system');
        break;

      case 'node_started':
        addLog('NODE', `Started ${event.agentId} (Node: ${event.nodeId})`, 'node');
        setNodeState(event.nodeId, 'active');
        iterationBadge.textContent = `Loop: ${event.iteration + 1}`;
        break;

      case 'agent_created':
        addLog('AGENT', `Spawned Cursor Cloud Agent ID: ${event.cursorAgentId.slice(0, 8)}...`, 'node');
        break;

      case 'assistant_delta':
        if (event.nodeId === 'writer') {
          addLog('WRITE', event.text.slice(0, 80) + '...', 'delta');
        }
        break;

      case 'node_finished':
        setNodeState(event.nodeId, 'completed');
        addLog('DONE', `Completed ${event.agentId}`, 'finish');

        if (event.outputKey === 'draft' && event.output) {
          currentDraftText = event.output;
          renderRawDraft(event.output);
        }

        if (event.evaluation) {
          renderEvaluation(event.evaluation);
        }
        break;

      case 'route':
        addLog('ROUTE', `Routing from ${event.from} → ${event.to}. Reason: ${event.reason}`, 'node');
        break;

      case 'pipeline_finished':
        if (event.status === 'completed') {
          addLog('SUCCESS', 'Quality thresholds met cleanly! Pipeline completed.', 'finish');
          streamStatus.textContent = 'Completed ✓';
          liveDot.classList.remove('pulsating');
          liveDot.style.backgroundColor = '#10b981';
        } else if (event.status === 'max_iterations') {
          addLog('WARN', 'Reached max iteration limit.', 'node');
          streamStatus.textContent = 'Max Loops Reached';
        } else if (event.status === 'error') {
          addLog('ERROR', event.error || 'Pipeline error', 'eval');
          streamStatus.textContent = 'Error';
        }
        if (event.draft) {
          currentDraftText = event.draft;
          renderRawDraft(event.draft);
        }
        break;
    }
  }

  // 8. Render Raw Draft (Pre-publish)
  function renderRawDraft(text) {
    let html = escapeHtml(text)
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>');

    articleCanvas.innerHTML = `<p>${html}</p>`;
  }

  // 9. Enable Publish & Interactive Visual Block Editor Mode
  publishBtn.addEventListener('click', enablePublishMode);
  addBlockBtn.addEventListener('click', () => addNewBlockBelow(blocks.length - 1));

  function enablePublishMode() {
    if (!currentDraftText) {
      alert('No draft content available to publish.');
      return;
    }

    isPublished = true;
    publishedBadge.hidden = false;
    editorBar.hidden = false;
    articleCanvas.classList.add('block-editor-active');
    addLog('PUBLISH', 'Article published! Interactive visual block editor activated.', 'finish');

    // Parse raw text into structured block array
    const rawParagraphs = currentDraftText.split(/\n\s*\n/).filter((p) => p.trim());
    blocks = rawParagraphs.map((pText, idx) => {
      let type = 'paragraph';
      if (pText.startsWith('# ')) type = 'h1';
      else if (pText.startsWith('## ')) type = 'h2';
      else if (pText.startsWith('### ')) type = 'h3';
      else if (pText.startsWith('> ')) type = 'blockquote';

      const cleanText = pText.replace(/^#{1,3}\s+/, '').replace(/^>\s+/, '');
      return { id: idx + 1, type, text: cleanText };
    });

    renderBlockEditor();
  }

  // 10. Render Interactive Blocks
  function renderBlockEditor() {
    articleCanvas.innerHTML = '';
    blocksCount.textContent = `${blocks.length} Blocks`;

    blocks.forEach((block, index) => {
      const blockItem = document.createElement('div');
      blockItem.className = 'block-item';
      blockItem.dataset.blockIndex = index;

      // Floating Block Control Toolbar
      const controls = document.createElement('div');
      controls.className = 'block-controls';
      controls.innerHTML = `
        <button type="button" class="block-btn edit-btn" title="Edit Inline">✏️ Edit</button>
        <button type="button" class="block-btn up-btn" title="Move Up">⬆️</button>
        <button type="button" class="block-btn down-btn" title="Move Down">⬇️</button>
        <button type="button" class="block-btn add-btn" title="Add Block Below">➕</button>
        <button type="button" class="block-btn del-btn" title="Delete Block">🗑️</button>
      `;

      // Editable Content Element
      let contentElem;
      if (block.type === 'h1') contentElem = document.createElement('h1');
      else if (block.type === 'h2') contentElem = document.createElement('h2');
      else if (block.type === 'h3') contentElem = document.createElement('h3');
      else if (block.type === 'blockquote') contentElem = document.createElement('blockquote');
      else contentElem = document.createElement('p');

      contentElem.className = 'block-content';
      contentElem.contentEditable = true;
      contentElem.innerHTML = escapeHtml(block.text);

      // Save edits on input
      contentElem.addEventListener('input', () => {
        blocks[index].text = contentElem.innerText;
      });

      // Control Event Listeners
      controls.querySelector('.edit-btn').addEventListener('click', () => contentElem.focus());

      controls.querySelector('.up-btn').addEventListener('click', () => {
        if (index > 0) {
          const temp = blocks[index];
          blocks[index] = blocks[index - 1];
          blocks[index - 1] = temp;
          renderBlockEditor();
        }
      });

      controls.querySelector('.down-btn').addEventListener('click', () => {
        if (index < blocks.length - 1) {
          const temp = blocks[index];
          blocks[index] = blocks[index + 1];
          blocks[index + 1] = temp;
          renderBlockEditor();
        }
      });

      controls.querySelector('.add-btn').addEventListener('click', () => addNewBlockBelow(index));

      controls.querySelector('.del-btn').addEventListener('click', () => {
        blocks.splice(index, 1);
        renderBlockEditor();
      });

      blockItem.appendChild(controls);
      blockItem.appendChild(contentElem);
      articleCanvas.appendChild(blockItem);
    });
  }

  function addNewBlockBelow(index) {
    const newBlock = { id: Date.now(), type: 'paragraph', text: 'Write your new paragraph content here...' };
    blocks.splice(index + 1, 0, newBlock);
    renderBlockEditor();
  }

  // 11. Render Evaluation
  function renderEvaluation(evaluation) {
    if (!evaluation || !evaluation.scores) return;
    criteriaGrid.innerHTML = '';

    for (const [key, score] of Object.entries(evaluation.scores)) {
      const pass = score >= 0.75;
      const card = document.createElement('div');
      card.className = 'criterion-card';
      card.innerHTML = `
        <span class="crit-label">${escapeHtml(key).toUpperCase()}</span>
        <span class="crit-score ${pass ? 'pass' : 'fail'}">${(score * 100).toFixed(0)}% ${pass ? '✓' : '✗'}</span>
      `;
      criteriaGrid.appendChild(card);
    }
  }

  // 12. Copy and Download Handlers
  function getLatestArticleText() {
    if (isPublished && blocks.length > 0) {
      return blocks.map((b) => b.text).join('\n\n');
    }
    return currentDraftText;
  }

  copyBtn.addEventListener('click', () => {
    const text = getLatestArticleText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied! ✓';
    setTimeout(() => (copyBtn.textContent = 'Copy Text'), 2000);
  });

  function triggerDownload() {
    const text = getLatestArticleText();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-published-article-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadBtn.addEventListener('click', triggerDownload);
});
