// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('token');

if (!token) {
  // Save the full join URL so app.js can redirect back here after login
  localStorage.setItem('pending_join', location.search);
  window.location.replace('index.html');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl    = document.getElementById('join-loading');
const contentEl    = document.getElementById('join-content');
const invalidEl    = document.getElementById('join-invalid');
const roomNameEl   = document.getElementById('join-room-name');
const memberCountEl = document.getElementById('join-member-count');
const joinBtn      = document.getElementById('join-btn');
const errorEl      = document.getElementById('error-msg');

// ── Read invite code from URL ─────────────────────────────────────────────────
const code = new URLSearchParams(location.search).get('code');

if (!code) {
  showInvalid();
} else {
  loadPreview(code);
}

// ── Preview ───────────────────────────────────────────────────────────────────
async function loadPreview(code) {
  try {
    const res = await fetch(`/api/rooms/join?code=${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) { showInvalid(); return; }

    const room = await res.json();
    roomNameEl.textContent   = room.name;
    memberCountEl.textContent = `${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}`;

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch {
    showInvalid();
  }
}

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  joinBtn.disabled    = true;
  joinBtn.textContent = 'Joining…';
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to join room');
    }

    const room = await res.json();
    // Open the room directly in chat
    window.location.replace(`chat.html?room=${room._id}`);
  } catch (err) {
    errorEl.textContent     = err.message;
    joinBtn.disabled        = false;
    joinBtn.textContent     = 'Join Room';
  }
});

function showInvalid() {
  loadingEl.style.display = 'none';
  invalidEl.style.display = 'block';
}
