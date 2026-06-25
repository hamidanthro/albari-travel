/* Umrah cost calculator — pure client-side, no backend.
   Renders into <div id="umrah-cost-calc"></div> on /services/hajj-and-umrah/.
*/
(function(){
  const target = document.getElementById('umrah-cost-calc');
  if (!target) return;

  // Base per-person PKR ranges (Economy / Standard / Premium) for a 14-day non-Ramadan, non-Hajj Umrah package
  const baseLow  = { economy: 235000, standard: 335000, premium: 510000 };
  const baseHigh = { economy: 290000, standard: 410000, premium: 750000 };

  // Multipliers (rough, indicative)
  const monthMult = {
    'jan': 0.92, 'feb': 0.88, 'mar': 1.00, 'apr': 1.10,
    'ramadan-first10': 1.65, 'ramadan-last10': 2.20,
    'may': 1.00, 'aug': 0.85, 'sep': 0.85, 'oct': 0.90,
    'nov': 0.85, 'dec-early': 0.92, 'dec-break': 1.45,
  };

  // Children: 75% adult; infants (<2): 10% adult
  const html = `
    <div class="calc-wrap">
      <h3 class="calc-title">Quick Umrah cost estimator</h3>
      <p class="calc-sub">2026 indicative — for an exact quote, WhatsApp your Regional Rep.</p>
      <div class="calc-grid">
        <div class="calc-field">
          <label for="calc-tier">Tier</label>
          <select id="calc-tier">
            <option value="economy">Economy (3-star, 500m+ from Haram)</option>
            <option value="standard" selected>Standard (4-star, 200&ndash;400m)</option>
            <option value="premium">Premium (5-star, within 200m)</option>
          </select>
        </div>
        <div class="calc-field">
          <label for="calc-month">Travel month</label>
          <select id="calc-month">
            <option value="nov">November (cheapest)</option>
            <option value="feb" selected>February</option>
            <option value="jan">January</option>
            <option value="oct">October</option>
            <option value="sep">September</option>
            <option value="aug">August</option>
            <option value="mar">March</option>
            <option value="apr">April</option>
            <option value="dec-early">Early December</option>
            <option value="dec-break">Late December (school break)</option>
            <option value="ramadan-first10">Ramadan — first 10 nights</option>
            <option value="ramadan-last10">Ramadan — last 10 nights (peak)</option>
          </select>
        </div>
        <div class="calc-field">
          <label for="calc-adults">Adults (12+)</label>
          <input type="number" id="calc-adults" min="1" max="20" value="2">
        </div>
        <div class="calc-field">
          <label for="calc-children">Children (2&ndash;11)</label>
          <input type="number" id="calc-children" min="0" max="10" value="0">
        </div>
        <div class="calc-field">
          <label for="calc-infants">Infants (under 2)</label>
          <input type="number" id="calc-infants" min="0" max="5" value="0">
        </div>
      </div>
      <div class="calc-result">
        <div class="calc-result-label">Estimated total range:</div>
        <div class="calc-result-amount" id="calc-amount">PKR — &ndash; —</div>
        <div class="calc-result-note" id="calc-note"></div>
        <a id="calc-wa" href="#" target="_blank" rel="noopener" class="btn btn-primary" style="margin-top:18px;display:inline-block;">Send to Regional Rep on WhatsApp</a>
      </div>
    </div>
  `;
  target.innerHTML = html;

  function fmt(n){ return 'PKR ' + Math.round(n/1000)*1000 .toLocaleString('en-PK') + (n >= 1000 ? '' : ''); }
  function fmtPKR(n){ return 'PKR ' + (Math.round(n/1000)*1000).toLocaleString('en-PK'); }

  function recalc() {
    const tier = document.getElementById('calc-tier').value;
    const month = document.getElementById('calc-month').value;
    const adults = parseInt(document.getElementById('calc-adults').value, 10) || 0;
    const children = parseInt(document.getElementById('calc-children').value, 10) || 0;
    const infants = parseInt(document.getElementById('calc-infants').value, 10) || 0;

    const mult = monthMult[month] || 1.0;
    const adultLow = baseLow[tier] * mult;
    const adultHigh = baseHigh[tier] * mult;
    const childLow = adultLow * 0.75;
    const childHigh = adultHigh * 0.75;
    const infantLow = adultLow * 0.10;
    const infantHigh = adultHigh * 0.10;

    const totalLow = adults * adultLow + children * childLow + infants * infantLow;
    const totalHigh = adults * adultHigh + children * childHigh + infants * infantHigh;

    document.getElementById('calc-amount').textContent = fmtPKR(totalLow) + ' – ' + fmtPKR(totalHigh);

    let note = adults + ' adult' + (adults !== 1 ? 's' : '');
    if (children > 0) note += ', ' + children + ' child' + (children !== 1 ? 'ren' : '');
    if (infants > 0) note += ', ' + infants + ' infant' + (infants !== 1 ? 's' : '');
    note += ' · ' + month + ' departure · ' + tier + ' tier';
    document.getElementById('calc-note').textContent = note;

    // WhatsApp link
    const msg = 'Hi, I\'d like an Umrah quote.\n' +
      'Tier: ' + tier + '\n' +
      'Travel month: ' + month + '\n' +
      'Adults: ' + adults + ', Children: ' + children + ', Infants: ' + infants + '\n' +
      'Estimated range from your calculator: ' + fmtPKR(totalLow) + ' – ' + fmtPKR(totalHigh);
    document.getElementById('calc-wa').href = 'https://wa.me/923159596161?text=' + encodeURIComponent(msg);
  }

  ['calc-tier','calc-month','calc-adults','calc-children','calc-infants'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalc);
    document.getElementById(id).addEventListener('change', recalc);
  });
  recalc();
})();
