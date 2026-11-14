/* Written with AI assistance (Claude, Anthropic) and reviewed by Team Atlas BZU.
   Ardi extras (added Sat 14 Nov): two farmer-side additions. Scores are NOT changed by this file.
   1) LISTEN: reads the farmer card aloud in Arabic with the browser's built-in speech (Web Speech API).
      The audio is machine speech made on the device; nothing is recorded or sent anywhere. Not yet tested with farmers. If the device has no Arabic voice, it says so.
   2) PARTS OF YOUR LAND: the farmer marks what differs inside the plot (low wet spot, high stony edge,
      sloping part, weak margins). Ardi shows what NASA SRTM can and cannot see around the point
      (terrain.json, made by data/4_terrain.py from the AppEEARS SRTM file) and adds one plain note per part.
      The notes are general agronomy, tagged "from you" + "check locally". Satellites cannot see inside one plot.
   Depends on globals from index.html: $, S, esc, set, fmt, isNum, cycleText, cropName, loadJSON, confidence. */
(function () {
  const X = { parts: new Set(), terrain: null, speaking: false, token: 0 };

  /* ---------------- PARTS OF YOUR LAND ---------------- */
  const PARTS = [
    { id: 'low', ic: '💧', en: 'A low spot where water collects', ar: 'جزء واطي بتتجمّع فيه المي',
      note_en: 'Water and cold air collect here. It stays wet after heavy rain and holds moisture longest in a dry year. Lentil and bitter vetch suffer in standing water, so keep the legume year off the wettest patch or drain it first.',
      note_ar: 'هون بتتجمّع المي والهوا البارد. بضل رطب بعد المطر القوي وبحفظ الرطوبة أكثر بسنة الجفاف. العدس والكرسنة ما بتحمّلوا المي الواقفة، فابعد البقوليات عن أكثر بقعة مبلولة أو صرّف المي أول.',
      say_ar: 'الجزء الواطي: بتتجمع فيه المي، فابعد العدس والكرسنة عن أكثر بقعة مبلولة.' },
    { id: 'high', ic: '🪨', en: 'A high or stony edge', ar: 'طرف عالي أو صخري',
      note_en: 'Shallow, stony soil dries first and feels a dry year hardest. Barley copes with it better than wheat. Expect less from this part and judge the rotation by the rest of the field.',
      note_ar: 'التربة القليلة والصخرية بتنشف أول وبتتأثر بسنة الجفاف أكثر. الشعير بتحمّلها أحسن من القمح. توقّع إنتاج أقل من هالجزء واحكم على الدورة من باقي الأرض.',
      say_ar: 'الطرف العالي أو الصخري: بنشف أول، والشعير بتحمّله أحسن من القمح.' },
    { id: 'slope', ic: '↘️', en: 'A sloping part', ar: 'جزء مايل',
      note_en: 'Rain runs off a slope and takes soil with it. Sow across the slope, leave the stubble after harvest and avoid leaving this part bare in winter. A vetch or barley cover helps hold the soil.',
      note_ar: 'المطر بيجري عالميلان وبيسحب التربة معه. ازرع بعرض الميلان، خلّي القش بعد الحصاد وما تترك هالجزء مكشوف بالشتا. الكرسنة أو الشعير بغطّوا التربة وبمسكوها.',
      say_ar: 'الجزء المايل: ازرع بعرض الميلان وما تتركه مكشوف بالشتا.' },
    { id: 'edges', ic: '🌿', en: 'Edges weaker than the middle', ar: 'الأطراف أضعف من الوسط',
      note_en: 'Field edges often yield less: tree roots and shade, compacted tracks, grazing and wind. Don\'t judge a new crop by the edge rows. Forage crops like bitter vetch or barley carry less risk on the margins.',
      note_ar: 'أطراف الأرض غالباً بتعطي أقل: جذور وظل الشجر، دعس الطرق، الرعي والهوا. ما تحكم على محصول جديد من صفوف الطرف. محاصيل العلف زي الكرسنة والشعير مخاطرتها أقل عالأطراف.',
      say_ar: 'الأطراف: غالباً أضعف من الوسط، فما تحكم على المحصول منها.' }
  ];

  function fieldBlock() {
    const host = document.getElementById('screen-field'); if (!host || document.getElementById('partsQ')) return;
    const q = document.createElement('div'); q.className = 'q'; q.id = 'partsQ';
    q.innerHTML = `<div class="qh">Is your land the same everywhere? <span class="ar-inline" lang="ar">هل أرضك كلها مثل بعض؟</span></div>
      <p class="small">Satellites describe the area, not the inside of one plot. You know where water collects and where the soil is thin: tap what applies (optional).
        <span class="ar" lang="ar">الأقمار الصناعية بتوصف المنطقة مش داخل القطعة. إنت بتعرف وين بتتجمّع المي ووين التربة قليلة: اختار اللي بينطبق (اختياري).</span></p>
      <div class="tiles" id="partTiles"></div>
      <div class="terrainbox" id="terrainBox"></div>`;
    host.insertBefore(q, host.querySelector('.nav'));
    drawPartTiles(); drawTerrain();
  }
  function drawPartTiles() {
    const box = document.getElementById('partTiles'); if (!box) return;
    box.innerHTML = PARTS.map(p => `<button class="tile" type="button" data-part="${p.id}" aria-pressed="${X.parts.has(p.id)}">
        <span class="ic" aria-hidden="true">${p.ic}</span><span class="t">${p.en}</span><span class="ar" lang="ar">${p.ar}</span></button>`).join('');
    box.querySelectorAll('[data-part]').forEach(b => b.onclick = () => {
      X.parts.has(b.dataset.part) ? X.parts.delete(b.dataset.part) : X.parts.add(b.dataset.part);
      drawPartTiles(); drawNotes(); drawStatus();
    });
    drawStatus();
  }
  function drawStatus() {
    const box = document.getElementById('partTiles'); if (!box) return;
    let s = document.getElementById('partsStatus');
    if (!s) { s = document.createElement('p'); s.id = 'partsStatus'; s.className = 'small'; s.setAttribute('aria-live', 'polite'); box.insertAdjacentElement('afterend', s); }
    const sel = PARTS.filter(p => X.parts.has(p.id));
    s.innerHTML = sel.length
      ? `<b>✓ Added to your card:</b> ${sel.map(p => p.en).join(', ')}. The notes show on your options (step 3) and on your card (step 4), and Listen reads them. <span class="ar" lang="ar">تمت الإضافة. الملاحظات بتظهر بالخيارات وبالبطاقة.</span>`
      : '';
  }
  function drawTerrain() {
    const box = document.getElementById('terrainBox'), t = X.terrain; if (!box) return;
    if (!t || !Array.isArray(t.points) || !t.points.length) { box.innerHTML = ''; return; }
    const W = 300, H = 300, pad = 46, ext = Math.max(...t.points.map(p => Math.max(Math.abs(p.x_m), Math.abs(p.y_m)))) || 1;
    const sx = x => W / 2 + (x / ext) * (W / 2 - pad), sy = y => H / 2 - (y / ext) * (H / 2 - pad);
    const lo = t.elev_min_m, hi = t.elev_max_m, k = e => hi > lo ? (e - lo) / (hi - lo) : 0.5;
    const col = e => { const v = k(e); return `rgb(${Math.round(60 + 150 * v)},${Math.round(120 + 40 * v)},${Math.round(190 - 130 * v)})`; };
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="SRTM heights around the pilot point">`;
    svg += `<text x="${W / 2}" y="14" text-anchor="middle" class="ax">north</text><line x1="${W / 2}" x2="${W / 2}" y1="20" y2="${H - 8}" class="grid"/><line x1="8" x2="${W - 8}" y1="${H / 2}" y2="${H / 2}" class="grid"/>`;
    t.points.forEach(p => {
      const c = p.id === 'center';
      svg += `<circle cx="${sx(p.x_m)}" cy="${sy(p.y_m)}" r="${c ? 13 : 11}" fill="${col(p.elev_m)}" ${c ? 'stroke="#1d1b16" stroke-width="2.5"' : ''}><title>${p.elev_m} m</title></circle>
              <text x="${sx(p.x_m)}" y="${sy(p.y_m) + 4}" text-anchor="middle" class="tv">${Math.round(p.elev_m)}</text>`;
    });
    svg += `</svg>`;
    const ti = t.tilt || {};
    box.innerHTML = `<div class="terrainrow"><div class="chart tmap">${svg}</div>
      <div><div class="qh" style="font-size:15px">What NASA can see of the ground <span class="ar-inline" lang="ar">· شو بتشوف ناسا من الأرض</span></div>
      <p class="small"><b>${fmt(t.elev_min_m, 0)}–${fmt(t.elev_max_m, 0)} m</b> above sea level across about ${t.extent_m ? t.extent_m.east_west : '—'} m: a difference of ${fmt(t.elev_range_m, 0)} m, tilting gently down toward the ${esc(ti.downhill_toward || '—')} (${fmt(ti.gradient_pct, 1)}% across the whole area${S.data && S.data.slope && isNum(S.data.slope.slope_pct) ? '; ' + S.data.slope.slope_pct + '% right at the point' : ''}). Each dot is one height reading in metres; the ringed dot is the pilot point.</p>
      <p class="small"><b>The limit:</b> each reading covers about 30 m and can be a few metres off, so this shows the tilt of the area. It can't show a dip, a stony edge or weak margins inside one plot. That part comes from you.
        <span class="ar" lang="ar">كل قراءة بتغطي حوالي ٣٠ متر وممكن تغلط كم متر، فهاي بتورجي ميلان المنطقة. ما بتقدر تشوف واطي أو طرف صخري أو أطراف ضعيفة جوّا القطعة. هاد الجزء منك إنت.</span></p>
      <div class="src">${esc(t.source || '')} · ${t.n_points} points</div></div></div>`;
  }
  function notesHtml() {
    const sel = PARTS.filter(p => X.parts.has(p.id)); if (!sel.length) return '';
    return `<div class="partsnotes"><div class="qh">For the parts of your land <span class="ar-inline" lang="ar">· لأجزاء أرضك</span>
        <span class="ptag">from you</span><span class="ptag warn">check locally</span></div>
      ${sel.map(p => `<div class="pnote"><b>${p.ic} ${p.en}</b><p>${p.note_en}</p><p class="ar" lang="ar">${p.note_ar}</p></div>`).join('')}
      <p class="small">These notes are general farming guidance for what you told us. They don't change the scores above, which describe the area from NASA records. Check them with a local agronomist.</p></div>`;
  }
  function drawNotes() {
    let a = document.getElementById('partsNotesCards');
    if (!a) { const host = document.querySelector('#screen-cards .panel'); if (host) { a = document.createElement('div'); a.id = 'partsNotesCards'; host.appendChild(a); } }
    if (a) a.innerHTML = notesHtml();
    let b = document.getElementById('partsNotesCard');
    if (!b) { const card = document.getElementById('arCard'); if (card) { b = document.createElement('div'); b.id = 'partsNotesCard'; card.insertBefore(b, card.lastElementChild); } }
    if (b) { const sel = PARTS.filter(p => X.parts.has(p.id));
      b.innerHTML = sel.length ? `<div class="row" style="display:block"><span>أجزاء أرضك (منك إنت):</span>${sel.map(p => `<p style="margin:.3em 0">${p.ic} ${p.say_ar}</p>`).join('')}</div>` : ''; }
  }

  /* ---------------- LISTEN (Arabic read-out) ---------------- */
  const synth = window.speechSynthesis;
  function arVoice() {
    if (!synth) return null;
    const all = synth.getVoices().filter(v => /^ar([-_]|$)/i.test(v.lang || ''));
    return all.find(v => v.localService) || all[0] || null;
  }
  function spokenCard() {
    const R = S.ranked || [], cur = R[0], best = R[1], dl = S.data && S.data.dry_line;
    if (!best) return '';
    const parts = PARTS.filter(p => X.parts.has(p.id)).map(p => p.say_ar);
    const line = [];
    line.push('بطاقة المزارع من أرضي.');
    if (best.rotation.card_ar) line.push(best.rotation.card_ar);
    if (cur) line.push(`دورتك الحالية: ${cycleText(cur.rotation.cycle, 'ar').replace(/↔/g, 'ثم')}.`);
    line.push(`الخيار الأنسب لأولوياتك: ${cycleText(best.rotation.cycle, 'ar').replace(/↔/g, 'ثم')}.`);
    if (dl) { const y = String(dl.season).split('/'); line.push(`خامس أجفّ موسم من ${dl.n_seasons} موسم كان موسم ${y[0]}، ونزل فيه ${Math.round(dl.rain_mm)} ملم مطر.`); }
    if (best.dry) line.push(best.dry.pass ? 'هذا الخيار بيصمد بسنة الجفاف.' : 'هذا الخيار ما بيصمد بسنة الجفاف.');
    line.push(`مدى ثقتنا: ${confidence(best)[1].replace('—', '،')}.`);
    if (parts.length) line.push('عن أجزاء أرضك: ' + parts.join(' '));
    line.push('هذه أفكار للنقاش وليست توصية. إنت أدرى بأرضك، فاعتبرها دليل مش قاعدة.');
    return line.join(' ');
  }
  function listenBlock() {
    const card = document.getElementById('arCard'); if (!card || document.getElementById('listenBar')) return;
    const bar = document.createElement('div'); bar.id = 'listenBar'; bar.className = 'listenbar'; bar.dir = 'rtl';
    bar.innerHTML = `<button class="btn" type="button" id="listenBtn" aria-live="polite">🔊 اسمع البطاقة · Listen</button><span class="small" id="listenMsg"></span>`;
    card.parentNode.insertBefore(bar, card);
    document.getElementById('listenBtn').onclick = toggleSpeak;
    if (!synth) { document.getElementById('listenBtn').disabled = true; document.getElementById('listenMsg').textContent = 'This browser can\'t read aloud. · هذا المتصفح لا يدعم القراءة الصوتية.'; }
  }
  function setBtn() { const b = document.getElementById('listenBtn'); if (b) b.textContent = X.speaking ? '⏹ إيقاف · Stop' : '🔊 اسمع البطاقة · Listen'; }
  function toggleSpeak() {
    if (!synth) return;
    if (X.speaking) { X.token++; synth.cancel(); X.speaking = false; setBtn(); return; }
    const text = spokenCard(), msg = document.getElementById('listenMsg'); if (!text) return;
    const v = arVoice();
    msg.textContent = v ? '' : 'No Arabic voice found on this device; it may read poorly or stay silent. In your phone settings, add an Arabic text-to-speech voice. · ما في صوت عربي على هذا الجهاز.';
    // short pieces: phones often drop or cut one long utterance
    const chunks = (text.match(/[^.؟!:]+[.؟!:]?/g) || [text]).map(s => s.trim()).filter(Boolean);
    let i = 0, token = ++X.token;
    X.speaking = true; setBtn();
    const next = () => {
      if (token !== X.token || i >= chunks.length) { if (token === X.token) { X.speaking = false; setBtn(); } return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = v ? v.lang : 'ar-SA'; if (v) u.voice = v; u.rate = 0.9;
      u.onend = next;
      u.onerror = e => {
        if (token !== X.token) return;
        X.speaking = false; setBtn();
        if (e && e.error && e.error !== 'canceled' && e.error !== 'interrupted') msg.textContent = 'The phone did not play the sound (' + e.error + '). Check the volume and that Arabic text-to-speech is installed. · الصوت ما اشتغل، تأكد من الصوت.';
      };
      synth.speak(u);
      if (synth.paused) synth.resume();
    };
    // keep the first speak() inside the tap (phones require it); cancel a stuck queue first
    if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(next, 120); } else next();
  }
  window.ArdiExtras = { spokenCard, PARTS, state: X };

  /* ---------------- wiring ---------------- */
  const css = document.createElement('style');
  css.textContent = `.terrainbox{margin-top:12px}.terrainrow{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:14px;align-items:start;background:var(--surface-2);border-radius:14px;padding:12px}
    @media (max-width:640px){.terrainrow{grid-template-columns:1fr}.tmap{max-width:260px;margin:0 auto}}
    .tmap .tv{font:700 10.5px Inter,sans-serif;fill:#fff}
    .partsnotes{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}.pnote{background:var(--surface-2);border-radius:12px;padding:10px 12px;margin-top:8px}
    .pnote p{font-size:14.5px;color:var(--ink-2)}.ptag{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--leaf-2);color:var(--leaf);margin-inline-start:6px}
    .ptag.warn{background:#fff0cc;color:#6b4a00}.listenbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}`;
  document.head.appendChild(css);

  const _rf = window.renderField, _ra = window.renderArabic;
  function mapLink() {
    try {
      const p = (S.data && S.data.point) || {}, box = document.getElementById('mapBox');
      if (!box || !isFinite(p.lat) || !isFinite(p.lon) || document.getElementById('mapLink')) return;
      const a = document.createElement('p'); a.id = 'mapLink'; a.className = 'src';
      a.innerHTML = 'Map blank? <a href="https://www.openstreetmap.org/?mlat=' + p.lat + '&mlon=' + p.lon + '#map=13/' + p.lat + '/' + p.lon + '" target="_blank" rel="noopener">Open the pilot point in OpenStreetMap</a> · <span lang="ar">الخريطة فارغة؟ افتحها من الرابط</span>';
      box.appendChild(a);
    } catch (e) { /* the map is optional */ }
  }
  if (typeof _rf === 'function') window.renderField = function () { _rf.apply(this, arguments); fieldBlock(); mapLink(); };
  if (typeof _ra === 'function') window.renderArabic = function () { _ra.apply(this, arguments); listenBlock(); drawNotes(); };
  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => {};
  (async () => { try { X.terrain = await loadJSON('terrain.json'); } catch (e) { X.terrain = null; } fieldBlock(); drawTerrain(); listenBlock(); drawNotes(); })();
})();

/* ---- Honesty notes (added after the council review). Everything is computed from ardi_data.json + crops.json. ---- */
(function () {
  function ranks(preset) {
    const crops = JSON.parse(JSON.stringify(S.crops));
    crops.rotations.forEach(r => r.is_current = (r.id === S.current));
    return ArdiScoring.rank(S.data, crops, WEIGHTS[preset]);
  }
  function notes() {
    if (!(window.ArdiScoring && S.data && S.crops)) return;
    const seasons = (S.data.seasons || []).filter(s => isNum(s.rain_mm)), n = seasons.length;
    // 1) is the order stable across the four priorities?
    let stable = '';
    try {
      const orders = Object.keys(WEIGHTS).map(p => ranks(p).map(r => r.id).join(' › '));
      const same = orders.every(o => o === orders[0]);
      const R = ranks(S.preset).filter(r => !r.rotation.is_current && isNum(r.total));
      const gap = R.length > 1 ? Math.round((R[0].total - R[1].total) * 100) : null;
      stable = (same ? 'With this data the order of the options is the same under all four priorities; only the scores change. ' : 'The order of the options changes with your priority. ')
        + (gap !== null && gap < 10 ? `${R[0].id} and ${R[1].id} are close (${gap} points apart): treat them as near-equal alternatives, both ahead of growing the same cereal every year.` : '');
    } catch (e) {}
    // 2) how often was each crop's minimum rain missed?
    const miss = (S.crops.crops || []).filter(c => isNum(c.min_season_rain_mm)).map(c =>
      `${c.name_en} (${c.min_season_rain_mm} mm): ${seasons.filter(s => s.rain_mm < c.min_season_rain_mm).length} of ${n}`).join(' · ');
    const sens = miss ? `Seasons that fell below each crop's minimum rain: ${miss}. The minimums are FAO ECOCROP lower limits, and satellite rain can be off by tens of millimetres, so a miss by a small margin is a warning, not a verdict.` : '';
    let el = document.getElementById('honestNotes');
    if (!el) { const host = document.getElementById('priceNote'); if (!host) return; el = document.createElement('div'); el.id = 'honestNotes'; host.parentNode.insertBefore(el, host.nextSibling); }
    el.innerHTML = [stable, sens, 'Only the rain record (IMERG) and heat days (POWER) feed the scores. MODIS greenness and SRTM slope are shown as context. The soil score is a rule: legume share plus sowing-calendar bare months, not a soil measurement.']
      .filter(Boolean).map(t => `<p class="small" style="margin-top:6px">${esc(t)}</p>`).join('');
    // 3) changing conditions: two halves of the record (description, not a forecast)
    const h = Math.floor(n / 2), a = seasons.slice(0, h), b = seasons.slice(h);
    const m = (arr, k) => { const v = arr.map(s => s[k]).filter(isNum); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
    let tr = document.getElementById('trendNote');
    if (!tr) { const host = document.getElementById('backtest'); if (!host) return; tr = document.createElement('div'); tr.id = 'trendNote'; tr.className = 'dryline'; host.parentNode.insertBefore(tr, host); }
    if (n >= 10) tr.innerHTML = `<b>Is it changing? · هل الوضع بتغيّر؟</b> Earlier half of the record (${esc(a[0].season)}–${esc(a[a.length - 1].season)}) vs later half (${esc(b[0].season)}–${esc(b[b.length - 1].season)}): season rain averaged ${fmt(m(a, 'rain_mm'), 0)} mm vs ${fmt(m(b, 'rain_mm'), 0)} mm; heat days above 32 °C in Mar–May averaged ${fmt(m(a, 'heat_days_mam'), 1)} vs ${fmt(m(b, 'heat_days_mam'), 1)} a season. A plain comparison of two halves of ${n} seasons, not a trend test or a forecast.`;
  }
  const _rc = window.renderCards;
  if (typeof _rc === 'function') window.renderCards = function () { _rc.apply(this, arguments); notes(); };
  const _rn = window.renderNasa;
  if (typeof _rn === 'function') window.renderNasa = function () { _rn.apply(this, arguments); notes(); };
  setTimeout(notes, 1500);
})();
