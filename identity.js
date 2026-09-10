// Lightweight "who are you" identity layer for the Short Form Learning tracker.
// Not real authentication — anyone can pick any name — but it gives every
// change a name attached to it, which is what an internal team board needs
// for a basic audit trail without requiring logins.

(function () {
  const STORAGE_KEY = 'sfl_tracker_identity';
  const NAMES = ['Oliver', 'Becca', 'Miah', 'Eleanor', 'Glenn', 'Gorgia', 'Rebecca'];

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch (e) { return null; }
  }
  function setStored(name) {
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
  }
  function clearStored() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById('identity-styles')) return;
    const style = document.createElement('style');
    style.id = 'identity-styles';
    style.textContent = `
      .identity-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex;
        align-items:center; justify-content:center; z-index:100; padding:20px; }
      .identity-modal{ background:var(--panel,#17171A); border:1px solid var(--border-strong,rgba(255,255,255,0.18));
        border-radius:12px; padding:26px 26px 22px; width:100%; max-width:380px;
        font-family:var(--font,'Inter',sans-serif); color:var(--text,#F2F2F0); }
      .identity-modal h2{ font-size:18px; font-weight:800; margin:0 0 6px; }
      .identity-modal p{ font-size:13px; color:var(--text-soft,#9A9A9A); margin:0 0 18px; line-height:1.4; }
      .identity-pillrow{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
      .identity-pill{ background:transparent; border:1px solid var(--border-strong,rgba(255,255,255,0.18));
        color:var(--text-soft,#9A9A9A); border-radius:20px; padding:8px 16px; font-family:inherit;
        font-size:13.5px; font-weight:500; cursor:pointer; }
      .identity-pill:hover{ border-color:var(--text-soft,#9A9A9A); color:var(--text,#F2F2F0); }
      .identity-pill.active{ border-color:var(--gold,#E0A73A); color:var(--gold,#E0A73A);
        background:rgba(224,167,58,0.14); font-weight:600; }
      .identity-other-row{ display:flex; gap:8px; margin-bottom:16px; }
      .identity-other-row input{ flex:1; padding:9px 10px; border:1px solid var(--border-strong,rgba(255,255,255,0.18));
        border-radius:7px; font-family:inherit; font-size:14px; background:var(--panel-alt,#1D1D21); color:var(--text,#F2F2F0); }
      .identity-confirm{ background:var(--gold,#E0A73A); color:var(--gold-ink,#1A1408); border:none;
        border-radius:8px; padding:10px 18px; font-family:inherit; font-weight:700; font-size:13.5px;
        cursor:pointer; width:100%; }
      .identity-confirm:disabled{ opacity:0.5; cursor:not-allowed; }
      .identity-badge{ margin-left:auto; display:flex; align-items:center; gap:8px; font-size:12.5px;
        color:var(--text-soft,#9A9A9A); font-family:var(--font,'Inter',sans-serif); }
      .identity-badge b{ color:var(--text,#F2F2F0); font-weight:600; }
      .identity-switch{ background:none; border:none; color:var(--text-faint,#8A8A8A); font-size:12px;
        text-decoration:underline; cursor:pointer; padding:0; font-family:inherit; }
      .identity-switch:hover{ color:var(--gold,#E0A73A); }
    `;
    document.head.appendChild(style);
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
    badge.innerHTML = `You: <b>${escapeHtml(name)}</b> · <button class="identity-switch" id="identity-switch-btn">switch</button>`;
    const btn = document.getElementById('identity-switch-btn');
    if (btn) btn.addEventListener('click', () => promptIdentity(true));
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function promptIdentity(isSwitch) {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'identity-overlay';
    overlay.innerHTML = `
      <div class="identity-modal">
        <h2>${isSwitch ? 'Switch user' : "Who's this?"}</h2>
        <p>Pick your name so changes on this board can be tracked back to someone. This isn't a password — just an honesty system for the team.</p>
        <div class="identity-pillrow" id="identity-pillrow">
          ${NAMES.map(n => `<button class="identity-pill" data-name="${n}">${n}</button>`).join('')}
          <button class="identity-pill" id="identity-other-pill" data-name="__other__">Other</button>
        </div>
        <div class="identity-other-row" id="identity-other-row" style="display:none;">
          <input type="text" id="identity-other-input" placeholder="Enter your name">
        </div>
        <button class="identity-confirm" id="identity-confirm-btn" disabled>Continue</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let selected = null;
    const confirmBtn = overlay.querySelector('#identity-confirm-btn');
    const otherRow = overlay.querySelector('#identity-other-row');
    const otherInput = overlay.querySelector('#identity-other-input');

    overlay.querySelectorAll('.identity-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        overlay.querySelectorAll('.identity-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (pill.dataset.name === '__other__') {
          otherRow.style.display = 'flex';
          selected = otherInput.value.trim() || null;
          otherInput.focus();
        } else {
          otherRow.style.display = 'none';
          selected = pill.dataset.name;
        }
        confirmBtn.disabled = !selected;
      });
    });
    otherInput.addEventListener('input', () => {
      selected = otherInput.value.trim() || null;
      confirmBtn.disabled = !selected;
    });

    confirmBtn.addEventListener('click', () => {
      if (!selected) return;
      setStored(selected);
      overlay.remove();
      renderBadge(selected);
      if (window.Identity._onReady) window.Identity._onReady(selected);
    });
  }

  window.Identity = {
    NAMES,
    current: getStored(),
    get() { return getStored(); },
    clear: clearStored,
    _onReady: null,
    // Call once on page load. `callback` runs immediately if an identity is
    // already stored, or after the person picks one for the first time.
    require(callback) {
      injectStyles();
      const existing = getStored();
      if (existing) {
        renderBadge(existing);
        callback(existing);
      } else {
        window.Identity._onReady = callback;
        promptIdentity(false);
      }
    }
  };
})();
