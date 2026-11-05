(() => {
  "use strict";

  /* =========================================================
     ReHestore — modern skin for hestore.hu
     The original DOM stays in place (hidden) and acts as the
     data source + action layer; everything visible lives in a
     shadow root attached to #rh-host.
     ========================================================= */

  const HOST_ID = "rh-host";
  const FAILSAFE_MS = 4000;
  const ORIGIN = location.origin;

  const state = {
    page: "legacy",
    host: null,
    root: null,
    view: "grid",
    theme: "light", // "light" | "dark" | "auto"
    header: null,
    cats: [],
  };

  /* ---------------- theme ---------------- */
  const darkMQ = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const isDark = () => state.theme === "dark" || (state.theme === "auto" && !!(darkMQ && darkMQ.matches));
  function applyTheme() {
    const dark = isDark();
    document.documentElement.classList.toggle("rh-dark", dark);
    const app = state.root && state.root.querySelector(".app");
    if (!app) return;
    app.classList.toggle("dark", dark);
    const btn = app.querySelector("[data-theme-toggle]");
    if (btn) {
      btn.innerHTML = `${icon(dark ? "sun" : "moon", 15)} ${dark ? "Világos" : "Sötét"}`;
      btn.title = state.theme === "auto" ? "Rendszer szerinti téma (váltás a bővítmény menüjében)" : "Téma váltása";
    }
  }
  if (darkMQ) darkMQ.addEventListener("change", applyTheme);

  /* ---------------- utils ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const attr = (el, name) => (el ? el.getAttribute(name) || "" : "");
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const abs = (u) => {
    try {
      return new URL(u, ORIGIN).href;
    } catch (_) {
      return u || "";
    }
  };
  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const withParams = (params, base = location.href) => {
    const u = new URL(base, ORIGIN);
    Object.entries(params).forEach(([k, v]) => {
      if (v == null || v === "") u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    });
    return u.pathname + u.search;
  };
  const num = (s) => {
    const m = String(s || "").replace(/\s/g, "").match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };
  const storage = {
    get(keys) {
      return new Promise((res) => {
        try {
          chrome.storage.local.get(keys, (r) => res(r || {}));
        } catch (_) {
          res({});
        }
      });
    },
    set(obj) {
      try {
        chrome.storage.local.set(obj);
      } catch (_) {}
    },
  };

  function submitForm(form, submitter) {
    if (!form) return false;
    try {
      if (typeof form.requestSubmit === "function") {
        if (submitter && submitter.form === form) form.requestSubmit(submitter);
        else form.requestSubmit();
      } else if (submitter) submitter.click();
      else form.submit();
      return true;
    } catch (_) {
      try {
        form.submit();
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  /* ---------------- product images ----------------
     The server keeps size variants of every product photo under
     /images/comp/<size>/<id>.jpg — small 80, medium 120, normal 220, large 480, full 600, xl 1200.
     The legacy list only references `small`, which looks pixelated at card size. */
  const IMG_RE = /^((?:https?:\/\/[^/]+)?\/images\/comp\/)(?:(?:small|medium|normal|large|full|xl)\/)?([^/?#]+\.(?:jpe?g|png|gif|webp))(\?.*)?$/i;
  // the legacy list lazy-loads: <img src="/pic/b.gif" data-src="/images/comp/small/…"> → prefer data-src
  function isrc(imgEl) {
    if (!imgEl) return "";
    const lazy = attr(imgEl, "data-src") || attr(imgEl, "data-original") || attr(imgEl, "data-lazy");
    const src = attr(imgEl, "src");
    return lazy || (/\/pic\/b\.gif$|^data:/.test(src) ? "" : src);
  }
  function imgSized(src, size) {
    const m = src && src.match(IMG_RE);
    return m ? `${m[1]}${size}/${m[2]}${m[3] || ""}` : src || "";
  }
  // <img> with a 1x/2x srcset; falls back to the original URL if the variant 404s (see mount())
  function pimg(src, size, size2x, attrs = 'alt="" loading="lazy"') {
    if (!src) return "";
    const s1 = imgSized(src, size);
    const srcset = size2x && s1 !== src ? ` srcset="${esc(s1)} 1x, ${esc(imgSized(src, size2x))} 2x"` : "";
    return `<img src="${esc(s1)}"${srcset} data-orig="${esc(src)}" ${attrs}>`;
  }

  async function copyText(s) {
    try {
      await navigator.clipboard.writeText(s);
      toast("Vágólapra másolva: " + s);
    } catch (_) {
      toast("A másolás nem sikerült", "bad");
    }
  }

  /* ---------------- icons ---------------- */

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2.2l2.3 10.6a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    file: '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    box: '<path d="M3 8 12 3l9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9"/><path d="M12 17h.01"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5A3 3 0 0 0 9.5 10c0 2 5 1.5 5 4a3 3 0 0 1-5 .5M12 6v2M12 16v2"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6M8 11h6M11 8v6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14" r="1.2"/>',
    tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    hash: '<path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17"/>',
    pin: '<path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9.5 12 1.8 1.8L15 10"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="m15 8 5 4-5 4M20 12H9"/>',
    home: '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  const icon = (name, size = 20) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;

  const LOGO = `<span class="logo-mark" role="img" aria-hidden="true"></span>`;

  /* ---------------- page detection ---------------- */

  function detect() {
    const p = location.pathname;
    const f = p.split("/").pop() || "";
    if (/^\/ajax_/.test(p) || /prod_getfile\.php$/.test(f) || /^\/images\//.test(p)) return "skip";
    if (/^\/article\/?$/.test(p) || p === "/article/index.php") return "articles";
    if (p === "/" || p === "/index.php") return "home";
    if (f === "login.php") return "login";
    if (/^prod_\d+\.html$/.test(f)) return "product";
    if (f === "cats.php") return "cats";
    if (/^cat_\d+\.html$/.test(f) || f === "search.php" || f === "new_products.html") return "list";
    if (f === "basket.php") return "basket";
    if (/^profile_\w+\.php$/.test(f)) return "profile";
    return "legacy";
  }

  /* account menu (stable hestore URLs; we draw our own icons instead of the site's white PNGs) */
  const ACCOUNT_LINKS = [
    { href: "/profile_home.php", label: "Profilom", icon: "home" },
    { href: "/profile_orders.php", label: "Rendelések", icon: "receipt" },
    { href: "/profile_fav.php", label: "Kedvenc termékek", icon: "heart" },
    { href: "/profile_balance.php", label: "Egyenleg", icon: "wallet" },
    { href: "/profile_offers.php", label: "Ajánlatok", icon: "tag" },
    { href: "/profile_invoice.php", label: "Számlák", icon: "file" },
    { href: "/profile_uno.php", label: "Saját cikkszámok", icon: "hash" },
    { href: "/profile_address.php", label: "Címek, nevek", icon: "pin" },
    { href: "/profile_legal.php", label: "Jogosultságok, dokumentumok", icon: "shield" },
    { href: "/profile_settings.php", label: "Beállítások", icon: "cog" },
  ];
  const LOGOUT_HREF = "/logout.php";
  const isActiveHref = (href) => location.pathname === href || (href === "/profile_orders.php" && location.pathname === "/profile_order.php");

  /* ---------------- shared parsers ---------------- */

  function parseHeader() {
    const pc = $(".mheader .pcont");
    const links = pc ? $$(":scope > a", pc) : [];
    const loginA = links.find((a) => /login\.php/.test(attr(a, "href")));
    const logoutA = links.find((a) => /logout|kilép/i.test(attr(a, "href") + txt(a)));
    const logged = !loginA;
    let name = "";
    if (logged && pc) {
      const profA = links.find((a) => /profile_home\.php/.test(attr(a, "href")));
      name = profA ? txt(profA) : "";
      if (!name) {
        const clone = pc.cloneNode(true);
        $$(".icns, a", clone).forEach((n) => n.remove());
        name = txt(clone).replace(/[|•]/g, " ").trim();
      }
    }
    return {
      logged,
      name,
      basket: txt($("#iBaskIcon div")) || "0",
      loginHref: attr(loginA, "href") || "/login.php",
      logoutHref: attr(logoutA, "href") || "",
      links: links.map((a) => ({ label: txt(a), href: attr(a, "href") })).filter((l) => l.label && !/^javascript/.test(l.href)),
    };
  }

  function parseCategories() {
    return $$(".mleft .category > li")
      .map((li) => {
        const id = (li.id || "").replace("catli", "");
        const a = $("a", li);
        return {
          id,
          label: txt(a),
          href: id ? `/cat_${id}.html` : attr(a, "href"),
          img: id ? `/images/cat/normal/${id}.jpg` : "",
        };
      })
      .filter((c) => c.label);
  }

  function parseCrumbs() {
    return $$(".crumblist a").map((a) => ({ label: txt(a), href: attr(a, "href") }));
  }

  function pageH1() {
    const crumbs = parseCrumbs();
    const h = $(".mcontent h1");
    if (h) return txt(h);
    if (crumbs.length) return crumbs[crumbs.length - 1].label;
    return document.title.split(" - ")[0];
  }

  // stock icons on hestore: 1 = raktáron, 2 = rendelésre, 3 = nem elérhető, 4 = néhány munkanap
  const STOCK_BY_ICON = {
    1: { cls: "ok", label: "Raktáron" },
    2: { cls: "neutral", label: "Rendelésre" },
    3: { cls: "bad", label: "Nem elérhető" },
    4: { cls: "warn", label: "Néhány munkanap" },
  };
  function stockInfo(text, imgSrc) {
    const t = (text || "").toLowerCase();
    const n = (String(imgSrc || "").match(/stock(\d)/) || [])[1];
    const byIcon = STOCK_BY_ICON[n];
    if (/nem\s|nincs|megszűnt|kifutott|nem rendelhető/.test(t)) return { cls: "bad", label: text || "Nem elérhető" };
    if (/munkanap|hét|rendelésre|beszerz|előrendel/.test(t)) return { cls: "warn", label: text };
    if (/raktár|azonnal|>|db/.test(t)) return { cls: "ok", label: text };
    if (/ajánljuk/.test(t)) return { cls: byIcon ? byIcon.cls : "ok", label: (byIcon ? byIcon.label + " · " : "") + text };
    if (byIcon) return { cls: byIcon.cls, label: text || byIcon.label };
    return { cls: "neutral", label: text || "Elérhetőség" };
  }

  /* ---------------- shadow CSS ---------------- */

  function css() {
    return `
:host { all: initial; display: block; }
*, *::before, *::after { box-sizing: border-box; }
.app {
  --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f8fafc;
  --ink: #0f172a; --ink-2: #475569; --ink-3: #94a3b8;
  --line: #e5e7eb; --line-2: #eef2f6;
  --accent: #f59e0b; --accent-hover: #d97706; --accent-ink: #1c1917; --accent-soft: #fff7e6;
  --ok: #16a34a; --ok-soft: #ecfdf5; --warn: #d97706; --warn-soft: #fffbeb; --bad: #dc2626; --bad-soft: #fef2f2; --info: #2563eb; --info-soft: #eff6ff;
  --ok-ink: #166534; --ok-line: #bbf7d0; --warn-ink: #92400e; --warn-line: #fde68a; --bad-ink: #991b1b; --bad-line: #fecaca; --info-ink: #1e40af; --info-line: #bfdbfe;
  --accent-text: #b45309; --accent-line: #fde68a;
  --line-hover: #cbd5e1; --hover-tint: rgba(15,23,42,.06);
  --ink-bg: #0f172a; --ink-bg-hover: #1e293b; --on-ink: #fff; --on-ink-2: #cbd5e1; --bar-bg: #0f172a;
  --img-bg: #fff;
  --hero-bg: linear-gradient(135deg, #fff7ed, #fef3c7 60%, #fde68a);
  --r: 12px; --r-lg: 16px;
  --sh-sm: 0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04);
  --sh-md: 0 10px 30px rgba(15,23,42,.10);
  color-scheme: light;
  font: 15px/1.5 Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--ink);
  background: var(--bg);
  min-height: 100vh;
  display: flex; flex-direction: column;
  -webkit-font-smoothing: antialiased;
}
/* ---------- dark theme ---------- */
.app.dark {
  --bg: #0b1220; --surface: #121b2e; --surface-2: #192338;
  --ink: #e6eaf2; --ink-2: #a7b1c4; --ink-3: #6f7d96;
  --line: #273350; --line-2: #1e2a44; --line-hover: #3d4b6b; --hover-tint: rgba(255,255,255,.07);
  --accent-hover: #fbbf24; --accent-soft: rgba(245,158,11,.14); --accent-text: #fbbf24; --accent-line: rgba(245,158,11,.35);
  --ok-soft: rgba(22,163,74,.14); --ok-ink: #4ade80; --ok-line: rgba(74,222,128,.3);
  --warn-soft: rgba(217,119,6,.14); --warn-ink: #fbbf24; --warn-line: rgba(251,191,36,.3);
  --bad: #f87171; --bad-soft: rgba(220,38,38,.14); --bad-ink: #f87171; --bad-line: rgba(248,113,113,.3);
  --info-soft: rgba(37,99,235,.16); --info-ink: #93c5fd; --info-line: rgba(147,197,253,.3);
  --ink-bg: #e2e8f0; --ink-bg-hover: #cbd5e1; --on-ink: #0f172a; --on-ink-2: #475569; --bar-bg: #060b16;
  --img-bg: #fff;
  --hero-bg: linear-gradient(135deg, #1f2937, #292524 60%, #3f2e0e);
  --sh-sm: 0 1px 2px rgba(0,0,0,.35); --sh-md: 0 12px 32px rgba(0,0,0,.5);
  color-scheme: dark;
}
.app.dark .pcard .media { border-radius: var(--r-lg) var(--r-lg) 0 0; }
.app.dark .cat-tile img, .app.dark .drawer nav img, .app.dark .mega-grid img { background: var(--img-bg); border-radius: 8px; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select, textarea { font: inherit; color: inherit; }
img { display: block; max-width: 100%; }
.wrap { width: min(1280px, 100% - 40px); margin-inline: auto; }
.ic { flex: 0 0 auto; }
.hidden, [hidden] { display: none !important; }
.muted { color: var(--ink-2); }
.small { font-size: 13px; }
.mono { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }

/* ---------- buttons & inputs ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 16px; border-radius: 999px;
  font-weight: 600; font-size: 14px; white-space: nowrap;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  transition: background .15s, border-color .15s, transform .05s, box-shadow .15s;
}
.btn:hover { background: var(--surface-2); border-color: var(--line-hover); }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn.dark { background: var(--ink-bg); border-color: var(--ink-bg); color: var(--on-ink); }
.btn.dark:hover { background: var(--ink-bg-hover); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.btn.ghost:hover { background: var(--hover-tint); color: var(--ink); }
.btn.sm { height: 34px; padding: 0 12px; font-size: 13px; }
.btn.block { width: 100%; }
.btn:disabled { opacity: .5; cursor: default; }
.iconbtn {
  display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 10px;
  color: var(--ink-2); position: relative;
}
.iconbtn:hover { background: var(--hover-tint); color: var(--ink); }
.field {
  height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface);
  outline: none; width: 100%; min-width: 0;
}
.field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,158,11,.18); }
input::placeholder, textarea::placeholder { color: #94a3b8; opacity: 1; }
.sel { position: relative; display: inline-block; }
.sel select.field { padding-right: 34px; appearance: none; width: 100%; }
.sel::after { content: ""; position: absolute; right: 14px; top: 50%; width: 7px; height: 7px; border-right: 2px solid var(--ink-2); border-bottom: 2px solid var(--ink-2); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
.qty { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); height: 40px; overflow: hidden; }
.qty button { width: 36px; height: 100%; color: var(--ink-2); font-size: 18px; }
.qty button:hover { background: var(--surface-2); color: var(--ink); }
.qty input { width: 48px; height: 100%; border: 0; text-align: center; outline: none; background: transparent; font-weight: 600; -moz-appearance: textfield; }
.qty input::-webkit-outer-spin-button, .qty input::-webkit-inner-spin-button { -webkit-appearance: none; }
.qty.sm { height: 34px; } .qty.sm button { width: 30px; } .qty.sm input { width: 40px; }
.badge {
  position: absolute; top: 4px; right: 2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; display: grid; place-items: center; line-height: 1;
}
.pill { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; border: 1px solid transparent; }
.pill.ok { background: var(--ok-soft); color: var(--ok-ink); border-color: var(--ok-line); }
.pill.warn { background: var(--warn-soft); color: var(--warn-ink); border-color: var(--warn-line); }
.pill.bad { background: var(--bad-soft); color: var(--bad-ink); border-color: var(--bad-line); }
.pill.neutral { background: var(--surface-2); color: var(--ink-2); border-color: var(--line); }
.pill.info { background: var(--info-soft); color: var(--info-ink); border-color: var(--info-line); }
.pill .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--sh-sm); }
.card.pad { padding: 20px; }
.section-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 36px 0 16px; }
.section-head h2 { margin: 0; font-size: 22px; letter-spacing: -0.015em; font-weight: 700; }
.section-head p { margin: 2px 0 0; color: var(--ink-2); font-size: 14px; }
.link { color: var(--accent-text); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
.link:hover { text-decoration: underline; }
h1.title { font-size: clamp(24px, 3vw, 32px); line-height: 1.15; letter-spacing: -0.02em; margin: 0; font-weight: 750; }

/* ---------- utility bar ---------- */
.utilbar { background: var(--bar-bg); color: #cbd5e1; font-size: 13px; }
.utilbar .wrap { display: flex; align-items: center; justify-content: space-between; height: 36px; gap: 16px; }
.utilbar a, .utilbar button { color: inherit; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; }
.utilbar a:hover, .utilbar button:hover { color: #fff; background: rgba(255,255,255,.08); }
.utilbar .group { display: flex; align-items: center; gap: 2px; }
.utilbar .sep { width: 1px; height: 16px; background: rgba(255,255,255,.15); margin: 0 6px; }
.utilbar strong { color: #fff; font-weight: 600; }

/* ---------- header ---------- */
.header { background: var(--surface); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 40; }
.header .wrap { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px; height: 76px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
.brand .logo-mark {
  display: block; flex: none; width: 26px; height: 36px;
  background: url("/pic/logo.png") left center / auto 36px no-repeat; /* original mark only; the word starts further right */
}
.brand small { display: block; font-weight: 500; font-size: 11px; color: var(--ink-3); letter-spacing: .02em; margin-top: -2px; }
.search { display: flex; align-items: center; height: 46px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); padding: 0 6px 0 16px; max-width: 720px; width: 100%; justify-self: center; transition: border-color .15s, box-shadow .15s, background .15s; }
.search:focus-within { background: var(--surface); border-color: var(--accent); box-shadow: 0 0 0 4px rgba(245,158,11,.16); }
.search .ic { color: var(--ink-3); }
.search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; padding: 0 12px; font-size: 15px; }
.search button { flex: none; height: 36px; padding: 0 18px; border-radius: 999px; background: var(--ink-bg); color: var(--on-ink); font-weight: 600; font-size: 14px; white-space: nowrap; }
.search button:hover { background: var(--ink-bg-hover); }
.search button .mobile-ic { display: none; }
.hactions { display: flex; align-items: center; gap: 4px; }
.hactions .iconbtn { width: 44px; height: 44px; }
.menu-toggle { display: none; }

/* ---------- nav ---------- */
.nav { background: var(--surface); border-bottom: 1px solid var(--line); position: relative; z-index: 30; }
.nav > .wrap { display: flex; align-items: center; gap: 4px; height: 48px; }
.nav a, .nav .navbtn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 8px; font-weight: 500; font-size: 14px; color: var(--ink-2); white-space: nowrap; flex: none; }
.nav a:hover, .nav .navbtn:hover { background: rgba(15,23,42,.05); color: var(--ink); }
.nav a.active { color: var(--ink); background: var(--accent-soft); }
.app.dark .nav a.active { color: #fff; }
.catbtn { background: var(--ink-bg); color: var(--on-ink) !important; font-weight: 600 !important; padding: 0 14px !important; }
.catbtn:hover { background: var(--ink-bg-hover) !important; }
.catbtn.open { background: var(--accent) !important; color: var(--accent-ink) !important; }
.nav .spacer { flex: 1; }
.mega { position: absolute; left: 0; right: 0; top: 100%; background: var(--surface); border-bottom: 1px solid var(--line); box-shadow: var(--sh-md); z-index: 35; }
.mega .wrap { padding: 20px 0 24px; max-height: calc(100vh - 180px); overflow: auto; }
.mega-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 18px; }
.mega-grid a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; font-size: 14px; color: var(--ink); min-width: 0; height: auto; white-space: normal; flex: initial; }
.mega-grid a:hover { background: var(--surface-2); }
.mega-grid img { width: 34px; height: 34px; object-fit: cover; border-radius: 8px; background: var(--surface-2); flex: 0 0 auto; }
.mega-grid span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.25; }
.scrim { position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 25; backdrop-filter: blur(1px); }

/* ---------- main ---------- */
.main { flex: 1; padding: 24px 0 64px; }
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); margin-bottom: 14px; }
.crumbs a:hover { color: var(--ink); text-decoration: underline; }
.crumbs .ic { color: var(--ink-3); }
.crumbs .cur { color: var(--ink); font-weight: 600; }

/* ---------- home ---------- */
.hero { display: grid; grid-template-columns: 2fr 1fr; grid-auto-rows: 200px; gap: 14px; }
.slide { position: relative; border-radius: var(--r-lg); overflow: hidden; background: #0f172a; color: #fff; display: block; isolation: isolate; }
.slide.big { grid-row: span 2; }
.slide img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .5s; z-index: -1; opacity: .95; }
.slide:hover img { transform: scale(1.03); }
.slide::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,23,42,0) 35%, rgba(15,23,42,.85) 100%); z-index: -1; }
.slide .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 20px; }
.slide h3 { margin: 0 0 4px; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.slide.big h3 { font-size: 28px; }
.slide p { margin: 0; font-size: 13.5px; color: #e2e8f0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.slide.big p { font-size: 15px; max-width: 56ch; }
.slide .tag { display: inline-flex; margin-bottom: 8px; padding: 3px 9px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 11.5px; font-weight: 700; letter-spacing: .02em; }
.usp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
.usp .card { display: flex; gap: 14px; align-items: center; padding: 14px 16px; }
.usp .ico { width: 42px; height: 42px; border-radius: 12px; background: var(--accent-soft); color: var(--accent-text); display: grid; place-items: center; flex: 0 0 auto; }
.usp strong { display: block; font-size: 14px; }
.usp span { font-size: 13px; color: var(--ink-2); }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.cat-tile { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 12px; text-align: center; font-size: 13.5px; font-weight: 600; transition: transform .15s, box-shadow .15s, border-color .15s; }
.cat-tile:hover { transform: translateY(-2px); box-shadow: var(--sh-md); border-color: var(--line-hover); }
.cat-tile img { width: 72px; height: 72px; object-fit: cover; border-radius: 14px; background: var(--surface-2); }
.cat-tile span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
.news-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.news-list { display: flex; flex-direction: column; gap: 10px; }
.news-item { display: grid; grid-template-columns: 84px 1fr; gap: 14px; padding: 12px; align-items: start; transition: border-color .15s, box-shadow .15s; }
.news-item:hover { border-color: var(--line-hover); box-shadow: var(--sh-md); }
.news-item img { width: 84px; height: 64px; object-fit: cover; border-radius: 10px; background: var(--surface-2); }
.news-item h4 { margin: 0 0 4px; font-size: 15px; line-height: 1.3; }
.news-item p { margin: 0; font-size: 13.5px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.news-item .date { font-size: 12px; color: var(--ink-3); margin-top: 6px; display: block; }

/* ---------- product cards ---------- */
.products { display: grid; gap: 14px; }
.products.grid { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.products.list { grid-template-columns: 1fr; }
.pcard { display: flex; flex-direction: column; overflow: hidden; transition: border-color .15s, box-shadow .15s; min-width: 0; position: relative; }
.pcard:hover { border-color: var(--line-hover); box-shadow: var(--sh-md); }
.pcard .media { display: block; aspect-ratio: 4 / 3; background: var(--img-bg); border-bottom: 1px solid var(--line-2); padding: 14px; }
.pcard .media img { width: 100%; height: 100%; object-fit: contain; }
.pcard .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
.pcard .sku { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-3); font-weight: 500; }
.pcard .sku button { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: var(--ink-3); }
.pcard .sku button:hover { background: var(--surface-2); color: var(--ink); }
.pcard .type { font-weight: 700; font-size: 15px; line-height: 1.3; letter-spacing: -0.005em; overflow-wrap: anywhere; }
.pcard .type:hover { color: var(--accent-text); }
.pcard .name { font-size: 13.5px; color: var(--ink-2); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pcard .mfr { font-size: 12.5px; color: var(--ink-3); }
.pcard .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 6px; flex-wrap: wrap; }
.price-main { font-size: 18px; font-weight: 750; letter-spacing: -0.01em; }
.price-main small { font-size: 12px; font-weight: 500; color: var(--ink-3); margin-left: 4px; }
.tiers { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--ink-2); }
.tiers b { font-weight: 600; color: var(--ink); }
.pcard .buy { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.pcard .buy .btn { flex: 1; }
.pcard .docs { display: flex; gap: 6px; flex-wrap: wrap; }
.pcard .docs a { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-2); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.pcard .docs a:hover { color: var(--ink); border-color: var(--line-hover); }
.products.list .pcard { flex-direction: row; align-items: stretch; }
.products.list .pcard .media { width: 150px; aspect-ratio: auto; border-bottom: 0; border-right: 1px solid var(--line-2); flex: 0 0 150px; display: grid; place-items: center; }
.products.list .pcard .body { display: grid; grid-template-columns: 1fr auto auto; grid-template-areas: "info price buy"; gap: 10px 24px; align-items: center; }
.products.list .pcard .info { grid-area: info; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.products.list .pcard .meta { grid-area: price; flex-direction: column; align-items: flex-end; margin: 0; padding: 0; }
.products.list .pcard .buy { grid-area: buy; margin: 0; }
.products.list .pcard .buy .btn { flex: 0 0 auto; }
.stockbtn { background: none; padding: 0; }
.stockbtn:hover .pill { filter: brightness(.97); }

/* ---------- list page ---------- */
.list-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.list-head .count { color: var(--ink-2); font-size: 14px; margin-top: 4px; }
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar .field { width: auto; }
.toggle { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); font-size: 14px; cursor: pointer; user-select: none; }
.toggle input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; }
.toggle.on { border-color: var(--accent); background: var(--accent-soft); }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; background: var(--surface); height: 40px; }
.seg button { width: 42px; display: grid; place-items: center; color: var(--ink-3); }
.seg button.on { background: var(--ink-bg); color: var(--on-ink); }
.list-layout { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
.list-layout.nofilters { grid-template-columns: 1fr; }
.filters { position: sticky; top: 92px; max-height: calc(100vh - 110px); overflow: auto; padding: 6px 0; scrollbar-width: thin; }
.filters .fhead { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 6px; }
.filters .fhead strong { font-size: 15px; }
.fgroup { border-top: 1px solid var(--line-2); }
.fgroup summary { list-style: none; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; font-weight: 600; font-size: 14px; cursor: pointer; }
.fgroup summary::-webkit-details-marker { display: none; }
.fgroup summary .ic { transition: transform .15s; color: var(--ink-3); }
.fgroup[open] summary .ic { transform: rotate(180deg); }
.fitems { padding: 0 16px 12px; display: flex; flex-direction: column; gap: 2px; }
.fitem { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; font-size: 13.5px; cursor: pointer; }
.fitem:hover { background: var(--surface-2); }
.fitem input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; flex: 0 0 auto; }
.fitem span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fitem i { font-style: normal; color: var(--ink-3); font-size: 12px; }
.fmore { padding: 6px 8px; color: var(--accent-text); font-weight: 600; font-size: 13px; text-align: left; }
.factions { position: sticky; bottom: 0; display: flex; gap: 8px; padding: 12px 16px; background: linear-gradient(180deg, transparent, var(--surface) 30%); border-top: 1px solid var(--line-2); }
.factions .btn { flex: 1; }
.pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 24px; flex-wrap: wrap; }
.pager .sel { min-width: 180px; }
.pager .info { color: var(--ink-2); font-size: 14px; }
.subcats { margin-bottom: 24px; }
.empty { padding: 48px 24px; text-align: center; color: var(--ink-2); }
.empty h3 { margin: 10px 0 4px; color: var(--ink); }
.sentinel { height: 1px; }
.loading { display: flex; justify-content: center; padding: 20px; color: var(--ink-3); font-size: 14px; }

/* ---------- product page ---------- */
.prod { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 32px; align-items: start; }
.gallery { position: sticky; top: 100px; }
.gallery .main-img { display: grid; place-items: center; aspect-ratio: 1; max-height: 520px; padding: 28px; position: relative; cursor: zoom-in; background: var(--img-bg); border-radius: var(--r-lg); }
.gallery .main-img img { max-height: 100%; max-width: 100%; object-fit: contain; }
.gallery .zoom { position: absolute; right: 12px; bottom: 12px; }
.prod-info { min-width: 0; margin-top: 32px; }
.prod-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
.skubox { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 6px 0 10px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); font-size: 13px; color: var(--ink-2); }
.skubox b { color: var(--ink); font-weight: 600; }
.skubox button { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: var(--ink-3); }
.skubox button:hover { background: var(--surface); color: var(--ink); }
.prod .desc { font-size: 17px; color: var(--ink-2); margin: 0 0 18px; line-height: 1.5; }
.summary { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--r); background: var(--accent-soft); border: 1px solid var(--accent-line); font-size: 14.5px; line-height: 1.55; }
.summary .ic { color: var(--accent-text); margin-top: 2px; }
.buybox { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.buybox .price-main { font-size: 28px; }
.buybox .price-main small { font-size: 13px; }
.tier-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.tier-table td { padding: 7px 0; border-bottom: 1px solid var(--line-2); }
.tier-table td:last-child { text-align: right; font-weight: 600; }
.tier-table tr.cur td { color: var(--accent-text); }
.tier-table tr:last-child td { border-bottom: 0; }
.avail-rows { display: flex; flex-direction: column; gap: 6px; }
.avail-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
.buy-row { display: flex; gap: 10px; align-items: center; }
.buy-row .btn { flex: 1; height: 46px; font-size: 15px; }
.qty.lg { height: 46px; }
.note { font-size: 12.5px; color: var(--ink-3); line-height: 1.45; }
.files a { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 14px; }
.files a:hover { background: var(--surface-2); }
.files .ic { color: var(--bad); }
.specs { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; }
.spec { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-2); font-size: 14px; }
.spec dt { color: var(--ink-2); margin: 0; }
.spec dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
.tabs button { padding: 10px 14px; font-weight: 600; font-size: 14px; color: var(--ink-2); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs button.on { color: var(--ink); border-color: var(--accent); }
.rail { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }

/* ---------- login ---------- */
.auth { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 920px; margin: 20px auto; }
.auth .card { padding: 32px; }
.auth h2 { margin: 0 0 6px; font-size: 24px; letter-spacing: -0.015em; }
.auth .lead { color: var(--ink-2); margin: 0 0 20px; font-size: 14.5px; }
.form { display: flex; flex-direction: column; gap: 14px; }
.form label { font-size: 13px; font-weight: 600; color: var(--ink-2); display: block; margin-bottom: 6px; }
.form .field { height: 46px; }
.form .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.form .row label { margin: 0; display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 500; }
.form .row input { accent-color: var(--accent); width: 16px; height: 16px; }
.err { color: var(--bad); font-size: 13.5px; }
.auth .side { background: linear-gradient(160deg, #0f172a, #1e293b); color: #fff; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
.auth .side h2 { color: #fff; }
.auth .side p { color: #cbd5e1; margin: 0; }
.auth .side ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; color: #e2e8f0; font-size: 14.5px; }
.auth .side li { display: flex; align-items: center; gap: 10px; }
.auth .side .ic { color: var(--accent); }

/* ---------- basket ---------- */
.basket { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
.bitems { display: flex; flex-direction: column; }
.bitem { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto auto minmax(90px, auto) auto; gap: 16px; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--line-2); }
.bitem:last-child { border-bottom: 0; }
.bitem img { width: 72px; height: 72px; object-fit: contain; border-radius: 10px; border: 1px solid var(--line-2); padding: 6px; background: var(--img-bg); }
.bitem .ttl { font-weight: 700; }
.bitem .sub { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
.bitem .sku { font-size: 12px; color: var(--ink-3); margin-top: 6px; }
.bitem .unit { font-size: 13px; color: var(--ink-2); text-align: right; white-space: nowrap; }
.bitem .sum { font-weight: 700; text-align: right; white-space: nowrap; min-width: 90px; }
.bitem .rm { color: var(--ink-3); }
.bitem .rm:hover { color: var(--bad); }
.bhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.quickadd { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.quickadd .field { width: 160px; }
.quickadd .field.q { width: 80px; }
.sumbox { padding: 20px; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 100px; }
.sumbox .row { display: flex; justify-content: space-between; font-size: 14.5px; color: var(--ink-2); }
.sumbox .row.total { color: var(--ink); font-weight: 750; font-size: 18px; padding-top: 10px; border-top: 1px solid var(--line); margin-top: 4px; gap: 12px; align-items: baseline; }
.sumbox .row.total span:first-child { font-size: 14px; font-weight: 600; color: var(--ink-2); }
.sumbox .row.total span:last-child { white-space: nowrap; font-size: 20px; }
.sumbox .btn { height: 48px; font-size: 15px; margin-top: 8px; }

/* ---------- articles ---------- */
.art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.art { display: flex; flex-direction: column; overflow: hidden; transition: border-color .15s, box-shadow .15s; }
.art:hover { border-color: var(--line-hover); box-shadow: var(--sh-md); }
.art img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--surface-2); }
.art .body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.art h3 { margin: 0; font-size: 16.5px; line-height: 1.3; letter-spacing: -0.005em; }
.art p { margin: 0; font-size: 14px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.art .date { font-size: 12.5px; color: var(--ink-3); margin-top: auto; }

/* ---------- legacy ---------- */
.legacy-wrap { padding: 24px 28px; }

/* ---------- footer ---------- */
.footer { background: var(--surface); border-top: 1px solid var(--line); margin-top: auto; }
.footer .wrap { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 24px; padding: 40px 0 28px; }
.footer h5 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); }
.footer ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.footer a:hover { color: var(--accent-text); }
.footer .about p { margin: 10px 0 0; color: var(--ink-2); font-size: 14px; max-width: 36ch; }
.footer .bottom { border-top: 1px solid var(--line-2); }
.footer .bottom .wrap { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; font-size: 13px; color: var(--ink-3); gap: 12px; flex-wrap: wrap; }

/* ---------- drawer ---------- */
.drawer { position: fixed; inset: 0 auto 0 0; width: min(360px, 88vw); background: var(--surface); z-index: 60; box-shadow: var(--sh-md); display: flex; flex-direction: column; transform: translateX(-100%); transition: transform .22s ease; }
.drawer.open { transform: none; }
.drawer .dhead { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.drawer nav { overflow: auto; padding: 8px; flex: 1; }
.drawer nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; font-size: 15px; }
.drawer nav a:hover { background: var(--surface-2); }
.drawer nav h6 { margin: 14px 12px 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); }
.drawer nav img { width: 28px; height: 28px; border-radius: 7px; object-fit: cover; background: var(--surface-2); }

/* ---------- overlays ---------- */
.toasts { position: fixed; right: 20px; bottom: 20px; z-index: 90; display: flex; flex-direction: column; gap: 8px; }
.toast { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 12px; background: var(--ink-bg); color: var(--on-ink); font-size: 14px; box-shadow: var(--sh-md); animation: pop .18s ease; max-width: 360px; }
.toast .ic { color: var(--accent); }
.toast.bad .ic { color: #fca5a5; }
.toast.ok .ic { color: #86efac; }
@keyframes pop { from { transform: translateY(8px); opacity: 0; } }
.lightbox { position: fixed; inset: 0; z-index: 95; background: rgba(15,23,42,.9); display: grid; place-items: center; padding: 24px; cursor: zoom-out; }
.lightbox img { max-width: 100%; max-height: 100%; border-radius: 12px; background: var(--img-bg); }
.lightbox .iconbtn { position: absolute; top: 16px; right: 16px; color: #fff; }
.popover { position: fixed; z-index: 70; width: min(320px, 92vw); background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--sh-md); padding: 10px; animation: pop .15s ease; max-height: 70vh; overflow: auto; }
.popover .phead { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 8px; font-weight: 700; font-size: 14px; }

/* ---------- account menu / profile pages ---------- */
.acct-head { display: flex; align-items: center; gap: 10px; padding: 8px 10px 12px; border-bottom: 1px solid var(--line-2); margin-bottom: 6px; color: var(--ink-2); }
.acct-head strong { display: block; color: var(--ink); font-size: 14px; }
.acct-head span { font-size: 12px; color: var(--ink-3); }
.acct-menu { display: flex; flex-direction: column; gap: 2px; }
.acct-menu a { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; font-size: 14px; color: var(--ink); }
.acct-menu a svg { color: var(--ink-3); flex: none; }
.acct-menu a:hover { background: var(--surface-2); }
.acct-menu a.on { background: var(--accent-soft); font-weight: 600; }
.acct-menu a.on svg { color: var(--accent-text); }
.acct-menu a.logout { color: var(--bad); margin-top: 4px; border-top: 1px solid var(--line-2); border-radius: 0 0 10px 10px; padding-top: 11px; }
.acct-menu a.logout svg { color: inherit; }

.account { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; align-items: start; }
.account .side { position: sticky; top: 100px; }
.account .side .who { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--line-2); }
.account .side .who .av { width: 42px; height: 42px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); display: grid; place-items: center; font-weight: 700; font-size: 16px; flex: none; }
.account .side .who strong { display: block; font-size: 15px; }
.account .side .who span { font-size: 12.5px; color: var(--ink-3); }
.account .side .acct-menu { padding: 8px; }
.acct-main { min-width: 0; }
.acct-main > .legacy-wrap { padding: 20px 24px; }
.hello { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 22px 24px; border-radius: var(--r-lg); background: var(--hero-bg); border: 1px solid var(--accent-line); }
.hello .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent-text); }
.hello h2 { margin: 4px 0 6px; font-size: 24px; letter-spacing: -0.015em; }
.hello p { margin: 0; color: var(--ink-2); font-size: 14.5px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 20px; }
.stat { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.stat .k { font-size: 12.5px; color: var(--ink-3); font-weight: 600; display: flex; align-items: center; gap: 6px; }
.stat .v { font-size: 20px; font-weight: 750; letter-spacing: -0.01em; }
.stat .v.sm { font-size: 15px; font-weight: 600; }
.stat .s { font-size: 13px; color: var(--ink-2); }
.stat.accent { background: var(--ink-bg); color: var(--on-ink); border-color: var(--ink-bg); }
.stat.accent .k, .stat.accent .s { color: var(--on-ink-2); }
.quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-top: 20px; }
.quick a { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: var(--r); border: 1px solid var(--line); background: var(--surface); font-size: 14px; font-weight: 600; color: var(--ink); transition: border-color .15s, box-shadow .15s, transform .15s; }
.quick a svg { color: var(--ink-3); }
.quick a:hover { border-color: var(--line-hover); box-shadow: var(--sh-sm); transform: translateY(-1px); }

.ord-filter { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; padding: 14px 16px; margin-bottom: 16px; }
.ord-filter label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.ord-filter .field { height: 38px; width: 130px; }
.ord-filter .q { flex: 1 1 220px; }
.ord-filter .q .field { width: 100%; }
.ord-filter .chk { flex-direction: row; align-items: center; gap: 8px; height: 38px; color: var(--ink-2); font-weight: 500; }
.orders { display: flex; flex-direction: column; gap: 10px; }
.order { display: grid; grid-template-columns: minmax(130px, auto) minmax(0, 1fr) auto auto; gap: 16px; align-items: center; padding: 14px 18px; }
.order .id { font-weight: 700; font-size: 15px; }
.order .id small { display: block; font-weight: 500; color: var(--ink-3); font-size: 12.5px; margin-top: 2px; }
.order .thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.order .thumbs a { width: 46px; height: 46px; border-radius: 8px; border: 1px solid var(--line); background: var(--img-bg) center/contain no-repeat; display: block; }
.order .thumbs a:hover { border-color: var(--line-hover); }
.order .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.order .sum { font-weight: 750; font-size: 16px; }
.order .track { font-size: 12.5px; color: var(--accent-text); display: inline-flex; align-items: center; gap: 4px; }
.order .more { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line); color: var(--ink-2); }
.order .more:hover { background: var(--surface-2); color: var(--ink); }
.empty { padding: 40px 20px; text-align: center; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.empty svg { color: var(--ink-3); }

/* ---------- order detail ---------- */
.ohead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.ohead .back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ink-3); margin-bottom: 8px; }
.ohead .back:hover { color: var(--ink); }
.ohead h1 { margin: 0; font-size: 26px; font-weight: 750; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
.ohead h1 .iconbtn { width: 32px; height: 32px; color: var(--ink-3); }
.ohead .osub { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 13.5px; color: var(--ink-2); }
.ohead .osub .t { display: inline-flex; align-items: center; gap: 5px; }
.ogrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.obox { padding: 16px 18px; }
.obox.wide { grid-column: 1 / -1; }
.obox h3 { margin: 0 0 10px; font-size: 12px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; display: flex; align-items: center; gap: 6px; }
.obox .ln { font-size: 14px; line-height: 1.55; color: var(--ink-2); }
.obox .ln strong { color: var(--ink); font-weight: 600; }
.obox .ln .k { display: block; font-size: 12.5px; color: var(--ink-3); margin-top: 6px; }
.obox .ln:first-of-type .k { margin-top: 0; }
.obox .note { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--accent-soft); color: var(--warn-ink); font-size: 13.5px; display: flex; gap: 8px; align-items: flex-start; }
.obox .note svg { flex: none; margin-top: 2px; }
.oitems { overflow: hidden; }
.oitems .oh { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line-2); }
.oitems .oh h2 { margin: 0; font-size: 17px; }
.oitems .oh span { font-size: 13px; color: var(--ink-3); }
.oitem { display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(110px, auto) 110px 110px 36px; gap: 14px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--line-2); }
.oitem:hover { background: var(--surface-2); }
.oitem .th { width: 56px; height: 56px; border-radius: 10px; border: 1px solid var(--line-2); background: var(--img-bg) center/contain no-repeat; background-origin: content-box; padding: 4px; display: grid; place-items: center; color: var(--ink-3); }
.oitem .in { min-width: 0; }
.oitem .nm { font-weight: 650; }
.oitem .nm a { color: var(--ink); }
.oitem .nm a:hover { color: var(--accent-text); }
.oitem .sk { font-size: 12.5px; color: var(--ink-3); margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap; }
.oitem .sk a { color: var(--accent-text); }
.oitem .qt { text-align: right; font-size: 13.5px; color: var(--ink-2); white-space: nowrap; }
.oitem .qt strong { color: var(--ink); font-weight: 700; }
.oitem .nt { text-align: right; font-size: 12.5px; color: var(--ink-3); white-space: nowrap; line-height: 1.45; }
.oitem .gr { text-align: right; font-weight: 750; white-space: nowrap; font-size: 15px; }
.oitem .st { justify-self: end; }
.oitem .st .iconbtn { width: 32px; height: 32px; }
.oitem .st img { width: 18px; height: 18px; display: block; }
.oitem.extra .th { background: var(--surface-2); border-style: dashed; }
.oitem.extra .nm { font-weight: 550; color: var(--ink-2); }
.ototals { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 16px 20px; border-bottom: 1px solid var(--line-2); }
.ototals .row { display: flex; justify-content: space-between; gap: 28px; min-width: 280px; font-size: 14px; color: var(--ink-2); }
.ototals .row strong { color: var(--ink); font-weight: 600; }
.ototals .row.tot { margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 15px; font-weight: 600; color: var(--ink); align-items: baseline; }
.ototals .row.tot strong { font-size: 20px; font-weight: 750; }
.oact { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; padding: 14px 20px; background: var(--surface-2); }

/* ---------- responsive ---------- */
@media (max-width: 1100px) {
  .prod { grid-template-columns: minmax(0, 1fr) 340px; }
  .footer .wrap { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 900px) {
  .wrap { width: min(1280px, 100% - 28px); }
  .utilbar .util-left { display: none; }
  .header .wrap { grid-template-columns: auto 1fr auto; grid-template-areas: "menu brand actions" "search search search"; height: auto; padding: 10px 0 12px; gap: 10px 12px; }
  .menu-toggle { display: inline-grid; grid-area: menu; }
  .brand { grid-area: brand; }
  .search { grid-area: search; max-width: none; height: 44px; }
  .search button { padding: 0 14px; font-size: 13px; }
  .hactions { grid-area: actions; }
  .nav > .wrap { overflow-x: auto; scrollbar-width: none; }
  .nav > .wrap::-webkit-scrollbar { display: none; }
  .nav .catbtn { display: none; }
  .hero { grid-template-columns: 1fr; grid-auto-rows: auto; }
  .slide { height: 190px; min-height: 0; }
  .slide.big { grid-row: span 1; height: 260px; min-height: 0; }
  .usp { grid-template-columns: 1fr; }
  .news-cols { grid-template-columns: 1fr; }
  .list-layout, .list-layout.nofilters { grid-template-columns: 1fr; }
  .filters { position: static; max-height: none; display: none; }
  .filters.open { display: block; }
  .filter-toggle { display: inline-flex !important; }
  .products.list .pcard .body { grid-template-columns: 1fr; grid-template-areas: "info" "price" "buy"; }
  .products.list .pcard .meta { align-items: flex-start; }
  .prod { grid-template-columns: 1fr; }
  .gallery { position: static; }
  .gallery .main-img { aspect-ratio: auto; height: 260px; padding: 16px; }
  .prod-info { margin-top: 24px; }
  .specs { grid-template-columns: 1fr; }
  .auth { grid-template-columns: 1fr; }
  .auth .side { display: none; }
  .basket { grid-template-columns: 1fr; }
  .sumbox { position: static; }
  .account { grid-template-columns: 1fr; }
  .account .side { position: static; }
  .account .side .acct-menu { flex-direction: row; flex-wrap: wrap; }
  .account .side .acct-menu a.logout { border-top: 0; margin: 0; padding-top: 9px; border-radius: 10px; }
  .hello { grid-template-columns: 1fr; }
  .ord-filter label:not(.chk) { flex: 1 1 140px; }
  .ord-filter .field { width: 100%; }
  .order { grid-template-columns: 1fr auto; grid-template-areas: "id more" "thumbs thumbs" "meta meta"; }
  .order .id { grid-area: id; } .order .thumbs { grid-area: thumbs; } .order .meta { grid-area: meta; align-items: flex-start; } .order .more { grid-area: more; }
  .ogrid { grid-template-columns: 1fr; }
  .ohead h1 { font-size: 22px; }
  .oitem { grid-template-columns: 48px minmax(0, 1fr) auto; grid-template-areas: "th in st" "th qt gr"; gap: 4px 12px; }
  .oitem .th { grid-area: th; width: 48px; height: 48px; }
  .oitem .in { grid-area: in; } .oitem .qt { grid-area: qt; text-align: left; } .oitem .nt { display: none; } .oitem .gr { grid-area: gr; } .oitem .st { grid-area: st; }
  .ototals .row { min-width: 0; width: 100%; }
  .oact .btn { flex: 1 1 auto; justify-content: center; }
  .bitem { grid-template-columns: 64px 1fr auto; grid-template-areas: "img info rm" "img qty sum"; }
  .bitem img { grid-area: img; width: 64px; height: 64px; }
  .bitem .info { grid-area: info; }
  .bitem .unit { display: none; }
  .bitem .qty { grid-area: qty; justify-self: start; }
  .bitem .sum { grid-area: sum; }
  .bitem .rm { grid-area: rm; }
  .legacy-wrap { padding: 16px; }
  .toasts { left: 16px; right: 16px; bottom: 16px; }
  .toast { max-width: none; }
}
@media (max-width: 560px) {
  .wrap { width: min(1280px, 100% - 20px); }
  .products.grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .pcard .body { padding: 10px 12px 12px; }
  .pcard .buy { flex-direction: column; align-items: stretch; }
  .pcard .buy .qty { width: 100%; justify-content: center; }
  .cat-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .cat-tile img { width: 56px; height: 56px; }
  .footer .wrap { grid-template-columns: 1fr; }
  .search button span { display: none; }
  .search button .mobile-ic { display: inline-grid; }
  .search button { padding: 0; width: 36px; justify-content: center; display: inline-grid; place-items: center; }
}
.filter-toggle { display: none; }
`;
  }

  /* ---------------- shell ---------------- */

  function navLinks() {
    const page = state.page;
    const path = location.pathname;
    return [
      { label: "Újdonságok", href: "/new_products.html", active: /new_products/.test(path) },
      { label: "Cikkek, tudástár", href: "/article/", active: page === "articles" || path.startsWith("/article/") },
      { label: "Eszközök, szolgáltatások", href: "/toolsandservice.php", active: /toolsandservice/.test(path) },
      { label: "Kosár", href: "/basket.php", active: page === "basket" },
      { label: "Súgó", href: "/help/", active: path.startsWith("/help") },
    ];
  }

  function renderShell() {
    const hdr = state.header;
    const app = el(`<div class="app">
      <div class="utilbar"><div class="wrap">
        <div class="group util-left">
          <a href="/help/contact.php">${icon("mail", 15)} info@hestore.hu</a>
          <a href="/help/">${icon("help", 15)} Kérdése van?</a>
          <a href="/help/shipping.php">${icon("truck", 15)} Szállítás</a>
        </div>
        <div class="group util-right">
          <button type="button" data-remote="/ajax_currselect.php" data-ptitle="Pénznem és ár megjelenítés">${icon("coin", 15)} Pénznem</button>
          <button type="button" data-remote="/ajax_langselect.php" data-ptitle="Nyelv">${icon("globe", 15)} Magyar</button>
          <button type="button" data-theme-toggle data-act="theme" aria-label="Téma váltása">${icon("moon", 15)} Sötét</button>
          <span class="sep"></span>
          <span data-userlinks></span>
        </div>
      </div></div>
      <header class="header"><div class="wrap">
        <button type="button" class="iconbtn menu-toggle" data-act="drawer" aria-label="Menü">${icon("menu", 22)}</button>
        <a class="brand" href="/">${LOGO}<span>HESTORE<small>ReHestore</small></span></a>
        <form class="search" data-search role="search">
          ${icon("search", 18)}
          <input type="search" name="q" placeholder="Keresés: típus, cikkszám vagy kifejezés…" autocomplete="off" aria-label="Keresés">
          <button type="submit" aria-label="Keresés"><span>Keresés</span><i class="mobile-ic">${icon("search", 16)}</i></button>
        </form>
        <div class="hactions" data-hactions></div>
      </div></header>
      <nav class="nav">
        <div class="wrap">
          <button type="button" class="navbtn catbtn" data-act="mega">${icon("grid", 18)} Összes kategória ${icon("chevron", 16)}</button>
          <span data-navlinks style="display:contents"></span>
        </div>
        <div class="mega" data-mega hidden><div class="wrap"><div class="mega-grid" data-megagrid></div></div></div>
      </nav>
      <main class="main"><div class="wrap" data-main></div></main>
      <footer class="footer">
        <div class="wrap">
          <div class="about"><a class="brand" href="/">${LOGO}<span>HESTORE</span></a><p>Elektronikai alkatrész kis- és nagykereskedelem. Több tízezer termék raktárról, gyors kiszállítással.</p></div>
          <div><h5>Vásárlás</h5><ul><li><a href="/cats.php">Kategóriák</a></li><li><a href="/new_products.html">Újdonságok</a></li><li><a href="/basket.php">Kosár</a></li><li><a href="/bk_kits_list.php">BK-KITS</a></li><li><a href="/toolsandservice.php">Eszközök, szolgáltatások</a></li></ul></div>
          <div><h5>Segítség</h5><ul><li><a href="/help/">Súgó</a></li><li><a href="/help/faq.php">GyIK</a></li><li><a href="/help/shipping.php">Szállítás</a></li><li><a href="/help/rma.php">Garancia, RMA</a></li><li><a href="/recall.php">Visszahívás</a></li></ul></div>
          <div><h5>Cég</h5><ul><li><a href="/help/contact.php">Elérhetőségek</a></li><li><a href="/help/hestore_partner.php">Partner Program</a></li><li><a href="https://api.hestore.hu/" target="_blank" rel="noopener">HESTORE API</a></li><li><a href="/help/terms.php">ÁSZF</a></li><li><a href="/help/privacy.php">Adatvédelem</a></li></ul></div>
        </div>
        <div class="bottom"><div class="wrap"><span>© ${new Date().getFullYear()} HESTORE Hungary Kft. Minden jog fenntartva.</span><span>ReHestore felület</span></div></div>
      </footer>
      <aside class="drawer" data-drawer aria-hidden="true">
        <div class="dhead"><a class="brand" href="/">${LOGO}<span>HESTORE</span></a><button type="button" class="iconbtn" data-act="drawer-close" aria-label="Bezárás">${icon("close", 22)}</button></div>
        <nav data-drawernav></nav>
      </aside>
      <div class="toasts" data-toasts></div>
    </div>`);

    // user links
    const ul = $("[data-userlinks]", app);
    if (hdr.logged) {
      ul.innerHTML = `<button type="button" data-account>${icon("user", 15)} <strong>${esc(hdr.name || "Profilom")}</strong></button><a href="${esc(hdr.logoutHref || LOGOUT_HREF)}">Kilépés</a>`;
    } else {
      ul.innerHTML = `<a href="${esc(hdr.loginHref)}">${icon("user", 15)} Belépés</a><a href="/reg.php">Regisztráció</a>`;
    }

    // header actions
    $("[data-hactions]", app).innerHTML = `
      ${hdr.logged
        ? `<button type="button" class="iconbtn" data-account title="Profilom">${icon("user", 22)}</button>`
        : `<a class="iconbtn" href="${esc(hdr.loginHref)}" title="Belépés">${icon("user", 22)}</a>`}
      <a class="iconbtn" href="/basket.php" title="Kosár">${icon("cart", 22)}<span class="badge" data-badge>${esc(hdr.basket)}</span></a>`;

    // nav links
    const nl = $("[data-navlinks]", app);
    navLinks().forEach((l) => nl.appendChild(el(`<a href="${esc(l.href)}" class="${l.active ? "active" : ""}">${esc(l.label)}</a>`)));

    // mega menu + drawer
    const mg = $("[data-megagrid]", app);
    const dn = $("[data-drawernav]", app);
    state.cats.forEach((c) => {
      mg.appendChild(el(`<a href="${esc(c.href)}"><img src="${esc(c.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(c.label)}</span></a>`));
    });
    dn.innerHTML = `<a href="/">${icon("spark", 18)} Főoldal</a>` + navLinks().map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("") +
      (hdr.logged
        ? `<h6>${esc(hdr.name || "Fiók")}</h6>` + ACCOUNT_LINKS.map((l) => `<a href="${l.href}">${icon(l.icon, 18)} ${esc(l.label)}</a>`).join("") + `<a href="${esc(hdr.logoutHref || LOGOUT_HREF)}">${icon("logout", 18)} Kijelentkezés</a>`
        : `<a href="${esc(hdr.loginHref)}">${icon("user", 18)} Belépés / Regisztráció</a>`) +
      `<h6>Kategóriák</h6>` + state.cats.map((c) => `<a href="${esc(c.href)}"><img src="${esc(c.img)}" alt="" loading="lazy">${esc(c.label)}</a>`).join("");

    // events
    $("[data-search]", app).addEventListener("submit", (e) => {
      e.preventDefault();
      const q = e.currentTarget.q.value.trim();
      if (q) location.href = "/search.php?q=" + encodeURIComponent(q);
    });
    const q0 = new URL(location.href).searchParams.get("q");
    if (q0 && state.page === "list") $("[data-search] input", app).value = q0;

    const mega = $("[data-mega]", app);
    const catbtn = $(".catbtn", app);
    let scrim = null;
    const closeMega = () => {
      mega.hidden = true;
      catbtn.classList.remove("open");
      if (scrim) scrim.remove();
      scrim = null;
    };
    catbtn.addEventListener("click", () => {
      if (!mega.hidden) return closeMega();
      mega.hidden = false;
      catbtn.classList.add("open");
      scrim = el('<div class="scrim"></div>');
      scrim.addEventListener("click", closeMega);
      app.appendChild(scrim);
    });
    const drawer = $("[data-drawer]", app);
    let dscrim = null;
    const closeDrawer = () => {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      if (dscrim) dscrim.remove();
      dscrim = null;
    };
    app.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "drawer") {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
        dscrim = el('<div class="scrim" style="z-index:55"></div>');
        dscrim.addEventListener("click", closeDrawer);
        app.appendChild(dscrim);
      } else if (act === "drawer-close") closeDrawer();
      else if (act === "classic") setClassic();
      else if (act === "theme") {
        state.theme = isDark() ? "light" : "dark";
        storage.set({ theme: state.theme });
        applyTheme();
      }
    });
    app.addEventListener("click", (e) => {
      const acc = e.target.closest("[data-account]");
      if (acc) return accountPopover(acc);
      const b = e.target.closest("[data-remote]");
      if (b) remotePopover(b.dataset.remote, b, b.dataset.ptitle || "");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMega();
        closeDrawer();
        closePopover();
        closeLightbox();
      }
    });

    return app;
  }

  /* ---------------- overlays ---------------- */

  function toast(msg, kind = "") {
    const box = $("[data-toasts]", state.root);
    if (!box) return;
    const t = el(`<div class="toast ${kind}">${icon(kind === "bad" ? "info" : "check", 18)}<span>${esc(msg)}</span></div>`);
    box.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  let lightboxEl = null;
  function openLightbox(src) {
    closeLightbox();
    lightboxEl = el(`<div class="lightbox"><button type="button" class="iconbtn" aria-label="Bezárás">${icon("close", 26)}</button><img src="${esc(src)}" alt=""></div>`);
    lightboxEl.addEventListener("click", closeLightbox);
    $(".app", state.root).appendChild(lightboxEl);
  }
  function closeLightbox() {
    if (lightboxEl) lightboxEl.remove();
    lightboxEl = null;
  }

  let popEl = null;
  let popLight = null;
  function closePopover() {
    if (popEl) popEl.remove();
    if (popLight) popLight.remove();
    popEl = popLight = null;
  }
  function openPopover(anchor, title, bodyHtml, width = 320) {
    closePopover();
    const r = anchor.getBoundingClientRect();
    popEl = el(`<div class="popover" role="dialog"><div class="phead"><span>${esc(title)}</span><button type="button" class="iconbtn" style="width:30px;height:30px" aria-label="Bezárás">${icon("close", 18)}</button></div>${bodyHtml}</div>`);
    $(".phead .iconbtn", popEl).addEventListener("click", closePopover);
    const app = $(".app", state.root);
    app.appendChild(popEl);
    const w = Math.min(width, window.innerWidth - 16);
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    popEl.style.left = left + "px";
    popEl.style.top = Math.min(r.bottom + 8, window.innerHeight - 100) + "px";
    popEl.style.width = w + "px";
    // NOTE: from a document-level listener, events coming out of the shadow root are retargeted
    // to the host element, so `contains(e.target)` would always be false → use composedPath().
    const onDoc = (e) => {
      const path = e.composedPath ? e.composedPath() : [e.target];
      const inside = path.some((n) => n === popEl || n === anchor || (popLight && n === popLight));
      if (popEl && !inside) {
        closePopover();
        document.removeEventListener("mousedown", onDoc, true);
      }
    };
    document.addEventListener("mousedown", onDoc, true);
    return popEl;
  }

  function accountPopover(anchor) {
    if (popEl && popEl.dataset.kind === "account") return closePopover();
    const hdr = state.header || {};
    const body = `
      <div class="acct-head">${icon("user", 20)}<div><strong>${esc(hdr.name || "Fiók")}</strong><span>Bejelentkezve</span></div></div>
      <div class="acct-menu">
        ${ACCOUNT_LINKS.map((l) => `<a href="${l.href}" class="${isActiveHref(l.href) ? "on" : ""}">${icon(l.icon, 18)}<span>${esc(l.label)}</span></a>`).join("")}
        <a href="${esc(hdr.logoutHref || LOGOUT_HREF)}" class="logout">${icon("logout", 18)}<span>Kijelentkezés</span></a>
      </div>`;
    const p = openPopover(anchor, "Fiókom", body, 300);
    p.dataset.kind = "account";
  }

  async function remotePopover(url, anchor, title) {
    openPopover(anchor, title, `<div class="loading">Betöltés…</div><slot name="pop"></slot>`);
    try {
      const res = await fetch(abs(url), { credentials: "same-origin" });
      const html = await res.text();
      if (!popEl) return;
      $(".loading", popEl)?.remove();
      popLight = document.createElement("div");
      popLight.className = "rh-pop";
      popLight.slot = "pop";
      const t = document.createElement("template");
      t.innerHTML = html;
      $$("script,style", t.content).forEach((n) => n.remove());
      popLight.appendChild(t.content);
      state.host.appendChild(popLight);
    } catch (_) {
      if (popEl) $(".loading", popEl).textContent = "Nem sikerült betölteni.";
    }
  }

  function setClassic() {
    storage.set({ enabled: false });
    location.reload();
  }

  function watchBasketBadge() {
    const src = $("#iBaskIcon div");
    if (!src) return;
    let last = txt(src);
    new MutationObserver(() => {
      const v = txt(src);
      if (v === last) return;
      last = v;
      $$("[data-badge]", state.root).forEach((b) => (b.textContent = v));
      toast("Kosár frissítve · " + v + " tétel", "ok");
    }).observe(src, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- shared renderers ---------------- */

  function crumbsHtml(crumbs, current) {
    const parts = [`<a href="/">Főoldal</a>`];
    crumbs.forEach((c) => {
      if (/^Főkategória$/i.test(c.label)) c = { label: "Kategóriák", href: "/cats.php" };
      parts.push(`${icon("right", 14)}<a href="${esc(c.href)}">${esc(c.label)}</a>`);
    });
    if (current) parts.push(`${icon("right", 14)}<span class="cur">${esc(current)}</span>`);
    return `<div class="crumbs">${parts.join("")}</div>`;
  }

  function qtyHtml(value = 1, cls = "") {
    return `<div class="qty ${cls}"><button type="button" data-q="-1" aria-label="Kevesebb">−</button><input type="number" min="1" step="1" value="${esc(value)}" aria-label="Mennyiség"><button type="button" data-q="1" aria-label="Több">+</button></div>`;
  }

  function bindQty(root) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]");
      if (!b) return;
      const inp = $("input", b.closest(".qty"));
      const v = Math.max(1, (parseInt(inp.value, 10) || 1) + parseInt(b.dataset.q, 10));
      inp.value = v;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function addToCart(form, qty) {
    if (!form) return toast("Nem található a kosár űrlap", "bad");
    const qu = $('input[name="qu"]', form);
    if (qu) qu.value = qty;
    const btn = $('input[type="submit"]', form);
    submitForm(form, btn);
  }

  async function showStock(cid, anchor) {
    if (!cid) return;
    await remotePopover(`/ajax_getstock.php?cid=${encodeURIComponent(cid)}`, anchor, "Készletinformáció");
  }

  function parseRow(tr) {
    const a = $('td.first a[href*="prod_"]', tr) || $('a[href*="prod_"]', tr);
    if (!a) return null;
    const href = attr(a, "href");
    const cid = (href.match(/prod_(\d+)/) || [])[1] || "";
    const img = $("td.first img", tr);
    const skuDiv = $("td.first div", tr);
    const sku = skuDiv && skuDiv.firstChild ? (skuDiv.firstChild.textContent || "").trim() : "";
    const tds = $$(":scope > td", tr);
    const nameTd = tds[1] || tr;
    const nameA = $("a", nameTd);
    const type = txt($("b", nameA));
    const name = txt(nameA).replace(type, "").trim();
    const lines = $$(".line3", nameTd).map((s) => txt(s));
    const mfr = (lines.find((l) => /^Gyártó:/.test(l)) || "").replace(/^Gyártó:\s*/, "");
    const docsTd = $("td.docs", tr);
    const docs = docsTd ? $$("a[href]", docsTd).map((d) => ({ href: attr(d, "href"), title: attr(d, "title") || txt(d) || "Dokumentum" })) : [];
    const availTd = $("td.avail", tr);
    const stockA = availTd ? $("a.stock", availTd) : null;
    const availText = txt(availTd);
    const prices = $$(".list-price tr", tr).map((r) => ({ qty: txt($(".qu", r)), price: txt($(".pr", r)) }));
    const form = $("form", $("td.basket", tr) || tr);
    return { cid, href, img: isrc(img) || attr(img, "rel"), imgMedium: attr(img, "rel"), sku, type, name, mfr, docs, availText, stockImg: attr($("img", stockA), "src"), prices, form };
  }

  function productCard(p) {
    const st = stockInfo(p.availText, p.stockImg);
    const main = p.prices[0];
    const rest = p.prices.slice(1, 4);
    const card = el(`<article class="pcard card" data-cid="${esc(p.cid)}">
      <a class="media" href="${esc(p.href)}">${pimg(p.img, "normal", "large")}</a>
      <div class="body">
        <div class="info">
          <div class="sku">${esc(p.sku)}${p.sku ? `<button type="button" data-copy="${esc(p.sku)}" title="Cikkszám másolása">${icon("copy", 13)}</button>` : ""}</div>
          <a class="type" href="${esc(p.href)}">${esc(p.type || p.name)}</a>
          ${p.type ? `<div class="name">${esc(p.name)}</div>` : ""}
          ${p.mfr ? `<div class="mfr">Gyártó: ${esc(p.mfr)}</div>` : ""}
          ${p.docs.length ? `<div class="docs">${p.docs.map((d) => `<a href="${esc(d.href)}" target="_blank" rel="noopener">${icon("file", 12)} ${esc(d.title)}</a>`).join("")}</div>` : ""}
          <button type="button" class="stockbtn" data-stock="${esc(p.cid)}"><span class="pill ${st.cls}"><span class="dot"></span>${esc(st.label)}</span></button>
        </div>
        <div class="meta">
          ${main ? `<div class="price-main mono">${esc(main.price)}<small>${esc(main.qty)} · nettó</small></div>` : `<div class="muted small">Ár: lásd a termékoldalt</div>`}
          ${rest.length ? `<div class="tiers mono">${rest.map((t) => `<span>${esc(t.qty)} <b>${esc(t.price)}</b></span>`).join("")}</div>` : ""}
        </div>
        ${p.form ? `<div class="buy">${qtyHtml(1, "sm")}<button type="button" class="btn primary sm" data-add>${icon("cart", 16)} Kosárba</button></div>` : ""}
      </div>
    </article>`);
    card.addEventListener("click", (e) => {
      const c = e.target.closest("[data-copy]");
      if (c) return copyText(c.dataset.copy);
      const s = e.target.closest("[data-stock]");
      if (s) return showStock(s.dataset.stock, s);
      if (e.target.closest("[data-add]")) {
        const q = parseInt($(".qty input", card).value, 10) || 1;
        addToCart(p.form, q);
      }
    });
    return card;
  }

  /* ---------------- HOME ---------------- */

  function renderHome(main) {
    const slides = $$("#sliderul > li").map((li) => {
      const a = $("a", li);
      const tip = $(".tooltip", li);
      return { href: attr(a, "href"), img: attr($("img", li), "src"), title: txt($("h1", tip)), text: txt($("span", tip)) };
    }).filter((s) => s.img);
    const promos = $$(".prod-promo-item").map((it) => {
      const a = $("a", it);
      const bg = (attr($(".prod-promo-item-img", it), "style").match(/url\(['"]?([^'")]+)/) || [])[1] || "";
      return { href: attr(a, "href"), sku: txt($("h1", it)), name: txt($("h2", it)), img: bg };
    });
    const newsOf = (sel) =>
      $$(`${sel} .index-news-item`).map((it) => {
        const a = $("a.index-news-item-content", it) || $("a", it);
        return { href: attr(a, "href"), img: attr($("img", it), "src"), title: txt($("h3", it)), text: txt($("p", it)) };
      });
    const news = newsOf(".index-news-n");
    const arts = newsOf(".index-news-a");

    const wrap = el(`<div>
      <section class="hero" data-hero></section>
      <section class="usp">
        <div class="card"><div class="ico">${icon("box", 22)}</div><div><strong>Több tízezer alkatrész</strong><span>raktárról, szakmai kategorizálással</span></div></div>
        <div class="card"><div class="ico">${icon("truck", 22)}</div><div><strong>GLS · FoxPost · CsomagPont</strong><span>gyors kiszállítás és automaták országszerte</span></div></div>
        <div class="card"><div class="ico">${icon("help", 22)}</div><div><strong>Kérdése van?</strong><span><a href="/help/contact.php" class="link">info@hestore.hu</a> — segítünk a választásban</span></div></div>
      </section>
      <div class="section-head"><div><h2>Kategóriák</h2><p>Böngésszen a teljes kínálatban</p></div><a class="link" href="/cats.php">Összes kategória ${icon("arrow", 16)}</a></div>
      <section class="cat-grid" data-cats></section>
      <div class="section-head"><div><h2>Újdonságok</h2><p>Most érkezett termékek</p></div><a class="link" href="/new_products.html">Összes újdonság ${icon("arrow", 16)}</a></div>
      <section class="products grid" data-promos></section>
      <div class="section-head"><div><h2>Hírek és tudástár</h2><p>Aktualitások, cikkek, projektek</p></div><a class="link" href="/article/">További cikkek ${icon("arrow", 16)}</a></div>
      <section class="news-cols"><div class="news-list" data-news></div><div class="news-list" data-arts></div></section>
    </div>`);

    const hero = $("[data-hero]", wrap);
    slides.slice(0, 3).forEach((s, i) => {
      hero.appendChild(el(`<a class="slide ${i === 0 ? "big" : ""}" href="${esc(s.href)}"><img src="${esc(s.img)}" alt=""><div class="cap">${i === 0 ? `<span class="tag">Kiemelt</span>` : ""}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></a>`));
    });
    if (!slides.length) hero.remove();

    const cg = $("[data-cats]", wrap);
    state.cats.slice(0, 12).forEach((c) => cg.appendChild(el(`<a class="card cat-tile" href="${esc(c.href)}"><img src="${esc(c.img)}" alt="" loading="lazy"><span>${esc(c.label)}</span></a>`)));

    const pg = $("[data-promos]", wrap);
    promos.forEach((p) => pg.appendChild(el(`<a class="pcard card" href="${esc(p.href)}"><span class="media">${pimg(p.img, "normal", "large")}</span><span class="body"><span class="type">${esc(p.sku)}</span><span class="name">${esc(p.name)}</span><span class="meta"><span class="pill info"><span class="dot"></span>Újdonság</span></span></span></a>`)));
    if (!promos.length) pg.previousElementSibling.remove(), pg.remove();

    const nl = $("[data-news]", wrap);
    const al = $("[data-arts]", wrap);
    const newsItem = (n) => el(`<a class="news-item card" href="${esc(n.href)}">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy">` : "<span></span>"}<div><h4>${esc(n.title)}</h4><p>${esc(n.text)}</p></div></a>`);
    news.forEach((n) => nl.appendChild(newsItem(n)));
    arts.forEach((n) => al.appendChild(newsItem(n)));
    main.appendChild(wrap);
  }

  /* ---------------- CATS ---------------- */

  function renderCats(main) {
    const tiles = $$(".list-category li").map((li) => {
      const a = $("a", li);
      return { href: attr(a, "href"), img: attr($("img", li), "src"), label: txt($("span", li)) || txt(a) };
    });
    const list = tiles.length ? tiles : state.cats;
    main.innerHTML = `${crumbsHtml([], "Kategóriák")}<div class="list-head"><div><h1 class="title">Termékkategóriák</h1><div class="count">${list.length} főkategória</div></div></div><div class="cat-grid" data-grid></div>`;
    const g = $("[data-grid]", main);
    list.forEach((c) => g.appendChild(el(`<a class="card cat-tile" href="${esc(c.href)}"><img src="${esc(c.img)}" alt="" loading="lazy"><span>${esc(c.label)}</span></a>`)));
  }

  /* ---------------- LIST ---------------- */

  function renderList(main) {
    const crumbs = parseCrumbs();
    const isSearch = /search\.php/.test(location.pathname);
    const q = new URL(location.href).searchParams.get("q") || "";
    const title = isSearch ? (q ? `Találatok: „${q}”` : "Keresés") : /new_products/.test(location.pathname) ? "Újdonságok" : crumbs.length ? crumbs[crumbs.length - 1].label : pageH1();
    const crumbTrail = isSearch ? [] : crumbs.slice(0, -1);

    const subcats = $$(".list-category li").map((li) => {
      const a = $("a", li);
      return { href: attr(a, "href"), img: attr($("img", li), "src"), label: txt($("span", li)) || txt(a) };
    });

    const table = $("#prodlisttbl") || $(".list-product");
    const isProductRow = (tr) => tr.tagName === "TR" && !!$(":scope > td.first", tr);
    const rows = table ? $$(":scope > tbody > tr", table).filter(isProductRow).map(parseRow).filter(Boolean) : [];
    const pagerSel = $(".pager select[name=pg]");
    const options = pagerSel ? $$("option", pagerSel).map((o) => ({ value: o.value, label: txt(o), selected: o.selected })) : [];
    const total = options.length ? Math.max(...options.map((o) => num(txt({ textContent: o.label.split("-").pop() })))) : rows.length;
    const curIdx = Math.max(0, options.findIndex((o) => o.selected));
    const pagesText = txt($$(".pager td").find((td) => /^\d+\s*\/\s*\d+$/.test(txt(td))));

    const sortLinks = table ? $$("thead a[href*='f=']", table).map((a) => ({ label: txt(a), href: attr(a, "href") })) : [];
    const urlNow = new URL(location.href);
    const curF = urlNow.searchParams.get("f") || "";
    const curO = urlNow.searchParams.get("o") || "";

    const groups = $$(".list-f-group").map((g) => ({
      title: txt($(".list-f-group-h", g)),
      items: $$("label", g).map((l) => {
        const cb = $("input[type=checkbox]", l);
        const full = attr(l, "title") || txt(l);
        const m = txt(l).match(/\((\d+)\)\s*$/);
        return { cb, label: full.replace(/\s*\(\d+\)\s*$/, ""), count: m ? m[1] : "", checked: !!(cb && cb.checked) };
      }),
    }));
    const stockCb = $("#iStockCB");
    const applyBtn = $$(".list-b input[type=button]").find((b) => /Szűrés/i.test(b.value));
    const clearBtn = $$(".list-b input[type=button]").find((b) => /törlése/i.test(b.value));
    const wisq = $("#wisq");
    const wisb = $(".wisb");

    main.innerHTML = `
      ${crumbsHtml(crumbTrail, title)}
      ${subcats.length ? `<section class="subcats"><div class="cat-grid" data-subcats></div></section>` : ""}
      <div class="list-head">
        <div><h1 class="title">${esc(title)}</h1><div class="count">${total ? `${total} termék` : rows.length ? `${rows.length} termék` : ""}${pagesText ? ` · ${esc(pagesText)}. oldal` : ""}</div></div>
        <div class="toolbar">
          ${groups.length ? `<button type="button" class="btn filter-toggle" data-ftoggle>${icon("filter", 18)} Szűrők</button>` : ""}
          ${wisq ? `<form class="search" data-within style="height:40px;width:220px;padding-left:12px">${icon("search", 16)}<input type="search" placeholder="Szűkítés a listában…" value="${esc(wisq.value)}"></form>` : ""}
          ${stockCb ? `<label class="toggle ${stockCb.checked ? "on" : ""}"><input type="checkbox" data-stockonly ${stockCb.checked ? "checked" : ""}> Csak raktáron</label>` : ""}
          ${sortLinks.length ? `<span class="sel"><select class="field" data-sort aria-label="Rendezés">
            <option value="">Rendezés: alapértelmezett</option>
            ${sortLinks.map((l) => {
              const u = new URL(l.href, location.href);
              const f = u.searchParams.get("f");
              return `<option value="${esc(f)}|asc" ${curF === f && curO === "asc" ? "selected" : ""}>${esc(l.label)} ↑</option><option value="${esc(f)}|desc" ${curF === f && curO === "desc" ? "selected" : ""}>${esc(l.label)} ↓</option>`;
            }).join("")}
          </select></span>` : ""}
          <div class="seg" role="group" aria-label="Nézet"><button type="button" data-view="grid" class="${state.view === "grid" ? "on" : ""}" title="Rács">${icon("grid", 18)}</button><button type="button" data-view="list" class="${state.view === "list" ? "on" : ""}" title="Lista">${icon("list", 18)}</button></div>
        </div>
      </div>
      <div class="list-layout ${groups.length ? "" : "nofilters"}">
        ${groups.length ? `<aside class="filters card" data-filters><div class="fhead"><strong>Szűrők</strong><button type="button" class="btn ghost sm" data-fclear>Törlés</button></div><div data-fgroups></div><div class="factions"><button type="button" class="btn primary" data-fapply>${icon("check", 16)} Szűrés</button></div></aside>` : ""}
        <section>
          <div class="products ${state.view}" data-products></div>
          <div class="sentinel" data-sentinel></div>
          <div class="loading" data-loading hidden>Továbbiak betöltése…</div>
          ${options.length > 1 ? `<div class="pager">
            <button type="button" class="btn" data-pg="${curIdx > 0 ? esc(options[curIdx - 1].value) : ""}" ${curIdx <= 0 ? "disabled" : ""}>${icon("left", 16)} Előző</button>
            <span class="sel"><select class="field" data-pgsel>${options.map((o) => `<option value="${esc(o.value)}" ${o.selected ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></span>
            <button type="button" class="btn" data-pg="${curIdx < options.length - 1 ? esc(options[curIdx + 1].value) : ""}" ${curIdx >= options.length - 1 ? "disabled" : ""}>Következő ${icon("right", 16)}</button>
          </div>` : ""}
        </section>
      </div>`;

    if (subcats.length) {
      const sg = $("[data-subcats]", main);
      subcats.forEach((c) => sg.appendChild(el(`<a class="card cat-tile" href="${esc(c.href)}"><img src="${esc(c.img)}" alt="" loading="lazy"><span>${esc(c.label)}</span></a>`)));
    }

    const grid = $("[data-products]", main);
    bindQty(grid);
    if (rows.length) rows.forEach((p) => grid.appendChild(productCard(p)));
    else if (!subcats.length) grid.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon("search", 32)}<h3>Nincs találat</h3><p>Próbáljon más kifejezést vagy kevesebb szűrőt.</p></div>`;

    // infinite scroll mirror
    if (table) {
      const tbody = $("tbody", table);
      new MutationObserver((muts) => {
        muts.forEach((m) =>
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1 || n.tagName !== "TR") return;
            if (isProductRow(n)) {
              const p = parseRow(n);
              if (p) grid.appendChild(productCard(p));
            } else if ($(".page-indicator", n)) {
              grid.appendChild(el(`<div class="muted small" style="grid-column:1/-1;text-align:center;padding:6px 0">${esc(txt(n))}</div>`));
            }
          })
        );
        $("[data-loading]", main).hidden = true;
      }).observe(tbody, { childList: true });
      const loader = $("#autoloaderdiv");
      if (loader) {
        new MutationObserver(() => {
          $("[data-loading]", main).hidden = loader.style.display === "none";
        }).observe(loader, { attributes: true, attributeFilter: ["style"] });
      }
    }

    // view toggle
    main.addEventListener("click", (e) => {
      const v = e.target.closest("[data-view]");
      if (v) {
        state.view = v.dataset.view;
        storage.set({ view: state.view });
        grid.className = "products " + state.view;
        $$("[data-view]", main).forEach((b) => b.classList.toggle("on", b === v));
      }
      const pgb = e.target.closest("[data-pg]");
      if (pgb && pgb.dataset.pg !== "") location.href = withParams({ pg: pgb.dataset.pg === "0" ? null : pgb.dataset.pg });
      if (e.target.closest("[data-ftoggle]")) $("[data-filters]", main)?.classList.toggle("open");
      if (e.target.closest("[data-fapply]")) applyBtn ? applyBtn.click() : toast("A szűrés nem elérhető", "bad");
      if (e.target.closest("[data-fclear]")) clearBtn ? clearBtn.click() : location.href = location.pathname;
    });
    $("[data-pgsel]", main)?.addEventListener("change", (e) => (location.href = withParams({ pg: e.target.value === "0" ? null : e.target.value })));
    $("[data-sort]", main)?.addEventListener("change", (e) => {
      const [f, o] = e.target.value.split("|");
      location.href = withParams({ f: f || null, o: f ? o : null, pg: null });
    });
    $("[data-stockonly]", main)?.addEventListener("change", (e) => {
      if (stockCb) {
        // click() toggles the box and fires the site's inline onclick (ApplyFilters)
        stockCb.checked = !e.target.checked;
        stockCb.click();
      }
    });
    $("[data-within]", main)?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (wisq) {
        wisq.value = $("input", e.currentTarget).value;
        if (wisb) wisb.click();
        else if (applyBtn) applyBtn.click();
      }
    });

    // filter groups
    const fg = $("[data-fgroups]", main);
    if (fg) {
      groups.forEach((g, gi) => {
        const open = gi < 3 || g.items.some((i) => i.checked);
        const d = el(`<details class="fgroup" ${open ? "open" : ""}><summary><span>${esc(g.title)}</span>${icon("chevron", 16)}</summary><div class="fitems"></div></details>`);
        const box = $(".fitems", d);
        const LIMIT = 7;
        const render = (all) => {
          box.innerHTML = "";
          (all ? g.items : g.items.slice(0, LIMIT)).forEach((it) => {
            const row = el(`<label class="fitem" title="${esc(it.label)}"><input type="checkbox" ${it.checked ? "checked" : ""}><span>${esc(it.label)}</span><i>${esc(it.count)}</i></label>`);
            $("input", row).addEventListener("change", (e) => {
              if (!it.cb) return;
              it.cb.checked = !e.target.checked;
              it.cb.click();
              it.cb.checked = e.target.checked;
              it.checked = e.target.checked;
            });
            box.appendChild(row);
          });
          if (g.items.length > LIMIT) {
            const more = el(`<button type="button" class="fmore">${all ? "Kevesebb" : `Mind a(z) ${g.items.length} megjelenítése`}</button>`);
            more.addEventListener("click", () => render(!all));
            box.appendChild(more);
          }
        };
        render(g.items.length <= LIMIT + 2);
        fg.appendChild(d);
      });
    }
  }

  /* ---------------- PRODUCT ---------------- */

  function renderProduct(main) {
    const crumbs = parseCrumbs();
    const type = txt($(".prod-title h1"));
    const name = txt($(".prod-title .value2"));
    const sku = txt($(".prod-price .cid [itemprop=sku]")) || txt($(".cid")).replace(/^Cikkszám:\s*/, "");
    const imgA = $(".prod-image a");
    const img = $("#prodimg");
    const fullImg = attr(imgA, "href") || attr(img, "src");
    const summary = txt($(".prod-desc .ai-text")) || "";
    const descHtml = (() => {
      const d = $(".prod-desc");
      if (!d) return "";
      const c = d.cloneNode(true);
      $$(".ai-summary-badge, script, style", c).forEach((n) => n.remove());
      return c.innerHTML.trim();
    })();
    const specs = $$(".prod-parstbl tr").map((tr) => ({ k: txt($("th", tr)), v: $("td", tr) ? $("td", tr).innerHTML.replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/(\s*,)+/g, ",").replace(/^,|,$/g, "").trim() : "" })).filter((s) => s.k);
    const tiers = $$(".prod-pricetbl tr").map((tr) => ({ qty: txt($("th", tr)), price: txt($("td", tr)).replace(/\s*Ft.*$/, " Ft") })).filter((t) => t.qty);
    const avail = $$(".prod-availtbl tr").slice(1).map((tr) => $$("td", tr).map((td) => txt(td))).filter((r) => r.length);
    const availHead = $$(".prod-availtbl tr:first-child th").map((th) => txt(th));
    const form = $('form[id^="ibask"]');
    const favA = $("#fava");
    const favOn = /fav_a/.test(attr($("img", favA), "src"));
    const files = $$(".prod-files a").map((a) => ({ href: attr(a, "href"), label: txt(a) }));
    const mfg = $(".prod-mfg");
    const mfgText = mfg ? $$("span", mfg).map((s) => txt(s)) : [];
    const related = $$(".prod-alist-new a").map((a) => ({ href: attr(a, "href"), img: isrc($("img", a)), sku: txt($("b", a)), name: txt(a).replace(txt($("b", a)), "").trim() }));
    const st = avail.length ? stockInfo(avail[0].join(" "), "") : null;
    const mfr = (specs.find((s) => /^Gyártó$/i.test(s.k)) || {}).v;
    const cid = (location.pathname.match(/prod_(\d+)/) || [])[1];

    main.innerHTML = `
      ${crumbsHtml(crumbs, type)}
      <div class="prod">
        <div class="gallery card" data-gallery>
          <div class="main-img">${img ? pimg(attr(img, "src"), "large", "xl", `alt="${esc(type)}"`) : `<span class="muted">Nincs kép</span>`}${fullImg ? `<span class="btn sm zoom">${icon("zoom", 16)} Nagyítás</span>` : ""}</div>
        </div>
        <div>
          <div class="prod-title-row">${sku ? `<span class="skubox">Cikkszám <b class="mono">${esc(sku)}</b><button type="button" data-copy="${esc(sku)}" title="Másolás">${icon("copy", 14)}</button></span>` : ""}${mfr ? `<span class="pill neutral">${esc(mfr)}</span>` : ""}</div>
          <h1 class="title">${esc(type)}</h1>
          ${name ? `<p class="desc">${esc(name)}</p>` : ""}
          ${summary ? `<div class="summary" style="margin-bottom:18px">${icon("spark", 18)}<div>${esc(summary)}</div></div>` : ""}
          <div class="buybox card">
            ${tiers.length ? `<div><div class="price-main mono">${esc(tiers[0].price)}<small>${esc(tiers[0].qty)} · nettó egységár</small></div>${tiers.length > 1 ? `<table class="tier-table mono" style="margin-top:10px" data-tiers>${tiers.map((t, i) => `<tr class="${i === 0 ? "cur" : ""}" data-min="${esc(num(t.qty))}"><td>${esc(t.qty)} db</td><td>${esc(t.price)}</td></tr>`).join("")}</table>` : ""}</div>` : `<p class="muted">Az ár megtekintéséhez jelentkezzen be.</p>`}
            ${avail.length ? `<div class="avail-rows">${avail.map((r) => `<div class="avail-row"><span class="pill ${stockInfo(r.join(" "), "").cls}"><span class="dot"></span>${esc(r[0])}</span><span class="mono"><b>${esc(r[1] || "")}</b> <span class="muted small">${esc(availHead[1] || "")}</span></span></div>`).join("")}</div>` : ""}
            ${form ? `<div class="buy-row">${qtyHtml(1, "lg")}<button type="button" class="btn primary" data-add>${icon("cart", 18)} Kosárba teszem</button></div>` : ""}
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${favA ? `<button type="button" class="btn sm" data-fav>${icon("heart", 16)} <span>${favOn ? "Kedvencekben" : "Kedvencekhez"}</span></button>` : ""}
              ${cid ? `<button type="button" class="btn sm" data-stock="${esc(cid)}">${icon("box", 16)} Készlet részletek</button>` : ""}
              <a class="btn sm" href="/help/contact.php">${icon("mail", 16)} Kérdésem van</a>
            </div>
            <p class="note">A feltüntetett árak nettó (ÁFA nélküli) egységárak, a mennyiségi kedvezményeket már tartalmazzák. A pénznem és az ár megjelenítése a fejlécben módosítható.</p>
          </div>
        </div>
      </div>
      <div class="prod-info">
        <div class="tabs" data-tabs><button type="button" class="on" data-tab="specs">Műszaki adatok</button>${descHtml ? `<button type="button" data-tab="desc">Leírás</button>` : ""}${files.length ? `<button type="button" data-tab="files">Dokumentumok (${files.length})</button>` : ""}${mfgText.length ? `<button type="button" data-tab="mfg">Forgalmazói információk</button>` : ""}</div>
        <div data-panel="specs" class="card pad">${specs.length ? `<div class="specs">${specs.map((s) => `<dl class="spec"><dt>${esc(s.k)}</dt><dd>${esc(s.v)}</dd></dl>`).join("")}</div>` : `<p class="muted">Nincsenek rögzített paraméterek.</p>`}</div>
        ${descHtml ? `<div data-panel="desc" class="card pad" hidden><slot name="desc"></slot></div>` : ""}
        ${files.length ? `<div data-panel="files" class="card pad files" hidden>${files.map((f) => `<a href="${esc(f.href)}" target="_blank" rel="noopener">${icon("file", 18)}<span>${esc(f.label)}</span>${icon("external", 14)}</a>`).join("")}</div>` : ""}
        ${mfgText.length ? `<div data-panel="mfg" class="card pad" hidden>${mfgText.map((t) => `<p style="margin:4px 0">${esc(t)}</p>`).join("")}</div>` : ""}
      </div>
      ${related.length ? `<div class="section-head"><div><h2>Termékajánló</h2><p>Hasonló vagy kapcsolódó termékek</p></div></div><div class="rail" data-related></div>` : ""}`;

    if (descHtml) {
      const light = document.createElement("div");
      light.className = "rh-legacy";
      light.slot = "desc";
      light.innerHTML = descHtml;
      state.host.appendChild(light);
    }
    if (related.length) {
      const r = $("[data-related]", main);
      related.forEach((p) => r.appendChild(el(`<a class="pcard card" href="${esc(p.href)}"><span class="media">${pimg(p.img, "normal", "large")}</span><span class="body"><span class="type">${esc(p.sku)}</span><span class="name">${esc(p.name)}</span></span></a>`)));
    }

    bindQty(main);
    const qtyInput = $(".buy-row .qty input", main);
    const tierRows = $$("[data-tiers] tr", main);
    const highlight = () => {
      const q = parseInt(qtyInput?.value, 10) || 1;
      let best = null;
      tierRows.forEach((tr) => {
        if (num(tr.dataset.min) <= q) best = tr;
      });
      tierRows.forEach((tr) => tr.classList.toggle("cur", tr === best));
    };
    qtyInput?.addEventListener("input", highlight);
    qtyInput?.addEventListener("change", highlight);
    tierRows.forEach((tr) =>
      tr.addEventListener("click", () => {
        if (qtyInput) {
          qtyInput.value = Math.max(1, num(tr.dataset.min));
          highlight();
        }
      })
    );

    main.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) {
        $$("[data-tab]", main).forEach((b) => b.classList.toggle("on", b === t));
        $$("[data-panel]", main).forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
      }
      if (e.target.closest("[data-gallery] .main-img") && fullImg) openLightbox(abs(imgSized(fullImg, "xl")));
      const c = e.target.closest("[data-copy]");
      if (c) copyText(c.dataset.copy);
      if (e.target.closest("[data-add]")) addToCart(form, parseInt(qtyInput?.value, 10) || 1);
      const s = e.target.closest("[data-stock]");
      if (s) showStock(s.dataset.stock, s);
      if (e.target.closest("[data-fav]") && favA) {
        favA.click();
        setTimeout(() => {
          const on = /fav_a/.test(attr($("img", favA), "src"));
          const label = txt($("span", favA));
          $("[data-fav] span", main).textContent = on ? "Kedvencekben" : "Kedvencekhez";
          if (/jelentkez|belép/i.test(label)) toast("A kedvencekhez bejelentkezés szükséges", "bad");
          else toast(on ? "Hozzáadva a kedvencekhez" : "Eltávolítva a kedvencekből", "ok");
        }, 700);
      }
    });
  }

  /* ---------------- LOGIN ---------------- */

  function renderLogin(main) {
    const form = $$("form").find((f) => $('input[name="email"]', f) && $('input[name="passw"]', f));
    const errText = txt($(".mcontent .error, .mcontent font[color=red], .mcontent .alert"));
    main.innerHTML = `
      <div class="auth">
        <div class="card">
          <h2>Bejelentkezés</h2>
          <p class="lead">Lépjen be a HESTORE fiókjába a rendeléshez, kedvencekhez és az egyedi árakhoz.</p>
          <form class="form" data-login novalidate>
            <div><label for="rh-email">E-mail cím</label><input id="rh-email" class="field" type="email" autocomplete="username" required></div>
            <div><label for="rh-pass">Jelszó</label><input id="rh-pass" class="field" type="password" autocomplete="current-password" required></div>
            <div class="row"><label><input type="checkbox" data-stay> Maradjon bejelentkezve</label><a class="link" href="/forgot.php">Elfelejtett jelszó?</a></div>
            <div class="err" data-err ${errText ? "" : "hidden"}>${esc(errText)}</div>
            <button type="submit" class="btn primary block" style="height:48px;font-size:15px">Bejelentkezés</button>
          </form>
          <p class="muted small" style="margin:16px 0 0;text-align:center">Nincs még fiókja? <a class="link" href="/reg.php">Regisztráció</a></p>
        </div>
        <div class="card side">
          <h2>Miért érdemes fiókot nyitni?</h2>
          <p>Több tízezer termék, gyors rendelés és átlátható rendeléskövetés.</p>
          <ul>
            <li>${icon("check", 18)} Rendelések és számlák egy helyen</li>
            <li>${icon("check", 18)} Kedvencek és mentett listák</li>
            <li>${icon("check", 18)} Egyedi, partneri árak</li>
            <li>${icon("check", 18)} Gyorsabb pénztár mentett adatokkal</li>
          </ul>
        </div>
      </div>`;
    $("[data-login]", main).addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#rh-email", main).value.trim();
      const pass = $("#rh-pass", main).value;
      const err = $("[data-err]", main);
      if (!form) {
        err.hidden = false;
        err.textContent = "Az eredeti bejelentkező űrlap nem található. Próbálja a klasszikus nézetet.";
        return;
      }
      if (!email || !pass) {
        err.hidden = false;
        err.textContent = "Kérjük adja meg az e-mail címét és a jelszavát.";
        return;
      }
      $('input[name="email"]', form).value = email;
      $('input[name="passw"]', form).value = pass;
      const stay = $('input[name="staylog"]', form);
      if (stay) stay.checked = $("[data-stay]", main).checked;
      submitForm(form, $('input[type="submit"]', form));
    });
    setTimeout(() => $("#rh-email", main)?.focus(), 50);
  }

  /* ---------------- BASKET ---------------- */

  function renderBasket(main) {
    const quickForm = $$("form").find((f) => $('input[name="act"][value="quickadd"]', f));
    const baskForm = $$("form").find((f) => $('input[name="act"][value="update"]', f));
    const ieForm = $$("form").find((f) => $('input[name="act"][value="ie"]', f));
    const rows = baskForm
      ? $$("table.list-basket tr", baskForm).filter((tr) => $('input[name^="qu"]', tr) && $('input[name="baskremcb[]"]', tr)).map((tr) => {
          const tds = $$(":scope > td", tr);
          const cb = $('input[name="baskremcb[]"]', tr);
          const a = $("a[href*='prod_']", tds[2] || tr);
          return {
            cid: cb.value,
            cb,
            img: isrc($("img", tds[1])),
            sku: txt($("div", tds[1])),
            href: attr(a, "href"),
            type: txt(a),
            name: txt($("span", tds[2])),
            unit: txt(tds[3]),
            qtyInput: $('input[name^="qu"]', tds[4]),
            avail: txt(tds[5]),
            stockImg: attr($("img", tds[5]), "src"),
            sum: txt(tds[6]),
          };
        })
      : [];
    const sums = $$("table.list-basket-sum tr").map((tr) => ({ k: txt($("td:first-of-type", tr)), v: txt($("td:last-of-type", tr)) })).filter((s) => s.k && s.v && s.k !== s.v);
    const updateBtn = baskForm ? $('input[type="submit"][value="Módosít"]', baskForm) : null;
    const checkoutBtn = $$('input[type="submit"]').find((b) => /Megrendelés/i.test(b.value));
    const count = rows.length;

    main.innerHTML = `
      ${crumbsHtml([], "Kosár")}
      <div class="list-head"><div><h1 class="title">Kosár</h1><div class="count">${count ? `${count} tétel` : "A kosár üres"}</div></div></div>
      <div class="basket">
        <div>
          <div class="card">
            <div class="bhead"><strong>Tételek</strong>${quickForm ? `<form class="quickadd" data-quick><input class="field" placeholder="Cikkszám (pl. 100.526.76)" required><input class="field q" type="number" min="1" value="1"><button type="submit" class="btn">${icon("spark", 16)} Gyors hozzáadás</button></form>` : ""}</div>
            <div class="bitems" data-items>${count ? "" : `<div class="empty">${icon("cart", 36)}<h3>Még nincs semmi a kosárban</h3><p>Böngésszen a kategóriák között vagy használja a keresőt.</p><p><a class="btn primary" href="/cats.php">Kategóriák</a></p></div>`}</div>
            ${count ? `<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--line-2)"><button type="button" class="btn" data-update>${icon("check", 16)} Mennyiségek frissítése</button></div>` : ""}
          </div>
          ${ieForm ? `<details class="card" style="margin-top:16px"><summary style="padding:16px 20px;cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;align-items:center">Kosár export / import ${icon("chevron", 16)}</summary><div class="legacy-wrap" style="padding-top:0"><slot name="ie"></slot></div></details>` : ""}
        </div>
        <aside class="sumbox card">
          <strong style="font-size:16px">Összesítés</strong>
          ${sums.length ? sums.map((s, i) => `<div class="row ${i === sums.length - 1 ? "total" : ""}"><span>${esc(s.k.replace(/:$/, ""))}</span><span class="mono">${esc(s.v)}</span></div>`).join("") : `<div class="row"><span>Nettó</span><span>0 Ft</span></div>`}
          <button type="button" class="btn primary" data-checkout ${count && checkoutBtn ? "" : "disabled"}>Tovább a megrendeléshez ${icon("arrow", 18)}</button>
          <p class="note">A megrendelés következő lépésében adhatja meg a szállítási és fizetési módot.</p>
        </aside>
      </div>`;

    const items = $("[data-items]", main);
    bindQty(items);
    rows.forEach((r) => {
      const st = stockInfo(r.avail, r.stockImg);
      const it = el(`<div class="bitem" data-cid="${esc(r.cid)}">
        <a href="${esc(r.href)}">${r.img ? pimg(r.img, "medium", "normal", 'alt=""') : "<span></span>"}</a>
        <div class="info"><a class="ttl" href="${esc(r.href)}">${esc(r.type)}</a><div class="sub">${esc(r.name)}</div><div class="sku">${esc(r.sku)} · <span class="pill ${st.cls}" style="height:22px;font-size:12px"><span class="dot"></span>${esc(r.avail)}</span></div></div>
        <div class="unit mono">${esc(r.unit)}<br><span class="muted small">/ db</span></div>
        ${qtyHtml(r.qtyInput ? r.qtyInput.value : 1, "sm")}
        <div class="sum mono">${esc(r.sum)}</div>
        <button type="button" class="iconbtn rm" data-rm title="Eltávolítás">${icon("trash", 18)}</button>
      </div>`);
      $(".qty input", it).addEventListener("change", (e) => {
        if (r.qtyInput) r.qtyInput.value = e.target.value;
      });
      $("[data-rm]", it).addEventListener("click", () => {
        $$('input[name="baskremcb[]"]', baskForm).forEach((c) => (c.checked = c === r.cb));
        submitForm(baskForm, updateBtn);
      });
      items.appendChild(it);
    });
    $("[data-update]", main)?.addEventListener("click", () => {
      $$('input[name="baskremcb[]"]', baskForm).forEach((c) => (c.checked = false));
      submitForm(baskForm, updateBtn);
    });
    $("[data-checkout]", main)?.addEventListener("click", () => {
      if (checkoutBtn) checkoutBtn.click();
      else location.href = "/order.php";
    });
    $("[data-quick]", main)?.addEventListener("submit", (e) => {
      e.preventDefault();
      const [cidI, quI] = $$("input", e.currentTarget);
      $('input[name="cid"]', quickForm).value = cidI.value.trim();
      $('input[name="qu"]', quickForm).value = quI.value || "1";
      submitForm(quickForm, $('input[type="submit"]', quickForm));
    });
    if (ieForm) {
      const light = document.createElement("div");
      light.className = "rh-legacy";
      light.slot = "ie";
      light.appendChild(ieForm);
      state.host.appendChild(light);
    }
  }

  /* ---------------- ARTICLES ---------------- */

  function renderArticles(main) {
    const cards = $$(".article-card").map((c) => ({
      href: attr($("a", c), "href"),
      img: attr($("img", c), "src"),
      title: txt($(".article-card__title", c)),
      text: txt($(".article-card__description", c)).replace(/»\s*Tovább olvasom\s*$/i, "").trim(),
      date: txt($(".article-card__date", c)),
    }));
    const q = new URL(location.href).searchParams.get("q") || "";
    main.innerHTML = `
      ${crumbsHtml([], "Cikkek, tudástár")}
      <div class="list-head">
        <div><h1 class="title">Cikkek, leírások, tudástár</h1><div class="count">Ötletek, tippek, projektek — ${cards.length} cikk</div></div>
        <form class="search" data-asearch style="height:44px;max-width:360px;padding-left:14px">${icon("search", 16)}<input type="search" name="q" placeholder="Keresés a cikkek között…" value="${esc(q)}"><button type="submit">Keresés</button></form>
      </div>
      <div class="art-grid" data-grid></div>`;
    const g = $("[data-grid]", main);
    cards.forEach((c) => g.appendChild(el(`<a class="art card" href="${esc(c.href)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ""}<div class="body"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p><span class="date">${esc(c.date)}</span></div></a>`)));
    if (!cards.length) g.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon("search", 32)}<h3>Nincs találat</h3></div>`;
    $("[data-asearch]", main).addEventListener("submit", (e) => {
      e.preventDefault();
      location.href = "/article/?q=" + encodeURIComponent(e.currentTarget.q.value.trim());
    });
  }

  /* ---------------- LEGACY ---------------- */

  function renderLegacy(main) {
    const source = $(".mcontent");
    const crumbs = parseCrumbs();
    const title = pageH1();
    if (!source) {
      main.innerHTML = `<div class="card empty"><h3>Ez az oldal nem jeleníthető meg a modern nézetben</h3><p><button type="button" class="btn" data-act="classic">Klasszikus nézet</button></p></div>`;
      return;
    }
    $$(".list-cattree", source).forEach((n) => n.remove());
    main.innerHTML = `${crumbsHtml(crumbs, title)}<div class="card legacy-wrap"><slot name="legacy"></slot></div>`;
    const light = document.createElement("div");
    light.className = "rh-legacy";
    light.slot = "legacy";
    light.appendChild(source);
    state.host.appendChild(light);
  }

  /* ---------------- PROFILE (account area) ---------------- */

  function accountSideHtml() {
    const hdr = state.header || {};
    const name = hdr.name || "Fiók";
    return `<aside class="side card">
      <div class="who"><span class="av">${esc(name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(name)}</strong><span>HESTORE fiók</span></div></div>
      <nav class="acct-menu">
        ${ACCOUNT_LINKS.map((l) => `<a href="${l.href}" class="${isActiveHref(l.href) ? "on" : ""}">${icon(l.icon, 18)}<span>${esc(l.label)}</span></a>`).join("")}
        <a href="${esc(hdr.logoutHref || LOGOUT_HREF)}" class="logout">${icon("logout", 18)}<span>Kijelentkezés</span></a>
      </nav>
    </aside>`;
  }

  function renderProfile(main) {
    const source = $(".mcontent");
    const f = location.pathname.split("/").pop();
    const title = pageH1() || "Fiókom";
    const crumbs = [{ href: "/profile_home.php", label: "Fiókom" }];
    main.innerHTML = `${crumbsHtml(crumbs, title)}<div class="account">${accountSideHtml()}<section class="acct-main" data-acct></section></div>`;
    const area = $("[data-acct]", main);
    if (!source) {
      area.innerHTML = `<div class="card empty">${icon("info", 28)}<h3>Ez az oldal nem jeleníthető meg a modern nézetben</h3><button type="button" class="btn" data-act="classic">Klasszikus nézet</button></div>`;
      return;
    }
    if (f === "profile_home.php" && renderProfileHome(area, source)) return;
    if (f === "profile_orders.php" && renderProfileOrders(area, source)) return;
    if (f === "profile_order.php" && renderProfileOrder(area, source)) return;
    renderProfileLegacy(area, source, title);
  }

  function renderProfileLegacy(area, source, title) {
    // drop the site's own "« Vissza" button and page title; our shell provides both
    $$('input[type="button"]', source).forEach((b) => { if (/^«\s*Vissza/.test(b.value)) b.remove(); });
    const h1 = $(":scope > h1", source);
    if (h1 && txt(h1) === title) h1.remove();
    area.innerHTML = `<h1 class="title" style="margin-bottom:16px">${esc(title)}</h1><div class="card legacy-wrap"><slot name="legacy"></slot></div>`;
    const light = document.createElement("div");
    light.className = "rh-legacy";
    light.slot = "legacy";
    light.appendChild(source);
    state.host.appendChild(light);
  }

  // key/value rows of the small two-column tables used all over the profile pages
  function kvRows(scope) {
    return $$("tr", scope).map((tr) => {
      const tds = $$(":scope > td", tr);
      if (tds.length < 2) return null;
      return { k: txt(tds[0]).replace(/:$/, ""), v: txt(tds[1]) };
    }).filter((r) => r && r.k);
  }

  function renderProfileHome(area, source) {
    const name = txt($(".wb-name", source)) || (state.header && state.header.name) || "";
    const sub = $(".wb-sub", source);
    const lastStatus = sub ? txt($("strong", sub)) : "";
    const boxes = $$(".box", source);
    const find = (re) => boxes.find((b) => re.test(txt($("h3", b)) || "") || (!$("h3", b) && re.test(txt(b))));
    const idBox = boxes.find((b) => /Ügyfélkód/.test(txt(b)));
    const lastBox = find(/Utolsó rendelés/);
    const bonusBox = find(/Bónusz/);
    const balBox = find(/Pénzügyi/);
    if (!idBox && !lastBox && !balBox) return false;
    const idRows = idBox ? kvRows(idBox) : [];
    const lastRows = lastBox ? kvRows(lastBox) : [];
    const bonusEl = bonusBox ? $("div[style]", bonusBox) : null;
    const bonus = bonusEl ? bonusEl.innerHTML.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    const balRows = balBox ? kvRows(balBox).filter((r) => r.v) : [];
    const get = (rows, re) => (rows.find((r) => re.test(r.k)) || {}).v || "";
    const hour = new Date().getHours();
    const greet = hour < 10 ? "Jó reggelt" : hour < 18 ? "Üdvözöljük" : "Jó estét";

    area.innerHTML = `
      <div class="hello">
        <div>
          <div class="eyebrow">Fiókom</div>
          <h2>${esc(greet)}, ${esc(name || "kedves vásárlónk")}!</h2>
          <p>${lastStatus ? `Legutóbbi rendelésének állapota: <strong>${esc(lastStatus)}</strong>. ` : ""}Itt kezelheti rendeléseit, kedvenceit, számláit és adatait.</p>
        </div>
        <a class="btn dark" href="/new_products.html">${icon("spark", 16)} Újdonságok</a>
      </div>
      <div class="stats">
        ${get(idRows, /Ügyfélkód/) ? `<div class="stat card"><span class="k">${icon("hash", 14)} Ügyfélkód</span><span class="v mono">${esc(get(idRows, /Ügyfélkód/))}</span><span class="s">Regisztráció: ${esc(get(idRows, /Regisztráció/))}</span></div>` : ""}
        ${lastRows.length ? `<div class="stat card"><span class="k">${icon("receipt", 14)} Utolsó rendelés</span><span class="v sm mono">${esc(get(lastRows, /azonosító/i))}</span><span class="s">${esc(get(lastRows, /ideje/i))} · <strong>${esc(get(lastRows, /állapota/i))}</strong></span><a class="link" href="/profile_orders.php" style="font-size:13px">Összes rendelés ${icon("arrow", 14)}</a></div>` : ""}
        ${bonus ? `<div class="stat card"><span class="k">${icon("spark", 14)} Bónusz pontok</span><span class="v">${esc(bonus)}</span></div>` : ""}
        ${balRows.length ? `<div class="stat card accent"><span class="k">${icon("wallet", 14)} Egyenleg</span><span class="v mono">${esc(get(balRows, /^Egyenleg/))}</span>${balRows.filter((r) => !/^Egyenleg/.test(r.k)).map((r) => `<span class="s">${esc(r.k)}: <strong style="color:var(--on-ink)">${esc(r.v)}</strong></span>`).join("")}</div>` : ""}
      </div>
      <div class="section-head" style="margin-top:28px"><div><h2>Gyors elérés</h2><p>Fiókja legfontosabb oldalai</p></div></div>
      <div class="quick">${ACCOUNT_LINKS.filter((l) => l.href !== "/profile_home.php").map((l) => `<a href="${l.href}">${icon(l.icon, 20)}<span>${esc(l.label)}</span></a>`).join("")}</div>`;
    return true;
  }

  function renderProfileOrders(area, source) {
    const table = $("#ordtbl", source);
    if (!table) return false;
    const form = $('form[name="searchfrm"]', source);
    const val = (n) => (form && $(`[name="${n}"]`, form) ? $(`[name="${n}"]`, form).value : "");
    const wi = form && $("#wi", form) ? $("#wi", form).checked : true;
    const bgUrl = (el_) => ((attr(el_, "style").match(/url\(([^)]+)\)/) || [])[1] || "").replace(/['"]/g, "");
    const STATUS = { queued: "warn", open: "info", shipped: "info", closed: "ok", canceled: "bad", cancelled: "bad", deleted: "bad" };
    const orders = $$("tr", table).filter((tr) => $("td", tr)).map((tr) => {
      const tds = $$(":scope > td", tr);
      if (tds.length < 5) return null;
      const a = $("a", tds[0]);
      const statusKey = attr($(".ordstatus", tds[2]), "rel");
      const trackA = $("a", tds[5] || null);
      return {
        href: attr(a, "href"),
        id: txt(a) || txt(tds[0]),
        thumbs: $$(".ppdiv a", tds[1]).map((t) => ({ img: bgUrl(t), title: attr(t, "title") })),
        status: (tds[2].childNodes[0] && tds[2].childNodes[0].textContent.trim()) || txt(tds[2]),
        statusCls: STATUS[statusKey] || "neutral",
        time: tds[3].innerHTML.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
        sum: txt(tds[4]),
        track: trackA ? { href: attr(trackA, "href"), label: txt(trackA) } : null,
      };
    }).filter(Boolean);

    area.innerHTML = `
      <h1 class="title" style="margin-bottom:16px">Rendelések</h1>
      <form class="ord-filter card" data-ordfilter>
        <label>Dátumtól<input class="field" name="from" value="${esc(val("from"))}" placeholder="ÉÉÉÉ.HH.NN"></label>
        <label>Dátumig<input class="field" name="to" value="${esc(val("to"))}" placeholder="ÉÉÉÉ.HH.NN"></label>
        <label class="q">Keresés (cikkszám, rendelési szám)<input class="field" name="q" value="${esc(val("q"))}" placeholder="pl. H26/7587161"></label>
        <label class="chk"><input type="checkbox" name="wi" ${wi ? "checked" : ""}> Termékképekkel</label>
        <button type="submit" class="btn primary" style="height:38px">${icon("search", 16)} Szűrés</button>
      </form>
      ${orders.length ? `<div class="orders">${orders.map((o) => `
        <div class="order card">
          <div class="id"><a href="${esc(o.href)}" class="mono">${esc(o.id)}</a><small>${icon("clock", 12)} ${esc(o.time)}</small><span class="pill ${o.statusCls}" style="margin-top:6px"><span class="dot"></span>${esc(o.status)}</span></div>
          <div class="thumbs">${o.thumbs.map((t) => `<a href="${esc(o.href)}" title="${esc(t.title)}" style="background-image:url('${esc(imgSized(t.img, "medium"))}')"></a>`).join("")}</div>
          <div class="meta"><span class="sum mono">${esc(o.sum)}</span>${o.track ? `<a class="track" href="${esc(o.track.href)}" target="_blank" rel="noopener">${icon("truck", 14)} ${esc(o.track.label)}</a>` : `<span class="muted small">Nincs követési kód</span>`}</div>
          <a class="more" href="${esc(o.href)}" title="Részletek">${icon("right", 18)}</a>
        </div>`).join("")}</div>`
        : `<div class="card empty">${icon("receipt", 30)}<strong>Nincs a feltételeknek megfelelő rendelés</strong><span>Próbáljon tágabb dátumtartományt vagy más kifejezést.</span></div>`}`;

    $("[data-ordfilter]", area).addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const u = new URL(location.pathname, location.origin);
      ["from", "to", "q"].forEach((k) => { const v = (fd.get(k) || "").toString().trim(); if (v) u.searchParams.set(k, v); });
      u.searchParams.set("wi", fd.get("wi") ? "1" : "0");
      const f = val("f"), o = val("o");
      if (f) u.searchParams.set("f", f);
      if (o) u.searchParams.set("o", o);
      location.href = u.toString();
    });
    return true;
  }

  // profile_order.php — single order detail
  function renderProfileOrder(area, source) {
    const table = $("#ordptbl", source);
    if (!table) return false;
    const stripHtml = (h) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
    const lines = (h) => stripHtml(h).split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    const bgUrl = (el_) => ((attr(el_, "style").match(/url\(([^)]+)\)/) || [])[1] || "").replace(/['"]/g, "");

    // --- key/value info block ("Rendelési azonosító: …<br>Rendelés ideje: …") ---
    const info = {};
    const infoEl = $(':scope > .box div[style*="line-height"]', source);
    if (infoEl) {
      let key = null;
      infoEl.childNodes.forEach((n) => {
        if (n.nodeType === 1) {
          const tag = n.tagName;
          if (tag === "B") { key = txt(n).replace(/:$/, ""); info[key] = ""; return; }
          if (tag === "SCRIPT" || tag === "STYLE" || n.classList.contains("hovercopy") || (tag === "SPAN" && /italic/.test(attr(n, "style")))) return;
          if (n.classList.contains("project-note")) { const c = n.cloneNode(true); $$("a", c).forEach((a) => a.remove()); if (key) info[key] += " " + txt(c); return; }
          if (tag !== "BR" && key) info[key] += " " + txt(n);
        } else if (n.nodeType === 3 && key) info[key] += " " + n.textContent;
      });
      Object.keys(info).forEach((k) => { info[k] = info[k].replace(/\s+/g, " ").trim(); });
    }
    const pick = (re) => { const k = Object.keys(info).find((x) => re.test(x)); return k ? info[k] : ""; };
    const orderId = pick(/^Rendelési azonosító/) || pageH1();
    const custId = pick(/^Rendelői azonosító/);
    const time = pick(/^Rendelés ideje/);
    const wanted = pick(/^Szállítás kívánt/);
    const status = pick(/^Rendelés állapota/);
    const note = pick(/megjegyzés/i);
    const statusCls = /teljesít|lezár|kiszállít|átvéve|kész/i.test(status) ? "ok" : /törölv|vissza(mond|utas)|sikertelen/i.test(status) ? "bad" : /várakoz|feldolgoz|függő/i.test(status) ? "warn" : status ? "info" : "neutral";

    // --- titled boxes (addresses, shipping, payment) ---
    const BOX_ICON = { "Szállítási cím": "truck", "Számlázási cím": "file", "Szállítás": "pin", "Számlázás": "wallet" };
    const boxes = $$(":scope > .box", source).filter((b) => $("h3", b)).map((b) => {
      const c = b.cloneNode(true);
      const h3 = $("h3", c);
      const title = txt(h3);
      h3.remove();
      $$("script,style", c).forEach((n) => n.remove());
      return { title, lines: lines(c.innerHTML) };
    });
    const boxHtml = (b) => {
      const isAddr = /cím/i.test(b.title);
      const body = b.lines.map((ln, i) => {
        const m = !isAddr && ln.match(/^([^:]{2,40}):\s*(.+)$/);
        if (m) return `<div class="ln"><span class="k">${esc(m[1])}</span><strong>${esc(m[2])}</strong></div>`;
        return `<div class="ln">${i === 0 && isAddr ? `<strong>${esc(ln)}</strong>` : esc(ln)}</div>`;
      }).join("");
      return `<div class="obox card"><h3>${icon(BOX_ICON[b.title] || "info", 14)} ${esc(b.title)}</h3>${body || `<div class="ln muted">—</div>`}</div>`;
    };

    // --- proxied original buttons (run the site's own JS handlers) ---
    const proxies = [];
    const proxy = (el_) => { if (!el_) return -1; proxies.push(el_); return proxies.length - 1; };
    const changeBtn = $("#changesmbtn", source);
    const changeIx = proxy(changeBtn);

    // --- line items / totals / actions ---
    const items = [], extras = [], totals = [], actions = [];
    $$("tr", table).forEach((tr) => {
      const tds = $$(":scope > td", tr);
      if (!tds.length) return;
      const btns = $$('input[type="button"]', tr);
      if (btns.length) { btns.forEach((b) => actions.push({ label: b.value, ix: proxy(b) })); return; }
      if (tds.length <= 3 && tds[0].hasAttribute("colspan")) { totals.push({ k: txt(tds[0]).replace(/:$/, ""), v: txt(tds[1]) }); return; }
      if (tds.length < 9) return;
      const link = $("a:not(.imga)", tds[0]);
      const row = {
        href: attr(link, "href"), sku: txt(link), img: bgUrl($("a.imga", tds[0])),
        own: txt(tds[1]), name: txt(tds[2]), qty: txt(tds[3]), unit: txt(tds[4]),
        net: txt(tds[5]), vat: txt(tds[6]), gross: txt(tds[7]),
        stRel: attr($(".opstatus", tds[8]), "rel"), stImg: attr($(".opstatus img", tds[8]), "src"),
      };
      (link ? items : extras).push(row);
    });
    if (!items.length && !extras.length) return false;

    const itemHtml = (it, extra) => `
      <div class="oitem${extra ? " extra" : ""}">
        ${extra ? `<div class="th">${icon(/bónusz|kedvezmény/i.test(it.name) ? "spark" : "truck", 20)}</div>`
          : `<a class="th" href="${esc(it.href)}" style="background-image:url('${esc(imgSized(it.img, "normal"))}')" aria-label="${esc(it.name)}"></a>`}
        <div class="in">
          <div class="nm">${extra ? esc(it.name) : `<a href="${esc(it.href)}">${esc(it.name)}</a>`}</div>
          ${extra ? "" : `<div class="sk"><a class="mono" href="${esc(it.href)}">${esc(it.sku)}</a>${it.own ? `<span>Saját: <span class="mono">${esc(it.own)}</span></span>` : ""}</div>`}
        </div>
        <div class="qt"><strong>${esc(it.qty)}</strong> × ${esc(it.unit)}</div>
        <div class="nt">Nettó ${esc(it.net)}<br>ÁFA ${esc(it.vat)}</div>
        <div class="gr mono">${esc(it.gross)}</div>
        <div class="st">${it.stRel ? `<button type="button" class="iconbtn" data-opstatus="${esc(it.stRel)}" title="Tétel állapota" aria-label="Tétel állapota">${it.stImg ? `<img src="${esc(it.stImg)}" alt="" width="18" height="18">` : icon("info", 18)}</button>` : ""}</div>
      </div>`;

    area.innerHTML = `
      <div class="ohead">
        <div>
          <a class="back" href="/profile_orders.php">${icon("left", 14)} Rendelések</a>
          <h1 class="mono">${esc(orderId)}<button type="button" class="iconbtn" data-copy="${esc(orderId)}" title="Másolás vágólapra" aria-label="Rendelési azonosító másolása">${icon("copy", 16)}</button></h1>
          <div class="osub">
            ${status ? `<span class="pill ${statusCls}"><span class="dot"></span>${esc(status)}</span>` : ""}
            ${time ? `<span class="t">${icon("clock", 14)} ${esc(time)}</span>` : ""}
            ${custId ? `<span class="t">${icon("hash", 14)} ${esc(custId)}</span>` : ""}
          </div>
        </div>
        ${changeIx >= 0 ? `<button type="button" class="btn" data-proxy="${changeIx}">${icon("cog", 16)} ${esc(changeBtn.value)}</button>` : ""}
      </div>
      <div class="ogrid">
        ${boxes.map(boxHtml).join("")}
        ${wanted || note ? `<div class="obox card wide"><h3>${icon("calendar", 14)} További adatok</h3>
          ${wanted ? `<div class="ln"><span class="k">Szállítás kívánt ideje</span><strong>${esc(wanted)}</strong></div>` : ""}
          ${note ? `<div class="note">${icon("info", 14)} <span><b>Saját megjegyzés:</b> ${esc(note)}</span></div>` : ""}
        </div>` : ""}
      </div>
      <div class="card oitems">
        <div class="oh"><h2>Rendelés tételei</h2><span>${items.length} termék${extras.length ? ` · ${extras.length} egyéb tétel` : ""}</span></div>
        ${items.map((it) => itemHtml(it, false)).join("")}
        ${extras.map((it) => itemHtml(it, true)).join("")}
        ${totals.length ? `<div class="ototals">${totals.map((t, i) => `<div class="row${i === totals.length - 1 ? " tot" : ""}"><span>${esc(t.k)}</span><strong class="mono">${esc(t.v)}</strong></div>`).join("")}</div>` : ""}
        ${actions.length ? `<div class="oact">${actions.map((a, i) => `<button type="button" class="btn${i === actions.length - 1 ? " primary" : ""}" data-proxy="${a.ix}">${icon(/újra/i.test(a.label) ? "cart" : "plus", 16)} ${esc(a.label)}</button>`).join("")}</div>` : ""}
      </div>`;

    area.addEventListener("click", (e) => {
      const cp = e.target.closest("[data-copy]");
      if (cp) { copyText(cp.dataset.copy); return; }
      const px = e.target.closest("[data-proxy]");
      if (px) { const o = proxies[+px.dataset.proxy]; if (o) o.click(); else toast("A művelet nem elérhető", "bad"); return; }
      const st = e.target.closest("[data-opstatus]");
      if (st) { remotePopover(`/ajax_getopstatus.php?pid=${encodeURIComponent(st.dataset.opstatus)}`, st, "Tétel állapota"); }
    });
    return true;
  }

  /* ---------------- mount / boot ---------------- */

  function mount() {
    state.header = parseHeader();
    state.cats = parseCategories();

    // the original site has no viewport meta → responsive layout needs one
    if (!document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width, initial-scale=1";
      document.head.appendChild(m);
    }

    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      document.body.appendChild(host);
    }
    state.host = host;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    state.root = root;
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = css();
    root.appendChild(style);
    const app = renderShell();
    root.appendChild(app);
    const main = $("[data-main]", app);

    // a requested image size variant may not exist for every product → fall back to the original URL
    root.addEventListener("error", (e) => {
      const im = e.target;
      if (im && im.tagName === "IMG" && im.dataset.orig && !im.dataset.fb) {
        im.dataset.fb = "1";
        im.removeAttribute("srcset");
        im.src = im.dataset.orig;
      }
    }, true);

    const renderers = { home: renderHome, cats: renderCats, list: renderList, product: renderProduct, login: renderLogin, basket: renderBasket, articles: renderArticles, profile: renderProfile, legacy: renderLegacy };
    (renderers[state.page] || renderLegacy)(main);

    watchBasketBadge();

    // cookie bar: keep the site's own consent behaviour reachable
    const cookieBtn = $("#cookiewarnbar input[type=button]");
    if (cookieBtn) {
      const bar = el(`<div class="toast" style="background:var(--surface);color:var(--ink);border:1px solid var(--line)">${icon("info", 18)}<span>Az oldal sütiket használ a működéshez. <a class="link" href="/help/privacy.php">Részletek</a></span><button type="button" class="btn sm primary">Rendben</button></div>`);
      $("button", bar).addEventListener("click", () => {
        cookieBtn.click();
        bar.remove();
      });
      $("[data-toasts]", app).appendChild(bar);
    }

    applyTheme();
    // live theme switch from the popup
    try {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === "local" && ch.theme && ["light", "dark", "auto"].includes(ch.theme.newValue)) {
          state.theme = ch.theme.newValue;
          applyTheme();
        }
      });
    } catch (_) {}

    document.documentElement.classList.add("rh-on");
    document.documentElement.classList.remove("rh-boot");
  }

  function fail(msg) {
    document.documentElement.classList.remove("rh-boot", "rh-on");
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
    let bar = document.getElementById("rh-fail");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "rh-fail";
      document.documentElement.appendChild(bar);
    }
    bar.textContent = "ReHestore: " + msg + " — az eredeti felület látható.";
    console.error("[ReHestore]", msg);
  }

  async function boot() {
    const page = detect();
    if (page === "skip") return;
    state.page = page;
    document.documentElement.classList.add("rh-boot");
    const timer = setTimeout(() => {
      if (!document.documentElement.classList.contains("rh-on")) fail("időtúllépés a betöltéskor");
    }, FAILSAFE_MS);
    const start = async () => {
      try {
        const s = await storage.get({ view: "grid", theme: "light" });
        state.view = s.view === "list" ? "list" : "grid";
        state.theme = ["light", "dark", "auto"].includes(s.theme) ? s.theme : "light";
        document.documentElement.classList.toggle("rh-dark", isDark());
        mount();
        clearTimeout(timer);
      } catch (err) {
        clearTimeout(timer);
        fail(err && err.message ? err.message : String(err));
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }

  // hide the original UI as early as possible (document_start) to avoid a flash
  if (detect() !== "skip") document.documentElement.classList.add("rh-boot");
  storage.get({ enabled: true }).then((s) => {
    if (s.enabled === false) {
      document.documentElement.classList.remove("rh-boot");
      return;
    }
    boot();
  });
})();
