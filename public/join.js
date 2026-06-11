// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  mode:  'login',   // 'login' | 'register'
  token: localStorage.getItem('token'),
  code:  new URLSearchParams(location.search).get('code'),
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authPanel      = document.getElementById('auth-panel');
const joinPanel      = document.getElementById('join-panel');
const loadingEl      = document.getElementById('join-loading');
const contentEl      = document.getElementById('join-content');
const invalidEl      = document.getElementById('join-invalid');
const roomNameEl     = document.getElementById('join-room-name');
const memberCountEl  = document.getElementById('join-member-count');
const joinBtn        = document.getElementById('join-btn');
const joinErrorEl    = document.getElementById('join-error');

const usernameInput  = document.getElementById('j-username');
const passwordInput  = document.getElementById('j-password');
const authSubmitBtn  = document.getElementById('auth-submit-btn');
const authErrorEl    = document.getElementById('auth-error');
const authToggleBtn  = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

// ── Init: decide which panel to show ─────────────────────────────────────────
if (!state.code) {
  // Landed here without a code — nothing to join
  showJoinPanel();
  showInvalid();
} else if (state.token) {
  showJoinPanel();
  loadPreview();
} else {
  showAuthPanel();
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
function showAuthPanel() {
  authPanel.style.display = 'block';
  joinPanel.style.display = 'none';
}

function showJoinPanel() {
  authPanel.style.display = 'none';
  joinPanel.style.display = 'block';
}

function showInvalid() {
  loadingEl.style.display = 'none';
  invalidEl.style.display = 'block';
}

// ── Inline auth form ──────────────────────────────────────────────────────────
function setAuthMode(mode) {
  state.mode = mode;
  authErrorEl.textContent = '';
  if (mode === 'login') {
    authSubmitBtn.textContent  = 'Sign in';
    authToggleText.textContent = "Don't have an account?";
    authToggleBtn.textContent  = 'Register';
  } else {
    authSubmitBtn.textContent  = 'Register';
    authToggleText.textContent = 'Already have an account?';
    authToggleBtn.textContent  = 'Sign in';
  }
}

authToggleBtn.addEventListener('click', () => {
  setAuthMode(state.mode === 'login' ? 'register' : 'login');
});

authSubmitBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    authErrorEl.textContent = 'Username and password are required.';
    return;
  }

  authSubmitBtn.disabled    = true;
  authSubmitBtn.textContent = 'Please wait…';
  authErrorEl.textContent   = '';

  try {
    if (state.mode === 'register') {
      await callAuth('/api/register', { username, password });
    }
    const data = await callAuth('/api/login', { username, password });
    localStorage.setItem('token',    data.token);
    localStorage.setItem('userId',   data.userId);
    localStorage.setItem('username', data.username);
    state.token = data.token;

    // Transition to room preview without a page reload
    showJoinPanel();
    loadPreview();
  } catch (err) {
    authErrorEl.textContent   = err.message;
    authSubmitBtn.disabled    = false;
    setAuthMode(state.mode);  // restore button text
  }
});

[usernameInput, passwordInput].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmitBtn.click(); });
});

// ── Room preview ──────────────────────────────────────────────────────────────
async function loadPreview() {
  try {
    const res = await fetch(`/api/rooms/join?code=${encodeURIComponent(state.code)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) { showInvalid(); return; }

    const room = await res.json();
    roomNameEl.textContent    = room.name;
    memberCountEl.textContent = `${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}`;
    loadingEl.style.display   = 'none';
    contentEl.style.display   = 'block';
  } catch {
    showInvalid();
  }
}

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  joinBtn.disabled      = true;
  joinBtn.textContent   = 'Joining…';
  joinErrorEl.textContent = '';

  try {
    const res = await fetch('/api/rooms/join', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body:    JSON.stringify({ code: state.code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to join room');
    }
    const room = await res.json();
    window.location.replace(`chat.html?room=${room._id}`);
  } catch (err) {
    joinErrorEl.textContent = err.message;
    joinBtn.disabled        = false;
    joinBtn.textContent     = 'Join Room';
  }
});
