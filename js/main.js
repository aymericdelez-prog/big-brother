/* =========================================================
   Big Brother — The original French Tacos
   Interactions & animations (GSAP 3.12.5 + ScrollTrigger, Lenis)
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const money = (n) => Number(n).toFixed(2);

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const debug = new URLSearchParams(location.search).has('debug');

  const loader = $('[data-loader]');
  if (loader) loader.style.animation = 'none'; // le script gère la sortie (la CSS n'est qu'un secours)

  // Aléatoire reproductible (mulberry32)
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Découpage en mots / lettres (jamais de mot coupé) ---------- */
  function split(el, { chars = true, aria = true } = {}) {
    if (el.__split) return el.__split;
    const host = el.closest('a, button, h1, h2, h3');
    const label = (host || el).textContent.replace(/\s+/g, ' ').trim();
    const words = [];
    const all = [];
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          // seuls les espaces « normaux » séparent les mots (les insécables restent collés)
          child.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
            if (!part) return;
            if (/^[ \t\n\r]+$/.test(part)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            if (chars) {
              Array.from(part).forEach((ch) => {
                const c = document.createElement('span');
                c.className = 'c';
                c.textContent = ch;
                w.appendChild(c);
                all.push(c);
              });
            } else w.textContent = part;
            words.push(w);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          if (child.hasAttribute('data-keep')) words.push(child);
          else if (child.tagName !== 'BR' && !(child instanceof SVGElement)) walk(child);
        }
      });
    };
    walk(el);
    if (aria && host) {
      if (!host.hasAttribute('aria-label')) host.setAttribute('aria-label', label);
      words.forEach((w) => w.setAttribute('aria-hidden', 'true'));
    }
    el.__split = { words, chars: all };
    return el.__split;
  }

  /* ---------- Statut d'ouverture (heure de Neuchâtel) ---------- */
  const at = (h, m = 0) => h * 60 + m;
  const HOURS = {
    0: [[at(17, 30), at(22)]],
    1: [[at(11), at(14)], [at(17, 30), at(22)]],
    2: [[at(11), at(14)], [at(17, 30), at(22)]],
    3: [[at(11), at(14)], [at(17, 30), at(22)]],
    4: [[at(11), at(14)], [at(17, 30), at(22)]],
    5: [[at(11), at(14)], [at(17, 30), at(23, 30)]],
    6: [[at(11), at(23, 30)]],
  };
  const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const hm = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

  function zurichNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Zurich', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
      }).formatToParts(new Date());
      const get = (t) => (parts.find((p) => p.type === t) || {}).value;
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
      return { day, min: Number(get('hour')) * 60 + Number(get('minute')) };
    } catch (e) {
      const d = new Date();
      return { day: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function openState() {
    const { day, min } = zurichNow();
    for (const [o, c] of HOURS[day]) {
      if (min >= o && min < c) {
        return { open: true, text: c - min <= 30 ? `Ferme bientôt · ${hm(c)}` : `Ouvert · jusqu’à ${hm(c)}` };
      }
    }
    const later = HOURS[day].find(([o]) => min < o);
    if (later) return { open: false, text: `Fermé · ouvre à ${hm(later[0])}` };
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      if (HOURS[d].length) return { open: false, text: `Fermé · ouvre ${i === 1 ? 'demain' : DAYS[d]} à ${hm(HOURS[d][0][0])}` };
    }
    return { open: false, text: 'Fermé' };
  }

  function initStatus() {
    const els = $$('[data-status]');
    const rows = $$('[data-days]');
    const tick = () => {
      const s = openState();
      els.forEach((el) => {
        el.classList.toggle('is-closed', !s.open);
        const t = $('.status__text', el);
        if (t) t.textContent = s.text;
      });
      const { day } = zurichNow();
      rows.forEach((r) => r.classList.toggle('is-today', r.dataset.days.split(',').map(Number).includes(day)));
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---------- Compteur à rouleaux (prix) ---------- */
  function setOdo(el, value) {
    const str = String(value);
    if (el.__odo === str) return;
    const prev = el.__odo;
    el.__odo = str;
    const shape = (s) => s.replace(/\d/g, 'd');
    let sr = $('.sr-only', el);
    if (!prev || shape(prev) !== shape(str)) {
      el.textContent = '';
      Array.from(str).forEach((ch) => {
        if (/\d/.test(ch)) {
          const d = document.createElement('span');
          d.className = 'odo__d';
          const col = document.createElement('span');
          col.className = 'odo__col';
          for (let n = 0; n < 10; n++) {
            const s = document.createElement('span');
            s.textContent = n;
            col.appendChild(s);
          }
          col.style.transform = `translateY(${-(prev ? 0 : Number(ch)) * 10}%)`;
          d.appendChild(col);
          el.appendChild(d);
        } else {
          const s = document.createElement('span');
          s.className = 'odo__s';
          s.textContent = ch;
          el.appendChild(s);
        }
      });
      $$('.odo__d, .odo__s', el).forEach((x) => x.setAttribute('aria-hidden', 'true'));
      sr = document.createElement('span');
      sr.className = 'sr-only';
      el.appendChild(sr);
      void el.offsetWidth; // la transition part bien de la valeur précédente
    }
    sr.textContent = str;
    const cols = $$('.odo__col', el);
    let k = 0;
    Array.from(str).forEach((ch) => {
      if (/\d/.test(ch)) cols[k++].style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }

  /* ---------- Sélecteur segmenté (pastille qui glisse) ---------- */
  function initSeg(seg, onChange) {
    const btns = $$('button', seg);
    const thumb = $('.seg__thumb', seg);
    const place = () => {
      const b = btns.find((x) => x.getAttribute('aria-pressed') === 'true') || btns[0];
      thumb.style.width = b.offsetWidth + 'px';
      thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    const set = (v) => {
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === v)));
      place();
      onChange(v);
    };
    btns.forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') !== 'true') set(b.dataset.v);
    }));
    place();
    addEventListener('resize', place);
    if (document.fonts) document.fonts.ready.then(place);
    return { set, place };
  }

  let refreshTimer = 0;
  function refreshSoon(ms = 120) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (window.ScrollTrigger) ScrollTrigger.refresh(); }, ms);
  }

  /* ---------- Compose ton tacos : ticket en direct ---------- */
  function initBuilder() {
    const form = $('[data-builder]');
    if (!form) return;
    const NAMES = { tacos: 'tacos', bowl: 'tacos bowl' };
    const INFO = { tacos: 'frites + boisson', bowl: 'boisson' };
    const lines = $('[data-t-lines]');
    const total = $('[data-t-total]');
    const name = $('[data-t-name]');
    const mbName = $('[data-mb-name]');
    const mbTotal = $('[data-mb-total]');
    const flip = $('[data-flip]');
    let mode = 'tacos';
    let order = []; // viandes dans l'ordre où elles ont été choisies
    let last = {};
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const on = (n) => $$(`[name="${n}"]`, form).filter((i) => i.checked && !i.disabled);
    const price = (i) => Number(i.dataset.price || 0);

    function syncMiel() {
      const chevre = $('[name="gratin"][value="Chèvre"]', form);
      const box = $('[data-miel]', form);
      const miel = $('[name="miel"]', form);
      const show = mode === 'tacos' && chevre.checked;
      box.hidden = !show;
      miel.disabled = !show;
      if (!show) miel.checked = false;
    }

    function syncMeats() {
      const max = Number(on('size')[0].dataset.meats);
      order = order.filter((i) => i.checked);
      $$('[name="meat"]', form).forEach((i) => { if (i.checked && !order.includes(i)) order.push(i); });
      // au-delà du nombre de viandes, la plus ancienne laisse sa place
      while (order.length > max) {
        const old = order.shift();
        old.checked = false;
        const opt = old.closest('.opt');
        opt.classList.remove('is-bump');
        void opt.offsetWidth;
        opt.classList.add('is-bump');
      }
      const left = max - order.length;
      $('[data-meat-count]', form).textContent = order.length;
      $('[data-meat-max]', form).textContent = max;
      $('[data-meat-help]', form).textContent = left <= 0
        ? 'au complet'
        : order.length ? `encore ${left}` : `choisis ${max} viande${max > 1 ? 's' : ''}`;
    }

    function setMode(m) {
      mode = m;
      if (flip) flip.classList.toggle('is-b', m === 'bowl');
      $$('[data-only]', form).forEach((el) => {
        const show = el.dataset.only === m;
        el.hidden = !show;
        $$('input', el).forEach((i) => { i.disabled = !show; });
      });
      $$('[name="formule"]', form).forEach((i) => {
        if (!i.dataset[m]) return;
        const box = i.closest('.fopt');
        $('[data-fprice]', box).textContent = '+' + i.dataset[m];
        $('[data-finfo]', box).textContent = INFO[m];
        $('[data-fname]', box).textContent = i.value === 'menu'
          ? (m === 'bowl' ? 'Menu bowl' : 'Menu')
          : (m === 'bowl' ? 'Menu bowl étudiant' : 'Menu étudiant');
      });
      syncMiel();
      update();
      refreshSoon(900);
    }

    function update() {
      const size = on('size')[0];
      const max = Number(size.dataset.meats);
      const meats = order.map((i) => i.value);
      const sauces = on('sauce').map((i) => i.value);
      const base = (on('base')[0] || {}).value || 'Mozzarella';
      const cheese = (on('cheese')[0] || {}).value || 'Mozzarella';
      const gratins = on('gratin');
      const miel = on('miel')[0];
      const supps = on('supp');
      const formule = on('formule')[0];
      const fp = Number(formule.dataset[mode] || 0);
      const gp = gratins.reduce((s, i) => s + price(i), 0) + (miel ? price(miel) : 0);
      const sp = supps.reduce((s, i) => s + price(i), 0);
      const sum = price(size) + gp + sp + fp;

      const L = [
        { k: 'Taille', v: `${cap(size.dataset.label)} · ${max} viande${max > 1 ? 's' : ''}`, p: money(price(size)) },
        { k: 'Viandes', v: meats.length ? meats.join(', ') : `à choisir (0/${max})`, muted: !meats.length },
        { k: 'Base', v: mode === 'tacos' ? base : `Frites, ${cheese.toLowerCase()}` },
        { k: 'Sauces', v: sauces.length ? sauces.join(', ') : 'au choix', muted: !sauces.length },
      ];
      if (mode === 'tacos' && gratins.length) {
        L.push({ k: 'Gratinage', v: gratins.map((i) => i.value).join(', ') + (miel ? ' + miel' : ''), p: '+' + money(gp) });
      }
      if (supps.length) L.push({ k: 'Suppléments', v: supps.map((i) => i.value).join(', '), p: '+' + money(sp) });
      L.push({
        k: 'Formule',
        v: formule.value === 'seul' ? 'Seul' : `${$('[data-fname]', formule.closest('.fopt')).textContent} (${INFO[mode]})`,
        p: fp ? '+' + money(fp) : '',
      });

      const keys = {};
      lines.textContent = '';
      L.forEach((l) => {
        const li = document.createElement('li');
        li.className = 'tl' + (l.muted ? ' is-muted' : '');
        ['k', 'v', 'p'].forEach((f) => {
          const s = document.createElement('span');
          s.className = 'tl__' + f;
          s.textContent = l[f] || '';
          li.appendChild(s);
        });
        const sig = l.v + '|' + (l.p || '');
        if (last[l.k] !== undefined && last[l.k] !== sig) li.classList.add('is-new');
        keys[l.k] = sig;
        lines.appendChild(li);
      });
      last = keys;

      name.textContent = `Ton ${NAMES[mode]} ${size.dataset.label}`;
      if (mbName) mbName.textContent = `${cap(NAMES[mode])} ${size.dataset.label}`;
      setOdo(total, money(sum));
      if (mbTotal) mbTotal.textContent = money(sum);
    }

    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'size' || t.name === 'meat') syncMeats();
      if (t.name === 'gratin') syncMiel();
      update();
    });

    const seg = $('[data-seg="mode"]');
    const segCtl = seg ? initSeg(seg, setMode) : null;

    // Suppléments repliables
    const tog = $('[data-supp-toggle]', form);
    const supp = $('[data-supp]', form);
    if (tog && supp) {
      supp.inert = true;
      tog.addEventListener('click', () => {
        const open = !supp.classList.contains('is-open');
        supp.classList.toggle('is-open', open);
        supp.inert = !open;
        tog.setAttribute('aria-expanded', String(open));
        refreshSoon(900);
      });
    }

    const reset = $('[data-reset]');
    if (reset) reset.addEventListener('click', () => {
      form.reset();
      order = [];
      if (segCtl) segCtl.set('tacos');
      else setMode('tacos');
      syncMeats();
      syncMiel();
      update();
    });

    syncMeats();
    syncMiel();
    update();
  }

  /* ---------- Snacks : 4 / 6 / 10 pièces ---------- */
  function initPieces() {
    const seg = $('[data-seg="pcs"]');
    if (!seg) return;
    initSeg(seg, (n) => {
      $$('[data-pcs-price]').forEach((el, i) => setTimeout(() => setOdo(el, el.dataset['p' + n]), i * 45));
      $$('[data-pcs-label]').forEach((l) => { l.textContent = `${n} pcs`; });
    });
  }

  /* ---------- Formulaire de contact (ouvre la messagerie) ---------- */
  function initForm() {
    const f = $('[data-contact]');
    if (!f) return;
    const msg = $('[data-form-msg]', f);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const bad = ['nom', 'email', 'message'].filter((k) => {
        const v = String(d[k] || '').trim();
        return !v || (k === 'email' && !/^\S+@\S+\.\S+$/.test(v));
      });
      $$('.field', f).forEach((el) => el.classList.toggle('is-invalid', bad.includes(el.name)));
      if (bad.length) {
        msg.textContent = 'Merci de remplir ton nom, ton e-mail et ton message.';
        return;
      }
      const subject = String(d.sujet || '').trim() || 'Message depuis le site';
      const body = `${String(d.message).trim()}\n\n— ${String(d.nom).trim()} (${String(d.email).trim()})`;
      location.href = `mailto:info@big-brother.ch?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      msg.textContent = 'Ton application e-mail s’ouvre avec ton message. Merci !';
    });
    f.addEventListener('input', (e) => e.target.classList.remove('is-invalid'));
  }

  /* ---------- Vidéos : lecture seulement à l'écran ---------- */
  function initVideos() {
    const vids = $$('video[data-autoplay]');
    vids.forEach((v) => { v.muted = true; });
    if (reduce) return;
    if (!('IntersectionObserver' in window)) {
      vids.forEach((v) => { const p = v.play(); if (p) p.catch(() => {}); });
      return;
    }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) { const p = v.play(); if (p) p.catch(() => {}); } else v.pause();
    }), { rootMargin: '150px 0px' });
    vids.forEach((v) => io.observe(v));
  }

  /* ---------- Hero : la pilule vidéo et son ouverture plein écran ---------- */
  const hero = $('[data-hero]');
  const heroTitle = $('[data-hero-title]');
  const pill = $('[data-hero-pill]');
  const stage = $('[data-hero-stage]');
  const stageVideo = stage ? $('video', stage) : null;
  let heroP = 0; // 0 = vidéo dans la pilule, 1 = plein écran

  function renderStage(p) {
    if (typeof p === 'number') heroP = p;
    if (!hero || !pill || !stage) return;
    const hr = hero.getBoundingClientRect();
    const pr = pill.getBoundingClientRect();
    const W = hr.width;
    const Ht = hr.height;
    const l = pr.left - hr.left;
    const t = pr.top - hr.top;
    const w = pr.width;
    const h = pr.height;
    const ie = 1 - heroP;
    stage.style.clipPath = `inset(${(t * ie).toFixed(2)}px ${((W - l - w) * ie).toFixed(2)}px ${((Ht - t - h) * ie).toFixed(2)}px ${(l * ie).toFixed(2)}px round ${((h / 2) * ie).toFixed(2)}px)`;
    // la vidéo entière tient d'abord dans la pilule, puis grandit avec elle
    const k0 = Math.max(w / W, h / Ht, 0.001);
    const k = k0 + (1 - k0) * heroP;
    const dx = (l + w / 2 - W / 2) * ie;
    const dy = (t + h / 2 - Ht / 2) * ie;
    if (stageVideo) stageVideo.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
  }

  // Hauteur de capitale réelle de la police → la pilule s'aligne sur les lettres
  function pillMetrics() {
    if (!heroTitle) return;
    try {
      const cs = getComputedStyle(heroTitle);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
      const m = ctx.measureText('BH');
      if (!m.fontBoundingBoxAscent || !m.actualBoundingBoxAscent) return;
      const asc = m.fontBoundingBoxAscent / 100;
      const desc = m.fontBoundingBoxDescent / 100;
      const capH = m.actualBoundingBoxAscent / 100;
      const lh = 0.8;
      const baseline = (lh - (asc + desc)) / 2 + asc;
      heroTitle.style.setProperty('--cap', capH.toFixed(3));
      heroTitle.style.setProperty('--cap-dy', (baseline - capH / 2 - lh / 2).toFixed(3));
    } catch (e) { /* valeurs CSS par défaut */ }
  }

  // « BIG ◯ BROTHER » occupe toute la largeur (deux lignes en portrait étroit)
  function fitHero() {
    if (!heroTitle || !hero) return;
    const avail = heroTitle.parentElement.clientWidth * 0.99;
    heroTitle.style.setProperty('--fs', '100px');
    const wl = $('.hero__word--l', heroTitle).getBoundingClientRect().width;
    const wr = $('.hero__word--r', heroTitle).getBoundingClientRect().width;
    if (!wl || !wr) return;
    const one = (avail * 100) / (wl + wr + 9 + 122);
    const stacked = one < 118 && innerHeight > innerWidth * 0.9;
    let fs = stacked ? (avail * 100) / wr : one;
    fs = Math.min(fs, hero.clientHeight * (stacked ? 0.26 : 0.38));
    heroTitle.classList.toggle('is-stacked', stacked);
    heroTitle.style.setProperty('--fs', fs.toFixed(2) + 'px');
  }

  function fitFooter() {
    const g = $('[data-footer-giant]');
    if (!g || !g.firstElementChild) return;
    g.style.setProperty('--fs', '100px');
    const w = g.firstElementChild.getBoundingClientRect().width;
    if (w) g.style.setProperty('--fs', ((g.clientWidth * 0.99 * 100) / w).toFixed(2) + 'px');
  }

  function fitAll() {
    pillMetrics();
    fitHero();
    fitFooter();
    renderStage();
  }

  /* ---------- Gouttes de cheddar (écran d'ouverture & menu) ---------- */
  function makeDrips(W, seed) {
    const r = rng(seed);
    const out = [];
    const maxL = Math.min(280, 120 + W * 0.12);
    let x = 8 + r() * 30;
    while (x < W - 8) {
      const w = 16 + r() * 30;
      out.push({ x: x + w / 2, w, len: (0.22 + Math.pow(r(), 1.5) * 0.78) * maxL });
      x += w + 22 + r() * 92;
    }
    return out;
  }

  // Panneau du haut jusqu'au bord « edge », gouttes qui pendent dessous (s = étirement 0 → 1)
  function dripPath(W, edge, drips, s) {
    const n = (v) => v.toFixed(1);
    let d = `M-20 -40H${n(W + 20)}V${n(edge)}`;
    for (let i = drips.length - 1; i >= 0; i--) {
      const { x, w, len } = drips[i];
      const L = len * s;
      if (L < 1) continue;
      const hw = w / 2;
      const ry = Math.min(hw, L * 0.5);
      const f = Math.min(10, L * 0.35);
      const yA = edge + L - ry;
      d += `H${n(x + hw + f)}Q${n(x + hw)} ${n(edge)} ${n(x + hw)} ${n(edge + f)}V${n(yA)}`;
      d += `A${n(hw)} ${n(ry)} 0 0 1 ${n(x - hw)} ${n(yA)}V${n(edge + f)}Q${n(x - hw)} ${n(edge)} ${n(x - hw - f)} ${n(edge)}`;
    }
    return d + 'H-20Z';
  }

  /* ---------- Démarrage sans animation ---------- */
  $$('.odo').forEach((el) => setOdo(el, el.textContent.trim()));
  initStatus();
  initBuilder();
  initPieces();
  initForm();
  initVideos();
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  root.classList.add('has-stage'); // la vidéo du hero est désormais dessinée par la « scène »

  // Sans GSAP (CDN indisponible) : tout reste visible et utilisable
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js');
    if (loader) loader.remove();
    fitAll();
    addEventListener('resize', fitAll);
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);

  /* ---------- Scroll fluide ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const velocity = () => (lenis ? lenis.velocity || 0 : 0);

  window.__bb = Object.assign(window.__bb || {}, {
    lenis,
    renderStage,
    // Débogage (onglet masqué = images gelées) : termine les animations en cours
    finish() { gsap.globalTimeline.getChildren(false, true, true).forEach((t) => { if (!t.scrollTrigger && t.repeat() !== -1) t.progress(1); }); },
    go(y) {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
      ScrollTrigger.update();
    },
  });

  /* ---------- Découpages, mises à la taille, états de départ ---------- */
  const heroChars = heroTitle ? $$('.hero__word', heroTitle).flatMap((w) => split(w).chars) : [];
  $$('[data-split]').forEach((el) => split(el));
  $$('[data-jelly]').forEach((el) => split(el));
  fitAll();
  ScrollTrigger.addEventListener('refreshInit', fitAll);

  if (!reduce) {
    gsap.set(heroChars, { yPercent: 105, rotate: 6, opacity: 0 });
    gsap.set($$('[data-hero-fade]'), { y: 16, opacity: 0 });
    if (pill) gsap.set(pill, { width: 0 });
  }

  /* ---------- Hero : ouverture au scroll (épinglé) ---------- */
  let heroST = null;
  if (hero && !reduce) {
    const prog = { p: 0 };
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => '+=' + Math.round(innerHeight * 1.6),
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onRefresh: () => renderStage(),
      },
    });
    tl.to(prog, { p: 1, duration: 0.7, ease: 'power2.inOut', onUpdate: () => renderStage(prog.p) }, 0)
      .to('.hero__word--l', { xPercent: -70, duration: 0.55, ease: 'power2.in' }, 0)
      .to('.hero__word--r', { xPercent: 70, duration: 0.55, ease: 'power2.in' }, 0)
      .to('.hero__top', { yPercent: -80, opacity: 0, duration: 0.24 }, 0)
      .to('.hero__bottom', { yPercent: 50, opacity: 0, duration: 0.24 }, 0)
      .to('.hero__scrim', { opacity: 0.4, duration: 0.3 }, 0.48)
      .fromTo('.hero__line', { yPercent: 80, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.2, stagger: 0.07, ease: 'power3.out' }, 0.62)
      .to({}, { duration: 0.14 });
    heroST = tl.scrollTrigger;
  } else {
    renderStage(0);
  }

  function heroIntro() {
    if (reduce) { renderStage(0); return; }
    gsap.timeline({
      onUpdate: () => renderStage(),
      onComplete: () => { if (pill) pill.style.width = ''; renderStage(); },
    })
      .to(pill, { width: '1.22em', duration: 1.45, ease: 'expo.inOut' }, 0.1)
      .to(heroChars, { yPercent: 0, rotate: 0, opacity: 1, duration: 1.3, ease: 'expo.out', stagger: 0.045 }, 0)
      .to($$('[data-hero-fade]'), { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.07 }, 0.6);
    // Arrivée avec une ancre (ex. index.html#carte)
    let target = null;
    try { target = location.hash && $(decodeURIComponent(location.hash)); } catch (e) { target = null; }
    if (target) requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
      else target.scrollIntoView();
    });
  }

  /* ---------- Signature wraps : défilement horizontal épinglé ---------- */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    const sec = $('[data-wraps]');
    if (!sec || reduce) return;
    const pinEl = $('.wraps__pin', sec);
    const track = $('.wraps__track', sec);
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const tw = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: { trigger: pinEl, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true },
    });
    $$('.wcard', track).forEach((card) => {
      gsap.fromTo(card, { yPercent: 9, rotate: 3.5 }, {
        yPercent: 0, rotate: 0, ease: 'none',
        scrollTrigger: { trigger: card, containerAnimation: tw, start: 'left right', end: 'left 76%', scrub: true },
      });
    });
    const bar = $('.wraps__bar i', sec);
    if (bar) gsap.to(bar, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: pinEl, start: 'top top', end: () => '+=' + dist(), scrub: true } });
  });

  /* ---------- Écran d'ouverture : le cheddar coule et libère la page ---------- */
  function runLoader(done) {
    if (!loader) { done(); return; }
    if (reduce || debug) { loader.remove(); done(); return; }
    if (lenis) lenis.stop();
    const svg = $('.loader__drip', loader);
    const path = $('path', svg);
    const inner = $('.loader__inner', loader);
    const count = $('[data-count]', loader);
    const c = { v: 0 };
    gsap.to(c, { v: 100, duration: 1.2, ease: 'power2.inOut', onUpdate: () => { count.textContent = Math.round(c.v); } });
    gsap.from('.loader__logo', { scale: 0.92, opacity: 0, duration: 1.1, ease: 'expo.out' });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([Promise.all([fonts, wait(1250)]), wait(3200)]).then(() => {
      ScrollTrigger.refresh(); // polices prêtes → tailles définitives
      const W = innerWidth;
      const Hh = innerHeight;
      const drips = makeDrips(W, 7);
      const maxLen = Math.max(...drips.map((d) => d.len));
      svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
      const st = { e: Hh, s: 0 };
      const draw = () => {
        path.setAttribute('d', dripPath(W, st.e, drips, st.s));
        inner.style.transform = `translate3d(0, ${(st.e - Hh).toFixed(1)}px, 0)`;
      };
      draw();
      loader.classList.add('is-svg');
      gsap.timeline({ onComplete: () => { loader.remove(); if (lenis) lenis.start(); } })
        .to(st, { s: 1, duration: 0.95, ease: 'power1.out', onUpdate: draw }, 0)
        .to(st, { e: -maxLen - 40, duration: 1.3, ease: 'power3.inOut', onUpdate: draw }, 0)
        .add(done, 0.5);
    });
  }

  /* ---------- Menu plein écran (mobile) ---------- */
  let closeMenu = (cb) => { if (cb) cb(); };
  function initMenu() {
    const btn = $('[data-burger]');
    const menu = $('[data-menu]');
    if (!btn || !menu) return;
    const svg = $('.menu__drip', menu);
    const path = $('path', svg);
    const links = $$('.menu__link', menu);
    const foot = $$('[data-menu-fade]', menu);
    const st = { e: 0, s: 0 };
    let open = false;
    let drips = [];
    let W = 0;
    let Hh = 0;
    let tl = null;
    const draw = () => path.setAttribute('d', dripPath(W, st.e, drips, st.s));
    const setup = () => {
      W = innerWidth;
      Hh = innerHeight;
      svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
      drips = makeDrips(W, 3);
    };
    function show() {
      open = true;
      setup();
      const maxLen = Math.max(...drips.map((d) => d.len));
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Fermer le menu');
      root.classList.add('menu-open');
      menu.style.visibility = 'visible';
      if (lenis) lenis.stop();
      if (tl) tl.kill();
      tl = gsap.timeline()
        .to(st, { e: Hh + maxLen + 10, duration: 0.85, ease: 'power3.inOut', onUpdate: draw }, 0)
        .to(st, { s: 1, duration: 0.7, ease: 'power1.out', onUpdate: draw }, 0)
        .fromTo(links, { yPercent: 60, y: 0, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.05 }, 0.4)
        .fromTo(foot, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }, 0.6);
    }
    function hide(cb) {
      if (!open) { if (cb) cb(); return; }
      open = false;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Ouvrir le menu');
      if (tl) tl.kill();
      tl = gsap.timeline({
        onComplete: () => {
          menu.style.visibility = '';
          root.classList.remove('menu-open');
          if (lenis) lenis.start();
          if (cb) cb();
        },
      })
        .to([...links, ...foot], { opacity: 0, y: -10, duration: 0.25, stagger: 0.02 }, 0)
        .to(st, { e: -10, s: 0, duration: 0.7, ease: 'power3.inOut', onUpdate: draw }, 0.12);
    }
    closeMenu = hide;
    btn.addEventListener('click', () => (open ? hide() : show()));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) hide(); });
    addEventListener('resize', () => { if (!open) return; setup(); st.e = Hh + 400; st.s = 1; draw(); });
  }

  /* ---------- Ancres ---------- */
  function goTo(target, offset = 0) {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id === '#' || id === '#main') return;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    const offset = id === '#ticket' ? -(parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 72) - 16 : 0;
    if (root.classList.contains('menu-open')) closeMenu(() => goTo(target, offset));
    else goTo(target, offset);
  }));

  /* ---------- En-tête, boutons flottants, récap mobile ---------- */
  const nav = $('[data-nav]');
  const dock = $('[data-dock]');
  const minibar = $('[data-minibar]');
  let lastY = 0;
  let mbOn = false;
  let footOn = false;
  const footer = $('[data-footer]');
  if (footer) ScrollTrigger.create({ trigger: footer, start: 'top 75%', onToggle: (s) => { footOn = s.isActive; onScroll(lastY); } });
  function onScroll(y) {
    const dy = y - lastY;
    lastY = y;
    const solidAt = heroST ? heroST.end - 2 : innerHeight * 0.8;
    nav.classList.toggle('is-solid', y > solidAt);
    if (!root.classList.contains('menu-open')) {
      if (y > 140 && dy > 2) nav.classList.add('is-hidden');
      else if (dy < -2 || y <= 140) nav.classList.remove('is-hidden');
    }
    if (dock) dock.classList.toggle('is-on', y > innerHeight * 0.9 && !mbOn && !footOn);
  }
  if (lenis) lenis.on('scroll', (l) => onScroll(l.scroll));
  else addEventListener('scroll', () => onScroll(scrollY), { passive: true });

  if (minibar) {
    const ticket = $('[data-ticket]');
    let inCompose = false;
    let ticketSeen = false;
    const sync = () => {
      mbOn = inCompose && !ticketSeen && innerWidth < 900;
      minibar.classList.toggle('is-on', mbOn);
      onScroll(lastY);
    };
    ScrollTrigger.create({ trigger: '#compose', start: 'top 55%', end: 'bottom 85%', onToggle: (s) => { inCompose = s.isActive; sync(); } });
    if (ticket) ScrollTrigger.create({ trigger: ticket, start: 'top 95%', end: 'bottom top', onToggle: (s) => { ticketSeen = s.isActive; sync(); } });
  }

  /* ---------- Pilules : remplissage depuis le point d'entrée + texte qui roule ---------- */
  function setOrigin(el, e) {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left).toFixed(1) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top).toFixed(1) + 'px');
  }
  function initPills() {
    $$('.pill').forEach((el) => {
      const t = $('.pill__t', el);
      if (t && !t.querySelector('.roll')) {
        const text = t.textContent.trim();
        t.textContent = '';
        const roll = document.createElement('span');
        roll.className = 'roll';
        const a = document.createElement('span');
        a.className = 'roll__a';
        a.textContent = text;
        const b = document.createElement('span');
        b.className = 'roll__b';
        b.textContent = text;
        b.setAttribute('aria-hidden', 'true');
        roll.append(a, b);
        t.appendChild(roll);
        [a, b].forEach((x) => split(x, { aria: false }).chars.forEach((c, i) => c.style.setProperty('--i', i)));
      }
      el.addEventListener('pointerenter', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--d', Math.ceil(Math.hypot(r.width, r.height) * 2.1) + 'px');
        setOrigin(el, e);
      });
      el.addEventListener('pointerleave', (e) => setOrigin(el, e));
    });
  }

  function initMagnetic() {
    if (!finePointer || reduce) return;
    $$('[data-magnetic]').forEach((el) => {
      const qx = gsap.quickTo(el, 'x', { duration: 0.7, ease: 'power3' });
      const qy = gsap.quickTo(el, 'y', { duration: 0.7, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        qx((e.clientX - r.left - r.width / 2) * 0.3);
        qy((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener('pointerleave', () => { qx(0); qy(0); });
    });
  }

  /* ---------- Curseur ---------- */
  function initCursor() {
    if (!finePointer || reduce) return;
    const c = $('[data-cursor-el]');
    if (!c) return;
    root.classList.add('has-cursor');
    const ring = $('.cursor__ring', c);
    const dot = $('.cursor__dot', c);
    const lab = $('.cursor__label', c);
    const labT = $('span', lab);
    const q = (el, p, d) => gsap.quickTo(el, p, { duration: d, ease: 'power3' });
    const mv = [[ring, 0.45], [dot, 0.1], [lab, 0.32]].map(([el, d]) => [q(el, 'x', d), q(el, 'y', d)]);
    let shown = false;
    addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (!shown) {
        shown = true;
        gsap.set([ring, dot, lab], { x: e.clientX, y: e.clientY });
      }
      c.classList.add('is-on');
      mv.forEach(([fx, fy]) => { fx(e.clientX); fy(e.clientY); });
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const field = t.closest('input, textarea, select');
      const link = t.closest('a, button, label, [data-tilt]');
      const own = t.closest('[data-cursor]');
      const zone = t.closest('[data-cursor-zone]');
      const text = own ? own.dataset.cursor : (!link && zone ? zone.dataset.cursorZone : '');
      if (text) labT.textContent = text;
      c.classList.toggle('is-text', !!field);
      c.classList.toggle('has-label', !!text);
      c.classList.toggle('is-link', !!link && !text && !field);
    });
    document.addEventListener('pointerleave', () => c.classList.remove('is-on'));
  }

  /* ---------- Bandeaux défilants : vitesse et inclinaison liées au scroll ---------- */
  function initMarquees() {
    const items = $$('[data-marquee]').map((m) => {
      const track = $('.marquee__track', m);
      const group = $('.marquee__group', m);
      const o = { m, track, group, dir: Number(m.dataset.dir || -1), x: 0, gw: 0, vis: true };
      o.fill = () => {
        $$('.marquee__group', track).slice(1).forEach((g) => g.remove());
        o.gw = group.offsetWidth;
        const n = Math.max(2, Math.ceil((innerWidth * 1.3) / Math.max(1, o.gw)) + 1);
        for (let i = 1; i < n; i++) {
          const k = group.cloneNode(true);
          k.setAttribute('aria-hidden', 'true');
          track.appendChild(k);
        }
      };
      o.fill();
      new IntersectionObserver(([en]) => { o.vis = en.isIntersecting; }).observe(m);
      return o;
    });
    if (!items.length) return;
    addEventListener('resize', () => items.forEach((o) => o.fill()));
    if (document.fonts) document.fonts.ready.then(() => items.forEach((o) => o.fill()));
    if (reduce) return;
    let skew = 0;
    let sdir = 1;
    gsap.ticker.add((t, dt) => {
      const v = velocity();
      if (Math.abs(v) > 0.2) sdir = Math.sign(v);
      skew = lerp(skew, clamp(v * 0.3, -8, 8), 0.1);
      items.forEach((o) => {
        if (!o.vis || !o.gw) return;
        o.x += (0.05 + Math.min(Math.abs(v), 80) * 0.03) * dt * o.dir * sdir;
        if (o.x <= -o.gw) o.x += o.gw;
        else if (o.x > 0) o.x -= o.gw;
        o.track.style.transform = `translate3d(${o.x.toFixed(2)}px,0,0) skewX(${(-skew).toFixed(2)}deg)`;
      });
    });
  }

  /* ---------- Apparitions au scroll ---------- */
  function initReveals() {
    if (reduce) return;
    $$('[data-split]').forEach((el) => {
      const { chars } = split(el);
      gsap.set(chars, { yPercent: 105, rotate: 5, opacity: 0 });
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => gsap.to(chars, { yPercent: 0, rotate: 0, opacity: 1, duration: 1.15, ease: 'expo.out', stagger: 0.022 }),
      });
    });
    $$('[data-reveal]').forEach((el) => {
      gsap.fromTo(el, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
    });
    $$('[data-stagger]').forEach((el) => {
      gsap.fromTo(el.children, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    $$('[data-stagger-rows]').forEach((el) => {
      gsap.fromTo($$('tr', el), { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    $$('.rule').forEach((r) => {
      gsap.fromTo(r, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: 'expo.inOut', scrollTrigger: { trigger: r, start: 'top 97%', once: true } });
    });
    // Le concept s'allume mot après mot
    const hl = $('[data-highlight]');
    if (hl) {
      const { words } = split(hl, { chars: false, aria: false });
      gsap.fromTo(words, { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.08, scrollTrigger: { trigger: hl, start: 'top 80%', end: 'bottom 50%', scrub: true } });
    }
  }

  /* ---------- Parallaxe : filigranes, vidéos, badges qui tournent ---------- */
  function initParallax() {
    if (reduce) return;
    $$('.wm__i').forEach((ic) => {
      const sp = parseFloat(ic.dataset.speed || 0.5);
      const r0 = parseFloat(ic.dataset.r || 0);
      gsap.fromTo(ic, { yPercent: 45 * sp, rotate: r0 - 14 * sp }, {
        yPercent: -45 * sp, rotate: r0 + 14 * sp, ease: 'none',
        scrollTrigger: { trigger: ic.closest('.sec') || ic.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
    $$('.capsule video').forEach((v) => {
      if (v.closest('.wraps')) return;
      gsap.fromTo(v, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: v.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    $$('[data-spin]').forEach((el) => {
      let r = 0;
      let vis = false;
      new IntersectionObserver(([en]) => { vis = en.isIntersecting; }).observe(el);
      gsap.ticker.add((t, dt) => {
        if (!vis) return;
        r += (0.014 + Math.min(Math.abs(velocity()), 60) * 0.012) * dt;
        el.style.transform = `rotate(${r.toFixed(2)}deg)`;
      });
    });
  }

  /* ---------- Crousty : les lettres s'assemblent comme des miettes ---------- */
  function initCrousty() {
    const el = $('[data-crumble]');
    if (!el) return;
    const { chars } = split(el);
    const r = rng(11);
    chars.forEach((c) => {
      c.style.setProperty('--jx', ((r() - 0.5) * 12).toFixed(1) + 'px');
      c.style.setProperty('--jy', ((r() - 0.5) * 12).toFixed(1) + 'px');
      c.style.setProperty('--jr', ((r() - 0.5) * 14).toFixed(1) + 'deg');
    });
    if (reduce) return;
    const r2 = rng(23);
    const pts = chars.map(() => ({ x: (r2() - 0.5) * 1.1, y: (r2() - 0.3) * 0.9, rot: (r2() - 0.5) * 170, s: 0.35 + r2() * 0.5 }));
    gsap.fromTo(chars, {
      x: (i) => pts[i].x * innerWidth * 0.5,
      y: (i) => pts[i].y * innerHeight * 0.6,
      rotate: (i) => pts[i].rot,
      scale: (i) => pts[i].s,
      opacity: 0,
    }, {
      x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, ease: 'power2.out',
      stagger: { each: 0.03, from: 'random' },
      scrollTrigger: { trigger: '.crousty', start: 'top 80%', end: 'center 58%', scrub: 1, invalidateOnRefresh: true },
    });
  }

  /* ---------- Avis : défilement continu, pause au survol, glisser ---------- */
  function initReviews() {
    const vp = $('[data-reviews]');
    if (!vp) return;
    const track = $('.reviews__track', vp);
    Array.from(track.children).forEach((card) => {
      const k = card.cloneNode(true);
      k.setAttribute('aria-hidden', 'true');
      track.appendChild(k);
    });
    const cruise = reduce ? 0 : -0.045; // px/ms
    let W = track.scrollWidth / 2;
    let x = 0;
    let v = cruise;
    let target = cruise;
    let drag = null;
    let vis = false;
    addEventListener('resize', () => { W = track.scrollWidth / 2; });
    new IntersectionObserver(([en]) => { vis = en.isIntersecting; }).observe(vp);
    vp.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') target = 0; });
    vp.addEventListener('pointerleave', () => { target = cruise; });
    vp.addEventListener('pointerdown', (e) => {
      drag = { sx: e.clientX, x0: x, lx: e.clientX, lt: performance.now(), vx: 0 };
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('is-drag');
    });
    vp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const now = performance.now();
      x = drag.x0 + (e.clientX - drag.sx);
      drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
      drag.lx = e.clientX;
      drag.lt = now;
    });
    const end = () => {
      if (!drag) return;
      v = clamp(drag.vx, -3, 3);
      drag = null;
      vp.classList.remove('is-drag');
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    gsap.ticker.add((t, dt) => {
      if (!vis && !drag) return;
      if (!drag) {
        v = lerp(v, target, 0.04);
        x += v * dt;
      }
      if (W > 0) {
        while (x <= -W) x += W;
        while (x > 0) x -= W;
      }
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    });
  }

  /* ---------- Pied de page : le nom monte du sol ---------- */
  function initFooter() {
    const g = $('[data-footer-giant] > span');
    if (!g || reduce) return;
    const { chars } = split(g, { aria: false });
    gsap.fromTo(chars, { yPercent: 102 }, {
      yPercent: 0, ease: 'power3.out', stagger: 0.05,
      scrollTrigger: { trigger: '[data-footer]', start: 'top 85%', end: 'bottom bottom', scrub: 1 },
    });
  }

  /* ---------- Survol : lettres qui se soulèvent près du curseur ---------- */
  function initJelly() {
    if (!finePointer || reduce) return;
    $$('[data-jelly]').forEach((el) => {
      const { chars } = split(el);
      if (!chars.length) return;
      const qs = chars.map((c) => gsap.quickTo(c, 'y', { duration: 0.55, ease: 'power3' }));
      let pts = [];
      let fs = 0;
      let t0 = 0;
      const measure = () => {
        pts = chars.map((c) => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        fs = parseFloat(getComputedStyle(el).fontSize);
        t0 = performance.now();
      };
      const zone = el.closest('a') || el;
      zone.addEventListener('pointerenter', measure);
      zone.addEventListener('pointermove', (e) => {
        if (performance.now() - t0 > 250) measure();
        const a = fs * 0.14;
        const R = a * 5.5;
        pts.forEach(([x, y], i) => {
          const f = Math.max(0, 1 - Math.hypot(e.clientX - x, (e.clientY - y) * 0.5) / R);
          qs[i](-a * f * f);
        });
      });
      zone.addEventListener('pointerleave', () => qs.forEach((q) => q(0)));
    });
  }

  /* ---------- Survol : cartes wraps inclinées ---------- */
  function initTilt() {
    if (!finePointer || reduce) return;
    $$('[data-tilt]').forEach((card) => {
      gsap.set(card, { transformPerspective: 900 });
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 10);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  /* ---------- Lancement ---------- */
  initPills();
  initMagnetic();
  initCursor();
  initMenu();
  initMarquees();
  initReveals();
  initParallax();
  initCrousty();
  initReviews();
  initFooter();
  initJelly();
  initTilt();
  fitAll();
  runLoader(heroIntro);

  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
})();
