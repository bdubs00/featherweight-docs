/* The behavior of the shell: the theme menu, the definitions behind a
   question mark, the list pane on a narrow window, the Copy key of a code
   block, the place of the reader in On this page, and the find field. The
   page works without this file; it only adds these conveniences. */
(function () {
  'use strict';
  var root = document.documentElement;
  var base = (window.FW_DOCS && window.FW_DOCS.base) || '.';

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
    return null;
  }

  /* ---------- a menu that opens from a key and closes on Escape ---------- */
  function menu(key, layer, onOpen) {
    function close(focus) {
      layer.hidden = true;
      key.setAttribute('aria-expanded', 'false');
      if (focus) key.focus();
    }
    key.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = layer.hidden;
      layer.hidden = !open;
      key.setAttribute('aria-expanded', String(open));
      if (open && onOpen) onOpen();
    });
    document.addEventListener('click', function (e) {
      if (!layer.hidden && !layer.contains(e.target)) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !layer.hidden) close(true);
    });
    return close;
  }

  /* ---------- the theme: Match the system, Light, Graphite ---------- */
  var themeKey = document.querySelector('.theme-key');
  var themeMenu = document.querySelector('.menu-theme');
  function picked() {
    return root.getAttribute('data-theme') || 'system';
  }
  function mark() {
    var now = picked();
    themeMenu.querySelectorAll('[data-theme-pick]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme-pick') === now));
    });
  }
  if (themeKey && themeMenu) {
    var closeTheme = menu(themeKey, themeMenu, function () {
      mark();
      var on = themeMenu.querySelector('[aria-checked="true"]');
      if (on) on.focus();
    });
    themeMenu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-pick]');
      if (!b) return;
      var t = b.getAttribute('data-theme-pick');
      if (t === 'system') {
        root.removeAttribute('data-theme');
        store('fw-docs-theme', null);
      } else {
        root.setAttribute('data-theme', t);
        store('fw-docs-theme', t);
      }
      mark();
      closeTheme(true);
      document.dispatchEvent(new CustomEvent('fw-theme'));
    });
  }

  /* ---------- a definition behind a question mark ---------- */
  document.querySelectorAll('.help').forEach(function (h) {
    var key = h.querySelector('.help-key');
    var pop = h.querySelector('.help-pop');
    if (key && pop) menu(key, pop);
  });

  /* ---------- the list pane on a narrow window ---------- */
  var shell = document.querySelector('.shell');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-show-list]')) {
      e.preventDefault();
      shell.setAttribute('data-show', 'list');
      window.scrollTo(0, 0);
      var sel = document.querySelector('.list .row.sel') || document.querySelector('.list .row');
      if (sel) sel.focus();
    } else if (e.target.closest('[data-show-main]')) {
      e.preventDefault();
      shell.setAttribute('data-show', 'main');
      document.getElementById('content').focus();
    }
  });

  /* ---------- a path in Sources breaks after a slash, not inside a name ---------- */
  document.querySelectorAll('.details-sources code, .sources-inline code').forEach(function (c) {
    if (c.children.length || c.textContent.indexOf('/') === -1) return;
    var parts = c.textContent.split('/');
    c.textContent = '';
    parts.forEach(function (p, i) {
      if (i) {
        c.appendChild(document.createTextNode('/'));
        c.appendChild(document.createElement('wbr'));
      }
      c.appendChild(document.createTextNode(p));
    });
  });

  /* ---------- tables scroll on their own ---------- */
  document.querySelectorAll('.doc > table').forEach(function (t) {
    var w = document.createElement('div');
    w.className = 'table-wrap';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });

  /* ---------- a filter above a long table of a reference page ---------- */
  document.querySelectorAll('.doc.wide .table-wrap').forEach(function (wrap, n) {
    var rows = Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'));
    if (rows.length < 12) return;
    var id = 'table-filter-' + n;
    var field = document.createElement('div');
    field.className = 'find recess table-filter';
    field.innerHTML =
      '<label class="sr" for="' + id + '">Filter this table</label>' +
      '<input id="' + id + '" type="search" placeholder="Filter ' + rows.length + ' rows" autocomplete="off" spellcheck="false">' +
      '<span class="table-filter-count" aria-live="polite"></span>';
    wrap.parentNode.insertBefore(field, wrap);
    var input = field.querySelector('input');
    var count = field.querySelector('.table-filter-count');
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (r) {
        var on = !q || r.textContent.toLowerCase().indexOf(q) !== -1;
        r.hidden = !on;
        if (on) shown++;
      });
      count.textContent = q ? shown + ' of ' + rows.length : '';
    });
  });

  /* ---------- the Copy key of a code block ---------- */
  document.querySelectorAll('.doc .highlight').forEach(function (block) {
    var code = block.querySelector('code');
    if (!code || !navigator.clipboard) return;
    /* The block is the <pre> that scrolls, so the key goes in a box around
       it, where it stays in place when a long line scrolls. */
    if (block.tagName === 'PRE') {
      var box = document.createElement('div');
      box.className = 'code-block';
      block.parentNode.insertBefore(box, block);
      box.appendChild(block);
      block = box;
    }
    var key = document.createElement('button');
    key.type = 'button';
    key.className = 'key key-s key-quiet copy-key';
    key.textContent = 'Copy';
    key.addEventListener('click', function () {
      navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(function () {
        key.textContent = 'Copied';
        key.setAttribute('data-done', '');
        setTimeout(function () {
          key.textContent = 'Copy';
          key.removeAttribute('data-done');
        }, 1600);
      });
    });
    block.appendChild(key);
  });

  /* ---------- the place of the reader in On this page ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[data-toc]'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) {
      byId[a.getAttribute('data-toc')] = a;
    });
    var heads = links
      .map(function (a) {
        return document.getElementById(a.getAttribute('data-toc'));
      })
      .filter(Boolean);
    var current = null;
    function setOn(id) {
      if (current === id) return;
      current = id;
      links.forEach(function (a) {
        a.classList.toggle('on', a.getAttribute('data-toc') === id);
      });
    }
    function update() {
      var top = 96;
      var id = heads.length ? heads[0].id : null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top - top <= 0) id = heads[i].id;
        else break;
      }
      setOn(id);
    }
    var ticking = false;
    window.addEventListener(
      'scroll',
      function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          update();
        });
      },
      { passive: true }
    );
    update();
  }

  /* ---------- the find field ---------- */
  var input = document.getElementById('find');
  var results = document.getElementById('find-results');
  if (!input || !results) return;
  var index = null;
  var loading = null;

  function load() {
    if (index || loading) return loading;
    loading = fetch(base.replace(/\/$/, '') + '/search/search_index.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        index = (data.docs || []).map(function (d) {
          /* The index puts a space around each tag that it strips, so put
             punctuation back against its word: "fw.run.queued , the" reads
             "fw.run.queued, the". */
          var text = (d.text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/ ([,;:!?)\]])/g, '$1')
            .replace(/ \.(?=\s|$)/g, '.')
            .replace(/([(\[]) /g, '$1')
            .trim();
          return { location: d.location, title: d.title || '', text: text, lower: text.toLowerCase(), ltitle: (d.title || '').toLowerCase() };
        });
        var pages = {};
        index.forEach(function (d) {
          if (d.location.indexOf('#') === -1) pages[d.location] = d.title;
        });
        index.forEach(function (d) {
          var at = d.location.indexOf('#');
          d.page = at === -1 ? '' : pages[d.location.slice(0, at)] || '';
        });
      })
      .catch(function () {
        index = [];
      });
    return loading;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function snippet(d, words) {
    var at = -1;
    for (var i = 0; i < words.length && at === -1; i++) at = d.lower.indexOf(words[i]);
    if (at === -1) return escapeHtml(d.text.slice(0, 110));
    var start = Math.max(0, at - 40);
    var s = (start > 0 ? '…' : '') + d.text.slice(start, start + 120) + (start + 120 < d.text.length ? '…' : '');
    var html = escapeHtml(s);
    words.forEach(function (w) {
      if (w.length < 2) return;
      html = html.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return html;
  }

  function search(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var hits = [];
    index.forEach(function (d) {
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var inTitle = d.ltitle.indexOf(w) !== -1;
        var inText = d.lower.indexOf(w) !== -1;
        if (!inTitle && !inText) return;
        score += inTitle ? 10 : 0;
        score += inText ? 1 : 0;
        if (d.ltitle === w) score += 10;
      }
      if (d.location.indexOf('#') === -1) score += 2;
      hits.push({ d: d, score: score });
    });
    hits.sort(function (a, b) {
      return b.score - a.score;
    });
    return hits.slice(0, 12).map(function (h) {
      return h.d;
    });
  }

  var active = -1;
  function render() {
    var q = input.value.trim();
    if (!q) {
      results.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = search(q);
    active = hits.length ? 0 : -1;
    if (!hits.length) {
      results.innerHTML = '<div class="empty">Nothing matches “' + escapeHtml(q) + '”. Try one word, such as ledger or bridge.</div>';
    } else {
      results.innerHTML = hits
        .map(function (d, i) {
          var where = d.page && d.page !== d.title ? d.page + ': ' : '';
          return (
            '<a role="option" href="' + base.replace(/\/$/, '') + '/' + d.location + '"' + (i === 0 ? ' aria-selected="true"' : '') + '>' +
            '<span class="t">' + escapeHtml(where + d.title) + '</span>' +
            '<span class="s">' + snippet(d, words) + '</span></a>'
          );
        })
        .join('');
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function move(step) {
    var items = results.querySelectorAll('a[role="option"]');
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    items.forEach(function (a, i) {
      a.setAttribute('aria-selected', String(i === active));
    });
    items[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', load);
  input.addEventListener('input', function () {
    var p = load();
    if (index) render();
    else if (p) p.then(render);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      var a = results.querySelector('a[aria-selected="true"]');
      if (a) {
        e.preventDefault();
        window.location.href = a.href;
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      render();
    }
  });
  document.addEventListener('click', function (e) {
    if (!results.hidden && !results.contains(e.target) && e.target !== input) {
      results.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) {
      e.preventDefault();
      if (shell.getAttribute('data-show') !== 'list' && window.matchMedia('(max-width: 819px)').matches) {
        shell.setAttribute('data-show', 'list');
      }
      input.focus();
    }
  });
})();
