const socket = io();

// === DOM ELEMENTS ===
const $ = (id) => document.getElementById(id);
const connectionStatus = $('connectionStatus');
const botCountDisplay = $('botCountDisplay');
const botGrid = $('botGrid');
const emptyState = $('emptyState');
const onlineCount = $('onlineCount');
const liveCount = $('liveCount');
const chatMessages = $('chatMessages');
const chatInput = $('chatInput');
const logContainer = $('logContainer');
const btnConnect = $('btnConnect');
const btnDisconnect = $('btnDisconnect');
const botCountSlider = $('botCount');
const botCountLabel = $('botCountLabel');
const connectDelaySlider = $('connectDelay');
const delayLabel = $('delayLabel');
const attackTargetRow = $('attackTargetRow');

// === STATE ===
let currentStatus = null;
let isConnected = false;

// === SLIDER LABELS ===
botCountSlider.addEventListener('input', () => {
  botCountLabel.textContent = botCountSlider.value;
});
connectDelaySlider.addEventListener('input', () => {
  delayLabel.textContent = connectDelaySlider.value;
});

// === CONNECT ===
btnConnect.addEventListener('click', () => {
  const data = {
    host: $('serverHost').value.trim() || 'localhost',
    port: $('serverPort').value || '25565',
    version: $('serverVersion').value.trim() || '1.21.1',
    auth: $('authMode').value,
    owner: $('ownerName').value.trim(),
    commanderName: $('commanderName').value.trim() || 'Commander',
    botCount: botCountSlider.value,
    connectDelay: connectDelaySlider.value
  };

  if (!data.owner) {
    addChatMsg('system', 'Lütfen "Senin İsmin" alanını doldur!');
    $('ownerName').focus();
    return;
  }

  socket.emit('connect_server', data);
  btnConnect.disabled = true;
  btnConnect.innerHTML = '<span class="btn-icon">⏳</span> Bağlanıyor...';
  updateConnectionStatus('connecting');
  addChatMsg('system', `${data.host}:${data.port} sunucusuna bağlanılıyor...`);
});

// === DISCONNECT ===
btnDisconnect.addEventListener('click', () => {
  socket.emit('disconnect_server');
  addChatMsg('system', 'Tüm botlar kapatılıyor...');
});

// === COMMAND BUTTONS ===
document.querySelectorAll('.cmd-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;

    if (cmd === 'attack') {
      attackTargetRow.style.display = attackTargetRow.style.display === 'none' ? 'flex' : 'none';
      if (attackTargetRow.style.display === 'flex') $('attackTarget').focus();
      return;
    }

    if (cmd === 'follow') {
      const owner = $('ownerName').value.trim();
      socket.emit('command', { behavior: 'follow', args: [owner] });
    } else if (cmd === 'gather') {
      socket.emit('command', { behavior: 'gather', args: [] });
    } else if (cmd === 'guard') {
      socket.emit('command', { behavior: 'guard', args: [] });
    } else if (cmd === 'circle') {
      const owner = $('ownerName').value.trim();
      socket.emit('command', { behavior: 'circle', args: [owner, 5] });
    } else {
      socket.emit('command', { behavior: cmd, args: [] });
    }
  });
});

// Attack confirm
$('btnAttackConfirm').addEventListener('click', () => {
  const target = $('attackTarget').value.trim();
  if (target) {
    socket.emit('command', { behavior: 'attack', args: [target] });
    attackTargetRow.style.display = 'none';
    $('attackTarget').value = '';
  }
});

// === BOT ADJUST ===
$('btnAdd1').addEventListener('click', () => socket.emit('spawn_bots', { count: 1 }));
$('btnAdd5').addEventListener('click', () => socket.emit('spawn_bots', { count: 5 }));
$('btnRemove1').addEventListener('click', () => socket.emit('kill_bots', { count: 1 }));
$('btnRemove5').addEventListener('click', () => socket.emit('kill_bots', { count: 5 }));

// === CHAT ASSISTANT ===
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});
$('btnSendChat').addEventListener('click', sendChat);

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  addChatMsg('user', msg);
  socket.emit('assistant_message', { message: msg });
  chatInput.value = '';
}

function addChatMsg(type, text) {
  const div = document.createElement('div');
  div.className = `chat-msg ${type}`;
  div.innerHTML = `<span class="msg-text">${escapeHtml(text)}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// === LOG ===
$('btnClearLog').addEventListener('click', () => {
  logContainer.innerHTML = '';
});

function addLogEntry(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.level}`;
  div.innerHTML = `<span class="log-time">${entry.time || ''}</span> <span class="log-source">[${entry.source}]</span> <span class="log-msg">${escapeHtml(entry.message)}</span>`;
  logContainer.appendChild(div);
  // Auto-scroll
  if (logContainer.scrollHeight - logContainer.scrollTop < logContainer.clientHeight + 100) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  // Max log entries in DOM
  while (logContainer.children.length > 200) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// === SOCKET EVENTS ===
socket.on('status', (status) => {
  currentStatus = status;
  isConnected = status.connected;
  renderStatus(status);
});

socket.on('log', (entry) => {
  addLogEntry(entry);
});

socket.on('logs', (logs) => {
  logs.forEach(entry => addLogEntry(entry));
});

socket.on('assistant_response', (data) => {
  addChatMsg('bot', data.response);
});

socket.on('config', (cfg) => {
  $('serverHost').value = cfg.server.host || 'localhost';
  $('serverPort').value = cfg.server.port || 25565;
  $('serverVersion').value = cfg.server.version || '1.21.1';
  $('authMode').value = cfg.auth || 'offline';
  if (cfg.owner) $('ownerName').value = cfg.owner;
  if (cfg.commander && cfg.commander.username) $('commanderName').value = cfg.commander.username;
});

socket.on('disconnect', () => {
  updateConnectionStatus('offline');
});

socket.on('connect', () => {
  addLogEntry({ time: new Date().toLocaleTimeString('tr-TR'), level: 'info', source: 'web', message: 'Dashboard bağlandı' });
});

// === RENDER ===
function renderStatus(status) {
  // Connection status
  if (status.connected) {
    updateConnectionStatus(status.onlineBots > 0 ? 'online' : 'connecting');
    btnConnect.disabled = true;
    btnConnect.innerHTML = '<span class="btn-icon">✓</span> Bağlı';
    btnDisconnect.disabled = false;
  } else {
    updateConnectionStatus('offline');
    btnConnect.disabled = false;
    btnConnect.innerHTML = '<span class="btn-icon">▶</span> Bağlan';
    btnDisconnect.disabled = true;
  }

  // Counter
  botCountDisplay.textContent = `${status.onlineBots} / ${status.totalBots}`;
  liveCount.textContent = status.totalBots;
  onlineCount.textContent = `${status.onlineBots} online`;

  // Bot grid
  renderBotGrid(status);
}

function renderBotGrid(status) {
  const allBots = [];

  // Commander first
  if (status.commander) {
    allBots.push({ ...status.commander, isCommander: true });
  }

  // Regular bots
  allBots.push(...status.bots);

  if (allBots.length === 0) {
    botGrid.innerHTML = '';
    botGrid.appendChild(createEmptyState());
    return;
  }

  // Diff-based update to avoid full re-render flicker
  const existingCards = {};
  botGrid.querySelectorAll('.bot-card').forEach(card => {
    existingCards[card.dataset.botId] = card;
  });

  // Remove empty state
  const empty = botGrid.querySelector('.empty-state');
  if (empty) empty.remove();

  const seenIds = new Set();

  allBots.forEach(bot => {
    const id = bot.id;
    seenIds.add(id);

    if (existingCards[id]) {
      updateBotCard(existingCards[id], bot);
    } else {
      const card = createBotCard(bot);
      botGrid.appendChild(card);
    }
  });

  // Remove cards for bots that no longer exist
  Object.keys(existingCards).forEach(id => {
    if (!seenIds.has(id)) {
      existingCards[id].remove();
    }
  });
}

function createBotCard(bot) {
  const card = document.createElement('div');
  card.className = `bot-card${bot.isCommander ? ' commander' : ''}`;
  card.dataset.botId = bot.id;
  updateBotCard(card, bot);
  return card;
}

function updateBotCard(card, bot) {
  const healthPercent = Math.max(0, Math.min(100, ((bot.health || 0) / 20) * 100));
  const posText = bot.position ? `${bot.position.x}, ${bot.position.y}, ${bot.position.z}` : '-';
  const label = bot.isCommander ? '👑 ' : '';

  card.innerHTML = `
    <div class="bot-card-header">
      <span class="bot-name">${label}${escapeHtml(bot.username)}</span>
      <span class="bot-status-dot ${bot.status}"></span>
    </div>
    <div class="bot-health-bar">
      <div class="bot-health-fill" style="width: ${healthPercent}%"></div>
    </div>
    <div class="bot-info">
      <div>❤ ${bot.health || 0}/20 &nbsp; 🍗 ${bot.food || 0}/20</div>
      <div>📍 ${posText}</div>
      <div>⚡ <span class="bot-behavior">${bot.behavior || 'idle'}${bot.behaviorTarget ? ` → ${bot.behaviorTarget}` : ''}</span></div>
    </div>
  `;
}

function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">🤖</div>
    <p>Henüz bot yok</p>
    <p class="empty-sub">Sunucuya bağlanıp bot oluştur</p>
  `;
  return div;
}

function updateConnectionStatus(state) {
  const dot = connectionStatus.querySelector('.status-dot');
  const text = connectionStatus.querySelector('.status-text');
  dot.className = `status-dot ${state}`;
  const labels = { offline: 'Bağlantı yok', connecting: 'Bağlanıyor...', online: 'Bağlı' };
  text.textContent = labels[state] || state;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
