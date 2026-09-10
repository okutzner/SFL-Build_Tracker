// "Who are you" identity layer for the Short Form Learning tracker.
// Now backed by real Firebase Authentication (Google sign-in), restricted
// to @curtin.edu.au accounts. This replaces the old honesty-system
// name-picker: the display name stamped on every change now comes from a
// verified Google account, not free text anyone could type.

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
        border-radius:12px; padding:26px 26px 22px; width:100%; max-width:380px; text-align:center;
        font-family:var(--font,'Inter',sans-serif); color:var(--text,#F2F2F0); }
      .identity-modal h2{ font-size:18px; font-weight:800; margin:0 0 6px; }
      .identity-modal p{ font-size:13px; color:var(--text-soft,#9A9A9A); margin:0 0 18px; line-height:1.4; }
      .identity-google-btn{ display:flex; align-items:center; justify-content:center; gap:10px;
        background:var(--gold,#E0A73A); color:var(--gold-ink,#1A1408); border:none;
        border-radius:8px; padding:11px 18px; font-family:inherit; font-weight:700; font-size:13.5px;
        cursor:pointer; width:100%; }
      .identity-google-btn:disabled{ opacity:0.5; cursor:not-allowed; }
      .identity-error{ color:var(--red,#E2735A); font-size:12.5px; margin-top:14px; }
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

  // Derive a friendly display name from the Google account: prefer the
  // profile display name, fall back to the email's local part, title-cased.
  function friendlyName(user) {
    if (user.displayName) return user.displayName;
    const local = (user.email || 'Unknown').split('@')[0];
    return local.replace(/[._]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function isAllowedDomain(user) {
    return !!user && !!user.email && user.emailVerified &&
      user.email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
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
    badge.innerHTML = `You: <b>${escapeHtml(name)}</b> · <button class="identity-switch" id="identity-switch-btn">sign out</button>`;
    const btn = document.getElementById('identity-switch-btn');
    if (btn) btn.addEventListener('click', () => firebase.auth().signOut());
  }

  function showSignInScreen(errorMsg) {
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
        <h2>Sign in required</h2>
        <p>This board is restricted to Curtin (@${ALLOWED_DOMAIN}) accounts. Sign in with your Curtin Google account to continue.</p>
        <button class="identity-google-btn" id="identity-google-btn">Sign in with Google</button>
        ${errorMsg ? `<div class="identity-error">${escapeHtml(errorMsg)}</div>` : ''}
      </div>
    `;
    const btn = overlay.querySelector('#identity-google-btn');
    btn.addEventListener('click', () => {
      btn.disabled = true;
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ hd: ALLOWED_DOMAIN }); // hints Google's picker, not a security boundary on its own
      firebase.auth().signInWithPopup(provider).catch(err => {
        console.error('Sign-in failed:', err);
        showSignInScreen('Sign-in failed — try again.');
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

    // Call once on page load. `callback` runs whenever a valid, allowed
    // session becomes active (initial load, or after a fresh sign-in).
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
          // Signed in, but with the wrong account — reject and force sign-out
          // so a stray personal Google session can't linger.
          firebase.auth().signOut();
          showSignInScreen(`"${user.email}" isn't a @${ALLOWED_DOMAIN} account.`);
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
