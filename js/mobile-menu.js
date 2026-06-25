/* Mobile menu drawer — slides in from the side, dimmed backdrop,
   ESC + outside-click + close-button all dismiss.
   Vanilla JS, no dependencies, < 1 KB.
*/
(function(){
  function init(){
    const toggle = document.getElementById('mobile-menu-toggle');
    const drawer = document.getElementById('mobile-menu');
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if (!toggle || !drawer) return;

    const closeBtn = drawer.querySelector('.mobile-menu-close');
    let lastFocused = null;

    function open(){
      lastFocused = document.activeElement;
      drawer.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
      toggle.setAttribute('aria-expanded', 'true');
      // Focus first link
      const firstLink = drawer.querySelector('a, button');
      if (firstLink) setTimeout(() => firstLink.focus(), 100);
    }
    function close(){
      drawer.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      document.body.style.overflow = '';
      toggle.setAttribute('aria-expanded', 'false');
      if (lastFocused) lastFocused.focus();
    }

    toggle.addEventListener('click', () => {
      drawer.classList.contains('open') ? close() : open();
    });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
    // Close when a nav link is clicked (so navigating works smoothly)
    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => setTimeout(close, 50));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
