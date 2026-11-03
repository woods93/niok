(function () {
  // Show "3h ago" for stories under two days old
  Array.prototype.forEach.call(document.querySelectorAll('time[datetime]'), function (t) {
    var ms = Date.now() - new Date(t.getAttribute('datetime')).getTime();
    if (ms >= 0 && ms < 48 * 3600000) {
      var h = Math.floor(ms / 3600000);
      t.textContent = h < 1 ? 'Just now' : h + 'h ago';
    }
  });

  // Filtering on the front page
  var cards = Array.prototype.slice.call(document.querySelectorAll('#feed .card'));
  var q = document.getElementById('q');
  var src = document.getElementById('src');
  var nost = document.getElementById('nost');
  var count = document.getElementById('count');

  function apply() {
    if (!q) return;
    var term = q.value.trim().toLowerCase();
    var words = term ? term.split(/\s+/) : [];
    var shown = 0;
    cards.forEach(function (c) {
      var text = c.getAttribute('data-text') || '';
      var ok = words.every(function (w) { return text.indexOf(w) !== -1; });
      if (ok && src.value) ok = c.getAttribute('data-source') === src.value;
      if (ok && nost.checked) ok = c.getAttribute('data-nostalgic') === 'yes';
      c.hidden = !ok;
      if (ok) shown += 1;
    });
    count.textContent = shown + ' of ' + cards.length + ' stories';
  }

  if (q) {
    q.addEventListener('input', apply);
    src.addEventListener('change', apply);
    nost.addEventListener('change', apply);
    apply();
  }

  // This day in Nashville music
  var box = document.getElementById('thisday');
  if (box) {
    var entries = [];
    try { entries = JSON.parse(box.getAttribute('data-entries') || '[]'); } catch (e) { entries = []; }
    var now = new Date();
    var m = now.getMonth() + 1;
    var d = now.getDate();
    var today = entries.filter(function (e) { return e.month === m && e.day === d; });
    if (today.length) {
      var list = document.getElementById('thisday-list');
      today.sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
      today.forEach(function (e) {
        var li = document.createElement('li');
        var label = (e.year ? e.year + ': ' : '') + e.event;
        if (e.url) {
          var a = document.createElement('a');
          a.href = e.url;
          a.rel = 'noopener';
          a.textContent = label;
          li.appendChild(a);
        } else {
          li.textContent = label;
        }
        list.appendChild(li);
      });
      box.hidden = false;
    }
  }
})();
