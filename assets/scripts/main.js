/* =========================================================
   main.js — interactions, demos, animations
   Modules:
     1.  $(...)            DOM helpers
     2.  Reveal observer   data-reveal entrance
     3.  Nav               stuck state on scroll
     4.  Capabilities      mouse-tracked highlight
     5.  Reasoning demo    typed step-by-step trace
     6.  Code editor demo  tokenized typing of code snippets
     7.  Benchmarks        bar animation on view
     8.  Form              quiet feedback
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const escHtml = (s) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;");

  /* =====================================================
     1. Reveal observer
     ===================================================== */
  (function reveal() {
    const els = $$("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const delay = e.target.getAttribute("data-reveal-delay") || 0;
          e.target.style.setProperty("--reveal-delay", delay + "ms");
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
  })();

  /* =====================================================
     2. Navigation — stuck on scroll
     ===================================================== */
  (function nav() {
    const nav = $("[data-nav]");
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle("is-stuck", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  })();

  /* =====================================================
     3. Capabilities — mouse-tracked highlight
     ===================================================== */
  (function caps() {
    const cards = $$(".cap");
    cards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--mx", "-200px");
        card.style.setProperty("--my", "-200px");
      });
    });
  })();

  /* =====================================================
     4. Reasoning demo
     ===================================================== */
  (function reasoning() {
    const root = $("[data-reasoning]");
    if (!root) return;

    const runBtn = $("[data-reasoning-run]", root);
    const runLabel = $("[data-reasoning-run-label]", root);
    const traceEl = $("[data-trace]", root);
    const answerEl = $("[data-reasoning-answer]", root);
    const answerText = $(".reasoning__answer-text", root);
    const bar = $("[data-reasoning-bar]", root);
    const tokensLabel = $("[data-reasoning-tokens]", root);

    const STEPS = [
      {
        label: "Уточнение условия",
        text:
          "Три выключателя, одна лампа в соседней комнате. Зайти можно только " +
          "один раз. Цель — собрать максимум информации до входа.",
      },
      {
        label: "Анализ информационной ёмкости",
        text:
          "Каждый выключатель даёт два состояния: вкл/выкл. Один заход в комнату " +
          "даёт мне видимый сигнал — горит/не горит. Двух бит мало для различения " +
          "трёх вариантов.",
      },
      {
        label: "Поиск дополнительного канала",
        text:
          "Лампа — не только источник света. Она имеет инерцию: разогревается со " +
          "временем и медленно остывает. Это _скрытое_ измерение, которое можно " +
          "проверить рукой.",
      },
      {
        label: "Конструирование стратегии",
        text:
          "Включаю первый выключатель и жду 5 минут — лампа успеет нагреться. " +
          "Выключаю первый, тут же включаю второй. Иду в соседнюю комнату.",
      },
      {
        label: "Декодирование",
        text:
          "Если лампа _горит_ — это второй. Если _не горит, но тёплая_ — это первый. " +
          "Если _не горит и холодная_ — третий.",
      },
      {
        label: "Самопроверка",
        text:
          "Каждый из трёх случаев различим. Решение использует время и тепло как " +
          "дополнительные каналы информации, обходя ограничение «один заход».",
      },
    ];

    const ANSWER =
      "Включи первый выключатель и подожди пять минут. Выключи его и сразу включи " +
      "второй. Войди. <em>Горит</em> — второй; <em>тёплая</em> — первый; " +
      "<em>холодная</em> — третий.";

    let running = false;

    const setBudget = (used, total) => {
      const pct = Math.min(used / total, 1);
      bar.style.right = (1 - pct) * 100 + "%";
      tokensLabel.textContent = `${used} / ${total} токенов`;
    };

    async function typeText(el, text, speed) {
      // Reveal text gradually; supports italics via _word_ markdown
      const tokens = text.split(/(\s+)/);
      let html = "";
      const finalize = () => {
        // After full text typed, replace _x_ with <em>x</em>
        el.innerHTML = el.innerHTML.replace(/_([^_]+)_/g, "<em>$1</em>");
      };

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\s+$/.test(t)) {
          html += t;
          el.textContent = html;
          continue;
        }
        // Type letter by letter for words
        for (let j = 0; j < t.length; j++) {
          html += t[j];
          el.textContent = html;
          await sleep(speed + (Math.random() * 18 - 9));
        }
      }
      finalize();
    }

    async function run() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      runLabel.textContent = "Идёт рассуждение…";

      // Reset UI
      traceEl.innerHTML = "";
      answerEl.hidden = true;
      answerText.innerHTML = "";
      setBudget(0, 1280);

      let used = 0;
      const total = 1280;

      for (let i = 0; i < STEPS.length; i++) {
        const s = STEPS[i];
        const li = document.createElement("li");
        li.className = "trace__step";
        li.innerHTML = `
          <span class="trace__label">${escHtml(s.label)}</span>
          <p class="trace__text"></p>
        `;
        traceEl.appendChild(li);

        // small delay before reveal class
        await sleep(140);
        li.classList.add("is-in");

        // Caret while thinking
        const textEl = $(".trace__text", li);
        textEl.innerHTML = '<span class="trace__caret"></span>';
        await sleep(reduceMotion ? 0 : 360);

        textEl.innerHTML = "";
        await typeText(textEl, s.text, reduceMotion ? 0 : 14);

        // Update budget proportionally
        const stepCost = 80 + Math.floor(s.text.length * 1.6);
        used += stepCost;
        setBudget(used, total);

        await sleep(reduceMotion ? 0 : 240);
      }

      // Final answer
      answerEl.hidden = false;
      await sleep(160);
      answerText.innerHTML = ANSWER;

      runBtn.disabled = false;
      runLabel.textContent = "Запустить ещё раз";
      running = false;
    }

    runBtn.addEventListener("click", run);

    // Auto-run when section first enters view
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !running && traceEl.children.length === 0) {
              setTimeout(run, 400);
              io.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      io.observe(root);
    }
  })();

  /* =====================================================
     5. Code editor demo
     ===================================================== */
  (function codeEditor() {
    const editor = $("[data-editor]");
    if (!editor) return;

    const codeEl = $("[data-editor-code]", editor);
    const gutterEl = $("[data-editor-gutter]", editor);
    const promptEl = $("[data-editor-prompt]", editor);
    const metaEl = $("[data-editor-meta]", editor);
    const statusEl = $("[data-editor-status]", editor);
    const statusDot = $("[data-editor-status-dot]", editor);
    const statsEl = $("[data-editor-stats]", editor);
    const tabs = $$("[data-editor-tab]", editor);

    /* ---------- Snippets ---------- */
    const SNIPPETS = {
      ts: {
        lang: "ts",
        name: "debounce.ts",
        meta: "TypeScript · 1.4 KB",
        prompt:
          "Реализуй типобезопасный debounce с поддержкой leading/trailing, " +
          "отменой и ожиданием результата. Без зависимостей.",
        code:
`// Возвращает дебаунсированную функцию с управлением жизненным циклом.
// Сохраняет типы аргументов и возвращаемого значения.
type DebouncedFn<A extends unknown[], R> = {
  (...args: A): Promise<R>;
  cancel: () => void;
  flush: () => Promise<R | undefined>;
};

interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R | Promise<R>,
  wait: number,
  options: DebounceOptions = {}
): DebouncedFn<A, R> {
  const { leading = false, trailing = true } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<R> | null = null;
  let resolve: ((v: R) => void) | null = null;
  let lastArgs: A | null = null;

  const invoke = async (args: A): Promise<R> => {
    lastArgs = null;
    return await fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (!pending) {
      pending = new Promise<R>((r) => (resolve = r));
    }
    if (leading && !timer) {
      invoke(args).then((v) => resolve && resolve(v));
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (trailing && lastArgs) {
        const v = await invoke(lastArgs);
        resolve && resolve(v);
        pending = null;
      }
    }, wait);
    return pending;
  }) as DebouncedFn<A, R>;

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    pending = null;
  };

  debounced.flush = async () => {
    if (!lastArgs) return undefined;
    const v = await invoke(lastArgs);
    resolve && resolve(v);
    pending = null;
    return v;
  };

  return debounced;
}`,
      },

      py: {
        lang: "py",
        name: "retry.py",
        meta: "Python · 0.8 KB",
        prompt:
          "Асинхронная обёртка retry с экспоненциальной задержкой и full jitter. " +
          "С аккуратной типизацией и понятным поведением на последней попытке.",
        code:
`from typing import Callable, Awaitable, TypeVar
import asyncio
import random

T = TypeVar("T")

async def retry(
    fn: Callable[..., Awaitable[T]],
    *args,
    attempts: int = 5,
    base_delay: float = 0.4,
    max_delay: float = 8.0,
    jitter: float = 0.25,
) -> T:
    """Экспоненциальная задержка с full jitter.
    Re-raises исходное исключение, если все попытки исчерпаны."""
    last_exc: Exception | None = None
    for n in range(attempts):
        try:
            return await fn(*args)
        except Exception as exc:
            last_exc = exc
            if n == attempts - 1:
                break
            delay = min(base_delay * (2 ** n), max_delay)
            delay *= 1 + random.uniform(-jitter, jitter)
            await asyncio.sleep(max(0.0, delay))
    assert last_exc is not None
    raise last_exc`,
      },

      rs: {
        lang: "rs",
        name: "cache.rs",
        meta: "Rust · 1.1 KB",
        prompt:
          "Минимальный потокобезопасный LRU-кэш с фиксированной ёмкостью. " +
          "Без внешних крейтов.",
        code:
`use std::collections::HashMap;
use std::hash::Hash;

/// Минимальный LRU без двойного списка: используем тики обращений.
/// Подходит для небольших ёмкостей (до ~10k).
pub struct Lru<K, V> {
    cap: usize,
    map: HashMap<K, (V, u64)>,
    tick: u64,
}

impl<K: Eq + Hash + Clone, V> Lru<K, V> {
    pub fn new(cap: usize) -> Self {
        Self { cap, map: HashMap::with_capacity(cap), tick: 0 }
    }

    pub fn get(&mut self, k: &K) -> Option<&V> {
        self.tick += 1;
        let t = self.tick;
        let entry = self.map.get_mut(k)?;
        entry.1 = t;
        Some(&entry.0)
    }

    pub fn put(&mut self, k: K, v: V) {
        self.tick += 1;
        if self.map.len() >= self.cap && !self.map.contains_key(&k) {
            if let Some(oldest) = self
                .map
                .iter()
                .min_by_key(|(_, (_, ts))| *ts)
                .map(|(k, _)| k.clone())
            {
                self.map.remove(&oldest);
            }
        }
        self.map.insert(k, (v, self.tick));
    }

    pub fn len(&self) -> usize { self.map.len() }
}`,
      },
    };

    /* ---------- Tokenizer ---------- */
    const KEYWORDS = {
      ts: new Set([
        "type","interface","export","function","const","let","var","if","else","return",
        "async","await","new","as","class","extends","implements","this","public","private",
        "protected","static","readonly","import","from","default","of","in","for","while",
        "true","false","null","undefined","typeof","keyof","void"
      ]),
      py: new Set([
        "from","import","def","async","await","return","if","else","elif","for","while",
        "in","not","and","or","True","False","None","class","self","try","except","finally",
        "raise","with","as","yield","pass","break","continue","lambda","is","assert"
      ]),
      rs: new Set([
        "fn","let","mut","pub","use","struct","impl","enum","trait","self","Self","for",
        "while","if","else","return","match","as","where","async","await","move","ref",
        "crate","mod","dyn","Some","None","Ok","Err"
      ]),
    };

    const TYPES = {
      ts: new Set([
        "string","number","boolean","any","void","unknown","never","Promise","Array",
        "ReturnType","Map","Set","Date","Error"
      ]),
      py: new Set([
        "Callable","TypeVar","Any","Awaitable","Exception","Optional","List","Dict","Tuple"
      ]),
      rs: new Set([
        "HashMap","Vec","Option","Result","String","u8","u16","u32","u64","i32","i64","usize",
        "isize","f32","f64","bool","Eq","Hash","Clone","Copy","Send","Sync"
      ]),
    };

    function tokenize(code, lang) {
      const k = KEYWORDS[lang] || new Set();
      const t = TYPES[lang] || new Set();
      const tokens = [];
      let i = 0;
      const len = code.length;

      while (i < len) {
        const c = code[i];

        // Whitespace (preserved)
        if (/\s/.test(c)) {
          let j = i;
          while (j < len && /\s/.test(code[j])) j++;
          tokens.push({ t: "ws", v: code.slice(i, j) });
          i = j;
          continue;
        }

        // Line comments
        if ((lang === "ts" || lang === "rs") && c === "/" && code[i + 1] === "/") {
          let end = code.indexOf("\n", i);
          if (end === -1) end = len;
          tokens.push({ t: "com", v: code.slice(i, end) });
          i = end;
          continue;
        }
        if ((lang === "rs") && c === "/" && code[i + 1] === "/" && code[i + 2] === "/") {
          // already handled above
        }
        if (lang === "py" && c === "#") {
          let end = code.indexOf("\n", i);
          if (end === -1) end = len;
          tokens.push({ t: "com", v: code.slice(i, end) });
          i = end;
          continue;
        }

        // Triple-quoted strings (Python)
        if (lang === "py" && code.slice(i, i + 3) === '"""') {
          let end = code.indexOf('"""', i + 3);
          if (end === -1) end = len;
          else end += 3;
          tokens.push({ t: "str", v: code.slice(i, end) });
          i = end;
          continue;
        }

        // Strings
        if (c === '"' || c === "'" || c === "`") {
          const quote = c;
          let j = i + 1;
          while (j < len) {
            if (code[j] === "\\") { j += 2; continue; }
            if (code[j] === quote) { j++; break; }
            j++;
          }
          tokens.push({ t: "str", v: code.slice(i, j) });
          i = j;
          continue;
        }

        // Numbers
        if (/[0-9]/.test(c)) {
          let j = i;
          while (j < len && /[0-9._]/.test(code[j])) j++;
          tokens.push({ t: "num", v: code.slice(i, j) });
          i = j;
          continue;
        }

        // Identifiers
        if (/[A-Za-z_$]/.test(c)) {
          let j = i;
          while (j < len && /[A-Za-z0-9_$]/.test(code[j])) j++;
          const word = code.slice(i, j);
          let type = "id";
          if (k.has(word)) type = "key";
          else if (t.has(word)) type = "type";
          else if (code[j] === "(" || (lang === "ts" && code[j] === "<")) type = "fn";
          else if (/^[A-Z]/.test(word)) type = "type";
          tokens.push({ t: type, v: word });
          i = j;
          continue;
        }

        // Punctuation
        if (/[{}()\[\]<>,;:.]/.test(c)) {
          tokens.push({ t: "punc", v: c });
          i++;
          continue;
        }

        // Operators (group consecutive op chars)
        let j = i;
        while (j < len && /[+\-*/%=&|!?^~]/.test(code[j])) j++;
        if (j > i) {
          tokens.push({ t: "op", v: code.slice(i, j) });
          i = j;
          continue;
        }

        // Fallback single char
        tokens.push({ t: "id", v: c });
        i++;
      }

      return tokens;
    }

    function renderUpTo(tokens, limit) {
      let html = "";
      let count = 0;
      for (const tok of tokens) {
        if (count >= limit) break;
        const remaining = limit - count;
        const text = tok.v.length <= remaining ? tok.v : tok.v.slice(0, remaining);
        if (tok.t === "ws") {
          html += escHtml(text);
        } else {
          html += `<span class="tok-${tok.t}">${escHtml(text)}</span>`;
        }
        count += text.length;
      }
      return html;
    }

    function buildGutter(lines) {
      let g = "";
      for (let i = 1; i <= lines; i++) {
        g += String(i).padStart(2, "0") + "\n";
      }
      return g;
    }

    /* ---------- State ---------- */
    let activeLang = "ts";
    let typingAbort = 0; // increments on each tab change to abort previous

    function setStatus(state, label) {
      statusDot.classList.remove("is-thinking", "is-done");
      if (state === "thinking" || state === "typing") statusDot.classList.add("is-thinking");
      if (state === "done") statusDot.classList.add("is-done");
      statusEl.textContent = label;
    }

    async function play(lang) {
      const snip = SNIPPETS[lang];
      if (!snip) return;
      activeLang = lang;
      const myToken = ++typingAbort;

      // Update tabs UI
      tabs.forEach((b) => b.classList.toggle("is-active", b.dataset.editorTab === lang));
      promptEl.textContent = snip.prompt;
      metaEl.textContent = snip.meta;
      codeEl.innerHTML = "";
      gutterEl.textContent = "";
      statsEl.textContent = "0 строк · 0 мс";

      setStatus("thinking", "Думает…");
      await sleep(reduceMotion ? 0 : 520);
      if (myToken !== typingAbort) return;

      const tokens = tokenize(snip.code, snip.lang);
      const total = snip.code.length;
      const start = performance.now();

      setStatus("typing", "Печатает…");

      // Adaptive speed: more chars at once for long files (keeps time bounded)
      const targetMs = reduceMotion ? 0 : 4200;
      const charsPerTick = Math.max(2, Math.ceil(total / (targetMs / 16)));

      let shown = 0;
      while (shown < total) {
        if (myToken !== typingAbort) return;
        // Pause briefly at newlines for natural rhythm
        const next = Math.min(total, shown + charsPerTick);

        // Look for newline within the next chunk and prefer to break there
        const newlineAt = snip.code.indexOf("\n", shown);
        const breakAt =
          newlineAt !== -1 && newlineAt < next ? newlineAt + 1 : next;

        shown = breakAt;
        codeEl.innerHTML =
          renderUpTo(tokens, shown) +
          (shown < total ? '<span class="editor__caret is-typing">▍</span>' : "");

        // Update gutter to current line count
        const lines = snip.code.slice(0, shown).split("\n").length;
        gutterEl.textContent = buildGutter(lines);

        // Stats
        const elapsed = Math.round(performance.now() - start);
        statsEl.textContent = `${lines} строк · ${elapsed} мс`;

        // Auto-scroll if overflowing
        codeEl.parentElement.scrollTop = codeEl.scrollHeight;

        // Pause longer at newline to feel natural
        const pause =
          newlineAt !== -1 && newlineAt < next
            ? reduceMotion ? 0 : 38 + Math.random() * 28
            : reduceMotion ? 0 : 14;
        await sleep(pause);
      }

      // Final render without caret
      codeEl.innerHTML = renderUpTo(tokens, total);
      const elapsed = Math.round(performance.now() - start);
      const finalLines = snip.code.split("\n").length;
      gutterEl.textContent = buildGutter(finalLines);
      statsEl.textContent = `${finalLines} строк · ${elapsed} мс`;
      setStatus("done", "Готово");
    }

    /* ---------- Tab clicks ---------- */
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const lang = tab.dataset.editorTab;
        if (lang === activeLang) return;
        play(lang);
      });
    });

    /* ---------- Auto-start when section enters view ---------- */
    let started = false;
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !started) {
              started = true;
              play("ts");
              io.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      io.observe(editor);
    } else {
      play("ts");
    }
  })();

  /* =====================================================
     6. Benchmarks — animated bars on view
     ===================================================== */
  (function benchmarks() {
    const root = $("[data-bench]");
    if (!root) return;
    const rows = $$("[data-bench-row]", root);

    const runRow = (row) => {
      const prev = parseFloat(row.dataset.prev);
      const now = parseFloat(row.dataset.now);
      const max = parseFloat(row.dataset.max) || 100;
      const prevFill = $(".bench-bar--prev .bench-bar__fill", row);
      const nowFill = $(".bench-bar--now .bench-bar__fill", row);
      // Stagger: prev first, now slightly after
      requestAnimationFrame(() => {
        prevFill.style.width = (prev / max) * 100 + "%";
        setTimeout(() => {
          nowFill.style.width = (now / max) * 100 + "%";
        }, 220);
      });
    };

    if (!("IntersectionObserver" in window)) {
      rows.forEach(runRow);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = rows.indexOf(e.target);
            setTimeout(() => runRow(e.target), idx * 90);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    rows.forEach((row) => io.observe(row));
  })();

  /* =====================================================
     7. Form — quiet feedback (no backend)
     ===================================================== */
  (function form() {
    const f = $("[data-form]");
    if (!f) return;
    const label = $("[data-form-label]", f);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = f.querySelector("input[type=email]");
      if (!input || !input.checkValidity()) {
        input?.focus();
        return;
      }
      const original = label.textContent;
      label.textContent = "Заявка принята";
      const btn = label.closest("button");
      btn.disabled = true;
      btn.style.opacity = "0.65";
      input.disabled = true;
      setTimeout(() => {
        // soft reset (re-enables form for repeated demos)
        label.textContent = original;
        btn.disabled = false;
        btn.style.opacity = "";
        input.disabled = false;
        input.value = "";
      }, 4500);
    });
  })();

  /* =====================================================
     8. Smooth in-page anchor offset (compensate fixed nav)
     ===================================================== */
  (function anchors() {
    const navEl = $("[data-nav]");
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (!id || id === "#" || id === "#top") return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        const offset = (navEl?.offsetHeight || 64) + 16;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  })();
})();
