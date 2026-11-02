(function () {
  var box = document.getElementById('results');
  var input = document.getElementById('sq');
  var nostBox = document.getElementById('snost');
  var count = document.getElementById('scount');
  if (!box || !input) return;

  var index = [];
  var MAX = 100;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function render(list, total) {
    box.textContent = '';
    list.forEach(function (r) {
      var card = el('article', 'card' + (r.n ? ' nostalgic' : ''));
      var h = el('h3', 'card-title');
      var a = el('a', '', r.t);
      a.href = r.u;
      a.rel = 'noopener';
      h.appendChild(a);
      card.appendChild(h);
      var meta = el('p', 'meta');
      meta.appendChild(el('span', 'source', r.s));
      meta.appendChild(document.createTextNode(fmt(r.d)));
      if (r.n) meta.appendChild(el('span', 'badge', 'Nostalgia ' + r.n));
      card.appendChild(meta);
      if (r.x) card.appendChild(el('p', 'excerpt', r.x));
      box.appendChild(card);
    });
    count.textContent = total > list.length
      ? 'Showing the first ' + list.length + ' of ' + total + ' matches'
      : total + (total === 1 ? ' match' : ' matches');
  }

  function run() {
    var words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length && !nostBox.checked) {
      box.textContent = '';
      count.textContent = index.length + ' stories in the index. Type to search.';
      return;
    }
    var hits = [];
    index.forEach(function (r) {
      if (nostBox.checked && !r.n) return;
      var hay = (r.t + ' ' + r.s + ' ' + r.x + ' ' + r.g.join(' ')).toLowerCase();
      var title = r.t.toLowerCase();
      var pts = 0;
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) === -1) return;
        pts += title.indexOf(words[i]) !== -1 ? 3 : 1;
      }
      hits.push({ r: r, pts: pts });
    });
    hits.sort(function (a, b) {
      return b.pts - a.pts || String(b.r.d).localeCompare(String(a.r.d));
    });
    render(hits.slice(0, MAX).map(function (h) { return h.r; }), hits.length);
  }

  count.textContent = 'Loading the index...';
  fetch(box.getAttribute('data-index'))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      index = data;
      input.addEventListener('input', run);
      nostBox.addEventListener('change', run);
      run();
    })
    .catch(function () {
      count.textContent = 'The search index could not be loaded. Try again later.';
    });
})();
