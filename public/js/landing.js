import { countUp, prefersReducedMotion } from './core/motion.js';

/**
 * Landing page behaviour. Separate from the console entirely: no shared state,
 * no API calls, nothing that needs a key.
 */

// --- Sticky header -------------------------------------------------------

const head = document.getElementById('site-head');
if (head) {
  const setStuck = () => {
    head.dataset.stuck = window.scrollY > 12 ? 'true' : 'false';
  };
  setStuck();
  window.addEventListener('scroll', setStuck, { passive: true });
}

// --- Scroll reveal -------------------------------------------------------

/**
 * Sections fade up as they come into view. The class is only applied when
 * IntersectionObserver exists, so without it everything renders in place
 * rather than staying invisible.
 */
const revealables = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !prefersReducedMotion()) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );
  for (const node of revealables) observer.observe(node);
} else {
  for (const node of revealables) node.classList.add('is-visible');
}

// --- Counting figures ----------------------------------------------------

const figures = document.querySelectorAll('[data-count]');
if ('IntersectionObserver' in window) {
  const counters = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        const suffix = node.dataset.suffix ?? '';
        countUp(node, Number(node.dataset.count), (n) => `${n}${suffix}`, 1100);
        counters.unobserve(node);
      }
    },
    { threshold: 0.5 },
  );
  for (const node of figures) counters.observe(node);
} else {
  for (const node of figures) {
    node.textContent = `${node.dataset.count}${node.dataset.suffix ?? ''}`;
  }
}

// --- Capability marquee --------------------------------------------------

const MARQUEE_ITEMS = [
  ['i-book', 'Jawaban dari knowledge base'],
  ['i-user', 'Ambil alih oleh agent'],
  ['i-shield', 'Terpisah per company'],
  ['i-target', 'Lead otomatis'],
  ['i-chart', 'Kuota terukur'],
  ['i-zap', 'Meta Cloud API resmi'],
  ['i-bot', 'Tanpa jawaban ngawur'],
];

const track = document.getElementById('marquee-track');
if (track) {
  const build = () =>
    MARQUEE_ITEMS.map(([glyph, label]) => {
      const item = document.createElement('span');
      item.className = 'marquee-item';
      item.innerHTML =
        `<svg width="17" height="17" viewBox="0 0 24 24" class="icon"><use href="#${glyph}"/></svg>`;
      item.appendChild(document.createTextNode(label));
      return item;
    });

  // Two identical halves, so translating the track by -50% loops seamlessly.
  for (const item of build()) track.appendChild(item);
  for (const item of build()) track.appendChild(item);
}

// --- Demo conversation ---------------------------------------------------

/**
 * A looping WhatsApp exchange. The last beat is the handover, which is the
 * part that actually distinguishes this product, so the script builds to it.
 */
const SCRIPT = [
  { from: 'in', text: 'Halo, ongkir ke Malang berapa ya?' },
  { from: 'out', text: 'Halo! Pengiriman ke Malang Rp 15.000, estimasi 1 sampai 2 hari kerja.' },
  { from: 'in', text: 'AC 1/2 PK stoknya ada?' },
  { from: 'out', text: 'Ada, tersedia 4 unit. Garansi resmi 1 tahun.' },
  { from: 'in', text: 'Saya mau bicara dengan orangnya saja' },
  {
    from: 'out',
    text: 'Baik, saya sambungkan ke tim kami. Agent akan membalas sebentar lagi.',
    handover: true,
  },
];

const body = document.getElementById('demo-body');
const state = document.getElementById('demo-state');

if (body && state) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const bubble = (entry) => {
    const node = document.createElement('div');
    node.className = `msg msg--${entry.from}`;
    node.textContent = entry.text;
    body.appendChild(node);
    return node;
  };

  const dots = () => {
    const node = document.createElement('div');
    node.className = 'msg-dots';
    for (let i = 0; i < 3; i++) node.appendChild(document.createElement('i'));
    body.appendChild(node);
    return node;
  };

  async function play() {
    // Static fallback: show the finished exchange and stop.
    if (prefersReducedMotion()) {
      for (const entry of SCRIPT) bubble(entry);
      state.textContent = 'agent mengambil alih';
      return;
    }

    for (;;) {
      body.replaceChildren();
      state.textContent = 'online';
      await wait(900);

      for (const entry of SCRIPT) {
        if (entry.from === 'out') {
          state.textContent = 'mengetik...';
          const pending = dots();
          // Longer replies take longer to "type", within reason.
          await wait(Math.min(1900, 620 + entry.text.length * 22));
          pending.remove();
          state.textContent = 'online';
        }

        bubble(entry);
        if (entry.handover) {
          await wait(600);
          state.textContent = 'agent mengambil alih';
        }
        await wait(entry.from === 'in' ? 1000 : 1500);
      }

      await wait(3200);
    }
  }

  play();
}
