/* ===========================================================================
   UI behaviour. No colour, no layout — those live in CSS.
   =========================================================================== */
(() => {
  'use strict';

  /* --- header: hairline appears once you leave the top -------------------- */
  const header = document.getElementById('site-header');
  if (header) {
    const sync = () => header.dataset.scrolled = String(window.scrollY > 8);
    sync();
    addEventListener('scroll', sync, { passive: true });
  }

  /* --- scroll reveal ------------------------------------------------------
     The observer adds BOTH classes. Markup never carries `is-reveal`, so an
     element can't end up hidden because it was missed in the list below.      */
  const REVEAL = '[data-reveal]';

  /* Two kinds of target:
       data-reveal         -> `is-reveal`: the element fades itself in.
       data-reveal="group" -> `is-group`:  the element stays visible and acts
                              only as a trigger; CSS choreographs its children
                              off `.is-group.is-in`.
     Either way the class is added HERE, never in markup — so with JS off
     nothing is hidden, which is the entire point of the rule. */
  const mark = el =>
    el.classList.add(el.dataset.reveal === 'group' ? 'is-group' : 'is-reveal');

  const reveal = () => {
    const targets = document.querySelectorAll(REVEAL);
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => { mark(el); el.classList.add('is-in'); });
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(el => { mark(el); io.observe(el); });
  };

  /* --- dev: hold G to see the column grid ---------------------------------
     Built once, toggled by hidden attribute. Purely a build aid.            */
  (() => {
    let overlay = null;
    const cols = () =>
      +getComputedStyle(document.documentElement).getPropertyValue('--grid-cols') || 12;

    const show = () => {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'grid-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < cols(); i++) overlay.appendChild(document.createElement('span'));
        document.body.appendChild(overlay);
      }
      overlay.hidden = false;
    };

    addEventListener('keydown', e => {
      if (e.key !== 'g' && e.key !== 'G') return;
      if (/^(input|textarea)$/i.test(document.activeElement?.tagName)) return;
      show();
    });
    addEventListener('keyup', e => {
      if ((e.key === 'g' || e.key === 'G') && overlay) overlay.hidden = true;
    });
  })();

  /* --- card deck ----------------------------------------------------------
     One active card, the next two fanned behind it. Position is expressed as
     distance-from-active so the CSS only needs to describe three states.     */
  (() => {
    const deck = document.querySelector('[data-deck]');
    if (!deck) return;

    const cards = [...deck.querySelectorAll('.deck__card')];
    const dots  = [...deck.querySelectorAll('.deck__dot')];
    if (!cards.length) return;

    let active = 0;

    const render = () => {
      cards.forEach((card, i) => {
        const offset = (i - active + cards.length) % cards.length;
        card.dataset.pos = offset <= 2 ? String(offset) : 'hidden';
        /* Only the front card is reachable; the rest are decoration. */
        card.toggleAttribute('inert', offset !== 0);
      });
      dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === active)));
    };

    const go = n => { active = (n + cards.length) % cards.length; render(); };

    deck.addEventListener('click', e => {
      const step = e.target.closest('[data-step]');
      if (step) return go(active + Number(step.dataset.step));
      const to = e.target.closest('[data-goto]');
      if (to) go(Number(to.dataset.goto));
    });

    deck.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(active - 1); }
    });

    render();
  })();

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll(REVEAL).forEach(el => el.classList.add('is-in'));
  } else {
    reveal();
  }
})();
