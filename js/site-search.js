/* Lightweight client-side site search — fetches /search-index.json once
   (build script generates this), filters as user types, shows dropdown.
   Plain-vanilla, no dependencies, ~3 KB.
*/
(function(){
  let index = null;
  let indexLoading = false;
  let resultBox = null;

  function ensureBox(input){
    if (resultBox) return resultBox;
    resultBox = document.createElement('div');
    resultBox.className = 'search-results';
    resultBox.setAttribute('role', 'listbox');
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(resultBox);
    return resultBox;
  }

  function loadIndex(callback){
    if (index) { callback(index); return; }
    if (indexLoading) return;
    indexLoading = true;
    fetch('/search-index.json')
      .then(r => r.json())
      .then(data => { index = data; indexLoading = false; callback(index); })
      .catch(() => { indexLoading = false; });
  }

  function search(q, idx){
    q = q.toLowerCase().trim();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/);
    return idx.map(item => {
      const hay = (item.t + ' ' + item.d + ' ' + (item.k || '')).toLowerCase();
      let score = 0;
      for (const t of tokens) {
        const i = hay.indexOf(t);
        if (i < 0) return null;
        score += i < 50 ? 3 : 1;
      }
      return { item, score };
    }).filter(Boolean).sort((a,b) => b.score - a.score).slice(0, 8).map(x => x.item);
  }

  function render(input, results){
    const box = ensureBox(input);
    if (results.length === 0) { box.innerHTML = '<div class="search-empty">No matches — try different keywords or <a href="/contact/">contact us</a> directly.</div>'; box.style.display = 'block'; return; }
    box.innerHTML = results.map(r => `
      <a href="${r.u}" class="search-result" role="option">
        <div class="search-result-title">${r.t}</div>
        <div class="search-result-desc">${r.d.slice(0,140)}${r.d.length > 140 ? '…' : ''}</div>
        <div class="search-result-url">${r.u}</div>
      </a>
    `).join('');
    box.style.display = 'block';
  }

  function attach(input){
    let debounceTimer;
    input.addEventListener('input', function(){
      clearTimeout(debounceTimer);
      const q = input.value;
      if (q.length < 2) { if (resultBox) resultBox.style.display = 'none'; return; }
      debounceTimer = setTimeout(() => {
        loadIndex(idx => render(input, search(q, idx)));
      }, 150);
    });
    input.addEventListener('focus', () => loadIndex(()=>{}));
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && resultBox && !resultBox.contains(e.target)) {
        if (resultBox) resultBox.style.display = 'none';
      }
    });
  }

  // Attach to any input with data-site-search attribute
  function init(){
    const inputs = document.querySelectorAll('[data-site-search]');
    inputs.forEach(attach);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
