// Live Shows page: hides days that have passed, labels Today and Tomorrow, filters by venue and search.
(function () {
  var venueSel = document.getElementById('venue-filter');
  var search = document.getElementById('show-search');
  var count = document.getElementById('show-count');
  var empty = document.getElementById('show-empty');
  var days = Array.prototype.slice.call(document.querySelectorAll('.day'));
  if (!days.length) return;

  function iso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  var now = new Date();
  var today = iso(now);
  var tomorrow = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  days.forEach(function (d) {
    var date = d.getAttribute('data-date');
    var label = d.querySelector('.day-label');
    if (date === today) label.textContent = 'Today, ' + label.getAttribute('data-label');
    else if (date === tomorrow) label.textContent = 'Tomorrow, ' + label.getAttribute('data-label');
  });

  function apply() {
    var venue = venueSel ? venueSel.value : '';
    var q = search ? search.value.trim().toLowerCase() : '';
    var shown = 0;
    days.forEach(function (d) {
      var date = d.getAttribute('data-date');
      var past = date < today;
      var any = false;
      Array.prototype.forEach.call(d.querySelectorAll('.show'), function (li) {
        var ok = !past &&
          (!venue || li.getAttribute('data-venue') === venue) &&
          (!q || li.getAttribute('data-text').indexOf(q) !== -1);
        li.hidden = !ok;
        if (ok) { any = true; shown++; }
      });
      d.hidden = !any;
    });
    if (count) count.textContent = shown + (shown === 1 ? ' show' : ' shows');
    if (empty) empty.hidden = shown !== 0;
  }

  if (venueSel) venueSel.addEventListener('change', apply);
  if (search) search.addEventListener('input', apply);
  apply();
})();
