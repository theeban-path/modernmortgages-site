/* ModernMortgages.ca calculators
   Canadian conventions: fixed-rate mortgages compound semi-annually (Interest Act),
   CMHC premiums for < 20% down, minimum down payment rules, stress test (B-20 / insured).
   All results are estimates. */
(function () {
  'use strict';
  var BOOK = 'https://meet.theeban.ca';
  var APPLY = 'https://velocity-client.newton.ca/en/client/journey?shortCode=3vnqzjtlrdep';

  /* ---------- math ---------- */
  function periodicRate(annualPct, perYear) {           // semi-annual compounding
    return Math.pow(1 + annualPct / 100 / 2, 2 / perYear) - 1;
  }
  function pmt(P, i, n) { if (P <= 0) return 0; if (i === 0) return P / n; return P * i / (1 - Math.pow(1 + i, -n)); }
  function pv(pay, i, n) { if (pay <= 0) return 0; if (i === 0) return pay * n; return pay * (1 - Math.pow(1 + i, -n)) / i; }
  function nper(P, i, pay) {                             // periods to pay off P with payment pay
    if (P <= 0) return 0; if (i === 0) return P / pay;
    var x = 1 - P * i / pay; if (x <= 0) return Infinity;
    return -Math.log(x) / Math.log(1 + i);
  }
  function monthlyMortgage(P, ratePct, years) { return pmt(P, periodicRate(ratePct, 12), years * 12); }
  function minDown(price) {
    if (price >= 1500000) return price * 0.20;
    if (price <= 500000) return price * 0.05;
    return 25000 + (price - 500000) * 0.10;
  }
  function maxPriceFromDown(down) {
    if (down <= 25000) return down / 0.05;
    var p = 500000 + (down - 25000) / 0.10;
    if (p < 1500000) return p;
    return Math.max(1499999, down / 0.20);
  }
  function cmhcRate(ltv) {                               // ltv as fraction of price
    if (ltv <= 0.80) return 0;
    if (ltv <= 0.85) return 0.028;
    if (ltv <= 0.90) return 0.031;
    return 0.040;
  }
  function bracketTax(price, brackets) {
    var tax = 0, prev = 0;
    for (var k = 0; k < brackets.length; k++) {
      var cap = brackets[k][0], rate = brackets[k][1];
      if (price > prev) tax += (Math.min(price, cap) - prev) * rate;
      prev = cap;
    }
    return tax;
  }

  /* ---------- formatting ---------- */
  var cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  function $(n) { return isFinite(n) ? cad.format(Math.round(n)).replace('CA', '') : '—'; }
  function pct(n, d) { return (isFinite(n) ? n.toFixed(d == null ? 1 : d) : '—') + '%'; }
  function yrs(periods, perYear) {
    if (!isFinite(periods)) return 'Never';
    var m = Math.ceil(periods * 12 / perYear); var y = Math.floor(m / 12), mo = m % 12;
    return y + ' yr' + (y === 1 ? '' : 's') + (mo ? ' ' + mo + ' mo' : '');
  }

  /* ---------- UI builders ---------- */
  function field(o) {
    // o: id,label,min,max,step,value,prefix,suffix,hint
    return '<div class="field">' +
      '<label for="' + o.id + '-n"><span>' + o.label + (o.hint ? ' <span class="hint" id="' + o.id + '-hint"></span>' : '') + '</span>' +
      '<span class="num">' + (o.prefix ? '<span>' + o.prefix + '</span>' : '') +
      '<input id="' + o.id + '-n" type="number" inputmode="decimal" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + o.value + '">' +
      (o.suffix ? '<span>' + o.suffix + '</span>' : '') + '</span></label>' +
      '<input id="' + o.id + '" type="range" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + o.value + '" aria-label="' + o.label + '">' +
      '</div>';
  }
  function toggle(id, label, checked) {
    return '<label class="toggle"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> ' + label + '</label>';
  }
  function select(id, label, opts) {
    return '<div class="field"><label for="' + id + '"><span>' + label + '</span></label><select id="' + id + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[2] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div>';
  }
  function hero(label, id, subId) {
    return '<div class="result-hero"><div class="k">' + label + '</div><div class="v" id="' + id + '">—</div><div class="s" id="' + subId + '"></div></div>';
  }
  function kv(items) {
    return '<div class="kv">' + items.map(function (it) {
      return '<div><div class="k">' + it[1] + '</div><div class="v" id="' + it[0] + '">—</div></div>';
    }).join('') + '</div>';
  }
  function cta() {
    return '<div class="calc-cta"><a class="btn btn-primary btn-sm" href="' + BOOK + '" target="_blank" rel="noopener">Get my exact numbers</a>' +
      '<a class="btn btn-ghost btn-sm" href="' + APPLY + '" target="_blank" rel="noopener">Apply now</a></div>';
  }
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  function setHTML(id, t) { var e = el(id); if (e) e.innerHTML = t; }
  function fill(r) { var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%'); }

  function bind(ids, recalc) {
    ids.forEach(function (id) {
      var r = el(id), n = el(id + '-n');
      if (!r) return;
      if (!n) { r.addEventListener('change', recalc); r.addEventListener('input', recalc); return; }
      fill(r);
      r.addEventListener('input', function () { n.value = r.value; fill(r); recalc(); });
      n.addEventListener('input', function () {
        var v = parseFloat(n.value); if (isNaN(v)) return;
        r.value = Math.min(Math.max(v, +r.min), +r.max); fill(r); recalc();
      });
      n.addEventListener('blur', function () { if (n.value === '' || isNaN(parseFloat(n.value))) n.value = r.value; });
    });
  }
  function val(id) { var n = el(id + '-n'); var v = parseFloat(n ? n.value : el(id).value); return isNaN(v) ? parseFloat(el(id).value) : v; }
  function checked(id) { return !!el(id).checked; }
  function setMax(id, max) {
    var r = el(id), n = el(id + '-n'); r.max = max; n.max = max;
    if (+r.value > max) { r.value = max; n.value = max; } fill(r);
  }

  /* =========================================================
     1) PAYMENT
     ========================================================= */
  function buildPayment() {
    var p = el('panel-payment');
    p.innerHTML =
      '<div class="calc-inputs">' +
        field({ id: 'pp-price', label: 'Home price', min: 100000, max: 3000000, step: 5000, value: 600000, prefix: '$' }) +
        field({ id: 'pp-down', label: 'Down payment', min: 0, max: 600000, step: 1000, value: 120000, prefix: '$', hint: true }) +
        '<div class="row-2">' +
          field({ id: 'pp-rate', label: 'Interest rate', min: 0.5, max: 12, step: 0.05, value: 4.5, suffix: '%' }) +
          field({ id: 'pp-amort', label: 'Amortization', min: 5, max: 30, step: 1, value: 25, suffix: 'yrs' }) +
        '</div>' +
        select('pp-freq', 'Payment frequency', [
          ['m', 'Monthly', true], ['sm', 'Semi-monthly'], ['bw', 'Bi-weekly'], ['abw', 'Accelerated bi-weekly'], ['w', 'Weekly'], ['aw', 'Accelerated weekly']
        ]) +
        toggle('pp-ftb', 'First-time buyer or new build (allows 30-yr insured amortization)', true) +
      '</div>' +
      '<div class="calc-results">' +
        hero('Estimated payment', 'pp-out', 'pp-out-s') +
        kv([['pp-mort', 'Total mortgage'], ['pp-cmhc', 'CMHC insurance'], ['pp-int', 'Total interest'], ['pp-free', 'Mortgage-free in']]) +
        '<div><div class="bar" aria-hidden="true"><i id="pp-bar-p" style="background:var(--ink)"></i><i id="pp-bar-i" style="background:var(--orange-2)"></i></div>' +
        '<div class="legend" style="margin-top:8px"><span><b style="background:var(--ink)"></b>Principal</span><span><b style="background:var(--orange-2)"></b>Interest</span></div></div>' +
        '<div class="alert" id="pp-alert" hidden></div>' +
        '<div class="alert ok" id="pp-tip" hidden></div>' +
        '<p class="note">Assumes a fixed rate for the full amortization with semi-annual compounding. Does not include property taxes, insurance or other fees. In Ontario, PST on the CMHC premium is paid at closing.</p>' +
        cta() +
      '</div>';
    var recalc = function () {
      var price = val('pp-price');
      setMax('pp-down', Math.round(price));
      var down = Math.min(val('pp-down'), price), rate = val('pp-rate'), amort = val('pp-amort');
      var freq = el('pp-freq').value, ftb = checked('pp-ftb');
      var dPct = price > 0 ? down / price * 100 : 0;
      setText('pp-down-hint', '(' + pct(dPct) + ')');

      var base = price - down, ltv = price > 0 ? base / price : 0;
      var md = minDown(price), alerts = [];
      var insured = ltv > 0.80;
      var premRate = 0;
      if (insured) {
        if (price >= 1500000) alerts.push('Homes priced at $1.5M or more need at least 20% down (' + $(price * 0.2) + ').');
        else {
          premRate = cmhcRate(ltv);
          if (amort > 25) premRate += 0.002;
          if (amort > 30 || (amort > 25 && !ftb)) alerts.push('Insured mortgages (under 20% down) are limited to a ' + (ftb ? 30 : 25) + '-year amortization' + (ftb ? '.' : ' unless you are a first-time buyer or buying a new build.'));
        }
      }
      if (down < md - 0.5) alerts.push('Minimum down payment for this price is ' + $(md) + '.');
      var premium = base * premRate, P = base + premium;

      var mi = periodicRate(rate, 12), nM = amort * 12, monthly = pmt(P, mi, nM);
      var per = { m: 12, sm: 24, bw: 26, abw: 26, w: 52, aw: 52 }[freq];
      var i = periodicRate(rate, per), pay, n;
      if (freq === 'abw') { pay = monthly / 2; n = nper(P, i, pay); }
      else if (freq === 'aw') { pay = monthly / 4; n = nper(P, i, pay); }
      else { n = amort * per; pay = pmt(P, i, n); }
      var interest = pay * n - P;
      var labels = { m: 'per month', sm: 'twice a month', bw: 'every two weeks', abw: 'every two weeks (accelerated)', w: 'per week', aw: 'per week (accelerated)' };

      setText('pp-out', $(pay)); setText('pp-out-s', labels[freq]);
      setText('pp-mort', $(P)); setText('pp-cmhc', premium ? $(premium) + ' (' + pct(premRate * 100, 2) + ')' : '$0');
      setText('pp-int', $(interest)); setText('pp-free', yrs(n, per));
      var tot = P + interest; el('pp-bar-p').style.width = (P / tot * 100) + '%'; el('pp-bar-i').style.width = (interest / tot * 100) + '%';

      var a = el('pp-alert'); a.hidden = !alerts.length; a.innerHTML = alerts.join('<br>');
      var tip = el('pp-tip');
      if (freq === 'abw' || freq === 'aw') {
        var savedI = (monthly * nM - P) - interest, sooner = nM - n * 12 / per;
        tip.hidden = false;
        tip.textContent = 'Accelerated payments save about ' + $(savedI) + ' in interest and make you mortgage-free ' + yrs(sooner, 12) + ' sooner than monthly payments.';
      } else if (freq === 'm' && P > 0) {
        var ab = monthly / 2, abN = nper(P, periodicRate(rate, 26), ab), abI = ab * abN - P;
        tip.hidden = false;
        tip.textContent = 'Tip: switching to accelerated bi-weekly (' + $(ab) + ' every two weeks) could save about ' + $(interest - abI) + ' in interest.';
      } else tip.hidden = true;
    };
    bind(['pp-price', 'pp-down', 'pp-rate', 'pp-amort', 'pp-freq', 'pp-ftb'], recalc);
    recalc();
  }

  /* =========================================================
     2) AFFORDABILITY
     ========================================================= */
  function buildAfford() {
    var p = el('panel-afford');
    p.innerHTML =
      '<div class="calc-inputs">' +
        field({ id: 'af-inc', label: 'Annual household income', min: 20000, max: 600000, step: 1000, value: 80000, prefix: '$' }) +
        field({ id: 'af-debt', label: 'Monthly debt payments', min: 0, max: 10000, step: 50, value: 500, prefix: '$', hint: true }) +
        field({ id: 'af-down', label: 'Down payment', min: 0, max: 1000000, step: 1000, value: 50000, prefix: '$' }) +
        '<div class="row-2">' +
          field({ id: 'af-rate', label: 'Interest rate', min: 0.5, max: 12, step: 0.05, value: 4.5, suffix: '%' }) +
          field({ id: 'af-amort', label: 'Amortization', min: 5, max: 30, step: 1, value: 25, suffix: 'yrs' }) +
        '</div>' +
        '<div class="row-2">' +
          field({ id: 'af-tax', label: 'Property tax / yr', min: 0, max: 25000, step: 100, value: 4000, prefix: '$' }) +
          field({ id: 'af-heat', label: 'Heating / mo', min: 0, max: 600, step: 10, value: 125, prefix: '$' }) +
        '</div>' +
        field({ id: 'af-condo', label: 'Condo fees / mo', min: 0, max: 2000, step: 25, value: 0, prefix: '$' }) +
      '</div>' +
      '<div class="calc-results">' +
        hero('You could afford up to', 'af-out', 'af-out-s') +
        kv([['af-mort', 'Mortgage amount'], ['af-pay', 'Monthly payment'], ['af-qual', 'Qualifying rate'], ['af-ratios', 'GDS / TDS used']]) +
        '<div class="alert" id="af-limit"></div>' +
        '<p class="note">Uses 39% GDS / 44% TDS limits and the federal stress test (greater of your rate + 2% or 5.25%). Includes CMHC insurance when under 20% down. Lender policies vary; actual qualification depends on credit, income type and property.</p>' +
        cta() +
      '</div>';
    var recalc = function () {
      var inc = val('af-inc'), debts = val('af-debt'), down = val('af-down'), rate = val('af-rate'), amort = val('af-amort');
      var tax = val('af-tax'), heat = val('af-heat'), condo = val('af-condo');
      var mi = inc / 12, housingExtras = tax / 12 + heat + condo * 0.5;
      setText('af-debt-hint', debts ? '(car, cards, loans)' : '');
      var qual = Math.max(rate + 2, 5.25);
      var gdsRoom = 0.39 * mi - housingExtras, tdsRoom = 0.44 * mi - housingExtras - debts;
      var maxPay = Math.max(0, Math.min(gdsRoom, tdsRoom));
      var maxMort = pv(maxPay, periodicRate(qual, 12), amort * 12);

      // Income-limited price (handles CMHC premium being added to the loan)
      var price = maxMort + down, base = maxMort;
      for (var k = 0; k < 6; k++) {
        var ltv = price > 0 ? (price - down) / price : 0;
        var pr = (ltv > 0.8 && price < 1500000) ? cmhcRate(ltv) + (amort > 25 ? 0.002 : 0) : 0;
        base = maxMort / (1 + pr); price = base + down;
      }
      var incomePrice = price, downPrice = maxPriceFromDown(down);
      var limitedByDown = downPrice < incomePrice;
      price = Math.max(0, Math.min(incomePrice, downPrice));
      var loan = Math.max(0, price - down), ltv2 = price > 0 ? loan / price : 0;
      var prem = (ltv2 > 0.8 && price < 1500000) ? cmhcRate(ltv2) + (amort > 25 ? 0.002 : 0) : 0;
      var P = loan * (1 + prem);
      var pay = monthlyMortgage(P, rate, amort), qPay = monthlyMortgage(P, qual, amort);
      var gds = mi ? (qPay + housingExtras) / mi * 100 : 0, tds = mi ? (qPay + housingExtras + debts) / mi * 100 : 0;

      setText('af-out', $(price));
      setText('af-out-s', 'home price with ' + $(down) + ' down (' + pct(price ? down / price * 100 : 0) + ')');
      setText('af-mort', $(P)); setText('af-pay', $(pay)); setText('af-qual', pct(qual, 2)); setText('af-ratios', pct(gds, 0) + ' / ' + pct(tds, 0));
      var lim = el('af-limit');
      if (maxPay <= 0) { lim.className = 'alert'; lim.textContent = 'Your current debts and housing costs already use up the allowable ratios. Let’s talk about consolidating debt or adding a co-signer.'; }
      else if (limitedByDown) { lim.className = 'alert'; lim.textContent = 'Limited by your down payment. Your income could support up to ' + $(incomePrice) + ', but minimum down payment rules cap the price at ' + $(downPrice) + '.'; }
      else { lim.className = 'alert ok'; lim.textContent = 'Limited by income (debt ratios). Paying down monthly debts or adding a co-applicant would increase this.'; }
      if (amort > 25 && ltv2 > 0.8) lim.textContent += ' Note: 30-year insured amortization is only for first-time buyers or new builds.';
    };
    bind(['af-inc', 'af-debt', 'af-down', 'af-rate', 'af-amort', 'af-tax', 'af-heat', 'af-condo'], recalc);
    recalc();
  }

  /* =========================================================
     3) REFINANCE / RENEWAL
     ========================================================= */
  function buildRefi() {
    var p = el('panel-refi');
    p.innerHTML =
      '<div class="calc-inputs">' +
        field({ id: 'rf-bal', label: 'Current mortgage balance', min: 50000, max: 3000000, step: 5000, value: 400000, prefix: '$' }) +
        '<div class="row-2">' +
          field({ id: 'rf-cur', label: 'Current rate', min: 0.5, max: 12, step: 0.05, value: 6.5, suffix: '%' }) +
          field({ id: 'rf-new', label: 'New rate', min: 0.5, max: 12, step: 0.05, value: 4.5, suffix: '%' }) +
        '</div>' +
        field({ id: 'rf-yrs', label: 'Years remaining', min: 1, max: 30, step: 1, value: 20, suffix: 'yrs' }) +
        field({ id: 'rf-cost', label: 'Penalty + fees (if breaking early)', min: 0, max: 60000, step: 250, value: 0, prefix: '$' }) +
      '</div>' +
      '<div class="calc-results">' +
        hero('Monthly savings', 'rf-out', 'rf-out-s') +
        kv([['rf-cp', 'Current payment'], ['rf-np', 'New payment'], ['rf-tot', 'Net interest savings'], ['rf-be', 'Break-even']]) +
        '<div class="alert" id="rf-alert" hidden></div>' +
        '<p class="note">Estimates only. Breaking a fixed mortgage early usually costs the greater of 3 months’ interest or the interest rate differential (IRD). Ask me for an exact penalty quote; at renewal there is usually no penalty.</p>' +
        cta() +
      '</div>';
    var recalc = function () {
      var bal = val('rf-bal'), cur = val('rf-cur'), nw = val('rf-new'), y = val('rf-yrs'), cost = val('rf-cost');
      var cp = monthlyMortgage(bal, cur, y), np = monthlyMortgage(bal, nw, y);
      var save = cp - np, n = y * 12, net = save * n - cost;
      setText('rf-out', $(save)); setText('rf-out-s', 'per month over ' + y + ' years');
      setText('rf-cp', $(cp)); setText('rf-np', $(np)); setText('rf-tot', $(net));
      el('rf-tot').className = 'v' + (net > 0 ? ' good' : '');
      setText('rf-be', cost > 0 ? (save > 0 ? Math.ceil(cost / save) + ' months' : 'Never') : 'Immediate');
      var a = el('rf-alert');
      if (save <= 0) { a.hidden = false; a.textContent = 'The new rate is not lower than your current rate, so a switch wouldn’t reduce your payment. A blend-and-extend or a longer amortization might still help.'; }
      else if (cost > 0 && net <= 0) { a.hidden = false; a.textContent = 'At these numbers the penalty and fees outweigh the savings. Waiting until renewal may be better.'; }
      else a.hidden = true;
    };
    bind(['rf-bal', 'rf-cur', 'rf-new', 'rf-yrs', 'rf-cost'], recalc);
    recalc();
  }

  /* =========================================================
     4) DEBT CONSOLIDATION
     ========================================================= */
  function buildDebt() {
    var p = el('panel-debt');
    p.innerHTML =
      '<div class="calc-inputs">' +
        field({ id: 'dc-bal', label: 'Current mortgage balance', min: 50000, max: 3000000, step: 5000, value: 350000, prefix: '$' }) +
        field({ id: 'dc-rate', label: 'Mortgage interest rate', min: 0.5, max: 12, step: 0.05, value: 4.5, suffix: '%' }) +
        field({ id: 'dc-debt', label: 'Total debts to consolidate', min: 1000, max: 300000, step: 1000, value: 50000, prefix: '$' }) +
        '<div class="row-2">' +
          field({ id: 'dc-drate', label: 'Avg. debt interest rate', min: 1, max: 35, step: 0.5, value: 18, suffix: '%' }) +
          field({ id: 'dc-term', label: 'Debt payoff plan', min: 1, max: 10, step: 1, value: 5, suffix: 'yrs' }) +
        '</div>' +
        field({ id: 'dc-yrs', label: 'Mortgage years remaining', min: 5, max: 30, step: 1, value: 20, suffix: 'yrs' }) +
      '</div>' +
      '<div class="calc-results">' +
        hero('Monthly cash-flow freed up', 'dc-out', 'dc-out-s') +
        kv([['dc-before', 'Current total'], ['dc-after', 'After consolidation'], ['dc-int', 'Long-term interest impact'], ['dc-smart', 'Smart-payment savings']]) +
        '<div class="alert ok" id="dc-tip"></div>' +
        '<p class="note">Assumes your debts are paid off evenly over the payoff plan at the average rate, and the consolidated mortgage keeps the same rate and remaining amortization. Subject to qualification, appraisal and available equity (typically up to 80% loan-to-value).</p>' +
        cta() +
      '</div>';
    var recalc = function () {
      var bal = val('dc-bal'), r = val('dc-rate'), debt = val('dc-debt'), dr = val('dc-drate'), term = val('dc-term'), y = val('dc-yrs');
      var mPay = monthlyMortgage(bal, r, y);
      var dPay = pmt(debt, dr / 100 / 12, term * 12);
      var before = mPay + dPay;
      var newBal = bal + debt, after = monthlyMortgage(newBal, r, y);
      var relief = before - after;
      var intBefore = (mPay * y * 12 - bal) + (dPay * term * 12 - debt);
      var intAfter = after * y * 12 - newBal;
      var impact = intBefore - intAfter;                 // + = saves interest, - = costs more
      // Smart strategy: keep paying the same total into the consolidated mortgage
      var mi = periodicRate(r, 12), nSmart = nper(newBal, mi, before), intSmart = before * nSmart - newBal;
      var smartSave = intBefore - intSmart, sooner = y * 12 - nSmart;

      setText('dc-out', $(relief)); setText('dc-out-s', 'per month');
      setText('dc-before', $(before) + '/mo'); setText('dc-after', $(after) + '/mo');
      setHTML('dc-int', impact >= 0 ? 'Saves ' + $(impact) : 'Costs ' + $(-impact) + ' more');
      el('dc-int').className = 'v' + (impact >= 0 ? ' good' : '');
      setText('dc-smart', $(smartSave)); el('dc-smart').className = 'v' + (smartSave > 0 ? ' good' : '');
      var tip = el('dc-tip');
      if (smartSave > 0) {
        tip.className = 'alert ok';
        tip.textContent = 'Best of both: keep paying your current ' + $(before) + '/mo into the new mortgage and you’d save about ' + $(smartSave) + ' in interest and be mortgage-free ' + yrs(sooner, 12) + ' sooner.';
      } else {
        tip.className = 'alert';
        tip.textContent = 'Consolidating frees up cash flow, but stretching short-term debt over a long amortization can cost more interest overall. Let’s build a plan that fits.';
      }
    };
    bind(['dc-bal', 'dc-rate', 'dc-debt', 'dc-drate', 'dc-term', 'dc-yrs'], recalc);
    recalc();
  }

  /* =========================================================
     5) LAND TRANSFER TAX (Ontario + Toronto)
     ========================================================= */
  var ON_LTT = [[55000, 0.005], [250000, 0.01], [400000, 0.015], [2000000, 0.02], [Infinity, 0.025]];
  var TO_MLTT = [[55000, 0.005], [250000, 0.01], [400000, 0.015], [2000000, 0.02], [3000000, 0.025], [4000000, 0.035],
                 [5000000, 0.045], [10000000, 0.055], [20000000, 0.065], [Infinity, 0.075]];
  function buildLTT() {
    var p = el('panel-ltt');
    p.innerHTML =
      '<div class="calc-inputs">' +
        field({ id: 'lt-price', label: 'Purchase price', min: 100000, max: 5000000, step: 5000, value: 900000, prefix: '$' }) +
        toggle('lt-to', 'Property is in the City of Toronto (municipal tax applies)', true) +
        toggle('lt-ftb', 'First-time home buyer (rebates apply)', true) +
      '</div>' +
      '<div class="calc-results">' +
        hero('Total land transfer tax', 'lt-out', 'lt-out-s') +
        kv([['lt-on', 'Ontario LTT'], ['lt-to-v', 'Toronto MLTT'], ['lt-onr', 'Ontario rebate'], ['lt-tor', 'Toronto rebate']]) +
        '<p class="note">Residential property with one or two single-family residences. First-time buyer rebates: up to $4,000 (Ontario) and up to $4,475 (Toronto); eligibility rules apply. Estimates only. Confirm with your real estate lawyer.</p>' +
        cta() +
      '</div>';
    var recalc = function () {
      var price = val('lt-price'), to = checked('lt-to'), ftb = checked('lt-ftb');
      var on = bracketTax(price, ON_LTT), tor = to ? bracketTax(price, TO_MLTT) : 0;
      var onR = ftb ? Math.min(on, 4000) : 0, toR = (ftb && to) ? Math.min(tor, 4475) : 0;
      var total = on + tor - onR - toR;
      setText('lt-out', $(total)); setText('lt-out-s', 'due on closing (' + pct(price ? total / price * 100 : 0, 2) + ' of price)');
      setText('lt-on', $(on)); setText('lt-to-v', to ? $(tor) : 'N/A');
      setText('lt-onr', onR ? '−' + $(onR) : '$0'); setText('lt-tor', toR ? '−' + $(toR) : '$0');
    };
    bind(['lt-price', 'lt-to', 'lt-ftb'], recalc);
    recalc();
  }

  /* ---------- tabs ---------- */
  function tabs() {
    var tabsEls = Array.prototype.slice.call(document.querySelectorAll('#calc-app [role=tab]'));
    function activate(t, focus) {
      tabsEls.forEach(function (x) {
        var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
        el(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) t.focus();
      try { history.replaceState(null, '', '#' + t.id.replace('tab-', 'calc-')); } catch (e) {}
    }
    tabsEls.forEach(function (t, idx) {
      t.addEventListener('click', function () { activate(t); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); activate(tabsEls[(idx + d + tabsEls.length) % tabsEls.length], true); }
      });
    });
    // deep links: /#calc-afford, /#calc-refi, /#calc-debt, /#calc-ltt
    var h = location.hash.replace('#calc-', '');
    var match = el('tab-' + h);
    if (match) { activate(match); setTimeout(function () { el('calculators').scrollIntoView(); }, 50); }
  }

  function init() {
    if (!el('calc-app')) return;
    buildPayment(); buildAfford(); buildRefi(); buildDebt(); buildLTT(); tabs();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // expose pure functions for testing
  window.MMCalc = { periodicRate: periodicRate, pmt: pmt, pv: pv, nper: nper, minDown: minDown, maxPriceFromDown: maxPriceFromDown, cmhcRate: cmhcRate, bracketTax: bracketTax, ON_LTT: ON_LTT, TO_MLTT: TO_MLTT };
})();
