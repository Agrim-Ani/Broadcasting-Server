// ── Auth guard ────────────────────────────────────────────────────────────────
const token    = localStorage.getItem('token');
const userId   = localStorage.getItem('userId');
const username = localStorage.getItem('username');

if (!token) window.location.replace('index.html');

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  onlineUserIds:  new Set(),  // userId strings of currently connected users
  rooms:          [],         // [{ _id, name, inviteCode, members, ... }]
  activeRoomId:   null,
  activeMembers:  [],         // [{ _id, username }] for the active room
  messages:       [],
  ws:             null,
  reconnectDelay: 1000,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chatLayout     = document.querySelector('.chat-layout');
const roomList       = document.getElementById('room-list');
const membersSection = document.getElementById('members-section');
const membersList    = document.getElementById('members-list');
const membersCount   = document.getElementById('members-count');
const chatEmpty      = document.getElementById('chat-empty');
const chatActive     = document.getElementById('chat-active');
const chatHeaderName = document.getElementById('chat-header-name');
const messagesWrap   = document.getElementById('messages-wrap');
const messagesList   = document.getElementById('messages-list');
const chatInput      = document.getElementById('chat-input');
const sendBtn        = document.getElementById('send-btn');
const copyLinkBtn          = document.getElementById('copy-link-btn');
const backBtn              = document.getElementById('back-btn');
const newRoomBtn           = document.getElementById('new-room-btn');
const joinRoomBtn          = document.getElementById('join-room-btn');
const settingsMenu         = document.getElementById('settings-menu');
const settingsBtn          = document.getElementById('settings-btn');
const settingsDropdown     = document.getElementById('settings-dropdown');
const renameRoomBtn        = document.getElementById('rename-room-btn');
const deleteRoomBtn        = document.getElementById('delete-room-btn');
const leaveRoomBtn         = document.getElementById('leave-room-btn');
const modalBackdrop        = document.getElementById('modal-backdrop');
const roomNameInput        = document.getElementById('room-name-input');
const modalError           = document.getElementById('modal-error');
const modalCancelBtn       = document.getElementById('modal-cancel-btn');
const modalCreateBtn       = document.getElementById('modal-create-btn');
const renameModalBackdrop  = document.getElementById('rename-modal-backdrop');
const renameRoomInput      = document.getElementById('rename-room-input');
const renameModalError     = document.getElementById('rename-modal-error');
const renameModalCancelBtn = document.getElementById('rename-modal-cancel-btn');
const renameModalSaveBtn   = document.getElementById('rename-modal-save-btn');
const deleteModalBackdrop  = document.getElementById('delete-modal-backdrop');
const deleteModalRoomName  = document.getElementById('delete-modal-room-name');
const deleteModalError     = document.getElementById('delete-modal-error');
const deleteModalCancelBtn = document.getElementById('delete-modal-cancel-btn');
const deleteModalConfirmBtn= document.getElementById('delete-modal-confirm-btn');
const leaveModalBackdrop   = document.getElementById('leave-modal-backdrop');
const leaveModalRoomName   = document.getElementById('leave-modal-room-name');
const leaveModalError      = document.getElementById('leave-modal-error');
const leaveModalCancelBtn  = document.getElementById('leave-modal-cancel-btn');
const leaveModalConfirmBtn = document.getElementById('leave-modal-confirm-btn');
const joinModalBackdrop    = document.getElementById('join-modal-backdrop');
const joinLinkInput        = document.getElementById('join-link-input');
const joinModalError       = document.getElementById('join-modal-error');
const joinModalCancelBtn   = document.getElementById('join-modal-cancel-btn');
const joinModalJoinBtn     = document.getElementById('join-modal-join-btn');

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  // 204 No Content has no body
  if (res.status === 204) return null;
  return res.json();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderRooms() {
  if (!state.rooms.length) {
    roomList.innerHTML = '<li class="sidebar-placeholder">No rooms yet — create one!</li>';
    return;
  }
  roomList.innerHTML = state.rooms
    .map(r => {
      const active = r._id === state.activeRoomId ? ' room-item--active' : '';
      return `<li class="room-item${active}" data-room-id="${escapeHtml(r._id)}">
        <span class="room-item-hash">#</span>
        <span class="room-item-name">${escapeHtml(r.name)}</span>
      </li>`;
    })
    .join('');

  roomList.querySelectorAll('.room-item').forEach(li => {
    li.addEventListener('click', () => openRoom(li.dataset.roomId));
  });
}

function renderMembers() {
  if (!state.activeRoomId) return;

  const online  = state.activeMembers.filter(m => state.onlineUserIds.has(m._id.toString()));
  const offline = state.activeMembers.filter(m => !state.onlineUserIds.has(m._id.toString()));

  membersCount.textContent = online.length;

  const buildItem = (m, isOnline) => {
    const isMe = m._id.toString() === userId;
    return `<li class="online-user${isMe ? ' online-user--me' : ''}">
      <span class="presence-dot${isOnline ? '' : ' presence-dot--offline'}"></span>
      <span class="online-username">${escapeHtml(m.username)}${isMe ? ' (you)' : ''}</span>
    </li>`;
  };

  membersList.innerHTML = [
    ...online.map(m => buildItem(m, true)),
    ...offline.map(m => buildItem(m, false)),
  ].join('');
}

function renderMessages() {
  messagesList.innerHTML = state.messages.map(buildMessageHtml).join('');
  scrollToBottom();
}

function buildMessageHtml(m) {
  const isMe = m.senderId?.toString() === userId;
  return `<li class="message-item${isMe ? ' message-item--mine' : ''}">
    ${!isMe ? `<span class="message-sender">${escapeHtml(m.senderUsername)}</span>` : ''}
    <div class="message-bubble">${escapeHtml(m.text)}</div>
    <span class="message-time">${formatTime(m.createdAt)}</span>
  </li>`;
}

function scrollToBottom() {
  messagesWrap.scrollTop = messagesWrap.scrollHeight;
}

// ── Chat area ─────────────────────────────────────────────────────────────────
function showChatArea() {
  chatEmpty.style.display  = 'none';
  chatActive.style.display = 'flex';
  membersSection.style.display = 'block';
  chatLayout.classList.add('chat-layout--in-room');
}

function hideChatArea() {
  chatEmpty.style.display  = 'flex';
  chatActive.style.display = 'none';
  membersSection.style.display = 'none';
  chatLayout.classList.remove('chat-layout--in-room');
  settingsMenu.style.display    = 'none';
  settingsDropdown.style.display = 'none';
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function loadRooms() {
  try {
    state.rooms = await apiFetch('/api/rooms');
    renderRooms();
  } catch (err) {
    console.error('loadRooms:', err.message);
  }
}

async function openRoom(roomId) {
  state.activeRoomId = roomId;
  state.messages     = [];
  state.activeMembers = [];
  renderRooms();
  messagesList.innerHTML = '';

  const room = state.rooms.find(r => r._id === roomId);
  chatHeaderName.textContent = room ? `# ${room.name}` : '…';
  showChatArea();

  // Show the settings menu for all members; toggle which items are visible by role.
  const isOwner = room?.createdBy?.toString() === userId;
  settingsMenu.style.display     = 'flex';
  settingsDropdown.style.display = 'none';
  renameRoomBtn.style.display    = isOwner ? 'block' : 'none';
  deleteRoomBtn.style.display    = isOwner ? 'block' : 'none';
  leaveRoomBtn.style.display     = isOwner ? 'none'  : 'block';
  chatInput.focus();

  // Load full room details (with member list) and messages in parallel
  try {
    const [roomDetail, msgs] = await Promise.all([
      apiFetch(`/api/rooms/${roomId}`),
      apiFetch(`/api/rooms/${roomId}/messages`),
    ]);

    state.activeMembers = roomDetail.members;
    state.messages      = msgs;
    renderMembers();
    renderMessages();

    // Keep inviteCode in state for the copy-link button
    const idx = state.rooms.findIndex(r => r._id === roomId);
    if (idx !== -1) state.rooms[idx].inviteCode = roomDetail.inviteCode;
  } catch (err) {
    console.error('openRoom:', err.message);
  }
}

async function createRoom(name) {
  const room = await apiFetch('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  state.rooms.unshift(room);
  renderRooms();
  openRoom(room._id);
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !state.activeRoomId || state.ws?.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({ type: 'message', roomId: state.activeRoomId, text }));
  chatInput.value = '';
  chatInput.style.height = '';
}

// Appends a single incoming message to the list without a full re-render.
function appendMessage(m) {
  const isMe = m.senderId?.toString() === userId;
  const li = document.createElement('li');
  li.className = `message-item${isMe ? ' message-item--mine' : ''}`;
  li.innerHTML = (!isMe ? `<span class="message-sender">${escapeHtml(m.senderUsername)}</span>` : '')
    + `<div class="message-bubble">${escapeHtml(m.text)}</div>`
    + `<span class="message-time">${formatTime(m.createdAt)}</span>`;
  messagesList.appendChild(li);
  scrollToBottom();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal() {
  roomNameInput.value     = '';
  modalError.textContent  = '';
  modalBackdrop.style.display = 'flex';
  roomNameInput.focus();
}

function closeModal() {
  modalBackdrop.style.display = 'none';
}

newRoomBtn.addEventListener('click', openModal);
modalCancelBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

modalCreateBtn.addEventListener('click', async () => {
  const name = roomNameInput.value.trim();
  if (!name) { modalError.textContent = 'Room name is required.'; return; }

  modalCreateBtn.disabled    = true;
  modalCreateBtn.textContent = 'Creating…';
  modalError.textContent     = '';

  try {
    await createRoom(name);
    closeModal();
  } catch (err) {
    modalError.textContent     = err.message;
    modalCreateBtn.disabled    = false;
    modalCreateBtn.textContent = 'Create Room';
  }
});

roomNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); modalCreateBtn.click(); }
});

// ── Settings dropdown ─────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = settingsDropdown.style.display === 'block';
  settingsDropdown.style.display = isOpen ? 'none' : 'block';
});

// Close dropdown when clicking anywhere outside it
document.addEventListener('click', () => { settingsDropdown.style.display = 'none'; });
settingsDropdown.addEventListener('click', e => e.stopPropagation());

// ── Rename Room modal ─────────────────────────────────────────────────────────
renameRoomBtn.addEventListener('click', () => {
  settingsDropdown.style.display = 'none';
  const room = state.rooms.find(r => r._id === state.activeRoomId);
  renameRoomInput.value          = room?.name ?? '';
  renameModalError.textContent   = '';
  renameModalBackdrop.style.display = 'flex';
  renameRoomInput.focus();
  renameRoomInput.select();
});

function closeRenameModal() {
  renameModalBackdrop.style.display = 'none';
  renameModalSaveBtn.disabled    = false;
  renameModalSaveBtn.textContent = 'Save';
}

renameModalCancelBtn.addEventListener('click', closeRenameModal);
renameModalBackdrop.addEventListener('click', e => { if (e.target === renameModalBackdrop) closeRenameModal(); });
renameRoomInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); renameModalSaveBtn.click(); } });

renameModalSaveBtn.addEventListener('click', async () => {
  const name = renameRoomInput.value.trim();
  if (!name) { renameModalError.textContent = 'Room name is required.'; return; }

  renameModalSaveBtn.disabled    = true;
  renameModalSaveBtn.textContent = 'Saving…';
  renameModalError.textContent   = '';

  try {
    await apiFetch(`/api/rooms/${state.activeRoomId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ name }),
    });
    closeRenameModal();
  } catch (err) {
    renameModalError.textContent   = err.message;
    renameModalSaveBtn.disabled    = false;
    renameModalSaveBtn.textContent = 'Save';
  }
});

// ── Delete Room modal ─────────────────────────────────────────────────────────
deleteRoomBtn.addEventListener('click', () => {
  settingsDropdown.style.display = 'none';
  const room = state.rooms.find(r => r._id === state.activeRoomId);
  deleteModalRoomName.textContent = room?.name ?? 'this room';
  deleteModalError.textContent    = '';
  deleteModalBackdrop.style.display = 'flex';
});

function closeDeleteModal() {
  deleteModalBackdrop.style.display = 'none';
  deleteModalConfirmBtn.disabled    = false;
  deleteModalConfirmBtn.textContent = 'Delete Room';
}

deleteModalCancelBtn.addEventListener('click', closeDeleteModal);
deleteModalBackdrop.addEventListener('click', e => { if (e.target === deleteModalBackdrop) closeDeleteModal(); });

deleteModalConfirmBtn.addEventListener('click', async () => {
  deleteModalConfirmBtn.disabled    = true;
  deleteModalConfirmBtn.textContent = 'Deleting…';
  deleteModalError.textContent      = '';

  try {
    await apiFetch(`/api/rooms/${state.activeRoomId}`, { method: 'DELETE' });
    closeDeleteModal();
    // WS room_deleted event will clean up state and UI for all clients including this one
  } catch (err) {
    deleteModalError.textContent      = err.message;
    deleteModalConfirmBtn.disabled    = false;
    deleteModalConfirmBtn.textContent = 'Delete Room';
  }
});

// ── Leave Room modal ──────────────────────────────────────────────────────────
leaveRoomBtn.addEventListener('click', () => {
  settingsDropdown.style.display = 'none';
  const room = state.rooms.find(r => r._id === state.activeRoomId);
  leaveModalRoomName.textContent = room?.name ?? 'this room';
  leaveModalError.textContent    = '';
  leaveModalBackdrop.style.display = 'flex';
});

function closeLeaveModal() {
  leaveModalBackdrop.style.display = 'none';
  leaveModalConfirmBtn.disabled    = false;
  leaveModalConfirmBtn.textContent = 'Leave Room';
}

leaveModalCancelBtn.addEventListener('click', closeLeaveModal);
leaveModalBackdrop.addEventListener('click', e => { if (e.target === leaveModalBackdrop) closeLeaveModal(); });

leaveModalConfirmBtn.addEventListener('click', async () => {
  leaveModalConfirmBtn.disabled    = true;
  leaveModalConfirmBtn.textContent = 'Leaving…';
  leaveModalError.textContent      = '';

  try {
    await apiFetch(`/api/rooms/${state.activeRoomId}/leave`, { method: 'POST' });
    closeLeaveModal();
    // Remove the room from the sidebar and close the chat for this user.
    state.rooms = state.rooms.filter(r => r._id !== state.activeRoomId);
    state.activeRoomId  = null;
    state.activeMembers = [];
    renderRooms();
    hideChatArea();
  } catch (err) {
    leaveModalError.textContent      = err.message;
    leaveModalConfirmBtn.disabled    = false;
    leaveModalConfirmBtn.textContent = 'Leave Room';
  }
});

// ── Join Room modal ───────────────────────────────────────────────────────────

// Accepts a full invite URL (https://…/join.html?code=xxx) or a bare code.
function parseInviteCode(input) {
  try {
    const url = new URL(input.trim());
    return url.searchParams.get('code');
  } catch {
    return input.trim() || null;
  }
}

function openJoinModal() {
  joinLinkInput.value        = '';
  joinModalError.textContent = '';
  joinModalBackdrop.style.display = 'flex';
  joinLinkInput.focus();
}

function closeJoinModal() {
  joinModalBackdrop.style.display = 'none';
}

joinRoomBtn.addEventListener('click', openJoinModal);
joinModalCancelBtn.addEventListener('click', closeJoinModal);
joinModalBackdrop.addEventListener('click', e => { if (e.target === joinModalBackdrop) closeJoinModal(); });

joinLinkInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); joinModalJoinBtn.click(); }
});

joinModalJoinBtn.addEventListener('click', async () => {
  const code = parseInviteCode(joinLinkInput.value);
  if (!code) { joinModalError.textContent = 'Please enter an invite link or code.'; return; }

  joinModalJoinBtn.disabled    = true;
  joinModalJoinBtn.textContent = 'Joining…';
  joinModalError.textContent   = '';

  try {
    const room = await apiFetch('/api/rooms/join', {
      method: 'POST',
      body:   JSON.stringify({ code }),
    });
    // Add to sidebar if not already present (user may be rejoining)
    if (!state.rooms.find(r => r._id === room._id)) {
      state.rooms.unshift(room);
      renderRooms();
    }
    closeJoinModal();
    openRoom(room._id);
  } catch (err) {
    joinModalError.textContent   = err.message;
    joinModalJoinBtn.disabled    = false;
    joinModalJoinBtn.textContent = 'Join Room';
  }
});

// ── Copy invite link ──────────────────────────────────────────────────────────
copyLinkBtn.addEventListener('click', () => {
  const room = state.rooms.find(r => r._id === state.activeRoomId);
  if (!room?.inviteCode) return;

  const link = `${location.origin}/join.html?code=${room.inviteCode}`;
  navigator.clipboard.writeText(link).then(() => {
    const prev = copyLinkBtn.textContent;
    copyLinkBtn.textContent = '✓ Copied!';
    setTimeout(() => { copyLinkBtn.textContent = prev; }, 2000);
  });
});

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  if (state.ws) state.ws.close();
  ['token', 'userId', 'username'].forEach(k => localStorage.removeItem(k));
  window.location.replace('index.html');
});

// Mobile back button — returns to the room list without closing the WS.
backBtn.addEventListener('click', () => {
  state.activeRoomId  = null;
  state.activeMembers = [];
  renderRooms();
  hideChatArea();
});

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = '';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}?token=${token}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.reconnectDelay = 1000;
    startPing(ws);

    // Load rooms on connect; also auto-open if ?room= is in the URL
    loadRooms().then(() => {
      const roomParam = new URLSearchParams(location.search).get('room');
      if (roomParam) {
        // Clean the URL so refreshing doesn't re-trigger the open
        history.replaceState(null, '', location.pathname);
        openRoom(roomParam);
      }
    });
  });

  ws.addEventListener('message', event => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.type === 'presence') {
      state.onlineUserIds = new Set(msg.users.map(u => u.userId));
      // Re-render member panel if a room is open
      if (state.activeRoomId) renderMembers();
    }

    if (msg.type === 'message') {
      const { roomId, messageId, senderId, senderUsername, text, createdAt } = msg;

      if (roomId === state.activeRoomId) {
        appendMessage({ _id: messageId, roomId, senderId, senderUsername, text, createdAt });
        state.messages.push({ _id: messageId, roomId, senderId, senderUsername, text, createdAt });
      }

      // Float the room to the top of the sidebar
      const idx = state.rooms.findIndex(r => r._id === roomId);
      if (idx > 0) {
        const [room] = state.rooms.splice(idx, 1);
        state.rooms.unshift(room);
        renderRooms();
      } else if (idx === -1) {
        loadRooms(); // message for a room we don't have yet — refresh list
      }
    }

    if (msg.type === 'member_joined') {
      const { roomId, member } = msg;
      if (roomId === state.activeRoomId) {
        const alreadyThere = state.activeMembers.some(m => m._id.toString() === member._id.toString());
        if (!alreadyThere) {
          state.activeMembers.push(member);
          renderMembers();
        }
      }
    }

    if (msg.type === 'member_left') {
      const { roomId, userId: leftUserId } = msg;
      if (roomId === state.activeRoomId) {
        state.activeMembers = state.activeMembers.filter(m => m._id.toString() !== leftUserId);
        renderMembers();
      }
    }

    if (msg.type === 'room_updated') {
      const { roomId, name } = msg;
      const room = state.rooms.find(r => r._id === roomId);
      if (room) {
        room.name = name;
        renderRooms();
        if (roomId === state.activeRoomId) chatHeaderName.textContent = `# ${name}`;
      }
    }

    if (msg.type === 'room_deleted') {
      const { roomId } = msg;
      state.rooms = state.rooms.filter(r => r._id !== roomId);
      renderRooms();
      if (roomId === state.activeRoomId) {
        state.activeRoomId  = null;
        state.activeMembers = [];
        hideChatArea();
      }
    }
  });

  ws.addEventListener('close', event => {
    if (event.code === 4001) {
      localStorage.removeItem('token');
      window.location.replace('index.html');
      return;
    }
    state.onlineUserIds = new Set();
    if (state.activeRoomId) renderMembers();
    setTimeout(connect, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
  });

  ws.addEventListener('error', () => {
    // 'close' fires right after 'error'; reconnect logic lives there
  });
}

function startPing(ws) {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    else clearInterval(interval);
  }, 30000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
hideChatArea();
connect();
