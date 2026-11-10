/* ===========================================================================
   Waitlist — signup, queue position, referral.

   Signup goes through the join_waitlist RPC rather than a table insert, so the
   caller is handed back only its own position and code. A plain insert cannot
   return data without a SELECT policy, and any SELECT policy broad enough to
   read your own row is broad enough to enumerate the list.
   See supabase.sql.
   =========================================================================== */
(() => {
  'use strict';

  const CFG = {
    url:     'YOUR_SUPABASE_PROJECT_URL',   /* e.g. https://abcdefgh.supabase.co */
    anonKey: 'YOUR_SUPABASE_ANON_KEY',      /* publishable key — safe in client code */
  };

  const configured = () => CFG.url && !CFG.url.startsWith('YOUR_');

  const rpc = (fn, body) =>
    fetch(`${CFG.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: CFG.anonKey,
        Authorization: `Bearer ${CFG.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    });

  /* Anyone arriving on a ?ref= link is credited to that referrer. */
  const referrer = () => {
    try { return new URL(location.href).searchParams.get('ref') || null; }
    catch { return null; }
  };

  const shareUrl = code =>
    `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;

  const form = document.getElementById('join');
  if (!form) return;

  const field  = form.querySelector('input[type="email"]');
  const trap   = form.querySelector('input[name="company"]');
  const button = form.querySelector('button[type="submit"]');
  const msg    = document.getElementById('join-msg');

  const say = (html, state) => {
    msg.innerHTML = html;
    if (state) msg.dataset.state = state; else delete msg.dataset.state;
    msg.hidden = false;
  };

  let busy = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;

    /* Bots fill hidden fields; people don't. Report success, send nothing. */
    if (trap && trap.value.trim()) { say('You are on the list.'); return; }

    const email = field.value.trim();
    if (!email || !field.checkValidity()) {
      field.focus();
      say('Enter a valid email address.', 'error');
      return;
    }
    if (!configured()) {
      say('Waitlist storage is not configured yet.', 'error');
      return;
    }

    busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    msg.hidden = true;

    try {
      const res = await rpc('join_waitlist', {
        p_email:  email,
        p_ref:    referrer(),
        p_source: location.hostname || 'direct',
      });
      if (!res.ok) throw new Error(`rpc_${res.status}`);
      const data = await res.json();
      const url  = shareUrl(data.code);

      say(
        `<span class="join__queue">You are #${data.position} in line.</span>` +
        `Every creator you refer moves you up five places.` +
        `<span class="join__share">` +
          `<input readonly value="${url}" aria-label="Your referral link">` +
          `<button type="button" data-copy="${url}">Copy</button>` +
        `</span>`
      );
      form.reset();
    } catch {
      say('We could not reach the server. Please try again.', 'error');
    } finally {
      busy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });

  msg.addEventListener('click', event => {
    const btn = event.target.closest('[data-copy]');
    if (!btn || !navigator.clipboard) return;
    navigator.clipboard.writeText(btn.dataset.copy).then(() => {
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1800);
    });
  });
})();
