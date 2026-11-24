/* ============================================================================
   Talk — landing motion + socials
   ========================================================================== */
(function () {
  "use strict";

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------- particles */
  const canvas = document.getElementById("field");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0, h = 0, dots = [], tx = 0, ty = 0, mx = 0, my = 0;

    const tint = ["rgba(255,255,255,", "rgba(205,188,164,"];

    function build() {
      w = canvas.width = innerWidth * dpr;
      h = canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";

      const n = Math.min(Math.round((innerWidth * innerHeight) / 28000), 130);
      dots = Array.from({ length: n }, () => {
        const r = (Math.random() * 2.4 + 0.55) * dpr;
        return {
          x: Math.random() * w, y: Math.random() * h, r,
          vx: (Math.random() - 0.5) * 0.1 * dpr,
          vy: (Math.random() - 0.5) * 0.1 * dpr,
          c: tint[Math.random() < 0.16 ? 1 : 0],
          a: Math.random() * 0.45 + 0.22,
          ph: Math.random() * Math.PI * 2
        };
      });
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;

      for (const d of dots) {
        if (!reduce) {
          d.x += d.vx; d.y += d.vy;
          if (d.x < -30) d.x = w + 30;
          if (d.x > w + 30) d.x = -30;
          if (d.y < -30) d.y = h + 30;
          if (d.y > h + 30) d.y = -30;
        }
        const px = d.x + mx * (d.r * 1.4);
        const py = d.y + my * (d.r * 1.4);
        const breath = reduce ? 0 : Math.sin(t / 1600 + d.ph) * 0.18;
        const r = d.r * (1 + breath);

        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 5);
        g.addColorStop(0, d.c + (d.a * 0.85).toFixed(3) + ")");
        g.addColorStop(0.4, d.c + (d.a * 0.22).toFixed(3) + ")");
        g.addColorStop(1, d.c + "0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, r * 5, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = d.c + (d.a * 0.9).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(px, py, r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    addEventListener("resize", build);
    addEventListener("mousemove", e => {
      tx = (e.clientX / innerWidth - 0.5) * 22;
      ty = (e.clientY / innerHeight - 0.5) * 22;
    });
    build();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------ custom cursor */
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");
  if (dot && ring) {
    let cx = innerWidth / 2, cy = innerHeight / 2, rx = cx, ry = cy;

    addEventListener("mousemove", e => {
      cx = e.clientX; cy = e.clientY;
      dot.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    });
    (function loop() {
      rx += (cx - rx) * 0.16;
      ry += (cy - ry) * 0.16;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    })();

    const grow = on => {
      ring.style.width = on ? "46px" : "30px";
      ring.style.height = on ? "46px" : "30px";
      ring.style.borderColor = on ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.35)";
    };
    document.querySelectorAll("a,button,summary").forEach(el => {
      el.addEventListener("mouseenter", () => grow(true));
      el.addEventListener("mouseleave", () => grow(false));
    });
  }

  /* ---------------------------------------------------------- reveal */
  const items = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach((en, i) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.style.transitionDelay = (i * 70) + "ms";
        el.classList.add("in");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add("in"));
  }

  /* ------------------------------------------------ fragment parallax */
  const frags = [...document.querySelectorAll(".frag-pos")];
  function parallax() {
    const vh = innerHeight;
    for (const f of frags) {
      const wrap = f.parentElement.getBoundingClientRect();
      const dp = parseFloat(f.dataset.dp || "0.4");
      const local = (vh - wrap.top) / (vh + wrap.height);
      f.style.transform = `translateY(${(local - 0.5) * dp * 80}px)`;
    }
  }
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { parallax(); ticking = false; });
  }, { passive: true });
  parallax();

  /* ------------------------------------------------------------- spine */
  const spineLinks = [...document.querySelectorAll(".spine .sp")];
  const targets = spineLinks.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (spineLinks.length && "IntersectionObserver" in window) {
    const io2 = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        spineLinks.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    targets.forEach(t => io2.observe(t));
  }

  /* ---------------------------------------------------------- socials */
  const CFG = window.TALK_CONFIG || {};
  const s = CFG.socials || {};

  const ICONS = {
    x: '<svg viewBox="0 0 24 24"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24"><path d="M21.9 4.3 18.8 19c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.8 12.4l-4.6-1.4c-1-.3-1-1 .2-1.4l17.9-6.9c.8-.3 1.6.2 1.6 1.6z"/></svg>',
    discord: '<svg viewBox="0 0 24 24"><path d="M20.3 4.4A19 19 0 0 0 15.6 3l-.3.6a17 17 0 0 0-6.6 0L8.4 3a19 19 0 0 0-4.7 1.4C.8 9 .1 13.4.4 17.7a19 19 0 0 0 5.8 2.9l.7-1.2c-.6-.2-1.2-.5-1.7-.8l.4-.3a13.6 13.6 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l.7 1.2a19 19 0 0 0 5.8-2.9c.4-5-.7-9.3-2.2-13.3zM8.3 15.2c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7.4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    github: '<svg viewBox="0 0 24 24"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.3.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11 11 0 0 1 5.9 0C17 4.5 18 4.8 18 4.8c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5z"/></svg>',
    site: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15 15 0 0 0-1.2-3.4A8 8 0 0 1 18.9 8zM12 4.2c.5.7 1 1.9 1.4 3.8h-2.8c.4-1.9.9-3.1 1.4-3.8zM4.3 14a8 8 0 0 1 0-4h3.3a21 21 0 0 0 0 4zm.8 2h2.9c.3 1.2.7 2.4 1.2 3.4A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.1-3.4A15 15 0 0 0 8 8zM12 19.8c-.5-.7-1-1.9-1.4-3.8h2.8c-.4 1.9-.9 3.1-1.4 3.8zM14.6 14H9.4a19 19 0 0 1 0-4h5.2a19 19 0 0 1 0 4zm.6 5.4c.5-1 .9-2.2 1.2-3.4h2.9a8 8 0 0 1-4.1 3.4zm1.6-5.4a21 21 0 0 0 0-4h3.3a8 8 0 0 1 0 4z"/></svg>'
  };

  const order = ["x", "telegram", "discord", "github", "site"];
  const label = k => k === "site" ? (s.label || "web") : k === "x" ? (s.xHandle || "x") : k;
  const link = (k, cls) => {
    const inner = ICONS[k] || "";
    return s[k]
      ? `<a class="${cls}" href="${s[k]}" target="_blank" rel="noopener noreferrer" aria-label="${label(k)}" title="${label(k)}">${inner}</a>`
      : `<span class="${cls} off" title="${label(k)} — not set">${inner}</span>`;
  };

  const hud = document.getElementById("hudSocials");
  if (hud) hud.innerHTML = order.map(k => link(k, "")).join("");

  const foot = document.getElementById("footSocials");
  if (foot) {
    const items = order.filter(k => s[k]);
    foot.innerHTML = items.length
      ? items.map(k => `<a href="${s[k]}" target="_blank" rel="noopener noreferrer">${label(k)}</a>`).join("")
      : "";
    if (!items.length) foot.hidden = true;
  }
})();
