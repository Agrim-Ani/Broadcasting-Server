// Single state object — the only source of truth for this page
const state = {
  mode: 'login',   // 'login' | 'register'
  loading: false,
};

// If already authenticated, send straight to chat
if (localStorage.getItem('token')) {
  window.location.replace('chat.html');
}

// Honour ?mode=register so the homepage "Get started" link opens the register form
const initialMode = new URLSearchParams(location.search).get('mode');
if (initialMode === 'register') state.mode = 'register';

const form       = document.getElementById('auth-form');
const titleEl    = document.getElementById('form-title');
const subtitleEl = document.getElementById('form-subtitle');
const submitBtn  = document.getElementById('submit-btn');
const errorEl    = document.getElementById('error-msg');
const toggleBtn  = document.getElementById('toggle-btn');
const toggleText = document.getElementById('toggle-text');

// Flip between login and register views without re-rendering the DOM
function setMode(mode) {
  state.mode = mode;
  errorEl.textContent = '';

  if (mode === 'login') {
    titleEl.textContent    = 'Sign in';
    subtitleEl.textContent = 'Welcome back. Enter your credentials.';
    submitBtn.textContent  = 'Sign in';
    toggleText.textContent = "Don't have an account?";
    toggleBtn.textContent  = 'Register';
  } else {
    titleEl.textContent    = 'Create account';
    subtitleEl.textContent = 'Pick a username and password to get started.';
    submitBtn.textContent  = 'Register';
    toggleText.textContent = 'Already have an account?';
    toggleBtn.textContent  = 'Sign in';
  }
}

function setLoading(on) {
  state.loading = on;
  submitBtn.disabled = on;
  submitBtn.textContent = on
    ? 'Please wait…'
    : state.mode === 'login' ? 'Sign in' : 'Register';
}

function showError(msg) {
  errorEl.textContent = msg;
}

function redirectAfterAuth() {
  window.location.replace('chat.html');
}

// POST to /api/login or /api/register; returns parsed JSON or throws with message
async function callAuth(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.loading) return;

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showError('Username and password are required.');
    return;
  }

  setLoading(true);
  showError('');

  try {
    if (state.mode === 'login') {
      const { token, userId, username: name } = await callAuth('/api/login', { username, password });
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
      localStorage.setItem('username', name);
      redirectAfterAuth();
    } else {
      // Register then immediately log in so the user lands in chat
      await callAuth('/api/register', { username, password });
      const { token, userId, username: name } = await callAuth('/api/login', { username, password });
      localStorage.setItem('token', token);
      localStorage.setItem('userId', userId);
      localStorage.setItem('username', name);
      redirectAfterAuth();
    }
  } catch (err) {
    showError(err.message);
    setLoading(false);
  }
});

toggleBtn.addEventListener('click', () => {
  setMode(state.mode === 'login' ? 'register' : 'login');
});

// Apply initial mode after DOM refs are set up
setMode(state.mode);
