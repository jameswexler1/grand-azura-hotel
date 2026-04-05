/**
 * =============================================================================
 * GRAND AZURA HOTEL — Booking System JS  (v2 — patched)
 * Multi-step form + Stripe Payment Element
 *
 * Fixes vs v1:
 *  • safeJsonFetch() — reads response as text first, never crashes on HTML 404
 *  • isLocalDev()    — detects Hugo server / localhost, shows clear dev notice
 *  • showDevNotice() — renders an informative in-page card instead of crashing
 *  • All error paths surface human-readable messages, never raw JSON.parse throws
 * =============================================================================
 */
(function () {
  'use strict';

  /* ── Config ───────────────────────────────────────────────────────────── */
  // Replace this with your real Stripe PUBLISHABLE key (pk_live_... or pk_test_...)
  const STRIPE_PUBLISHABLE_KEY = 'pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY';
  const API_ENDPOINT           = '/.netlify/functions/create-payment-intent';
  const SUCCESS_URL            = '/booking/success/';

  /* ── State ────────────────────────────────────────────────────────────── */
  const state = {
    currentStep:  1,
    selectedRoom: null,
    checkin:      null,
    checkout:     null,
    nights:       0,
    guests:       2,
    guestName:    '',
    guestEmail:   '',
    guestPhone:   '',
    specialReqs:  '',
    stripeReady:  false,
    stripe:       null,
    elements:     null,
    paymentEl:    null,
    clientSecret: null,
    isSubmitting: false,
  };

  /* ── DOM shortcut ─────────────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /* ── Detect local Hugo dev server ─────────────────────────────────────── */
  function isLocalDev() {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
  }

  /* ── Safe JSON fetch — never throws on non-JSON (HTML 404 etc.) ────────── */
  async function safeJsonFetch(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      throw new Error('Network error — please check your connection and try again.');
    }

    // Read body as text first — this never throws on HTML content
    const text = await res.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Server returned non-JSON (HTML error page, proxy issue, cold-start, etc.)
      if (!res.ok) {
        throw new Error(
          `Server returned ${res.status} ${res.statusText}. ` +
          (isLocalDev()
            ? 'Netlify Functions are not available with `hugo server`. Run `netlify dev` instead (see dev notice on page).'
            : 'Please try again or call us directly.')
        );
      }
      throw new Error(`Unexpected server response (status ${res.status}). Please try again.`);
    }

    if (!res.ok || data.error) {
      throw new Error(data.error || `Request failed with status ${res.status}.`);
    }

    return data;
  }

  /* ── Utilities ────────────────────────────────────────────────────────── */
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const formatCurrency = (eur) =>
    '€' + Number(eur).toLocaleString('de-DE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });

  const calcNights = (checkin, checkout) => {
    if (!checkin || !checkout) return 0;
    return Math.max(0, Math.round(
      (new Date(checkout) - new Date(checkin)) / (1000 * 60 * 60 * 24)
    ));
  };

  const showError = (elId, msg) => {
    const el = $(elId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  };

  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  /* ── Local dev notice (shown on step 3 when running hugo server) ──────── */
  function showDevNotice() {
    const container = $('stripe-payment-element');
    if (!container) return;
    container.innerHTML = `
      <div style="
        padding: var(--sp-8) var(--sp-7);
        background: var(--dark);
        border: 1px solid rgba(184,144,74,0.25);
        display: flex;
        flex-direction: column;
        gap: var(--sp-5);
      ">
        <div style="display:flex; align-items:center; gap: var(--sp-3);">
          <span style="font-size:1.3rem;">🛠</span>
          <span style="font-size: var(--fs-xs); font-weight:500; letter-spacing:0.16em;
                        text-transform:uppercase; color: var(--gold);">Local Development Mode</span>
        </div>
        <p style="font-size: var(--fs-sm); font-weight:300; color: var(--cream); line-height:1.8;">
          Stripe payments require the <strong style="color:var(--ivory);">Netlify Functions</strong>
          runtime, which is not available with <code style="color:var(--gold-light); font-size:0.9em;">hugo server</code>.
        </p>
        <div style="background: var(--void); border: 1px solid var(--border);
                    padding: var(--sp-5) var(--sp-6); display:flex; flex-direction:column; gap: var(--sp-3);">
          <p style="font-size: var(--fs-xs); font-weight:500; letter-spacing:0.14em;
                     text-transform:uppercase; color: var(--text-muted);">To test payments locally:</p>
          <p style="font-family: monospace; font-size: var(--fs-sm); color: var(--gold-light); line-height:1.9;">
            npm install -g netlify-cli<br>
            netlify dev
          </p>
          <p style="font-size: var(--fs-sm); color: var(--text-subdued); font-weight:300;">
            Then open <span style="color:var(--gold-light);">http://localhost:8888/booking/</span><br>
            Netlify Dev runs both Hugo and the serverless functions simultaneously.
          </p>
        </div>
        <div style="padding: var(--sp-4) var(--sp-5); background: rgba(184,144,74,0.06);
                    border: 1px solid rgba(184,144,74,0.15);">
          <p style="font-size: var(--fs-xs); color: var(--text-subdued); line-height:1.7;">
            <strong style="color:var(--ivory);">Also required:</strong> Set your Stripe keys —
            replace <code style="color:var(--gold-light);">pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY</code>
            in <code>assets/js/booking.js</code> and add
            <code style="color:var(--gold-light);">STRIPE_SECRET_KEY</code>
            to your Netlify environment variables or a local <code>.env</code> file.
          </p>
        </div>
        <p style="font-size: var(--fs-xs); color: var(--text-muted);">
          Stripe test card: <span style="color:var(--ivory); font-family:monospace;">4242 4242 4242 4242</span>
          · Any future expiry · Any CVC
        </p>
      </div>
    `;

    // Enable the submit button to show a clear message when clicked in dev mode
    const submitBtn = $('submit-payment');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.addEventListener('click', () => {
        showPaymentError(
          'Payments are not available with `hugo server`. ' +
          'Run `netlify dev` to test the full payment flow locally.'
        );
      }, { once: true });
    }
  }

  /* ── Step Navigation ──────────────────────────────────────────────────── */
  function goToStep(stepNum) {
    document.querySelectorAll('.booking-panel').forEach(p => p.classList.remove('is-active'));

    document.querySelectorAll('.booking-step').forEach((s, i) => {
      const n = i + 1;
      s.classList.remove('active', 'completed');
      if (n < stepNum) s.classList.add('completed');
      if (n === stepNum) s.classList.add('active');
    });

    const panel = $(`panel-${stepNum}`);
    if (panel) panel.classList.add('is-active');

    state.currentStep = stepNum;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Room Selection ───────────────────────────────────────────────────── */
  function initRoomSelection() {
    const cards = document.querySelectorAll('.room-select-card');

    cards.forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (!radio) return;

      const selectCard = () => {
        cards.forEach(c => c.classList.remove('is-selected'));
        document.querySelectorAll('.room-select-card input').forEach(r => r.checked = false);

        card.classList.add('is-selected');
        radio.checked = true;

        state.selectedRoom = {
          id:       radio.value,
          name:     radio.dataset.name,
          price:    parseFloat(radio.dataset.price),
          image:    radio.dataset.image,
          size:     radio.dataset.size,
          bed:      radio.dataset.bed,
          maxGuests:parseInt(radio.dataset.guests, 10),
          category: radio.dataset.category,
        };

        // Update guest max if needed
        const gEl = $('b-guests');
        if (gEl && state.selectedRoom.maxGuests) {
          // Remove options exceeding room max
          [...gEl.options].forEach(opt => {
            const v = parseInt(opt.value, 10);
            opt.disabled = v > state.selectedRoom.maxGuests;
            if (opt.disabled && gEl.value === opt.value) {
              gEl.value = String(state.selectedRoom.maxGuests);
            }
          });
        }

        showError('step1-error', '');
        updateSummary();
      };

      card.addEventListener('click', selectCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(); }
      });
      card.setAttribute('tabindex', '0');
    });

    // Pre-select from URL param
    const params = new URLSearchParams(window.location.search);
    const preRoom     = params.get('room');
    const preCheckin  = params.get('checkin');
    const preCheckout = params.get('checkout');

    if (preRoom) {
      const match = document.querySelector(`.room-select-card input[value="${preRoom}"]`);
      if (match) match.closest('.room-select-card')?.dispatchEvent(new MouseEvent('click'));
    }
    if (preCheckin)  { const el = $('b-checkin');  if (el) el.value = preCheckin; }
    if (preCheckout) { const el = $('b-checkout'); if (el) el.value = preCheckout; }
    if (preCheckin || preCheckout) updateSummary();
  }

  /* ── Date Handling ────────────────────────────────────────────────────── */
  function initDates() {
    const checkinEl  = $('b-checkin');
    const checkoutEl = $('b-checkout');
    const today      = new Date().toISOString().split('T')[0];

    if (checkinEl)  checkinEl.setAttribute('min', today);
    if (checkoutEl) checkoutEl.setAttribute('min', today);

    const onChange = () => {
      if (checkinEl?.value && checkoutEl?.value && checkoutEl.value <= checkinEl.value) {
        const d = new Date(checkinEl.value);
        d.setDate(d.getDate() + 1);
        checkoutEl.value = d.toISOString().split('T')[0];
      }
      if (checkinEl?.value && checkoutEl) {
        checkoutEl.setAttribute('min', checkinEl.value);
      }
      updateSummary();
    };

    checkinEl?.addEventListener('change', onChange);
    checkoutEl?.addEventListener('change', onChange);
    $('b-guests')?.addEventListener('change', updateSummary);
  }

  /* ── Summary Sidebar ──────────────────────────────────────────────────── */
  function updateSummary() {
    state.checkin  = $('b-checkin')?.value  || null;
    state.checkout = $('b-checkout')?.value || null;
    state.guests   = parseInt($('b-guests')?.value || '2', 10);
    state.nights   = calcNights(state.checkin, state.checkout);

    const roomNameEl  = $('summary-room-name');
    const detailsEl   = $('summary-details');
    const totalRowEl  = $('summary-total-row');
    const imgEl       = $('summary-img');
    const placeholderEl = $('summary-placeholder');

    if (state.selectedRoom) {
      if (roomNameEl) {
        roomNameEl.innerHTML = '';
        const cat = document.createElement('span');
        cat.className = 'summary-room-category';
        cat.textContent = state.selectedRoom.category;
        const name = document.createElement('span');
        name.className = 'summary-room-name-text';
        name.textContent = state.selectedRoom.name;
        roomNameEl.appendChild(cat);
        roomNameEl.appendChild(name);
      }
      if (imgEl) {
        imgEl.src = state.selectedRoom.image || '';
        imgEl.alt = state.selectedRoom.name;
        imgEl.style.opacity = '1';
      }
      if (placeholderEl) placeholderEl.style.display = 'none';
    } else {
      if (roomNameEl) roomNameEl.innerHTML = '';
      if (imgEl) imgEl.style.opacity = '0.3';
    }

    const hasFullData = state.selectedRoom && state.nights > 0;

    if (detailsEl)  detailsEl.style.display  = hasFullData ? 'flex'    : 'none';
    if (totalRowEl) totalRowEl.style.display  = hasFullData ? 'flex'    : 'none';

    if (hasFullData) {
      const total   = state.selectedRoom.price * state.nights;
      const taxRate = 0.10;
      const base    = Math.round((total / (1 + taxRate)) * 100) / 100;
      const tax     = Math.round((total - base)          * 100) / 100;

      setText('summary-checkin',  formatDateShort(state.checkin));
      setText('summary-checkout', formatDateShort(state.checkout));
      setText('summary-nights',   `${state.nights} night${state.nights !== 1 ? 's' : ''}`);
      setText('summary-guests',   `${state.guests} guest${state.guests !== 1 ? 's' : ''}`);
      setText('summary-rate',     formatCurrency(state.selectedRoom.price));
      setText('summary-base',     formatCurrency(base));
      setText('summary-tax',      formatCurrency(tax));
      setText('summary-total',    formatCurrency(total));
    }
  }

  /* ── Step 1 ───────────────────────────────────────────────────────────── */
  function initStep1() {
    $('step1-next')?.addEventListener('click', () => {
      showError('step1-error', '');
      if (!state.selectedRoom) {
        showError('step1-error', 'Please select a room to continue.');
        $('room-grid')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!state.checkin || !state.checkout) {
        showError('step1-error', 'Please select both check-in and check-out dates.');
        return;
      }
      if (state.nights < 1) {
        showError('step1-error', 'Check-out must be at least one night after check-in.');
        return;
      }
      if (state.nights > 90) {
        showError('step1-error', 'Maximum stay is 90 nights. Please contact us for longer stays.');
        return;
      }
      goToStep(2);
    });
  }

  /* ── Step 2 ───────────────────────────────────────────────────────────── */
  function initStep2() {
    $('step2-back')?.addEventListener('click', () => goToStep(1));

    $('step2-next')?.addEventListener('click', () => {
      showError('step2-error', '');

      const fname = $('g-fname')?.value.trim() || '';
      const lname = $('g-lname')?.value.trim() || '';
      const email = $('g-email')?.value.trim() || '';
      const phone = $('g-phone')?.value.trim() || '';

      if (!fname || !lname) {
        showError('step2-error', 'Please enter your full name.'); return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('step2-error', 'Please enter a valid email address.'); return;
      }
      if (!phone) {
        showError('step2-error', 'Please enter a contact phone number.'); return;
      }

      state.guestName  = `${fname} ${lname}`;
      state.guestEmail = email;
      state.guestPhone = phone;
      state.specialReqs = $('g-requests')?.value.trim() || '';

      goToStep(3);
      initStripePaymentElement();
    });
  }

  /* ── Step 3 ───────────────────────────────────────────────────────────── */
  function initStep3() {
    $('step3-back')?.addEventListener('click', () => {
      goToStep(2);
      // Unmount Stripe element so it can be re-initialised cleanly
      if (state.paymentEl) {
        try { state.paymentEl.unmount(); } catch (_) {}
        state.paymentEl    = null;
        state.elements     = null;
        state.clientSecret = null;
        state.stripeReady  = false;
      }
      // Reset payment container
      const container = $('stripe-payment-element');
      if (container) {
        container.innerHTML = `
          <div id="stripe-payment-element--loading" style="display:flex; flex-direction:column;
               align-items:center; gap: var(--sp-4); padding: var(--sp-12); text-align:center;">
            <div class="stripe-spinner" aria-hidden="true"></div>
            <p style="font-size: var(--fs-sm); color: var(--text-subdued);">Preparing secure payment form…</p>
          </div>
          <div id="stripe-element-mount" style="display:none;"></div>
        `;
      }
      const submitBtn = $('submit-payment');
      if (submitBtn) submitBtn.disabled = true;
      showPaymentError('');
    });
  }

  /* ── Stripe Payment Element ───────────────────────────────────────────── */
  async function initStripePaymentElement() {
    if (state.stripeReady) return;

    // LOCAL DEV: Netlify Functions won't be available — show helpful notice
    if (isLocalDev()) {
      showDevNotice();
      return;
    }

    const submitBtn = $('submit-payment');

    if (typeof Stripe === 'undefined') {
      showPaymentError('Stripe.js failed to load. Please disable any ad-blockers and refresh.');
      return;
    }

    if (!state.stripe) {
      state.stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    }

    const total = state.selectedRoom.price * state.nights;

    try {
      const data = await safeJsonFetch(API_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId:          state.selectedRoom.id,
          roomName:        state.selectedRoom.name,
          pricePerNight:   state.selectedRoom.price,
          nights:          state.nights,
          checkin:         state.checkin,
          checkout:        state.checkout,
          guestName:       state.guestName,
          guestEmail:      state.guestEmail,
          guestPhone:      state.guestPhone,
          specialRequests: state.specialReqs,
          currency:        'eur',
        }),
      });

      state.clientSecret = data.clientSecret;

      // Persist to sessionStorage for success page
      sessionStorage.setItem('ga_booking', JSON.stringify({
        roomName: state.selectedRoom.name,
        checkin:  state.checkin,
        checkout: state.checkout,
        nights:   state.nights,
        total:    total.toFixed(2),
      }));

      // Mount Stripe Payment Element
      state.elements = state.stripe.elements({
        clientSecret: state.clientSecret,
        appearance:   buildStripeAppearance(),
      });

      state.paymentEl = state.elements.create('payment', {
        layout:  { type: 'tabs', defaultCollapsed: false },
        wallets: { applePay: 'auto', googlePay: 'auto' },
      });

      const loadEl  = $('stripe-payment-element--loading');
      const mountEl = $('stripe-element-mount');

      if (loadEl)  loadEl.style.display  = 'none';
      if (mountEl) mountEl.style.display = 'block';

      state.paymentEl.mount('#stripe-element-mount');

      state.paymentEl.on('ready', () => {
        if (submitBtn) submitBtn.disabled = false;
        state.stripeReady = true;
      });

      state.paymentEl.on('change', (event) => {
        showPaymentError(event.error ? event.error.message : '');
      });

    } catch (err) {
      const loadEl = $('stripe-payment-element--loading');
      if (loadEl) loadEl.style.display = 'none';

      // Render the error inside the payment container — never as a bare JS throw
      const container = $('stripe-payment-element');
      if (container) {
        container.innerHTML = `
          <div style="padding: var(--sp-6) var(--sp-7); background: rgba(200,80,80,0.07);
                      border: 1px solid rgba(200,80,80,0.25); display:flex; flex-direction:column; gap: var(--sp-4);">
            <p style="font-size: var(--fs-xs); font-weight:500; letter-spacing:0.14em;
                       text-transform:uppercase; color: #e08080;">Payment Initialisation Failed</p>
            <p style="font-size: var(--fs-sm); font-weight:300; color: var(--cream); line-height:1.75;">
              ${err.message || 'An unexpected error occurred.'}
            </p>
            <button
              id="retry-payment-init"
              class="btn btn--secondary btn--sm"
              style="align-self:flex-start;"
            >Try Again</button>
          </div>
        `;
        $('retry-payment-init')?.addEventListener('click', () => {
          // Re-render loading state and retry
          container.innerHTML = `
            <div id="stripe-payment-element--loading" style="display:flex; flex-direction:column;
                 align-items:center; gap: var(--sp-4); padding: var(--sp-12); text-align:center;">
              <div class="stripe-spinner" aria-hidden="true"></div>
              <p style="font-size: var(--fs-sm); color: var(--text-subdued);">Retrying…</p>
            </div>
            <div id="stripe-element-mount" style="display:none;"></div>
          `;
          state.stripeReady = false;
          initStripePaymentElement();
        });
      }
    }
  }

  /* ── Stripe Appearance Theme ─────────────────────────────────────────── */
  function buildStripeAppearance() {
    return {
      theme: 'night',
      variables: {
        colorPrimary:         '#b8904a',
        colorBackground:      '#141929',
        colorText:            '#f0e8d0',
        colorTextSecondary:   '#a09070',
        colorTextPlaceholder: '#5c5448',
        colorDanger:          '#e08080',
        fontFamily:           '"Jost", "Segoe UI", system-ui, sans-serif',
        fontSizeBase:         '15px',
        fontWeightNormal:     '300',
        fontWeightMedium:     '500',
        spacingUnit:          '5px',
        borderRadius:         '0px',
        gridRowSpacing:       '20px',
        gridColumnSpacing:    '20px',
      },
      rules: {
        '.Input': {
          backgroundColor: '#0f1320',
          border:          '1px solid #1e2840',
          color:           '#f0e8d0',
          boxShadow:       'none',
          padding:         '14px 18px',
          transition:      'border-color 0.2s ease, box-shadow 0.2s ease',
        },
        '.Input:focus': {
          border:    '1px solid #b8904a',
          boxShadow: '0 0 0 1px rgba(184,144,74,0.2)',
          outline:   'none',
        },
        '.Input--invalid': {
          border:    '1px solid rgba(200,80,80,0.6)',
          boxShadow: '0 0 0 1px rgba(200,80,80,0.15)',
        },
        '.Label': {
          color:         '#a09070',
          fontSize:      '11px',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight:    '500',
          marginBottom:  '10px',
        },
        '.Tab': {
          backgroundColor: '#0f1320',
          border:          '1px solid #1e2840',
          color:           '#a09070',
          padding:         '12px 16px',
          transition:      'all 0.2s ease',
        },
        '.Tab:hover': { color: '#f0e8d0', borderColor: '#2a3550' },
        '.Tab--selected': {
          backgroundColor: '#141929',
          border:          '1px solid #b8904a',
          color:           '#f0e8d0',
        },
        '.Error': { color: '#e08080', fontSize: '12px', marginTop: '6px' },
        '.Block': { backgroundColor: 'transparent' },
      },
    };
  }

  /* ── Payment Submit ───────────────────────────────────────────────────── */
  function initPaymentSubmit() {
    $('submit-payment')?.addEventListener('click', async () => {
      if (state.isSubmitting || !state.stripe || !state.elements || !state.stripeReady) return;

      state.isSubmitting = true;
      setSubmitLoading(true);
      showPaymentError('');

      try {
        const { error } = await state.stripe.confirmPayment({
          elements: state.elements,
          confirmParams: {
            return_url: `${window.location.origin}${SUCCESS_URL}`,
            receipt_email: state.guestEmail,
            payment_method_data: {
              billing_details: {
                name:  state.guestName,
                email: state.guestEmail,
                phone: state.guestPhone,
              },
            },
          },
        });

        if (error) {
          showPaymentError(
            error.type === 'card_error' || error.type === 'validation_error'
              ? error.message
              : 'An unexpected error occurred. Please try again or contact us directly.'
          );
        }
      } catch (err) {
        showPaymentError('Payment could not be processed. Please try again.');
      } finally {
        state.isSubmitting = false;
        setSubmitLoading(false);
      }
    });
  }

  function setSubmitLoading(on) {
    const btn     = $('submit-payment');
    const text    = $('submit-payment-text');
    const spinner = $('submit-payment-spinner');
    if (!btn) return;
    btn.disabled = on;
    if (text)    text.style.display    = on ? 'none'   : 'inline';
    if (spinner) spinner.style.display = on ? 'inline' : 'none';
    btn.style.opacity = on ? '0.75' : '1';
  }

  function showPaymentError(msg) {
    const el = $('payment-message');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('is-visible', !!msg);
    if (msg) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Site-wide Book Now links ─────────────────────────────────────────── */
  function initBookNowLinks() {
    document.querySelectorAll('[data-book-room]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.bookRoom;
        if (id) window.location.href = `/booking/?room=${encodeURIComponent(id)}`;
      });
    });
  }

  /* ── Guard: only run full booking logic on the booking page ───────────── */
  const isBookingPage = () => !!$('booking-app');

  /* ── Init ─────────────────────────────────────────────────────────────── */
  function init() {
    initBookNowLinks();
    if (!isBookingPage()) return;
    initRoomSelection();
    initDates();
    updateSummary();
    initStep1();
    initStep2();
    initStep3();
    initPaymentSubmit();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
