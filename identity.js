// "Who are you" identity layer for the Short Form Learning tracker.
// Backed by Firebase Authentication (email/password). Accounts are created
// manually by an admin in the Firebase console — there is no public sign-up
// here, which is the actual access control for this stopgap: only people
// an admin has personally added can ever get a valid login.

(function () {
  const ALLOWED_DOMAIN = 'curtin.edu.au';

  function injectStyles() {
    if (document.getElementById('identity-styles')) return;
    const style = document.createElement('style');
    style.id = 'identity-styles';
    style.textContent = `
      .identity-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex;
        align-items:center; justify-content:center; z-index:100; padding:20px; }
      .identity-modal{ background:var(--panel,#17171A); border:1px solid var(--border-strong,rgba(255,255,255,0.18));
        border-radius:12px; padding:26px 26px 22px; width:100%; max-width:360px;
        font-family:var(--font,'Inter',sans-serif); color:var(--text,#F2F2F0); }
      .identity-modal h2{ font-size:18px; font-weight:800; margin:0 0 6px; }
      .identity-modal p{ font-size:13px; color:var(--text-soft,#9A9A9A); margin:0 0 18px; line-height:1.4; }
      .identity-field{ margin-bottom:13px; }
      .identity-field label{ display:block; font-size:11px; font-weight:700; letter-spacing:0.05em;
        text-transform:uppercase; color:var(--text-soft,#9A9A9A); margin-bottom:6px; }
      .identity-field input{ width:100%; padding:9px 10px; border:1px solid var(--border-strong,rgba(255,255,255,0.18));
        border-radius:7px; font-family:inherit; font-size:14px; background:var(--panel-alt,#1D1D21); color:var(--text,#F2F2F0);
        box-sizing:border-box; }
      .identity-field input:focus{ outline:none; border-color:var(--gold,#E0A73A);
        box-shadow:0 0 0 3px rgba(224,167,58,0.28); }
      .identity-submit{ background:var(--gold,#E0A73A); color:var(--gold-ink,#1A1408); border:none;
        border-radius:8px; padding:11px 18px; font-family:inherit; font-weight:700; font-size:13.5px;
        cursor:pointer; width:100%; margin-top:4px; }
      .identity-submit:disabled{ opacity:0.5; cursor:not-allowed; }
      .identity-links{ display:flex; justify-content:space-between; margin-top:12px; }
      .identity-link-btn{ background:none; border:none; color:var(--text-faint,#8A8A8A); font-size:12px;
        text-decoration:underline; cursor:pointer; padding:0; font-family:inherit; }
      .identity-link-btn:hover{ color:var(--gold,#E0A73A); }
      .identity-error{ color:var(--red,#E2735A); font-size:12.5px; margin-top:14px; }
      .identity-notice{ color:var(--teal,#4FBFA8); font-size:12.5px; margin-top:14px; }
      .identity-badge{ margin-left:auto; display:flex; align-items:center; gap:8px; font-size:12.5px;
        color:var(--text-soft,#9A9A9A); font-family:var(--font,'Inter',sans-serif); }
      .identity-badge b{ color:var(--text,#F2F2F0); font-weight:600; }
      .identity-switch{ background:none; border:none; color:var(--text-faint,#8A8A8A); font-size:12px;
        text-decoration:underline; cursor:pointer; padding:0; font-family:inherit; }
      .identity-switch:hover{ color:var(--gold,#E0A73A); }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function friendlyName(user) {
    if (user.displayName) return user.displayName;
    const local = (user.email || 'Unknown').split('@')[0];
    return local.replace(/[._]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function isAllowedDomain(user) {
    return !!user && !!user.email && user.email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
  }

  function friendlyAuthError(err) {
    switch (err.code) {
      case 'auth/invalid-email': return 'That doesn\u2019t look like a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email or password not recognised.';
      case 'auth/too-many-requests': return 'Too many attempts \u2014 wait a bit and try again.';
      default: return 'Sign-in failed \u2014 try again.';
    }
  }

  function renderBadge(name) {
    let badge = document.getElementById('identity-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'identity-badge';
      badge.className = 'identity-badge';
      const topbar = document.querySelector('.topbar');
      if (topbar) topbar.appendChild(badge);
    }
    badge.innerHTML = `You: <b>${escapeHtml(name)}</b> \u00b7 <button class="identity-switch" id="identity-switch-btn">sign out</button>`;
    const btn = document.getElementById('identity-switch-btn');
    if (btn) btn.addEventListener('click', () => firebase.auth().signOut());
  }

  function showSignInScreen(message, isError) {
    injectStyles();
    let overlay = document.getElementById('identity-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'identity-overlay';
      overlay.className = 'identity-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="identity-modal">
        <h2>Sign in</h2>
        <p>Sign in with the Curtin email and password you were given for this board.</p>
        <div class="identity-field">
          <label for="identity-email">Email</label>
          <input id="identity-email" type="email" placeholder="you@curtin.edu.au" autocomplete="username">
        </div>
        <div class="identity-field">
          <label for="identity-password">Password</label>
          <input id="identity-password" type="password" autocomplete="current-password">
        </div>
        <button class="identity-submit" id="identity-submit-btn">Sign in</button>
        <div class="identity-links">
          <button class="identity-link-btn" id="identity-forgot-btn" type="button">Forgot password?</button>
        </div>
        ${message ? `<div class="${isError ? 'identity-error' : 'identity-notice'}">${escapeHtml(message)}</div>` : ''}
      </div>
    `;

    const emailInput = overlay.querySelector('#identity-email');
    const passwordInput = overlay.querySelector('#identity-password');
    const submitBtn = overlay.querySelector('#identity-submit-btn');
    const forgotBtn = overlay.querySelector('#identity-forgot-btn');

    function doSignIn() {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) return;
      submitBtn.disabled = true;
      firebase.auth().signInWithEmailAndPassword(email, password).catch(err => {
        console.error('Sign-in failed:', err);
        showSignInScreen(friendlyAuthError(err), true);
      });
    }

    submitBtn.addEventListener('click', doSignIn);
    passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });

    forgotBtn.addEventListener('click', () => {
      const email = emailInput.value.trim();
      if (!email) {
        showSignInScreen('Enter your email above first, then click "Forgot password?" again.', true);
        return;
      }
      forgotBtn.disabled = true;
      firebase.auth().sendPasswordResetEmail(email).then(() => {
        showSignInScreen('Reset link sent \u2014 check your Curtin inbox.', false);
      }).catch(err => {
        console.error('Password reset failed:', err);
        // Deliberately vague: don't reveal whether the address has an account.
        showSignInScreen('If that address has an account, a reset link has been sent.', false);
      });
    });
  }

  function hideSignInScreen() {
    const overlay = document.getElementById('identity-overlay');
    if (overlay) overlay.remove();
  }

  window.Identity = {
    current: null,
    get() { return window.Identity.current; },
    _onReady: null,

    require(callback) {
      injectStyles();
      window.Identity._onReady = callback;

      firebase.auth().onAuthStateChanged(user => {
        if (!user) {
          window.Identity.current = null;
          const badge = document.getElementById('identity-badge');
          if (badge) badge.remove();
          showSignInScreen();
          return;
        }
        if (!isAllowedDomain(user)) {
          firebase.auth().signOut();
          showSignInScreen(`"${user.email}" isn't a @${ALLOWED_DOMAIN} account.`, true);
          return;
        }
        const name = friendlyName(user);
        window.Identity.current = name;
        hideSignInScreen();
        renderBadge(name);
        if (window.Identity._onReady) window.Identity._onReady(name);
      });
    }
  };
})();
