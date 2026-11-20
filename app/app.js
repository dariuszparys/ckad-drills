/* CKAD interactive drills. Data comes from app/data.js (built by tools/build.py). */
(function () {
  "use strict";

  const DATA = window.DRILL_DATA;
  const STORE_KEY = "ckad-drills-progress-v1";
  const chapters = DATA.chapters;
  const allDrills = [];
  chapters.forEach((ch) => ch.drills.forEach((d) => { d.chapter = ch; allDrills.push(d); }));
  const byId = Object.fromEntries(allDrills.map((d) => [d.id, d]));

  // Curriculum: exam domains -> competencies -> drills (built from curriculum/map.json).
  const CUR = DATA.curriculum || { domains: [], exam: "", examTitle: "The CKAD exam" };
  const domainBySlug = Object.fromEntries(CUR.domains.map((dom) => [dom.slug, dom]));
  const compBySlug = {};
  CUR.domains.forEach((dom) => dom.competencies.forEach((c) => { c.domain = dom; compBySlug[c.slug] = c; }));
  function domainLabel(dom) { return dom.title + (dom.weight ? ` (${dom.weight}%)` : ""); }

  // Read mode shows hints, solutions and explanations at once and never
  // touches the progress store. Practice mode reveals them step by step.
  const MODE_KEY = "ckad-drills-mode";
  let reading = localStorage.getItem(MODE_KEY) === "read";

  // ---------- progress store ----------
  let store = load();
  function load() {
    try { return Object.assign({ drills: {}, exam: {} }, JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); }
    catch (e) { return { drills: {}, exam: {} }; }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  function prog(id) {
    if (!store.drills[id]) store.drills[id] = { hints: 0, verify: false, solution: false, solved: false, score: [] };
    return store.drills[id];
  }
  function statusOf(id) {
    const p = store.drills[id];
    if (!p) return "todo";
    if (p.solved) return p.hints === 0 && !p.solution ? "clean" : "helped";
    if (p.solution) return "peeked";
    if (p.hints > 0 || p.verify) return "started";
    return "todo";
  }
  const STATUS = {
    todo: ["○", "Not started"],
    started: ["◐", "In progress"],
    clean: ["✓", "Solved without help"],
    helped: ["✓", "Solved with hints or solution"],
    peeked: ["👁", "Solution viewed, not marked solved"],
  };

  // ---------- markdown ----------
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Paths in markdown are relative to the file they come from: drills/ for the
  // drills, the repo root for the reference docs. mdBase tracks which one.
  const DOCS = DATA.docs || {};
  let mdBase = "drills/";
  function resolvePath(u) {
    const parts = (mdBase + u).split("/");
    const out = [];
    parts.forEach((p) => { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); });
    return out.join("/");
  }
  function docRoute(u) {
    const path = resolvePath(u.split("#")[0]);
    return Object.prototype.hasOwnProperty.call(DOCS, path) ? "#/doc/" + path : null;
  }
  function fixLink(u) {
    if (/^(https?:|mailto:|#)/.test(u)) return u;
    return docRoute(u) || resolvePath(u);
  }
  function linkAttrs(href) { return href.startsWith("#") ? "" : ' target="_blank" rel="noopener"'; }
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => { const href = fixLink(u); return `<a href="${href}"${linkAttrs(href)}>${t}</a>`; });
    s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, "$1<em>$2</em>");
    s = s.replace(/\[ \]/g, "☐");
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => {
      const c = codes[+i];
      // `../cheatsheet.md` style references become links to the rendered doc.
      const route = /\.md$/.test(c) && !/\s/.test(c) ? docRoute(c) : null;
      return route ? `<a href="${route}"><code>${esc(c)}</code></a>` : `<code>${esc(c)}</code>`;
    });
    return s;
  }
  function splitRow(line) {
    const cells = []; let cur = ""; let inCode = false;
    const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    for (const ch of body) {
      if (ch === "`") inCode = !inCode;
      if (ch === "|" && !inCode) { cells.push(cur.trim()); cur = ""; } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }
  const FENCE = /^\s*```/;
  const LIST = /^(\s*)([-*]|\d+\.)\s+/;
  function isBlockStart(l) {
    return FENCE.test(l) || /^#{1,6} /.test(l) || /^>/.test(l) || /^\|/.test(l) || LIST.test(l) || /^---+\s*$/.test(l);
  }
  function codeBlock(code, lang, wrap) {
    return `<div class="code${wrap ? " wrap" : ""}"><button class="copy" type="button" title="Copy">Copy</button>` +
      `<pre><code class="lang-${esc(lang || "text")}">${esc(code)}</code></pre></div>`;
  }
  // Long commands written as inline code wrap badly inside prose, so they are
  // lifted out into their own copyable code block.
  const LONG_CODE = 48;
  function paragraph(text) {
    const html = [];
    const re = /`([^`]+)`/g;
    let m, last = 0;
    while ((m = re.exec(text))) {
      if (m[1].length < LONG_CODE || docRoute(m[1])) continue;
      pushText(text.slice(last, m.index));
      html.push(codeBlock(m[1], "bash", true));
      last = m.index + m[0].length;
    }
    pushText(text.slice(last));
    return html.join("\n");
    function pushText(t) {
      // Drop the punctuation left behind where a command was lifted out.
      t = t.replace(/^[\s.,;)]+/, "").replace(/[\s(,;]+$/, "");
      if (t.replace(/[\s.,;:()]/g, "")) html.push(`<p>${inline(t)}</p>`);
    }
  }
  function md(src) {
    const lines = src.replace(/\r/g, "").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (FENCE.test(l)) {
        const indent = l.match(/^\s*/)[0].length;
        const lang = l.trim().slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) {
          const lead = lines[i].match(/^\s*/)[0].length;
          buf.push(lines[i].slice(Math.min(indent, lead)));
          i++;
        }
        i++;
        out.push(codeBlock(buf.join("\n"), lang));
        continue;
      }
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,6}) (.*)$/))) {
        const level = Math.min(6, m[1].length + 1);
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
        i++; continue;
      }
      if (/^---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (/^>/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^> ?/, "")); i++; }
        out.push(`<blockquote>${md(buf.join("\n"))}</blockquote>`);
        continue;
      }
      if (/^\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        const head = splitRow(rows[0]);
        const body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || "") ? 2 : 1);
        out.push("<div class=\"table\"><table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") +
          "</tr></thead><tbody>" + body.map((r) => "<tr>" + splitRow(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table></div>");
        continue;
      }
      if ((m = l.match(LIST))) {
        const base = m[1].length;
        const ordered = /\d/.test(m[2]);
        const items = [];
        while (i < lines.length) {
          const cur = lines[i];
          const im = cur.match(LIST);
          if (im && im[1].length === base) {
            items.push([cur.slice(im[0].length)]);
            i++;
          } else if (cur.trim() && (cur.match(/^\s*/)[0].length > base) && items.length) {
            items[items.length - 1].push(cur.slice(Math.min(cur.match(/^\s*/)[0].length, base + 3)));
            i++;
          } else if (!cur.trim() && i + 1 < lines.length && lines[i + 1].match(/^\s*/)[0].length > base && items.length) {
            items[items.length - 1].push("");
            i++;
          } else if (!cur.trim() && i + 1 < lines.length && items.length &&
                     (lines[i + 1].match(LIST) || [])[1] === m[1] && /\d/.test(lines[i + 1].match(LIST)[2]) === ordered) {
            i++; // blank line between items of the same list
          } else if (cur.trim() && !isBlockStart(cur) && items.length && (lines[i - 1] || "").trim()) {
            items[items.length - 1].push(cur); // lazy continuation
            i++;
          } else break;
        }
        const tag = ordered ? "ol" : "ul";
        const start = ordered && parseInt(m[2], 10) !== 1 ? ` start="${parseInt(m[2], 10)}"` : "";
        out.push(`<${tag}${start}>` + items.map((it) => {
          let html = md(it.join("\n"));
          const single = html.match(/^<p>([\s\S]*?)<\/p>/);
          if (single && html.indexOf("<p>", 3) === -1) html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
          return `<li>${html}</li>`;
        }).join("") + `</${tag}>`);
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) { buf.push(lines[i]); i++; }
      out.push(paragraph(buf.join(" ")));
    }
    return out.join("\n");
  }

  // ---------- helpers ----------
  const $main = document.getElementById("main");
  const $nav = document.getElementById("nav");
  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; }
  function fmt(sec) {
    const neg = sec < 0; sec = Math.abs(Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (neg ? "+" : "") + m + ":" + String(s).padStart(2, "0");
  }
  function badge(id) {
    const st = statusOf(id);
    return `<span class="badge st-${st}" title="${STATUS[st][1]}">${STATUS[st][0]}</span>`;
  }
  function chapterSlug(ch) { return ch.file.replace(/\.md$/, ""); }
  function chapterBySlug(s) { return chapters.find((c) => chapterSlug(c) === s); }
  function shortTitle(ch) { return ch.mock ? "Mock exam" : ch.title.replace(/^Chapter (\d+): /, "$1 · "); }

  // ---------- sidebar ----------
  function solvedIn(ids) { return ids.filter((id) => /clean|helped/.test(statusOf(id))).length; }
  function renderNav(activeId, activeCh, activeCur) {
    const solved = allDrills.filter((d) => /clean|helped/.test(statusOf(d.id))).length;
    document.getElementById("overall").textContent = `${solved} / ${allDrills.length} solved`;
    const cur = `<details class="navch navcur"${activeCur ? " open" : ""}><summary><a href="#/cur">Curriculum</a>` +
      `<span class="count">read first</span></summary><ul>` +
      `<li${activeCur === "exam" ? ' class="active"' : ""}><a href="#/cur">${esc(CUR.examTitle)}</a></li>` +
      CUR.domains.map((dom) => `<li${activeCur === dom.slug ? ' class="active"' : ""}><a href="#/cur/${dom.slug}">` +
        `${esc(dom.title)}${dom.weight ? ` <span class="nid">${dom.weight}%</span>` : ""}</a></li>`).join("") +
      "</ul></details>";
    $nav.innerHTML = cur + chapters.map((ch) => {
      const done = ch.drills.filter((d) => /clean|helped/.test(statusOf(d.id))).length;
      const open = activeCh === ch ? " open" : "";
      return `<details class="navch"${open}><summary><a href="#/ch/${chapterSlug(ch)}">${esc(shortTitle(ch))}</a>` +
        `<span class="count">${done}/${ch.drills.length}</span></summary><ul>` +
        ch.drills.map((d) => `<li${d.id === activeId ? ' class="active"' : ""}><a href="#/d/${d.id}">${badge(d.id)}` +
          `<span class="nid">${ch.mock ? "T" + d.id.slice(5) : d.id}</span> ${inline(d.title)}</a></li>`).join("") +
        "</ul></details>";
    }).join("");
    const act = $nav.querySelector("li.active");
    if (act) act.scrollIntoView({ block: "nearest" });
  }

  // ---------- timers ----------
  let tick = null;
  function stopTick() { if (tick) clearInterval(tick); tick = null; }

  function drillTimer(root, minutes) {
    const el = root.querySelector(".timer");
    if (!el) return;
    const limit = (minutes || 5) * 60;
    let elapsed = 0, running = false, last = 0;
    const disp = el.querySelector(".t-disp"), btn = el.querySelector(".t-start");
    function paint() {
      disp.textContent = fmt(limit - elapsed);
      el.classList.toggle("over", elapsed > limit);
      el.classList.toggle("running", running);
      btn.textContent = running ? "Pause" : elapsed ? "Resume" : "Start timer";
    }
    btn.onclick = () => {
      running = !running; last = Date.now();
      if (running && !tick) tick = setInterval(() => { if (running) { const n = Date.now(); elapsed += (n - last) / 1000; last = n; paint(); } }, 250);
      paint();
    };
    el.querySelector(".t-reset").onclick = () => { running = false; elapsed = 0; paint(); };
    root.getElapsed = () => elapsed;
    paint();
  }

  function examRemaining() {
    const ex = store.exam;
    if (!ex.start) return null;
    const used = (ex.stoppedAt || Date.now()) - ex.start;
    return DATA.chapters.find((c) => c.mock).minutes * 60 - used / 1000;
  }
  function examClock(root) {
    const el = root.querySelector(".examclock");
    if (!el) return;
    const disp = el.querySelector(".t-disp"), btn = el.querySelector(".t-start");
    function paint() {
      const r = examRemaining();
      const ex = store.exam;
      disp.textContent = r === null ? "120:00" : fmt(r);
      el.classList.toggle("over", r !== null && r < 0);
      el.classList.toggle("running", !!ex.start && !ex.stoppedAt);
      btn.textContent = !ex.start ? "Start exam (120 min)" : ex.stoppedAt ? "Resume" : "Pause";
    }
    btn.onclick = () => {
      const ex = store.exam;
      if (!ex.start) ex.start = Date.now();
      else if (ex.stoppedAt) { ex.start += Date.now() - ex.stoppedAt; delete ex.stoppedAt; }
      else ex.stoppedAt = Date.now();
      save(); paint();
    };
    el.querySelector(".t-reset").onclick = () => {
      if (!confirm("Reset the exam clock?")) return;
      store.exam = {}; save(); paint();
    };
    paint();
    tick = setInterval(paint, 500);
  }

  // ---------- pages ----------
  function examScore() {
    const mock = chapters.find((c) => c.mock);
    let got = 0;
    mock.drills.forEach((d) => {
      const sc = (store.drills[d.id] || {}).score || [];
      d.scoring.checks.forEach((c, i) => { if (sc[i]) got += c.points; });
    });
    return got;
  }

  function renderHome() {
    renderNav(null, null);
    $main.innerHTML = `<div class="page">
      <h1>CKAD drills</h1>
      <p class="lead">Read the task, start the timer and solve it in your cluster. Stuck? Take a hint. Still stuck? Take the second hint, and only then look at the solution. Run the verify commands to check your work, then open the explanation to see why it works.</p>
      <p class="muted">Only want to read? Switch to <strong>Read</strong> mode at the top of the sidebar: it shows every hint, solution and explanation and leaves your progress alone.</p>
      <section class="before md">
        <h3>Before you start</h3>
        <p>Start the cluster, then open the practice shell in a terminal from this folder. It sets up <code>k</code>, <code>$do</code> and GNU <code>sed</code> like the exam's bash.</p>
        ${codeBlock("minikube start -p ckad", "bash")}
        ${codeBlock('"$(brew --prefix)/bin/bash" --rcfile ckad-env.sh', "bash")}
        <p class="muted small">First time? Follow <a href="#/doc/README.md">Getting started</a> for the one-time setup (tools, cluster, <code>/opt/course</code>).</p>
      </section>
      <h2>Curriculum</h2>
      <p class="muted">What the exam asks for, explained by domain, with the drills that practise each point. Read it before the drills, or on its own.</p>
      <div class="cards">
        <a class="card" href="#/cur"><h3>${esc(CUR.examTitle)}</h3>
          <div class="muted">Format, tools, what you may read during the exam</div></a>
        ${CUR.domains.map((dom) => {
          const ids = [...new Set(dom.competencies.flatMap((c) => c.drills))];
          return `<a class="card" href="#/cur/${dom.slug}"><h3>${esc(dom.title)}</h3>
            <div class="muted">${dom.weight ? dom.weight + "% of the exam · " : ""}${dom.competencies.length} topics · ${ids.length} drills</div>
            <div class="bar"><span style="width:${ids.length ? Math.round(100 * solvedIn(ids) / ids.length) : 0}%"></span></div></a>`;
        }).join("")}
      </div>
      <h2>Drills</h2>
      <div class="cards">${chapters.map((ch) => {
        const done = ch.drills.filter((d) => /clean|helped/.test(statusOf(d.id))).length;
        const clean = ch.drills.filter((d) => statusOf(d.id) === "clean").length;
        const pct = Math.round(100 * done / ch.drills.length);
        return `<a class="card" href="#/ch/${chapterSlug(ch)}"><h3>${esc(shortTitle(ch))}</h3>
          <div class="muted">${ch.mock ? `${ch.drills.length} tasks · ${ch.minutes} min · pass at ${ch.passMark}/100`
            : `${ch.drills.length} drills · ${ch.drills.reduce((a, d) => a + (d.minutes || 0), 0)} min`}</div>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div class="muted small">${done}/${ch.drills.length} solved · ${clean} without help</div></a>`;
      }).join("")}</div>
      <p><button class="reset-btn" data-reset="all">↺ Reset all progress</button></p>
      <h2>Keyboard</h2>
      <p class="muted"><kbd>n</kbd> next drill · <kbd>p</kbd> previous drill · <kbd>h</kbd> next hint · <kbd>t</kbd> start/pause timer</p>
      <h2>Reference</h2>
      <ul class="refs">
        <li><a href="#/doc/README.md">Getting started and practice shell</a> <span class="muted">README.md</span></li>
        <li><a href="#/doc/cheatsheet.md">CKAD speed sheet</a> <span class="muted">cheatsheet.md</span></li>
        <li><a href="#/doc/minikube.md">Running the drills on minikube</a> <span class="muted">minikube.md</span></li>
        <li><a href="#/doc/drills/README.md">About the drills</a> <span class="muted">drills/README.md</span></li>
      </ul>
    </div>`;
  }

  function renderChapter(ch) {
    renderNav(null, ch);
    const rows = ch.drills.map((d) => `<tr><td>${badge(d.id)}</td><td><a href="#/d/${d.id}">${ch.mock ? "Task " + d.id.slice(5) : d.id}</a></td>
      <td><a href="#/d/${d.id}">${inline(d.title)}</a></td><td class="muted">${d.minutes ? d.minutes + " min" : ""}</td>
      ${ch.mock ? `<td>${scoreOf(d)}/${d.points}</td>` : ""}</tr>`).join("");
    $main.innerHTML = `<div class="page">
      <p class="crumbs"><a href="#/">All chapters</a></p>
      <h1>${esc(ch.title)}</h1>
      ${ch.mock ? `<div class="examclock timer big"><span class="t-disp"></span><button class="t-start"></button><button class="t-reset link">reset</button></div>
        <p class="score">Score: <strong>${examScore()}</strong> / 100 · pass mark ${ch.passMark}</p>` : ""}
      <table class="list"><thead><tr><th></th><th>#</th><th>Drill</th><th>Time</th>${ch.mock ? "<th>Score</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>
      <p><button class="reset-btn" data-reset="chapter:${chapterSlug(ch)}">↺ Reset ${ch.mock ? "mock exam (scores and clock)" : "this chapter"}</button></p>
      <h2>${ch.mock ? "Rules and setup" : "Chapter setup"}</h2>
      <div class="md">${md(ch.intro)}</div>
    </div>`;
    examClock($main);
  }

  function renderDoc(path) {
    renderNav(null, null);
    mdBase = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    const html = md(DOCS[path]);
    mdBase = "drills/";
    $main.innerHTML = `<div class="page doc">
      <p class="crumbs"><a href="#/">All chapters</a> › ${esc(path)}</p>
      <div class="md">${html}</div>
    </div>`;
    window.scrollTo(0, 0);
  }

  function drillLabel(d) { return d.chapter.mock ? "Task " + d.id.slice(5) : d.id; }
  function practiceList(ids) {
    return `<ul class="practice">` + ids.map((id) => {
      const d = byId[id];
      return `<li>${badge(id)}<a href="#/d/${id}"><span class="nid">${d.chapter.mock ? "Mock " + id.slice(5) : id}</span> ${inline(d.title)}</a>` +
        `${d.minutes ? ` <span class="muted small">${d.minutes} min</span>` : ""}</li>`;
    }).join("") + "</ul>";
  }
  function curMd(src) {
    mdBase = "curriculum/";
    const html = md(src);
    mdBase = "drills/";
    return html;
  }

  function renderExam() {
    renderNav(null, null, "exam");
    const first = CUR.domains[0];
    $main.innerHTML = `<div class="page doc cur">
      <p class="crumbs"><a href="#/">Start</a> › Curriculum</p>
      <h1>${esc(CUR.examTitle)}</h1>
      <div class="md">${curMd(CUR.exam)}</div>
      <nav class="pager"><span></span>${first ? `<a href="#/cur/${first.slug}">${esc(domainLabel(first))} →</a>` : ""}</nav>
    </div>`;
    window.scrollTo(0, 0);
  }

  function renderDomain(dom, compSlug) {
    renderNav(null, null, dom.slug);
    const i = CUR.domains.indexOf(dom);
    const prev = CUR.domains[i - 1], next = CUR.domains[i + 1];
    $main.innerHTML = `<div class="page doc cur">
      <p class="crumbs"><a href="#/">Start</a> › <a href="#/cur">Curriculum</a></p>
      <h1>${esc(domainLabel(dom))}</h1>
      ${dom.note ? `<p class="muted">${esc(dom.note)}</p>` : ""}
      <div class="md">${curMd(dom.intro)}</div>
      <ol class="toc">${dom.competencies.map((c) => `<li><a href="#/cur/${dom.slug}/${c.slug}">${esc(c.title)}</a>` +
        ` <span class="muted small">${solvedIn(c.drills)}/${c.drills.length} drills solved</span></li>`).join("")}</ol>
      ${dom.competencies.map((c) => `<section class="comp" id="c-${c.slug}">
        <h2>${esc(c.title)}</h2>
        <div class="md">${curMd(c.body)}</div>
        <h4>Practise it</h4>
        ${practiceList(c.drills)}
      </section>`).join("")}
      <nav class="pager">
        ${prev ? `<a href="#/cur/${prev.slug}">← ${esc(domainLabel(prev))}</a>` : `<a href="#/cur">← ${esc(CUR.examTitle)}</a>`}
        ${next ? `<a href="#/cur/${next.slug}">${esc(domainLabel(next))} →</a>` : "<span></span>"}
      </nav>
    </div>`;
    const target = compSlug && document.getElementById("c-" + compSlug);
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
  }

  function scoreOf(d) {
    const sc = (store.drills[d.id] || {}).score || [];
    return d.scoring.checks.reduce((a, c, i) => a + (sc[i] ? c.points : 0), 0);
  }

  function renderDrill(d) {
    const ch = d.chapter;
    renderNav(d.id, ch);
    // In Read mode use a throwaway state with everything open; the store stays untouched.
    const p = reading ? { hints: d.hints.length, solution: true, verify: true, explain: true, solved: false, score: [] } : prog(d.id);
    const idx = allDrills.indexOf(d);
    const prev = allDrills[idx - 1], next = allDrills[idx + 1];
    const label = ch.mock ? `Task ${d.id.slice(5)}` : d.id;
    const meta = [d.minutes ? `⏱ ${d.minutes} min` : "", ch.mock ? `${d.points} points` : "", d.source ? inline(d.source) : ""].filter(Boolean).join(" · ");
    const chips = (d.competencies || []).map((c) => compBySlug[c.slug]).filter(Boolean).map((c) =>
      `<a class="chip" href="#/cur/${c.domain.slug}/${c.slug}" title="${esc(c.domain.title)}">${esc(c.title)}</a>`).join("");
    const timerHtml = reading ? "" : ch.mock
      ? `<div class="examclock timer"><span class="t-disp"></span><button class="t-start"></button><button class="t-reset link">reset</button></div>`
      : `<div class="timer"><span class="t-disp"></span><button class="t-start"></button><button class="t-reset link">reset</button></div>`;

    $main.innerHTML = `<div class="page drill">
      <p class="crumbs"><a href="#/">All chapters</a> › <a href="#/ch/${chapterSlug(ch)}">${esc(shortTitle(ch))}</a></p>
      <div class="drill-head">
        <div><h1><span class="nid">${label}</span> ${inline(d.title)}</h1><div class="muted">${meta}</div></div>
        ${timerHtml}
      </div>
      ${chips ? `<p class="chips"><span class="muted small">Curriculum:</span> ${chips}</p>` : ""}
      ${reading ? `<p class="readnote">Read mode: hints, solution and explanation are shown, and nothing is recorded. Switch to Practice at the top of the sidebar to work through the drill.</p>` : ""}
      <details class="setup"><summary>${ch.mock ? "Exam rules and setup script" : "Chapter setup (minikube)"}</summary><div class="md">${md(ch.intro)}</div></details>
      <section class="task md">${md(d.task)}</section>
      <section class="steps">
        ${d.hints.map((hint, i) => `<div class="step hint" data-step="hint${i}">
            <button class="reveal" data-act="hint" data-n="${i}">💡 Show hint ${i + 1}</button>
            <div class="body md">${md(hint)}</div></div>`).join("")}
        <div class="step sol" data-step="solution">
          <button class="reveal" data-act="solution">📖 Show solution</button>
          <div class="body md">${md(d.solution)}</div></div>
        ${d.verify ? `<div class="step ver" data-step="verify">
          <button class="reveal" data-act="verify">🔎 Show verify commands</button>
          <div class="body md">${md(d.verify)}</div></div>` : ""}
        ${d.explanation ? `<div class="step exp" data-step="explain">
          <button class="reveal" data-act="explain"></button>
          <div class="body md">${md(d.explanation)}</div></div>` : ""}
        ${ch.mock && !reading ? `<div class="step score-step" data-step="score">
          <button class="reveal" data-act="score">🧮 Score this task</button>
          <div class="body"><p class="muted small">Tick each check that passes in your cluster.</p>
          ${d.scoring.checks.map((c, i) => `<label class="check"><input type="checkbox" data-i="${i}"${p.score && p.score[i] ? " checked" : ""}> ${inline(c.text)} <span class="muted">(${c.points})</span></label>`).join("")}
          <p class="score">Task score: <strong class="tscore">${scoreOf(d)}</strong> / ${d.points}</p></div></div>` : ""}
      </section>
      ${reading ? "" : `<div class="actions">
        <button class="solved-btn"></button>
        <button class="reset-btn" data-reset="drill:${d.id}" title="Hide hints and solution again and clear the solved mark">↺ Reset drill</button>
        <span class="muted small status-line"></span>
      </div>`}
      <nav class="pager">
        ${prev ? `<a href="#/d/${prev.id}">← ${prev.chapter.mock ? "Task " + prev.id.slice(5) : prev.id} ${inline(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a href="#/d/${next.id}">${next.chapter.mock ? "Task " + next.id.slice(5) : next.id} ${inline(next.title)} →</a>` : "<span></span>"}
      </nav>
    </div>`;

    const root = $main.querySelector(".drill");
    if (!reading) { if (ch.mock) examClock(root); else drillTimer(root, d.minutes); }

    function paint() {
      root.querySelectorAll(".step.hint").forEach((el, i) => {
        el.classList.toggle("open", p.hints > i);
        el.classList.toggle("locked", p.hints < i);
        el.querySelector(".reveal").textContent = (p.hints > i ? "💡 Hint " : "💡 Show hint ") + (i + 1);
      });
      const nextHint = p.hints < d.hints.length ? d.hints.length - p.hints : 0;
      const solStep = root.querySelector(".step.sol");
      solStep.classList.toggle("open", p.solution);
      solStep.querySelector(".reveal").textContent = p.solution ? "📖 Solution" :
        nextHint ? `📖 Show solution (${nextHint} hint${nextHint > 1 ? "s" : ""} left; try those first)` : "📖 Show solution";
      const ver = root.querySelector(".step.ver");
      if (ver) ver.classList.toggle("open", p.verify);
      const sc = root.querySelector(".score-step");
      if (sc) sc.classList.toggle("open", !!p.scoreOpen);
      const exp = root.querySelector(".step.exp");
      if (exp) {
        // The explanation gives the solution away, so it unlocks with it.
        const unlocked = p.solution || p.solved;
        exp.classList.toggle("open", unlocked && !!p.explain);
        exp.classList.toggle("locked-exp", !unlocked);
        exp.querySelector(".reveal").textContent = !unlocked ? "🎓 Explanation (unlocks when you solve the drill or open the solution)"
          : p.explain ? "🎓 Why it works" : "🎓 Show explanation: why it works";
      }
      if (reading) return;
      const btn = root.querySelector(".solved-btn");
      btn.textContent = p.solved ? "✓ Marked as solved (undo)" : "Mark as solved";
      btn.classList.toggle("on", p.solved);
      const st = statusOf(d.id);
      root.querySelector(".status-line").innerHTML = `${badge(d.id)} ${STATUS[st][1]}` +
        (p.hints ? ` · ${p.hints} hint${p.hints > 1 ? "s" : ""} used` : "") + (p.solution ? " · solution viewed" : "") +
        (p.time ? ` · solved in ${fmt(p.time)}` : "");
      renderNav(d.id, ch);
    }

    root.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("copy")) return copy(b);
      if (b.dataset.reset || reading) return;
      const act = b.dataset.act;
      if (act === "explain") {
        if (!(p.solution || p.solved)) return;
        p.explain = !p.explain;
      } else if (act === "hint") {
        const n = +b.dataset.n;
        if (n < p.hints) return;
        p.hints = Math.max(p.hints, n + 1);
      } else if (act === "solution") {
        if (p.solution) return;
        p.solution = true;
      } else if (act === "verify") {
        p.verify = !p.verify;
      } else if (act === "score") {
        p.scoreOpen = !p.scoreOpen;
      } else if (b.classList.contains("solved-btn")) {
        p.solved = !p.solved;
        if (p.solved && root.getElapsed && root.getElapsed() > 5) p.time = Math.round(root.getElapsed());
        if (!p.solved) delete p.time;
      } else return;
      save(); paint();
    });
    root.addEventListener("change", (e) => {
      const cb = e.target.closest("input[type=checkbox][data-i]");
      if (!cb || reading) return;
      p.score = p.score || [];
      p.score[+cb.dataset.i] = cb.checked;
      root.querySelector(".tscore").textContent = scoreOf(d);
      save();
    });
    paint();
    window.scrollTo(0, 0);
  }

  function copy(btn) {
    const text = btn.parentElement.querySelector("code").textContent;
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1200); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } finally { ta.remove(); }
    }
  }

  // ---------- routing ----------
  function route() {
    stopTick();
    const hash = location.hash.replace(/^#\/?/, "");
    let m;
    if ((m = hash.match(/^d\/(.+)$/)) && byId[m[1]]) renderDrill(byId[m[1]]);
    else if ((m = hash.match(/^ch\/(.+)$/)) && chapterBySlug(m[1])) renderChapter(chapterBySlug(m[1]));
    else if ((m = hash.match(/^doc\/(.+)$/)) && DOCS[decodeURIComponent(m[1])] !== undefined) renderDoc(decodeURIComponent(m[1]));
    else if ((m = hash.match(/^cur\/([^/]+)(?:\/(.+))?$/)) && domainBySlug[m[1]]) renderDomain(domainBySlug[m[1]], m[2]);
    else if (/^cur\/?$/.test(hash)) renderExam();
    else renderHome();
    document.title = ((document.querySelector("#main h1, #main h2") || {}).textContent || "") + " · CKAD drills";
  }
  window.addEventListener("hashchange", route);
  $main.addEventListener("click", (e) => { const b = e.target.closest("button.copy"); if (b && !b.closest(".drill")) copy(b); });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
    const cur = byId[(location.hash.match(/^#\/d\/(.+)$/) || [])[1]];
    if (!cur) return;
    const idx = allDrills.indexOf(cur);
    if (e.key === "n" && allDrills[idx + 1]) location.hash = "#/d/" + allDrills[idx + 1].id;
    else if (e.key === "p" && allDrills[idx - 1]) location.hash = "#/d/" + allDrills[idx - 1].id;
    else if (e.key === "h") { const b = $main.querySelector(".step.hint:not(.open) .reveal"); if (b) b.click(); }
    else if (e.key === "t") { const b = $main.querySelector(".timer .t-start"); if (b) b.click(); }
  });

  function resetProgress(scope) {
    const [kind, arg] = scope.split(":");
    if (kind === "all") {
      if (!confirm("Reset ALL progress? This clears hints, solved marks, mock exam scores and the exam clock.")) return;
      store = { drills: {}, exam: {} };
    } else if (kind === "chapter") {
      const ch = chapterBySlug(arg);
      if (!confirm(`Reset progress for "${shortTitle(ch)}"?` + (ch.mock ? " This also clears scores and the exam clock." : ""))) return;
      ch.drills.forEach((d) => delete store.drills[d.id]);
      if (ch.mock) store.exam = {};
    } else if (kind === "drill") {
      delete store.drills[arg];
    }
    save(); route();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-reset]");
    if (b) resetProgress(b.dataset.reset);
  });

  // ---------- practice / read mode ----------
  const $mode = document.getElementById("mode-toggle");
  function applyMode() {
    $mode.textContent = reading ? "📖 Read" : "✍ Practice";
    $mode.title = reading ? "Read mode: everything is shown, nothing is recorded (click for Practice)"
      : "Practice mode: reveal hints and solutions step by step (click for Read)";
    document.documentElement.dataset.mode = reading ? "read" : "practice";
  }
  $mode.onclick = () => {
    reading = !reading;
    if (reading) localStorage.setItem(MODE_KEY, "read"); else localStorage.removeItem(MODE_KEY);
    applyMode(); route();
  };
  applyMode();

  // ---------- theme ----------
  const THEME_KEY = "ckad-drills-theme";
  const THEMES = ["system", "light", "dark"];
  const THEME_LABEL = { system: "◐ Auto", light: "☀ Light", dark: "☾ Dark" };
  const $theme = document.getElementById("theme-toggle");
  function applyTheme(t) {
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $theme.textContent = THEME_LABEL[t];
    $theme.title = `Theme: ${t === "system" ? "follows your OS" : t} (click to change)`;
  }
  let theme = THEMES.includes(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : "system";
  applyTheme(theme);
  $theme.onclick = () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    if (theme === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  };

  route();
})();
