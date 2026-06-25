/* Exit-intent + scroll-up popup — mobile + desktop, once per session per user.
   Pakistani-friendly: WhatsApp-first CTA, dismissible, no email harvesting.
*/
(function(){
  if (sessionStorage.getItem('ge_exit_dismissed') === '1') return;
  if (sessionStorage.getItem('ge_exit_shown') === '1') return;

  let popupShown = false;
  let lastScrollY = window.scrollY;

  function showPopup(){
    if (popupShown) return;
    popupShown = true;
    sessionStorage.setItem('ge_exit_shown', '1');

    const overlay = document.createElement('div');
    overlay.id = 'exit-popup';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'exit-popup-h');
    overlay.innerHTML = `
      <div class="exit-popup-card" role="document">
        <button class="exit-popup-close" aria-label="Close" type="button">&times;</button>
        <p class="exit-popup-tag">Before you go</p>
        <h3 id="exit-popup-h">Get a free Umrah quote on WhatsApp</h3>
        <p class="exit-popup-body">Tell us your dates and party size — we'll WhatsApp back with options within 4 hours. No spam, no email signup.</p>
        <a href="https://wa.me/923159596161?text=Hi%2C%20I%27d%20like%20a%20free%20Umrah%20quote" target="_blank" rel="noopener" class="btn btn-primary exit-popup-btn">WhatsApp +92 315 9596161</a>
        <button type="button" class="exit-popup-dismiss">No thanks, just browsing</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close(){
      sessionStorage.setItem('ge_exit_dismissed', '1');
      overlay.classList.add('exit-popup-closing');
      document.body.style.overflow = '';
      setTimeout(() => overlay.remove(), 250);
    }
    overlay.querySelector('.exit-popup-close').addEventListener('click', close);
    overlay.querySelector('.exit-popup-dismiss').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  // Desktop: trigger on mouse leaving viewport from the top
  document.addEventListener('mouseout', function(e){
    if (!e.toElement && !e.relatedTarget && e.clientY < 10) showPopup();
  });

  // Mobile: trigger on fast upward scroll after 30% scroll depth (back-button proxy)
  let scrollDirection = 'down';
  window.addEventListener('scroll', function(){
    const y = window.scrollY;
    const doc = document.documentElement;
    const pct = (y + window.innerHeight) / doc.scrollHeight;
    const delta = y - lastScrollY;
    if (delta < -40 && pct > 0.3) showPopup();
    lastScrollY = y;
  }, { passive: true });

  // Fallback: show after 90 seconds if user is still browsing without engaging contact
  setTimeout(showPopup, 90000);
})();
