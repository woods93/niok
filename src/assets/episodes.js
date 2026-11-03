(function () {
  // Click a thumbnail to swap in the YouTube player (nocookie domain, loads only on click).
  document.addEventListener('click', function (ev) {
    var link = ev.target.closest && ev.target.closest('.yt-lite');
    if (!link) return;
    var box = link.parentNode;
    var id = box.getAttribute('data-id');
    if (!id) return;
    ev.preventDefault();
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    f.title = box.getAttribute('data-title') || 'Video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.innerHTML = '';
    box.appendChild(f);
  });
})();
