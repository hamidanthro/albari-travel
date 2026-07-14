/* Al Bari Travel — video showcase.
 * Auto-scrolling (right-to-left) marquee of YouTube videos with a click-to-play
 * lightbox. Works for ANY number of videos: to add one, add a <button class="vm-card"
 * data-yt="ID" data-title="..."> in index.html — no changes needed here.
 */
(function () {
  'use strict';
  var track = document.getElementById('vmTrack');
  var modal = document.getElementById('vmModal');
  if (!track || !modal) return;

  var GAP = 20; // must match .vm-track gap in CSS
  var SPEED = 0.225; // px per frame (~13.5px/sec at 60fps)
  var player = document.getElementById('vmModalPlayer');
  var closeBtn = document.getElementById('vmModalClose');
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Build each card's thumbnail + play button + title from its data attributes.
  function buildCard(card) {
    var id = card.getAttribute('data-yt');
    var title = card.getAttribute('data-title') || '';
    card.setAttribute('aria-label', 'Play video: ' + title);
    card.innerHTML =
      '<span class="vm-thumb" style="background-image:url(https://i.ytimg.com/vi/' + id + '/hqdefault.jpg)">' +
      '<span class="vm-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' +
      '</span>' +
      (title ? '<span class="vm-title" dir="auto">' + title + '</span>' : '');
  }

  var originals = Array.prototype.slice.call(track.querySelectorAll('.vm-card'));
  if (!originals.length) return;
  originals.forEach(buildCard);

  // --- Fill the track with enough clones to cover 2x the viewport for a seamless loop.
  var viewport = track.parentElement;
  function ensureFilled() {
    var need = viewport.offsetWidth * 2 + 400;
    var guard = 0;
    while (track.scrollWidth < need && guard < 60) {
      originals.forEach(function (c) { track.appendChild(c.cloneNode(true)); });
      guard++;
    }
  }
  ensureFilled();

  // --- Recycling right-to-left animation: shift left; when the first card is fully
  // off-screen, move it to the end. Handles any card count, no visible seam.
  var offset = 0, raf = null, paused = false;
  function frame() {
    if (!paused) {
      offset -= SPEED;
      var first = track.firstElementChild;
      if (first && -offset >= first.offsetWidth + GAP) {
        offset += first.offsetWidth + GAP;
        track.appendChild(first);
      }
      track.style.transform = 'translateX(' + offset + 'px)';
    }
    raf = requestAnimationFrame(frame);
  }
  if (!prefersReduced) {
    raf = requestAnimationFrame(frame);
    // Pause while hovering / touching so people can aim at a video.
    track.addEventListener('mouseenter', function () { paused = true; });
    track.addEventListener('mouseleave', function () { paused = false; });
    window.addEventListener('resize', ensureFilled);
  } else {
    // Reduced-motion: no auto-scroll, allow manual horizontal scroll instead.
    viewport.style.overflowX = 'auto';
  }

  // --- Lightbox (event delegation so cloned cards work too).
  function openVideo(id) {
    paused = true;
    player.innerHTML =
      '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0&modestbranding=1" title="Al Bari Travel video" frameborder="0" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
      'allowfullscreen></iframe>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function closeVideo() {
    modal.hidden = true;
    player.innerHTML = ''; // stop playback
    document.body.style.overflow = '';
    paused = false;
  }
  track.addEventListener('click', function (e) {
    var card = e.target.closest('.vm-card');
    if (card) openVideo(card.getAttribute('data-yt'));
  });
  closeBtn.addEventListener('click', closeVideo);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeVideo(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeVideo(); });
})();
