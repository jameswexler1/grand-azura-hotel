/**
 * =============================================================================
 * GRAND AZURA HOTEL — main.js
 * Pure Vanilla JS, zero dependencies.
 * =============================================================================
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
   * 1. UTILITY HELPERS
   * ───────────────────────────────────────────────────────────────────────── */

  /** Shorthand query selectors */
  const qs  = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /** Debounce: limit function call rate */
  function debounce(fn, delay = 100) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /** Throttle: fire at most once per interval */
  function throttle(fn, interval = 100) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= interval) { last = now; fn(...args); }
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 2. STICKY NAVIGATION — adds .scrolled class after threshold
   * ───────────────────────────────────────────────────────────────────────── */
  function initStickyNav() {
    const header = qs('#site-header');
    if (!header) return;

    const SCROLL_THRESHOLD = 60;

    function onScroll() {
      if (window.scrollY > SCROLL_THRESHOLD) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    window.addEventListener('scroll', throttle(onScroll, 80), { passive: true });
    onScroll(); // run on init in case page loads scrolled
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 3. MOBILE NAVIGATION DRAWER
   * ───────────────────────────────────────────────────────────────────────── */
  function initMobileNav() {
    const toggle = qs('#nav-toggle');
    const drawer = qs('#nav-drawer');
    if (!toggle || !drawer) return;

    let isOpen = false;

    function openDrawer() {
      isOpen = true;
      drawer.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
      document.body.style.overflow = 'hidden';
      // Move focus to first link in drawer for accessibility
      const firstLink = qs('a, button', drawer);
      if (firstLink) firstLink.focus();
    }

    function closeDrawer() {
      isOpen = false;
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
      document.body.style.overflow = '';
      toggle.focus();
    }

    toggle.addEventListener('click', () => {
      isOpen ? closeDrawer() : openDrawer();
    });

    // Close on drawer link click
    qsa('a', drawer).forEach(link => {
      link.addEventListener('click', closeDrawer);
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closeDrawer();
    });

    // Close on backdrop click (outside drawer)
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) closeDrawer();
    });

    // Trap focus inside drawer when open
    drawer.addEventListener('keydown', (e) => {
      if (!isOpen || e.key !== 'Tab') return;
      const focusable = qsa('a, button', drawer).filter(el => !el.disabled && el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 4. REVEAL ON SCROLL — Intersection Observer API
   *    Targets: .reveal, .reveal--left, .reveal--right, .reveal--scale
   *    Children of .stagger get cascade delays from CSS custom classes.
   * ───────────────────────────────────────────────────────────────────────── */
  function initRevealOnScroll() {
    const SELECTORS = '.reveal, .reveal--left, .reveal--right, .reveal--scale';
    const elements = qsa(SELECTORS);
    if (!elements.length) return;

    // Respect prefers-reduced-motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      elements.forEach(el => el.classList.add('revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target); // fire once only
          }
        });
      },
      {
        threshold: 0.12,       // element must be 12% visible to trigger
        rootMargin: '0px 0px -40px 0px' // slight negative bottom margin
      }
    );

    elements.forEach(el => observer.observe(el));
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 5. ACTIVE NAV LINK HIGHLIGHTING
   *    Marks the nav link matching the current page path as .active
   * ───────────────────────────────────────────────────────────────────────── */
  function initActiveNavLinks() {
    const path = window.location.pathname;
    qsa('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      const isActive = href === '/'
        ? path === '/'
        : path.startsWith(href) && href !== '/';
      link.classList.toggle('active', isActive);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 6. MENU TABS (Dining Page)
   *    Tabs are .menu-tab buttons; panels are .menu-panel divs.
   *    ARIA roles: tablist / tab / tabpanel.
   * ───────────────────────────────────────────────────────────────────────── */
  function initMenuTabs() {
    const tablist = qs('[role="tablist"]');
    if (!tablist) return;

    const tabs   = qsa('.menu-tab', tablist);
    const panels = qsa('.menu-panel');
    if (!tabs.length || !panels.length) return;

    function activateTab(tab) {
      // Deactivate all
      tabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
      });
      panels.forEach(p => p.classList.remove('is-active'));

      // Activate target
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      tab.removeAttribute('tabindex');

      const panelId = tab.getAttribute('aria-controls');
      const panel = qs(`#${panelId}`);
      if (panel) panel.classList.add('is-active');

      // Scroll tab into view if off-screen (mobile)
      tab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activateTab(tab));

      // Keyboard navigation: arrow keys
      tab.addEventListener('keydown', (e) => {
        let newIndex = i;
        if (e.key === 'ArrowRight') newIndex = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft')  newIndex = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home')       newIndex = 0;
        if (e.key === 'End')        newIndex = tabs.length - 1;
        if (newIndex !== i) {
          e.preventDefault();
          tabs[newIndex].focus();
          activateTab(tabs[newIndex]);
        }
      });
    });

    // Allow external links to scroll to bar/terrace and switch tab
    qsa('[data-scroll-to-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetCat = link.dataset.scrollToTab;
        const targetTab = tabs.find(t => t.dataset.tab === targetCat.toLowerCase().replace(/\s+/g, '-'));
        if (targetTab) {
          activateTab(targetTab);
          tablist.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 7. ROOMS FILTER (Rooms Page)
   *    Filter buttons: .filter-btn with data-filter attribute.
   *    Room cards:     .room-full-card with data-category attribute.
   * ───────────────────────────────────────────────────────────────────────── */
  function initRoomsFilter() {
    const filterContainer = qs('#rooms-filter');
    const listing         = qs('#rooms-listing');
    const noResults       = qs('#rooms-no-results');
    if (!filterContainer || !listing) return;

    const buttons = qsa('.filter-btn', filterContainer);
    const cards   = qsa('.room-full-card', listing);

    function filterRooms(filterValue) {
      let visibleCount = 0;

      cards.forEach(card => {
        const category = card.dataset.category || '';
        const isVisible = filterValue === 'all' || category === filterValue;

        // Animate in/out
        if (isVisible) {
          card.style.display = '';
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          // Slight stagger by index
          const idx = cards.indexOf(card);
          setTimeout(() => {
            card.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, idx * 60);
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      // Show/hide no-results message
      if (noResults) {
        noResults.classList.toggle('hidden', visibleCount > 0);
      }
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterValue = btn.dataset.filter;

        // Update active state
        buttons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        filterRooms(filterValue);
      });
    });

    // "View All" button inside no-results message
    const clearBtn = qs('#clear-filter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const allBtn = buttons.find(b => b.dataset.filter === 'all');
        if (allBtn) allBtn.click();
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 8. CONTACT FORM — Client-side validation & simulated submission
   * ───────────────────────────────────────────────────────────────────────── */
  function initContactForm() {
    const form    = qs('#dining-reservation') || qs('form.contact-form');
    if (!form) return;

    const successMsg = qs('#form-success');
    const errorMsg   = qs('#form-error');
    const submitBtn  = qs('[type="submit"]', form);

    // Real-time validation feedback
    const requiredFields = qsa('[required]', form);
    requiredFields.forEach(field => {
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => {
        if (field.dataset.touched) validateField(field);
      });
    });

    function validateField(field) {
      field.dataset.touched = 'true';
      const isValid = field.checkValidity();
      field.style.borderColor = isValid
        ? 'var(--border-light)'
        : 'rgba(200, 80, 80, 0.6)';
      if (isValid) field.style.boxShadow = '';
      else field.style.boxShadow = '0 0 0 1px rgba(200,80,80,0.2)';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validate all required fields
      let isFormValid = true;
      requiredFields.forEach(field => {
        validateField(field);
        if (!field.checkValidity()) isFormValid = false;
      });

      if (!isFormValid) {
        // Scroll to first invalid field
        const firstInvalid = qs('[required]:invalid', form);
        if (firstInvalid) {
          firstInvalid.focus();
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Loading state
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      // Simulate async submission (replace with real endpoint / Formspree / Netlify Forms)
      try {
        await new Promise(resolve => setTimeout(resolve, 1800));

        // Success
        form.style.display = 'none';
        if (successMsg) {
          successMsg.classList.remove('hidden');
          successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch {
        // Error
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '';
        if (errorMsg) {
          errorMsg.classList.remove('hidden');
          errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });

    // Enhance date inputs: set min date to today
    const today = new Date().toISOString().split('T')[0];
    qsa('input[type="date"]', form).forEach(input => {
      input.setAttribute('min', today);
    });

    // Checkout must be after checkin
    const checkin  = qs('#checkin',  form);
    const checkout = qs('#checkout', form);
    if (checkin && checkout) {
      checkin.addEventListener('change', () => {
        if (checkin.value) {
          checkout.setAttribute('min', checkin.value);
          if (checkout.value && checkout.value <= checkin.value) {
            checkout.value = '';
          }
        }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 9. SMOOTH SCROLL for anchor links
   *    Accounts for fixed header height offset.
   * ───────────────────────────────────────────────────────────────────────── */
  function initSmoothScroll() {
    const header = qs('#site-header');

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const targetId = link.getAttribute('href').slice(1);
      if (!targetId) return;
      const target = qs(`#${targetId}`);
      if (!target) return;

      e.preventDefault();
      const headerH = header ? header.offsetHeight : 88;
      const top = target.getBoundingClientRect().top + window.scrollY - headerH - 16;
      window.scrollTo({ top, behavior: 'smooth' });
      // Update URL hash without jump
      history.pushState(null, '', `#${targetId}`);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 10. PARALLAX HERO — subtle depth on the hero background
   *     Only on desktop (avoids jank on mobile/touch)
   * ───────────────────────────────────────────────────────────────────────── */
  function initHeroParallax() {
    const heroBg = qs('.hero__bg');
    if (!heroBg) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ('ontouchstart' in window) return; // skip touch devices

    function onScroll() {
      const scrolled = window.scrollY;
      const rate = scrolled * 0.25;
      heroBg.style.transform = `translateY(${rate}px)`;
    }

    window.addEventListener('scroll', throttle(onScroll, 16), { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 11. NEWSLETTER FORM — inline submission feedback
   * ───────────────────────────────────────────────────────────────────────── */
  function initNewsletterForm() {
    const forms = qsa('form[aria-label="Newsletter subscription"]');
    forms.forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input  = qs('input[type="email"]', form);
        const button = qs('button', form);
        if (!input || !input.value) return;

        const originalBtnText = button.textContent;
        button.textContent = '…';
        button.disabled = true;

        await new Promise(resolve => setTimeout(resolve, 1200));

        // Replace form with success message
        const parent = form.parentElement;
        parent.innerHTML = `
          <div style="padding: var(--sp-5) var(--sp-6); background: rgba(184,144,74,0.08); border: 1px solid rgba(184,144,74,0.25); display: flex; align-items: center; gap: var(--sp-4);">
            <span style="color: var(--gold); font-size: 1.4rem;">✓</span>
            <div>
              <p style="font-family: 'Cormorant Garamond', serif; font-size: var(--fs-lg); color: var(--ivory);">You're on the list.</p>
              <p style="font-size: var(--fs-sm); color: var(--text-subdued); margin-top: 2px;">Expect curated news from Grand Azura in your inbox soon.</p>
            </div>
          </div>
        `;
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 12. HEADER HIDE ON SCROLL DOWN / SHOW ON SCROLL UP
   *     (enhances mobile reading experience)
   * ───────────────────────────────────────────────────────────────────────── */
  function initHeaderAutoHide() {
    const header = qs('#site-header');
    if (!header) return;

    let lastScrollY = window.scrollY;
    const HIDE_AFTER = 300; // px scrolled before auto-hide kicks in

    function onScroll() {
      const currentY = window.scrollY;
      const isScrollingDown = currentY > lastScrollY;
      const isPastThreshold = currentY > HIDE_AFTER;

      if (isScrollingDown && isPastThreshold) {
        header.style.transform = 'translateY(-100%)';
        header.style.transition = 'transform 0.4s cubic-bezier(0.4,0,0.2,1)';
      } else {
        header.style.transform = 'translateY(0)';
        header.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1)';
      }

      lastScrollY = currentY;
    }

    // Only enable on mobile to preserve desktop UX
    if (window.innerWidth <= 768) {
      window.addEventListener('scroll', throttle(onScroll, 80), { passive: true });
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 13. LAZY BACKGROUND IMAGES
   *     Elements with data-bg attribute get their background set
   *     only when they enter the viewport.
   * ───────────────────────────────────────────────────────────────────────── */
  function initLazyBgImages() {
    const lazyBgs = qsa('[data-bg]');
    if (!lazyBgs.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.backgroundImage = `url('${entry.target.dataset.bg}')`;
          delete entry.target.dataset.bg;
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px 0px' });

    lazyBgs.forEach(el => observer.observe(el));
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 14. TESTIMONIAL CAROUSEL (optional: auto-scroll on mobile)
   *     On small screens, only 1 card visible. This adds swipe support.
   * ───────────────────────────────────────────────────────────────────────── */
  function initTestimonialSwipe() {
    const grid = qs('.testimonials-grid');
    if (!grid || window.innerWidth > 768) return;

    let startX = 0;
    let isDragging = false;

    grid.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });

    grid.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      const deltaX = e.changedTouches[0].clientX - startX;
      isDragging = false;

      if (Math.abs(deltaX) < 40) return; // minimum swipe distance

      const cards = qsa('.testimonial-card', grid);
      // Simple scroll approach
      const scrollAmount = grid.offsetWidth * 0.85;
      grid.scrollBy({ left: deltaX < 0 ? scrollAmount : -scrollAmount, behavior: 'smooth' });
    }, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 15. COUNTER ANIMATION — animate numbers in .about-stat__number
   *     Triggers when element enters viewport.
   * ───────────────────────────────────────────────────────────────────────── */
  function initCounters() {
    const counters = qsa('.about-stat__number');
    if (!counters.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function animateCounter(el) {
      // Extract numeric value (ignore non-digit chars for display)
      const text = el.textContent.trim();
      const target = parseInt(text.replace(/\D/g, ''), 10);
      const suffix = text.replace(/[\d\s]/g, ''); // e.g. "+" or "m²"
      if (isNaN(target) || target === 0) return;

      const duration = 1400; // ms
      const start = performance.now();

      function step(timestamp) {
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);
        el.textContent = current + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => observer.observe(el));
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 16. HOVER CURSOR EFFECT (subtle custom cursor on desktop)
   * ───────────────────────────────────────────────────────────────────────── */
  function initCustomCursor() {
    // Only on pointer devices (desktop)
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const cursor = document.createElement('div');
    cursor.id = 'custom-cursor';
    cursor.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 99999;
      width: 8px;
      height: 8px;
      background: var(--gold);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: transform 0.15s ease, width 0.25s ease, height 0.25s ease, opacity 0.25s ease;
      opacity: 0;
    `;
    document.body.appendChild(cursor);

    // Trail circle
    const trail = document.createElement('div');
    trail.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 99998;
      width: 32px;
      height: 32px;
      border: 1px solid rgba(184,144,74,0.4);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: left 0.12s ease, top 0.12s ease, width 0.3s ease, height 0.3s ease, opacity 0.3s ease;
      opacity: 0;
    `;
    document.body.appendChild(trail);

    let mouseX = 0, mouseY = 0;
    let trailX  = 0, trailY  = 0;
    let visible = false;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      cursor.style.left = mouseX + 'px';
      cursor.style.top  = mouseY + 'px';

      if (!visible) {
        cursor.style.opacity = '1';
        trail.style.opacity  = '1';
        visible = true;
      }
    });

    // Smooth trail animation
    function animateTrail() {
      trailX += (mouseX - trailX) * 0.14;
      trailY += (mouseY - trailY) * 0.14;
      trail.style.left = trailX + 'px';
      trail.style.top  = trailY + 'px';
      requestAnimationFrame(animateTrail);
    }
    animateTrail();

    // Expand on interactive elements
    const interactiveSelectors = 'a, button, input, textarea, select, .room-card, .testimonial-card, .menu-item, .filter-btn';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(interactiveSelectors)) {
        cursor.style.transform = 'translate(-50%, -50%) scale(2.5)';
        trail.style.width  = '48px';
        trail.style.height = '48px';
        trail.style.borderColor = 'rgba(184,144,74,0.6)';
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(interactiveSelectors)) {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        trail.style.width  = '32px';
        trail.style.height = '32px';
        trail.style.borderColor = 'rgba(184,144,74,0.4)';
      }
    });

    // Hide when mouse leaves window
    document.addEventListener('mouseleave', () => {
      cursor.style.opacity = '0';
      trail.style.opacity  = '0';
      visible = false;
    });

    document.addEventListener('mouseenter', () => {
      cursor.style.opacity = '1';
      trail.style.opacity  = '1';
      visible = true;
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 17. IMAGE COLOUR FALLBACK PLACEHOLDERS
   *     If an <img> fails to load, show a styled placeholder.
   * ───────────────────────────────────────────────────────────────────────── */
  function initImageFallbacks() {
    qsa('img').forEach(img => {
      img.addEventListener('error', function () {
        this.style.cssText = `
          background: linear-gradient(135deg, #0f1a2e 0%, #1a1020 100%);
          display: block;
        `;
        this.removeAttribute('src');
        this.setAttribute('aria-hidden', 'true');
      }, { once: true });
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 18. PAGE TRANSITION — fade-in on load
   * ───────────────────────────────────────────────────────────────────────── */
  function initPageTransition() {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';

    window.addEventListener('load', () => {
      document.body.style.opacity = '1';
    });

    // Fade out on navigation
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      // Only internal links, not anchors or external
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
      if (link.target === '_blank') return;

      e.preventDefault();
      document.body.style.opacity = '0';
      setTimeout(() => { window.location.href = href; }, 350);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 19. BOOKING WIDGET DATE SYNC (if present on page)
   *     Quick date range widget for hero CTAs
   * ───────────────────────────────────────────────────────────────────────── */
  function initBookingWidget() {
    const widget = qs('#booking-widget');
    if (!widget) return;

    const checkin  = qs('#bw-checkin', widget);
    const checkout = qs('#bw-checkout', widget);
    if (!checkin || !checkout) return;

    const today = new Date().toISOString().split('T')[0];
    checkin.setAttribute('min', today);
    checkout.setAttribute('min', today);

    checkin.addEventListener('change', () => {
      if (checkin.value) {
        checkout.setAttribute('min', checkin.value);
        if (!checkout.value || checkout.value <= checkin.value) {
          const nextDay = new Date(checkin.value);
          nextDay.setDate(nextDay.getDate() + 1);
          checkout.value = nextDay.toISOString().split('T')[0];
        }
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 20. INIT — Run everything on DOMContentLoaded
   * ───────────────────────────────────────────────────────────────────────── */
  function init() {
    initPageTransition();
    initStickyNav();
    initMobileNav();
    initActiveNavLinks();
    initRevealOnScroll();
    initHeroParallax();
    initMenuTabs();
    initRoomsFilter();
    initContactForm();
    initSmoothScroll();
    initNewsletterForm();
    initHeaderAutoHide();
    initLazyBgImages();
    initTestimonialSwipe();
    initCounters();
    initCustomCursor();
    initImageFallbacks();
    initBookingWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // DOM already ready
  }

})();
