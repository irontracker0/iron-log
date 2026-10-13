(function () {
  'use strict';

  /* ================= Storage (saved in this browser only) ================= */
  var KEY = 'ironlog.v1';
  var UI_KEY = 'ironlog.ui';
  var STARTER_EXERCISES = [
    'Chest Press Machine', 'Pec Fly', 'Incline Dumbbell Press', 'Back Squat',
    'Seated Cable Row', 'Chest Supported Row', 'Lat Pulldown', 'Lat Pulldown Machine',
    'Straight Arm Cable Pulldown', 'Lateral Raises', 'Triceps Pulldown',
    'Bench Press', 'Overhead Triceps Pull'
  ];
  var loadError = false;

  function defaults() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      settings: { unit: 'kg', theme: 'dark' },
      exercises: STARTER_EXERCISES.map(function (n, i) { return { id: 'ex' + (i + 1), name: n, custom: false, bodyweight: false }; }),
      workouts: [],
      measurements: [],
      plan: ''
    };
  }

  function save() {
    if (loadError) return false; // never overwrite data we could not read
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { console.error('Save failed', e); return false; }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { loadError = true; return defaults(); }
    if (!raw) { var d = defaults(); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} return d; }
    try { return JSON.parse(raw); }
    catch (e) { loadError = true; return defaults(); }
  }

  var db = load();
  if (!db.measureTypes) db.measureTypes = [];
  if (!db.measurements) db.measurements = [];

  /* ================= Small helpers ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime()); }
  function fmtDate(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function num(n) { return n == null ? '' : String(n); }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) { if (fn(arr[i])) return arr[i]; } return null; }

  function isDone(s) { return s.reps != null && s.reps > 0; }
  function exById(id) { return find(db.exercises, function (e) { return e.id === id; }); }
  function exName(id) { var e = exById(id); return e ? e.name : 'Deleted exercise'; }
  function isBW(id) { var e = exById(id); return !!(e && e.bodyweight); }
  function loggedWorkouts() {
    return db.workouts.filter(function (w) { return w.exercises.some(function (x) { return x.sets.some(isDone); }); });
  }
  function byNewest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  }

  function fmtSet(s, bw) {
    var w = (s.weight != null && s.weight > 0) ? num(s.weight) + ' kg' : null;
    var r = s.reps != null ? s.reps : '?';
    if (bw) return (w ? 'BW +' + w : 'BW') + ' \u00d7 ' + r;
    return (w || '0 kg') + ' \u00d7 ' + r;
  }

  // The most recent earlier session that contains this exercise (with at least one finished set).
  function previousSession(exerciseId, workout) {
    var best = null;
    db.workouts.forEach(function (w) {
      if (w.id === workout.id) return;
      if (w.date > workout.date) return;
      if (w.date === workout.date && w.createdAt > workout.createdAt) return;
      var we = find(w.exercises, function (x) { return x.exerciseId === exerciseId && x.sets.some(isDone); });
      if (!we) return;
      if (!best || w.date > best.w.date || (w.date === best.w.date && w.createdAt > best.w.createdAt)) best = { w: w, we: we };
    });
    return best;
  }

  /* ================= Screen state (not part of your saved data) ================= */
  var ui = { activeId: null, picking: false, noteOpen: {}, search: '', hist: { q: '', ex: '', from: '', to: '' }, histOpen: null, returnTo: null, str: { ex: '', range: '3m', metric: 'weight', point: null }, dashDay: null, body: { ranges: {}, sel: {}, draft: {}, date: '', newCustom: false, edit: null, filter: '', limit: 30, msg: '' } };
  try { var u = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); if (u.activeId) ui.activeId = u.activeId; } catch (e) {}
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ activeId: ui.activeId })); } catch (e) {} }
  function activeWorkout() {
    var w = ui.activeId ? find(db.workouts, function (x) { return x.id === ui.activeId; }) : null;
    if (!w && ui.activeId) { ui.activeId = null; saveUi(); }
    return w;
  }
  function touch(w) { w.updatedAt = new Date().toISOString(); save(); }

  /* ================= Icons ================= */
  var ICONS = {
    dashboard: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    log: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    strength: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    body: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }
  var X = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  var NOTE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';

  /* ================= Pages ================= */
  function header(title, sub) { return '<h1>' + title + '</h1><p class="sub">' + sub + '</p>'; }
  function comingSoon(title, sub, stage, text) {
    return header(title, sub) +
      '<div class="card empty-card"><h2>Nothing here yet</h2><p>' + text + '</p>' +
      '<p style="margin:0">This page is built in ' + stage + '.</p></div>';
  }

  /* ---------- Log Workout ---------- */
  function renderLogHome() {
    var recent = db.workouts.slice().sort(byNewest).slice(0, 5);
    var html = header('Log Workout', 'Record exercises, sets, weight and reps') +
      '<div class="card"><h2>New workout</h2>' +
      '<label class="field">Date<input type="date" id="nw-date" value="' + today() + '"></label>' +
      '<button class="btn primary wide" data-act="start">Start workout</button></div>';
    if (recent.length) {
      html += '<h2 class="section">Recent workouts</h2>';
      recent.forEach(function (w) {
        var sets = 0; w.exercises.forEach(function (x) { sets += x.sets.length; });
        html += '<button class="card item" data-act="open" data-id="' + esc(w.id) + '"><span><strong>' + fmtDate(w.date) + '</strong><br>' +
          '<span class="muted">' + w.exercises.length + ' exercise' + (w.exercises.length === 1 ? '' : 's') + ', ' + sets + ' set' + (sets === 1 ? '' : 's') + '</span></span><span class="muted">Edit</span></button>';
      });
      html += '<a class="btn wide" href="#/history">View full history</a>';
    }
    return html;
  }

  function renderSet(we, s, i, bw) {
    var noteOpen = s.note || s.max || ui.noteOpen[s.id];
    return '<div class="set">' +
      '<span class="set-n">' + (i + 1) + '</span>' +
      '<input class="num" inputmode="decimal" autocomplete="off" placeholder="' + (bw ? '+kg' : 'kg') + '" aria-label="Weight in kilograms" value="' + esc(num(s.weight)) + '" data-in="weight" data-we="' + we.id + '" data-set="' + s.id + '">' +
      '<input class="num" inputmode="numeric" autocomplete="off" placeholder="reps" aria-label="Repetitions" value="' + esc(num(s.reps)) + '" data-in="reps" data-we="' + we.id + '" data-set="' + s.id + '">' +
      '<button class="icon-btn" aria-label="Set details" data-act="note" data-set="' + s.id + '">' + NOTE + '</button>' +
      '<button class="icon-btn" aria-label="Delete set" data-act="rmset" data-we="' + we.id + '" data-set="' + s.id + '">' + X + '</button>' +
      (noteOpen ? '<div class="details"><input class="note" maxlength="200" placeholder="Set note (optional)" value="' + esc(s.note || '') + '" data-in="snote" data-we="' + we.id + '" data-set="' + s.id + '">' +
        '<label class="check"><input type="checkbox" data-in="smax" data-we="' + we.id + '" data-set="' + s.id + '"' + (s.max ? ' checked' : '') + '> Real 1RM attempt (counts only with 1 rep)</label></div>' : '') +
      '</div>';
  }

  function renderExerciseCard(w, we) {
    var bw = isBW(we.exerciseId);
    var prev = previousSession(we.exerciseId, w);
    var html = '<div class="card"><div class="ex-head"><h2>' + esc(exName(we.exerciseId)) + (bw ? ' <span class="badge">Bodyweight</span>' : '') + '</h2>' +
      '<button class="icon-btn" aria-label="Remove exercise" data-act="rmex" data-we="' + we.id + '">' + X + '</button></div>';
    if (prev) {
      html += '<p class="prev">Last time (' + fmtDate(prev.w.date) + '): ' +
        prev.we.sets.filter(isDone).map(function (s) { return fmtSet(s, bw); }).join(', ') + '</p>';
    } else {
      html += '<p class="prev">No earlier session for this exercise yet.</p>';
    }
    if (we.sets.length) {
      html += '<div class="set-head"><span></span><span>' + (bw ? 'Added kg' : 'Weight (kg)') + '</span><span>Reps</span><span></span><span></span></div>';
    }
    we.sets.forEach(function (s, i) { html += renderSet(we, s, i, bw); });
    html += '<div class="btn-row"><button class="btn" data-act="addset" data-we="' + we.id + '">Add set</button>';
    if (!we.sets.length && prev) html += '<button class="btn" data-act="copylast" data-we="' + we.id + '">Copy last session</button>';
    return html + '</div></div>';
  }

  function renderExList(q) {
    q = (q || '').trim().toLowerCase();
    var list = db.exercises.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .filter(function (e) { return !q || e.name.toLowerCase().indexOf(q) > -1; });
    if (!list.length) return '<p class="muted">No exercise matches. Create it below.</p>';
    return list.map(function (e) {
      return '<button class="pick" data-act="pick" data-eid="' + esc(e.id) + '">' + esc(e.name) + (e.bodyweight ? ' <span class="badge">Bodyweight</span>' : '') + '</button>';
    }).join('');
  }

  function renderPicker() {
    return '<div class="card"><h2>Add exercise</h2>' +
      '<input class="search" id="ex-search" type="search" placeholder="Search exercises" autocomplete="off" value="' + esc(ui.search) + '" data-in="exsearch">' +
      '<div id="ex-list">' + renderExList(ui.search) + '</div>' +
      '<h2 class="section">Create a new exercise</h2>' +
      '<input class="search" id="new-ex-name" maxlength="60" placeholder="Exercise name" autocomplete="off">' +
      '<label class="check"><input type="checkbox" id="new-ex-bw"> Bodyweight exercise (weight is optional extra load)</label>' +
      '<div class="btn-row"><button class="btn primary" data-act="createex">Create and add</button><button class="btn" data-act="cancelpick">Cancel</button></div></div>';
  }

  function renderEditor(w) {
    var html = '<div class="topbar"><button class="btn" data-act="done">Done</button></div>' +
      header('Workout', 'Everything saves automatically as you type') +
      '<div class="card"><label class="field">Date<input type="date" value="' + esc(w.date) + '" data-in="date"></label>' +
      '<label class="field">Duration in minutes (optional)<input inputmode="numeric" autocomplete="off" placeholder="e.g. 60" value="' + esc(num(w.duration)) + '" data-in="dur"></label>' +
      '<label class="field">Notes (optional)<textarea rows="2" maxlength="1000" placeholder="How did the session feel?" data-in="wnotes">' + esc(w.notes || '') + '</textarea></label></div>' +
      '<div id="strain-live">' + strainCardHtml(w) + '</div>';
    if (!w.exercises.length) html += '<div class="card empty-card"><p style="margin:0">No exercises yet. Add your first one below.</p></div>';
    w.exercises.forEach(function (we) { html += renderExerciseCard(w, we); });
    html += ui.picking ? renderPicker() : '<button class="btn primary wide" data-act="addex">Add exercise</button>';
    html += '<button class="btn danger wide" data-act="delworkout">Delete this workout</button>';
    return html;
  }


  /* ================= Strength analytics ================= */
  // Estimated 1RM uses the Epley formula: weight x (1 + reps / 30).
  // A set of exactly 1 rep uses its actual weight. Sets above 10 reps are not estimated.
  var E1RM_MAX_REPS = 10;
  function e1rm(weight, reps) {
    if (weight == null || !(weight > 0) || reps == null || reps < 1 || reps > E1RM_MAX_REPS) return null;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }
  function isActual(s) { return !!s.max && s.reps === 1 && s.weight > 0; } // a real 1RM attempt you flagged
  function fmtVal(n) { return String(Math.round(n * 10) / 10); }

  function sessionsFor(exId) { // every workout that contains this exercise, oldest first
    var out = [];
    db.workouts.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    }).forEach(function (w) {
      w.exercises.forEach(function (x) {
        if (x.exerciseId !== exId) return;
        var sets = x.sets.filter(isDone);
        if (sets.length) out.push({ w: w, date: w.date, sets: sets });
      });
    });
    return out;
  }

  function sessionStats(se, bw) {
    var st = { topW: null, topWSet: null, bestE: null, bestESet: null, topR: null, topRSet: null, actual: null, actualSet: null, vol: 0 };
    se.sets.forEach(function (s) {
      var w = s.weight > 0 ? s.weight : 0;
      st.vol += w * s.reps;
      if (w > 0 && (st.topW == null || w > st.topW || (w === st.topW && s.reps > st.topWSet.reps))) { st.topW = w; st.topWSet = s; }
      var e = bw ? null : e1rm(s.weight, s.reps);
      if (e != null && (st.bestE == null || e > st.bestE)) { st.bestE = e; st.bestESet = s; }
      if (st.topR == null || s.reps > st.topR || (s.reps === st.topR && w > (st.topRSet.weight || 0))) { st.topR = s.reps; st.topRSet = s; }
      if (isActual(s) && (st.actual == null || s.weight > st.actual)) { st.actual = s.weight; st.actualSet = s; }
    });
    st.bestSet = st.bestESet || st.topWSet || st.topRSet;
    return st;
  }

  // Personal records are recomputed from your saved workouts every time, so edits and deletes always stay correct.
  function exercisePRs(exId) {
    var bw = isBW(exId), sess = sessionsFor(exId), ev = [];
    var maxW = 0, maxE = 0, maxA = null, maxR = 0, repsAt = {};
    sess.forEach(function (se, idx) {
      var st = sessionStats(se, bw);
      var add = function (type, set, text) { ev.push({ exId: exId, type: type, date: se.date, workoutId: se.w.id, setId: set.id, text: text }); };
      var bestAt = {};
      if (!bw) se.sets.forEach(function (x) { if (x.weight > 0) { var k = String(x.weight); if (!bestAt[k] || x.reps > bestAt[k].reps) bestAt[k] = x; } });
      if (idx > 0) { // the very first session only sets the starting point
        if (st.topW != null && st.topW > maxW) add('weight', st.topWSet, 'Heaviest weight: ' + fmtSet(st.topWSet, bw));
        if (st.bestE != null && st.bestE > maxE) add('e1rm', st.bestESet, 'Estimated 1RM: ' + fmtVal(st.bestE) + ' kg');
        if (st.actual != null && maxA != null && st.actual > maxA) add('max', st.actualSet, 'New real 1RM: ' + fmtVal(st.actual) + ' kg');
        if (bw) { if (st.topR > maxR) add('reps', st.topRSet, 'Most reps in a set: ' + st.topR); }
        else Object.keys(bestAt).forEach(function (k) {
          if (repsAt[k] != null && bestAt[k].reps > repsAt[k]) add('repsAt', bestAt[k], bestAt[k].reps + ' reps at ' + num(bestAt[k].weight) + ' kg (was ' + repsAt[k] + ')');
        });
      }
      if (st.topW != null && st.topW > maxW) maxW = st.topW;
      if (st.bestE != null && st.bestE > maxE) maxE = st.bestE;
      if (st.actual != null && (maxA == null || st.actual > maxA)) maxA = st.actual;
      if (st.topR > maxR) maxR = st.topR;
      Object.keys(bestAt).forEach(function (k) { if (repsAt[k] == null || bestAt[k].reps > repsAt[k]) repsAt[k] = bestAt[k].reps; });
    });
    return ev;
  }

  function allPRs() {
    var ev = [];
    db.exercises.forEach(function (e) { ev = ev.concat(exercisePRs(e.id)); });
    return ev.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function prSetMap() { var m = {}; allPRs().forEach(function (e) { m[e.setId] = true; }); return m; }

  function exerciseRecords(exId) {
    var bw = isBW(exId), r = { heaviest: null, e1rm: null, actual: null, mostReps: null, byReps: {} };
    sessionsFor(exId).forEach(function (se) {
      se.sets.forEach(function (s) {
        var w = s.weight > 0 ? s.weight : 0;
        if (w > 0 && (!r.heaviest || w > r.heaviest.weight || (w === r.heaviest.weight && s.reps > r.heaviest.reps))) r.heaviest = { weight: w, reps: s.reps, date: se.date };
        var e = bw ? null : e1rm(s.weight, s.reps);
        if (e != null && (!r.e1rm || e > r.e1rm.value)) r.e1rm = { value: e, weight: w, reps: s.reps, date: se.date };
        if (isActual(s) && (!r.actual || s.weight > r.actual.weight)) r.actual = { weight: s.weight, date: se.date };
        if (!r.mostReps || s.reps > r.mostReps.reps || (s.reps === r.mostReps.reps && w > r.mostReps.weight)) r.mostReps = { reps: s.reps, weight: w, date: se.date };
        if (w > 0 && !bw) { var b = r.byReps[s.reps]; if (!b || w > b.weight) r.byReps[s.reps] = { weight: w, date: se.date }; }
      });
    });
    return r;
  }

  function rangeStart(range) {
    var n = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range];
    if (!n) return '';
    var d = new Date(); d.setMonth(d.getMonth() - n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function shortDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  function dayNum(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000; }
  function delta(a, b, unit) {
    var d = Math.round((a - b) * 10) / 10;
    return d === 0 ? 'no change' : (d > 0 ? '+' : '\u2212') + fmtVal(Math.abs(d)) + (unit ? ' ' + unit : '');
  }

  function chartSvg(main, extra, sel, hit) {
    var W = 340, H = 210, L = 44, R = 14, T = 14, B = 30;
    var all = main.concat(extra), ys = all.map(function (p) { return p.y; }), xs = all.map(function (p) { return dayNum(p.date); });
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var pad = (ymax - ymin) * 0.2; if (!pad) pad = Math.max(1, ymax * 0.1);
    ymin = Math.max(0, ymin - pad); ymax = ymax + pad;
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    function X(d) { return xmax === xmin ? L + (W - L - R) / 2 : L + (dayNum(d) - xmin) / (xmax - xmin) * (W - L - R); }
    function Y(v) { return T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B); }
    var g = '';
    for (var i = 0; i < 4; i++) {
      var v = ymin + (ymax - ymin) * i / 3, y = Y(v);
      g += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="ch-txt" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + ((ymax - ymin) >= 6 ? Math.round(v) : fmtVal(v)) + '</text>';
    }
    var first = main.concat(extra).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    g += '<text class="ch-txt" x="' + L + '" y="' + (H - 8) + '" text-anchor="start">' + shortDate(first[0].date) + '</text>';
    if (xmax !== xmin) g += '<text class="ch-txt" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + shortDate(first[first.length - 1].date) + '</text>';
    if (main.length > 1) g += '<polyline class="ch-line" fill="none" points="' + main.map(function (p) { return X(p.date) + ',' + Y(p.y); }).join(' ') + '"/>';
    extra.forEach(function (p) {
      var x = X(p.date), y = Y(p.y);
      g += '<path class="ch-actual" d="M' + x + ' ' + (y - 6.5) + ' L' + (x + 6.5) + ' ' + y + ' L' + x + ' ' + (y + 6.5) + ' L' + (x - 6.5) + ' ' + y + ' Z"/>';
    });
    main.forEach(function (p, i) {
      var x = X(p.date), y = Y(p.y);
      if (i === sel) g += '<circle class="ch-sel" cx="' + x + '" cy="' + y + '" r="9"/>';
      g += '<circle class="' + (p.pr ? 'ch-pr' : 'ch-pt') + '" cx="' + x + '" cy="' + y + '" r="' + (p.pr ? 5.5 : 4) + '"/>';
      g += '<circle class="ch-hit" cx="' + x + '" cy="' + y + '" r="16" ' + (hit || 'data-act="cpoint"') + ' data-i="' + i + '"/>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Progress graph">' + g + '</svg>';
  }

  var METRICS = {
    weight: { label: 'Weight', unit: 'kg', title: 'Top weight in a session' },
    e1rm: { label: 'Est. 1RM', unit: 'kg', title: 'Estimated 1RM (Epley)' },
    reps: { label: 'Reps', unit: 'reps', title: 'Most reps in a single set' }
  };

  function renderStrength() {
    var list = [];
    db.exercises.forEach(function (e) { var se = sessionsFor(e.id); if (se.length) list.push({ e: e, last: se[se.length - 1].date }); });
    if (!list.length) {
      return header('Strength Progress', 'Graphs, estimated 1RM and personal records') +
        '<div class="card empty-card"><h2>No strength data yet</h2><p>Log a workout with finished sets and your graphs and records will appear here.</p><a class="btn primary" href="#/log">Log workout</a></div>';
    }
    var S = ui.str;
    if (!S.ex || !find(list, function (x) { return x.e.id === S.ex; })) {
      S.ex = list.slice().sort(function (a, b) { return a.last < b.last ? 1 : -1; })[0].e.id; S.point = null;
    }
    var exId = S.ex, bw = isBW(exId), sess = sessionsFor(exId);
    var stats = sess.map(function (se) { return sessionStats(se, bw); });
    var hasAdded = stats.some(function (st) { return st.topW != null; });
    var avail = bw ? (hasAdded ? ['reps', 'weight'] : ['reps']) : ['weight', 'e1rm', 'reps'];
    if (avail.indexOf(S.metric) < 0) S.metric = avail[0];
    var m = S.metric, prs = exercisePRs(exId);
    var prType = { weight: 'weight', e1rm: 'e1rm', reps: bw ? 'reps' : 'repsAt' }[m];

    var start = rangeStart(S.range), main = [], extra = [];
    sess.forEach(function (se, i) {
      if (start && se.date < start) return;
      var st = stats[i], y = m === 'weight' ? st.topW : m === 'e1rm' ? st.bestE : st.topR;
      var best = st.bestSet;
      if (y != null) main.push({ date: se.date, y: y, st: st, se: se, best: best,
        pr: prs.some(function (e) { return e.workoutId === se.w.id && e.type === prType; }) });
      if (m === 'e1rm' && st.actual != null) extra.push({ date: se.date, y: st.actual });
    });
    if (S.point == null || S.point >= main.length) S.point = main.length - 1;

    var opts = list.sort(function (a, b) { return a.e.name.localeCompare(b.e.name); }).map(function (x) {
      return '<option value="' + esc(x.e.id) + '"' + (x.e.id === exId ? ' selected' : '') + '>' + esc(x.e.name) + '</option>';
    }).join('');
    var html = header('Strength Progress', 'Graphs, estimated 1RM and personal records') +
      '<div class="card"><label class="field" style="margin:0">Exercise<select data-in="sex">' + opts + '</select></label></div>';

    // graph
    html += '<div class="card"><h2>' + METRICS[m].title + '</h2><div class="chips">' +
      avail.map(function (k) { return '<button class="chip' + (k === m ? ' active' : '') + '" data-act="smetric" data-v="' + k + '">' + (bw && k === 'weight' ? 'Added kg' : METRICS[k].label) + '</button>'; }).join('') + '</div>' +
      '<div class="chips">' + [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']].map(function (r) {
        return '<button class="chip' + (S.range === r[0] ? ' active' : '') + '" data-act="srange" data-v="' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div>';
    if (!main.length) {
      html += '<p class="muted" style="margin:6px 0 0">No sessions with this measure in the selected range. Try a longer range.</p>';
    } else {
      html += chartSvg(main, extra, S.point);
      html += '<div class="legend"><span><i class="lg-pt"></i>Session</span><span><i class="lg-pr"></i>New record</span>' + (m === 'e1rm' && extra.length ? '<span><i class="lg-act"></i>Real 1RM attempt</span>' : '') + '</div>';
      var a = main[0], z = main[main.length - 1];
      if (main.length > 1) html += '<p class="muted small">' + shortDate(a.date) + ' to ' + shortDate(z.date) + ': ' + fmtVal(a.y) + ' to ' + fmtVal(z.y) + ' ' + METRICS[m].unit + ' (' + delta(z.y, a.y, METRICS[m].unit) + ').</p>';
      else html += '<p class="muted small">Only one session in this range, so there is no trend yet.</p>';
      var pt = main[S.point];
      html += '<div class="readout"><strong>' + fmtDate(pt.date) + '</strong><br>' + fmtVal(pt.y) + ' ' + METRICS[m].unit +
        (pt.best ? '<br><span class="muted">Best set: ' + fmtSet(pt.best, bw) + '</span>' : '') +
        '<br><span class="muted">All sets: ' + pt.se.sets.map(function (x) { return fmtSet(x, bw); }).join(', ') + '</span></div>';
    }
    html += '</div>';

    // records
    var rec = exerciseRecords(exId), rows = '';
    function recRow(label, val, date) { return '<div class="row"><span>' + label + '</span><span class="rv">' + val + (date ? '<br><span class="muted small">' + fmtDate(date) + '</span>' : '') + '</span></div>'; }
    if (rec.heaviest) rows += recRow(bw ? 'Heaviest added weight' : 'Heaviest weight', fmtSet({ weight: rec.heaviest.weight, reps: rec.heaviest.reps }, bw), rec.heaviest.date);
    if (!bw) {
      rows += rec.e1rm ? recRow('Best estimated 1RM', fmtVal(rec.e1rm.value) + ' kg <span class="muted small">(from ' + fmtSet({ weight: rec.e1rm.weight, reps: rec.e1rm.reps }, false) + ')</span>', rec.e1rm.date) : recRow('Best estimated 1RM', '<span class="muted">Not available yet</span>');
      rows += rec.actual ? recRow('Real 1RM (marked attempt)', fmtVal(rec.actual.weight) + ' kg', rec.actual.date) : recRow('Real 1RM (marked attempt)', '<span class="muted">None marked</span>');
    }
    if (rec.mostReps) rows += recRow('Most reps in a set', rec.mostReps.reps + (rec.mostReps.weight > 0 ? ' at ' + num(rec.mostReps.weight) + ' kg' : (bw ? ' (bodyweight)' : '')), rec.mostReps.date);
    html += '<div class="card"><h2>Personal records</h2><p class="muted small">All time, not limited by the range above.</p>' + rows + '</div>';

    var repKeys = Object.keys(rec.byReps).map(Number).sort(function (a, b) { return a - b; });
    if (repKeys.length) {
      html += '<div class="card"><h2>Best weight by reps</h2>' + repKeys.map(function (k) {
        return '<div class="row"><span>' + k + (k === 1 ? ' rep' : ' reps') + '</span><span class="rv">' + num(rec.byReps[k].weight) + ' kg<br><span class="muted small">' + fmtDate(rec.byReps[k].date) + '</span></span></div>';
      }).join('') + '</div>';
    }

    // comparison of the latest two sessions
    html += '<div class="card"><h2>Latest vs previous session</h2>';
    if (sess.length < 2) {
      html += '<p class="muted" style="margin:0">Log this exercise in one more workout to compare sessions.</p>';
    } else {
      var A = stats[stats.length - 1], Bp = stats[stats.length - 2];
      html += '<p class="muted small">' + fmtDate(sess[sess.length - 1].date) + ' compared with ' + fmtDate(sess[sess.length - 2].date) + '</p>';
      html += '<div class="row"><span>Best set</span><span class="rv">' + fmtSet(A.bestSet, bw) + '<br><span class="muted small">was ' + fmtSet(Bp.bestSet, bw) + '</span></span></div>';
      if (!bw && A.bestE != null && Bp.bestE != null) html += '<div class="row"><span>Estimated 1RM</span><span class="rv">' + fmtVal(A.bestE) + ' kg<br><span class="muted small">' + delta(A.bestE, Bp.bestE, 'kg') + '</span></span></div>';
      if (A.topW != null && Bp.topW != null) html += '<div class="row"><span>' + (bw ? 'Added weight' : 'Top weight') + '</span><span class="rv">' + fmtVal(A.topW) + ' kg<br><span class="muted small">' + delta(A.topW, Bp.topW, 'kg') + '</span></span></div>';
      if (!bw) html += '<div class="row"><span>Total volume</span><span class="rv">' + fmtVal(A.vol) + ' kg<br><span class="muted small">' + delta(A.vol, Bp.vol, 'kg') + '</span></span></div>';
      html += '<div class="row"><span>Most reps in a set</span><span class="rv">' + A.topR + '<br><span class="muted small">' + delta(A.topR, Bp.topR, '') + '</span></span></div>';
    }
    html += '</div>';

    // recent records for this exercise
    var recent = prs.slice().reverse().slice(0, 6);
    html += '<div class="card"><h2>Recent records</h2>' + (recent.length ? recent.map(function (e) {
      return '<div class="row"><span>' + fmtDate(e.date) + '</span><span class="rv">' + esc(e.text) + '</span></div>';
    }).join('') : '<p class="muted" style="margin:0">No new records yet. A record needs an earlier session to beat.</p>') + '</div>';

    html += '<p class="muted small foot">Estimated 1RM uses the Epley formula: weight \u00d7 (1 + reps \u00f7 30). Single reps use their actual weight and sets above ' + E1RM_MAX_REPS +
      ' reps are left out. These are estimates, not tested maximums. Real 1RM attempts only count when you mark a 1-rep set as one.</p>';
    return html;
  }


  /* ================= Workout strain (0 to 36) =================
     Idea: compare what you DID in a set with what you COULD have done, based on your own earlier workouts.
     1. For each exercise, "capacity" = your best estimated max from workouts BEFORE this one (Epley, sets up to 15 reps).
        With no earlier history, this workout's own sets are used instead.
     2. For each set: max reps possible at that weight = 30 x (capacity / weight - 1).
        effort = reps done / max reps possible (capped at 1). Bodyweight: reps / your best reps at that load or heavier.
     3. Work = sum of effort squared (hard sets count much more than easy ones or warm-ups).
     4. Time you typed in adjusts the work by roughly -40% (very short) to +25% (long). No time entered = no adjustment.
     5. The curved scale: score = 36 x (1 - e^(-work / 16)). Early points come easily, the top is hard to reach. */
  var STRAIN_MAX = 36, STRAIN_K = 16, STRAIN_CAP_REPS = 15;

  function isBefore(a, b) { return a.date < b.date || (a.date === b.date && a.createdAt < b.createdAt); }
  function priorSets(exId, w) {
    var out = [];
    db.workouts.forEach(function (o) {
      if (o.id === w.id || !isBefore(o, w)) return;
      o.exercises.forEach(function (x) { if (x.exerciseId === exId) x.sets.forEach(function (s) { if (isDone(s)) out.push(s); }); });
    });
    return out;
  }
  function setEffort(s, cap, bw) {
    var w = s.weight > 0 ? s.weight : 0;
    if (bw) {
      var base = 0;
      cap.forEach(function (p) { if ((p.weight > 0 ? p.weight : 0) >= w && p.reps > base) base = p.reps; });
      return { e: base ? Math.min(1, s.reps / base) : 1 };
    }
    if (w <= 0) return { skip: true };
    var E = 0;
    cap.forEach(function (p) { if (p.weight > 0) { var est = p.weight * (1 + Math.min(p.reps, STRAIN_CAP_REPS) / 30); if (est > E) E = est; } });
    if (w >= E) return { e: 1 };
    return { e: Math.min(1, s.reps / (30 * (E / w - 1))) };
  }
  function workoutStrain(w) {
    var V = 0, n = 0, sumE = 0, skipped = 0, learning = [];
    w.exercises.forEach(function (x) {
      var done = x.sets.filter(isDone);
      if (!done.length) return;
      var cap = priorSets(x.exerciseId, w);
      if (!cap.length) { cap = done; learning.push(exName(x.exerciseId)); }
      var bw = isBW(x.exerciseId);
      done.forEach(function (s) {
        var r = setEffort(s, cap, bw);
        if (r.skip) { skipped++; return; }
        V += r.e * r.e; sumE += r.e; n++;
      });
    });
    if (!n) return null;
    var d = w.duration > 0 ? w.duration : null;
    var tf = d ? 0.6 + 0.65 * (1 - Math.exp(-d / 45)) : 1;
    var raw = V * tf;
    return { score: Math.round(STRAIN_MAX * (1 - Math.exp(-raw / STRAIN_K)) * 10) / 10, sets: n, avgEffort: sumE / n, work: V, duration: d, timeFactor: tf, learning: learning, skipped: skipped };
  }
  function strainLabel(x) { return x < 9 ? 'Light' : x < 17 ? 'Moderate' : x < 25 ? 'Hard' : x < 31 ? 'Very hard' : 'All-out'; }

  function gaugeSvg(score) {
    var r = 54, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, score / STRAIN_MAX));
    return '<svg class="gauge" viewBox="0 0 140 140" role="img" aria-label="Strain ' + score.toFixed(1) + ' out of ' + STRAIN_MAX + '">' +
      '<circle class="g-bg" cx="70" cy="70" r="' + r + '"/>' +
      (f > 0 ? '<circle class="g-fg" cx="70" cy="70" r="' + r + '" stroke-dasharray="' + (c * f).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 70 70)"/>' : '') +
      '<text class="g-num" x="70" y="77" text-anchor="middle">' + score.toFixed(1) + '</text><text class="g-sub" x="70" y="97" text-anchor="middle">of ' + STRAIN_MAX + '</text></svg>';
  }

  function strainCardHtml(w) {
    var st = workoutStrain(w);
    if (!st) return '<div class="card"><h2>Workout strain</h2><p class="muted" style="margin:0">Finish a set with weight and reps to see this workout\u2019s strain.</p></div>';
    var notes = '';
    if (st.learning.length) notes += '<p class="muted small">No earlier history for ' + esc(st.learning.join(', ')) + ', so the comparison used this workout alone. Scores get more meaningful as you log more sessions.</p>';
    if (st.skipped) notes += '<p class="muted small">' + st.skipped + ' set' + (st.skipped === 1 ? ' has' : 's have') + ' no weight and ' + (st.skipped === 1 ? 'is' : 'are') + ' not counted.</p>';
    return '<div class="card strain"><div class="strain-top">' + gaugeSvg(st.score) +
      '<div><h2>Workout strain</h2><div class="strain-label">' + strainLabel(st.score) + '</div>' +
      '<p class="muted small" style="margin:6px 0 0">' + st.sets + ' set' + (st.sets === 1 ? '' : 's') + ' counted<br>Average effort ' + Math.round(st.avgEffort * 100) + '% of your best' +
      '<br>' + (st.duration ? 'Time ' + st.duration + ' min (\u00d7' + st.timeFactor.toFixed(2) + ')' : 'No time entered, so time is not counted') + '</p></div></div>' + notes +
      '<details class="how"><summary>How is this calculated?</summary><p>Each set is compared with the most you could have done at that weight, based on your own earlier workouts. ' +
      'Hard sets count much more than easy sets or warm-ups, and the time you enter adjusts the total a little. The result is put on a curved 0 to ' + STRAIN_MAX +
      ' scale, so the top is hard to reach. It is an estimate of workout load from weight, reps and time, not a medical measurement.</p></details></div>';
  }
  function refreshStrain(w) { var el = document.getElementById('strain-live'); if (el) el.innerHTML = strainCardHtml(w); }

  /* ---------- Dashboard: month dots ---------- */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function renderDots() {
    var t = today(), y = +t.slice(0, 4), mo = +t.slice(5, 7), dim = new Date(y, mo, 0).getDate();
    var by = {}, days = 0;
    loggedWorkouts().forEach(function (w) {
      if (w.date.slice(0, 7) !== t.slice(0, 7)) return;
      var st = workoutStrain(w); if (!st) return;
      if (!by[w.date]) { by[w.date] = { max: 0, list: [] }; days++; }
      by[w.date].list.push({ w: w, st: st }); if (st.score > by[w.date].max) by[w.date].max = st.score;
    });
    var html = '<div class="card dots-card"><div class="dots-head"><h2>' + monthLabel(t) + '</h2><span class="muted small">' + days + ' training day' + (days === 1 ? '' : 's') + '</span></div><div class="dots">';
    for (var d = 1; d <= dim; d++) {
      var iso = y + '-' + pad2(mo) + '-' + pad2(d), cls = 'dot', style = '', label = fmtDate(iso);
      if (by[iso]) { cls += ' work'; style = ' style="background:rgba(95,191,138,' + (0.3 + 0.7 * Math.min(1, by[iso].max / 30)).toFixed(2) + ')"'; label += ', strain ' + by[iso].max.toFixed(1); }
      else if (iso > t) cls += ' future'; else cls += ' rest';
      if (iso === t) cls += ' today';
      if (ui.dashDay === iso) cls += ' picked';
      html += '<button class="' + cls + '"' + style + ' data-act="dday" data-d="' + iso + '" aria-label="' + label + '"></button>';
    }
    html += '</div><div class="dots-legend muted small"><span>Rest</span><i class="dl-rest"></i><span>Light</span><i class="dl-grad"></i><span>Hard</span></div>';
    if (ui.dashDay && ui.dashDay.slice(0, 7) === t.slice(0, 7)) {
      var e = by[ui.dashDay];
      html += '<div class="readout"><strong>' + fmtDate(ui.dashDay) + '</strong>';
      if (e) e.list.forEach(function (x) {
        html += '<br>Strain ' + x.st.score.toFixed(1) + ' (' + strainLabel(x.st.score) + '), ' + x.w.exercises.length + ' exercise' + (x.w.exercises.length === 1 ? '' : 's') +
          ' <button class="link" data-act="dopen" data-id="' + esc(x.w.id) + '">Open</button>';
      }); else html += '<br><span class="muted">' + (ui.dashDay > t ? 'Upcoming day.' : 'No workout logged.') + '</span>';
      html += '</div>';
    }
    return html + '</div>';
  }

  /* ================= Body measurements ================= */
  var BODY_TYPES = [
    { id: 'weight', name: 'Body weight', unit: 'kg', min: 20, max: 500 },
    { id: 'bodyfat', name: 'Body fat', unit: '%', min: 1, max: 70 },
    { id: 'chest', name: 'Chest', unit: 'cm', min: 5, max: 300 },
    { id: 'armL', name: 'Left arm', unit: 'cm', min: 5, max: 300 },
    { id: 'armR', name: 'Right arm', unit: 'cm', min: 5, max: 300 },
    { id: 'waist', name: 'Waist', unit: 'cm', min: 5, max: 300 },
    { id: 'thigh', name: 'Thigh', unit: 'cm', min: 5, max: 300 }
  ];
  function bodyTypes() {
    return BODY_TYPES.concat(db.measureTypes.map(function (c) { return { id: c.id, name: c.name, unit: c.unit, min: 0, max: 1000000, custom: true }; }));
  }
  function bodyType(id) { return find(bodyTypes(), function (t) { return t.id === id; }); }
  function fmtN(n) { return String(Math.round(n * 100) / 100); }
  function parseBody(v, t) {
    v = v.trim().replace(',', '.');
    if (v === '') return { ok: true, val: null };
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return { ok: false };
    var n = parseFloat(v);
    return (n >= t.min && n <= t.max) ? { ok: true, val: n } : { ok: false };
  }
  function rangeText(t) { return t.custom ? 'a number' : t.min + ' to ' + t.max + ' ' + t.unit; }

  function entriesFor(typeId) {
    return db.measurements.filter(function (m) { return m.type === typeId; }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  }
  function bodyDays(typeId) { // one point per date: the average if several were entered that day
    var map = {}, order = [];
    entriesFor(typeId).forEach(function (m) { if (!map[m.date]) { map[m.date] = []; order.push(m.date); } map[m.date].push(m.value); });
    return order.map(function (d) {
      var a = map[d], sum = 0; a.forEach(function (x) { sum += x; });
      return { date: d, y: Math.round(sum / a.length * 100) / 100, n: a.length };
    });
  }
  function bodyStatCard(typeId, label) {
    var t = bodyType(typeId), days = bodyDays(typeId);
    if (!days.length) return '<div class="card"><div class="stat-label">' + label + '</div><div class="stat-value empty">No data</div></div>';
    var last = days[days.length - 1], prev = days.length > 1 ? days[days.length - 2] : null;
    return '<div class="card"><div class="stat-label">' + label + '</div><div class="stat-value">' + fmtN(last.y) + '<span class="unit"> ' + t.unit + '</span></div>' +
      '<div class="muted small">' + shortDate(last.date) + (prev ? ' \u00b7 ' + delta(last.y, prev.y, t.unit) : '') + '</div></div>';
  }

  var PENCIL = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  function renderBodyForm() {
    var B = ui.body;
    var fields = bodyTypes().map(function (t) {
      return '<label class="field bf"><span>' + esc(t.name) + ' (' + esc(t.unit) + ')</span><input inputmode="decimal" autocomplete="off" data-in="bf" data-t="' + esc(t.id) + '" value="' + esc(B.draft[t.id] || '') + '"></label>';
    }).join('');
    var custom = '<button class="btn" data-act="bcustomtoggle">' + (B.newCustom ? 'Close custom measurements' : 'Add custom measurement') + '</button>';
    if (B.newCustom) {
      custom += '<div class="custom-box"><label class="field">Name<input id="cm-name" maxlength="30" placeholder="e.g. Neck" autocomplete="off"></label>' +
        '<label class="field">Unit<input id="cm-unit" maxlength="10" value="cm" autocomplete="off"></label>' +
        '<button class="btn primary" data-act="bcustomcreate">Create measurement</button>';
      if (db.measureTypes.length) {
        custom += '<h2 class="section">Your custom measurements</h2>' + db.measureTypes.map(function (c) {
          return '<div class="entry"><div class="grow">' + esc(c.name) + ' <span class="muted">(' + esc(c.unit) + ')</span></div><button class="btn danger sm" data-act="bcustomdel" data-id="' + esc(c.id) + '">Delete</button></div>';
        }).join('');
      }
      custom += '</div>';
    }
    return '<div class="card"><h2>Add measurements</h2><p class="muted small">Fill in only what you measured. Each value is saved as its own entry for the date below.</p>' +
      '<label class="field">Date<input type="date" value="' + esc(B.date || today()) + '" data-in="bdate"></label>' +
      '<div class="two">' + fields + '</div>' +
      (B.msg ? '<p class="ok">' + esc(B.msg) + '</p>' : '') +
      '<button class="btn primary wide" data-act="bsave">Save measurements</button>' + custom + '</div>';
  }

  function renderBodyGraph(t) {
    var B = ui.body, days = bodyDays(t.id);
    if (!days.length) return '';
    var range = B.ranges[t.id] || 'all', start = rangeStart(range);
    var pts = days.filter(function (d) { return !start || d.date >= start; });
    var html = '<div class="card"><h2>' + esc(t.name) + ' <span class="muted">(' + esc(t.unit) + ')</span></h2><div class="chips">' +
      [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']].map(function (r) {
        return '<button class="chip' + (range === r[0] ? ' active' : '') + '" data-act="brange" data-t="' + esc(t.id) + '" data-v="' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div>';
    var last = days[days.length - 1], prev = days.length > 1 ? days[days.length - 2] : null;
    html += '<p style="margin:4px 0 2px"><span class="big">' + fmtN(last.y) + '</span> ' + esc(t.unit) + ' <span class="muted small">on ' + shortDate(last.date) + (prev ? ' \u00b7 ' + delta(last.y, prev.y, t.unit) + ' since previous' : '') + '</span></p>';
    if (!pts.length) {
      html += '<p class="muted small">No entries in this range. Try a longer range.</p>';
    } else {
      var sel = B.sel[t.id]; if (sel == null || sel >= pts.length) sel = pts.length - 1;
      html += chartSvg(pts.map(function (d) { return { date: d.date, y: d.y, pr: false }; }), [], sel, 'data-act="bpoint" data-t="' + esc(t.id) + '"');
      if (pts.length > 1) html += '<p class="muted small">' + shortDate(pts[0].date) + ' to ' + shortDate(pts[pts.length - 1].date) + ': ' + fmtN(pts[0].y) + ' to ' + fmtN(pts[pts.length - 1].y) + ' ' + esc(t.unit) + ' (' + delta(pts[pts.length - 1].y, pts[0].y, t.unit) + ').</p>';
      else html += '<p class="muted small">Only one entry in this range, so there is no trend yet.</p>';
      var pt = pts[sel];
      html += '<div class="readout"><strong>' + fmtDate(pt.date) + '</strong><br>' + fmtN(pt.y) + ' ' + esc(t.unit) + (pt.n > 1 ? '<br><span class="muted">Average of ' + pt.n + ' entries that day</span>' : '') + '</div>';
    }
    if (t.id === 'bodyfat') html += '<p class="muted small" style="margin-bottom:0">Body-fat readings vary a lot between devices, times of day and hydration. Look at the trend over weeks, not single values.</p>';
    return html + '</div>';
  }

  function renderBodyEntries() {
    var B = ui.body, types = bodyTypes();
    var prevDelta = {};
    types.forEach(function (t) { var prev = null; entriesFor(t.id).forEach(function (m) { if (prev != null) prevDelta[m.id] = m.value - prev; prev = m.value; }); });
    var list = db.measurements.filter(function (m) { return bodyType(m.type) && (!B.filter || m.type === B.filter); }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    var opts = '<option value="">All measurements</option>' + types.map(function (t) { return '<option value="' + esc(t.id) + '"' + (B.filter === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var html = '<div class="card"><h2>Measurement history</h2><label class="field"><select data-in="btype">' + opts + '</select></label>';
    if (!list.length) return html + '<p class="muted" style="margin:0">Nothing here yet.</p></div>';
    list.slice(0, B.limit).forEach(function (m) {
      var t = bodyType(m.type);
      if (B.edit === m.id) {
        html += '<div class="entry edit"><div class="grow"><strong>' + esc(t.name) + '</strong>' +
          '<label class="field">Date<input type="date" id="be-date" value="' + esc(m.date) + '"></label>' +
          '<label class="field">Value (' + esc(t.unit) + ')<input id="be-value" inputmode="decimal" autocomplete="off" value="' + esc(fmtN(m.value)) + '"></label>' +
          '<button class="btn primary" data-act="beditsave" data-id="' + esc(m.id) + '">Save</button><button class="btn" data-act="beditcancel">Cancel</button></div></div>';
        return;
      }
      html += '<div class="entry"><div class="grow"><strong>' + fmtN(m.value) + ' ' + esc(t.unit) + '</strong> <span class="muted">' + esc(t.name) + '</span><br>' +
        '<span class="muted small">' + fmtDate(m.date) + (prevDelta[m.id] != null ? ' \u00b7 ' + delta(m.value, m.value - prevDelta[m.id], t.unit) + ' vs previous' : '') + '</span></div>' +
        '<button class="icon-btn" aria-label="Edit entry" data-act="bedit" data-id="' + esc(m.id) + '">' + PENCIL + '</button>' +
        '<button class="icon-btn" aria-label="Delete entry" data-act="bdel" data-id="' + esc(m.id) + '">' + X + '</button></div>';
    });
    if (list.length > B.limit) html += '<button class="btn wide" data-act="bmore">Show more</button>';
    return html + '</div>';
  }

  function renderBody() {
    var html = header('Body Progress', 'Weight, body fat and measurements') + renderBodyForm();
    var graphs = bodyTypes().map(renderBodyGraph).join('');
    if (!db.measurements.length) {
      html += '<div class="card empty-card"><h2>No measurements yet</h2><p style="margin:0">Add your first measurement above. Graphs appear here for every measurement you record.</p></div>';
    } else html += graphs + renderBodyEntries();
    return html;
  }

  function onBodyClick(act, btn) {
    var B = ui.body;
    if (act === 'bsave') {
      var date = B.date || today();
      if (!validDate(date)) { alert('Please choose a valid date.'); return; }
      var inputs = view.querySelectorAll('[data-in="bf"]'), made = [], bad = [];
      Array.prototype.forEach.call(inputs, function (el) {
        var t = bodyType(el.getAttribute('data-t')); if (!t) return;
        var r = parseBody(el.value, t);
        if (!r.ok) { bad.push(t.name + ' (' + rangeText(t) + ')'); el.classList.add('bad'); }
        else if (r.val != null) made.push({ id: uid(), date: date, type: t.id, value: r.val, createdAt: new Date().toISOString() });
      });
      if (bad.length) { alert('Please check these values:\n' + bad.join('\n')); return; }
      if (!made.length) { alert('Enter at least one measurement first.'); return; }
      made.forEach(function (m) { db.measurements.push(m); });
      if (!save()) { alert('Could not save. Your data was not changed.'); db.measurements = db.measurements.filter(function (m) { return made.indexOf(m) < 0; }); return; }
      B.draft = {}; B.msg = 'Saved ' + made.length + ' measurement' + (made.length === 1 ? '' : 's') + ' for ' + fmtDate(date) + '.';
      rerender();
    } else if (act === 'bcustomtoggle') { B.newCustom = !B.newCustom; rerender(); }
    else if (act === 'bcustomcreate') {
      var name = document.getElementById('cm-name').value.replace(/\s+/g, ' ').trim(), unit = document.getElementById('cm-unit').value.trim() || 'cm';
      if (!name) { alert('Please type a name.'); return; }
      if (bodyTypes().some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) { alert('A measurement with that name already exists.'); return; }
      db.measureTypes.push({ id: 'c' + uid(), name: name, unit: unit }); save(); B.msg = ''; rerender();
    } else if (act === 'bcustomdel') {
      var id = btn.getAttribute('data-id'), ct = find(db.measureTypes, function (c) { return c.id === id; });
      if (!ct) return;
      var cnt = db.measurements.filter(function (m) { return m.type === id; }).length;
      if (!confirm('Delete "' + ct.name + '"' + (cnt ? ' and its ' + cnt + ' saved entr' + (cnt === 1 ? 'y' : 'ies') : '') + '? This cannot be undone.')) return;
      db.measureTypes = db.measureTypes.filter(function (c) { return c.id !== id; });
      db.measurements = db.measurements.filter(function (m) { return m.type !== id; }); save(); rerender();
    } else if (act === 'brange') { var tid = btn.getAttribute('data-t'); B.ranges[tid] = btn.getAttribute('data-v'); B.sel[tid] = null; rerender(); }
    else if (act === 'bpoint') { B.sel[btn.getAttribute('data-t')] = parseInt(btn.getAttribute('data-i'), 10); rerender(); }
    else if (act === 'bedit') { B.edit = btn.getAttribute('data-id'); rerender(); }
    else if (act === 'beditcancel') { B.edit = null; rerender(); }
    else if (act === 'beditsave') {
      var m = find(db.measurements, function (x) { return x.id === btn.getAttribute('data-id'); }); if (!m) return;
      var t2 = bodyType(m.type), nd = document.getElementById('be-date').value, nv = parseBody(document.getElementById('be-value').value, t2);
      if (!validDate(nd)) { alert('Please choose a valid date.'); return; }
      if (!nv.ok || nv.val == null) { alert('Please enter a valid value: ' + rangeText(t2) + '.'); return; }
      m.date = nd; m.value = nv.val; save(); B.edit = null; rerender();
    } else if (act === 'bdel') {
      var dm = find(db.measurements, function (x) { return x.id === btn.getAttribute('data-id'); }); if (!dm) return;
      var dt = bodyType(dm.type);
      if (!confirm('Delete this entry (' + fmtN(dm.value) + ' ' + dt.unit + ', ' + fmtDate(dm.date) + ')? This cannot be undone.')) return;
      db.measurements = db.measurements.filter(function (x) { return x.id !== dm.id; }); save(); rerender();
    } else if (act === 'bmore') { B.limit += 30; rerender(); }
  }

  /* ================= My Plan (rich-text notebook) ================= */
  var SIZE_KW = ['x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large'];
  var PLAN_COLORS = [['Default', '#e9efeb'], ['Green', '#5fbf8a'], ['Yellow', '#e0b45a'], ['Orange', '#f0985a'], ['Red', '#f07a7a'], ['Blue', '#6aa8ff'], ['Purple', '#b58cf0'], ['Grey', '#9aa6a0']];
  var planEl = null, planTimer = null, planRange = null, planStatusTimer = null;

  // Everything pasted or loaded goes through this cleaner: only simple formatting survives, nothing that could run code.
  var DROP = { SCRIPT: 1, STYLE: 1, META: 1, TITLE: 1, HEAD: 1, LINK: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, SVG: 1, IMG: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1, TEMPLATE: 1, NOSCRIPT: 1, FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1 };
  var BLOCK = { P: 'p', DIV: 'div', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', UL: 'ul', OL: 'ol', LI: 'li', TR: 'p', BLOCKQUOTE: 'div', PRE: 'div' };
  var INLINE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u' };

  function sizeFromCss(v) {
    v = (v || '').trim().toLowerCase();
    if (v === '-webkit-xxx-large') return 'xxx-large';
    if (SIZE_KW.indexOf(v) > -1) return v === 'medium' ? null : v;
    var m = /^([\d.]+)(px|pt)$/.exec(v);
    if (!m) return null;
    var px = parseFloat(m[1]) * (m[2] === 'pt' ? 1.333 : 1);
    return px <= 11 ? 'x-small' : px <= 13 ? 'small' : px <= 17 ? null : px <= 20 ? 'large' : px <= 26 ? 'x-large' : px <= 34 ? 'xx-large' : 'xxx-large';
  }
  function colorFromCss(v) {
    if (!v) return null;
    var t = document.createElement('span'); t.style.color = v;
    var c = t.style.color, m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    if (!m) return null;
    var lin = function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var lum = 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
    return (lum + 0.05) / 0.061 < 3 ? null : c; // too little contrast on the dark background (pasted black text, for example): drop it
  }
  function cleanInto(src, out) {
    Array.prototype.forEach.call(src.childNodes, function (ch) {
      if (ch.nodeType === 3) { out.appendChild(document.createTextNode(ch.nodeValue)); return; }
      if (ch.nodeType !== 1 || DROP[ch.tagName]) return;
      if (ch.tagName === 'BR') { out.appendChild(document.createElement('br')); return; }
      var target = out;
      function wrap(name, style) { var e = document.createElement(name); if (style) e.setAttribute('style', style); target.appendChild(e); target = e; }
      if (BLOCK[ch.tagName]) wrap(BLOCK[ch.tagName]);
      else if (INLINE[ch.tagName]) wrap(INLINE[ch.tagName]);
      var st = ch.style || {};
      if (st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600) wrap('b');
      if (st.fontStyle === 'italic') wrap('i');
      if ((st.textDecorationLine || st.textDecoration || '').indexOf('underline') > -1) wrap('u');
      var col = colorFromCss(st.color || (ch.tagName === 'FONT' ? ch.getAttribute('color') : ''));
      var sz = sizeFromCss(st.fontSize);
      if (!sz && ch.tagName === 'FONT' && ch.getAttribute('size')) sz = sizeFromCss(SIZE_KW[Math.max(0, Math.min(6, parseInt(ch.getAttribute('size'), 10) - 1))]);
      var css = (col ? 'color: ' + col + ';' : '') + (sz ? ' font-size: ' + sz + ';' : '');
      if (css) wrap('span', css.trim());
      cleanInto(ch, target);
    });
  }
  function sanitizeHtml(html) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html'), out = document.createElement('div');
    cleanInto(doc.body, out);
    return out.innerHTML;
  }
  function textToHtml(t) {
    return t.replace(/\r\n?/g, '\n').split('\n').map(function (l) { return '<p>' + (l ? esc(l) : '<br>') + '</p>'; }).join('');
  }

  function timeLabel(iso) { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function setPlanStatus(t, temp) {
    var el = document.getElementById('plan-status'); if (!el) return;
    el.textContent = t;
    clearTimeout(planStatusTimer);
    if (temp) planStatusTimer = setTimeout(function () { el.textContent = db.planUpdatedAt ? 'Saved ' + timeLabel(db.planUpdatedAt) : 'Nothing saved yet'; }, 2500);
  }
  function isPlanEmpty() { return !planEl.textContent.trim() && !planEl.querySelector('li'); }
  function updatePlanEmpty() { planEl.classList.toggle('is-empty', isPlanEmpty()); }

  function planDirty() { setPlanStatus('Saving...'); clearTimeout(planTimer); planTimer = setTimeout(flushPlan, 400); }
  function flushPlan() {
    clearTimeout(planTimer); planTimer = null;
    if (!planEl || !document.body.contains(planEl)) return;
    var html = isPlanEmpty() ? '' : planEl.innerHTML;
    if (html !== (db.plan || '')) {
      var before = db.plan, beforeAt = db.planUpdatedAt;
      db.plan = html; db.planUpdatedAt = new Date().toISOString();
      if (!save()) { db.plan = before; db.planUpdatedAt = beforeAt; setPlanStatus(loadError ? 'Saving is paused: saved data could not be read.' : 'Could not save. Try Copy to keep your text.'); return; }
    }
    setPlanStatus(db.planUpdatedAt ? 'Saved ' + timeLabel(db.planUpdatedAt) : 'Nothing saved yet');
  }

  function onSelChange() {
    if (!planEl || !document.body.contains(planEl)) return;
    var sel = window.getSelection();
    if (sel.rangeCount && planEl.contains(sel.anchorNode)) { planRange = sel.getRangeAt(0).cloneRange(); updateToolbarState(); }
  }
  function restoreSel() {
    var had = document.activeElement === planEl;
    if (!had) planEl.focus();
    if (!had && planRange) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(planRange); }
  }
  function planCmd(cmd, val) {
    if (!planEl) return;
    restoreSel();
    try { document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'fontSize'); } catch (e) {}
    document.execCommand(cmd, false, val == null ? null : val);
    updatePlanEmpty(); planDirty(); updateToolbarState();
  }
  function updateToolbarState() {
    var bar = document.getElementById('plan-toolbar'); if (!bar) return;
    var block = '';
    try { block = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, ''); } catch (e) {}
    Array.prototype.forEach.call(bar.querySelectorAll('[data-cmd]'), function (b) {
      var c = b.getAttribute('data-cmd'), v = b.getAttribute('data-val'), on = false;
      try {
        if (c === 'bold' || c === 'italic' || c === 'underline' || c === 'insertUnorderedList' || c === 'insertOrderedList') on = document.queryCommandState(c);
        else if (c === 'formatBlock') on = v === block || (v === 'p' && (block === 'div' || block === 'p' || block === ''));
      } catch (e) {}
      b.classList.toggle('on', !!on);
    });
  }

  function onPlanPaste(ev) {
    ev.preventDefault();
    var cd = ev.clipboardData; if (!cd) return;
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    var out = html ? sanitizeHtml(html) : '';
    if (!out && text) out = textToHtml(text);
    if (out) document.execCommand('insertHTML', false, out);
  }

  function initPlan() {
    planEl = document.getElementById('plan-editor');
    if (!planEl) return;
    planEl.innerHTML = db.plan ? sanitizeHtml(db.plan) : '';
    updatePlanEmpty();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    setPlanStatus(loadError ? 'Saving is paused: saved data could not be read.' : (db.planUpdatedAt ? 'Saved ' + timeLabel(db.planUpdatedAt) : 'Nothing saved yet'));
    planEl.addEventListener('input', function () { updatePlanEmpty(); planDirty(); });
    planEl.addEventListener('paste', onPlanPaste);
    planEl.addEventListener('drop', function (e) { e.preventDefault(); });
    planEl.addEventListener('blur', flushPlan);
  }

  function copyPlan() {
    var html = planEl.innerHTML, text = planEl.innerText;
    function plain() {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return Promise.reject(new Error('no clipboard'));
    }
    var p = (navigator.clipboard && window.ClipboardItem)
      ? navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).catch(plain)
      : plain();
    p.then(function () { setPlanStatus('Copied. Paste it anywhere.', true); }, function () { setPlanStatus('Copy was blocked. Select the text and copy it manually.', true); });
  }
  function downloadPlan() {
    var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Plan</title>' +
      '<style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0c0f0e;color:#e9efeb;max-width:720px;margin:0 auto;padding:24px;line-height:1.55}h2{font-size:26px}h3{font-size:20px}</style></head><body>' + planEl.innerHTML + '</body></html>';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    a.download = 'ironlog-plan-' + today() + '.html'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    setPlanStatus('Downloaded as a file.', true);
  }
  function onPlanClick(act, btn) {
    if (act === 'pcmd') planCmd(btn.getAttribute('data-cmd'), btn.getAttribute('data-val'));
    else if (act === 'pcopy') copyPlan();
    else if (act === 'pdownload') downloadPlan();
  }

  function tb(label, cmd, val, title) {
    return '<button type="button" class="tb" data-act="pcmd" data-cmd="' + cmd + '"' + (val != null ? ' data-val="' + val + '"' : '') + ' aria-label="' + title + '" title="' + title + '">' + label + '</button>';
  }
  function renderPlan() {
    var svg = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
    var sep = '<span class="tb-sep"></span>';
    var bar = tb(svg('<path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>'), 'undo', null, 'Undo') +
      tb(svg('<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>'), 'redo', null, 'Redo') + sep +
      tb('Text', 'formatBlock', 'p', 'Normal text') + tb('Heading', 'formatBlock', 'h2', 'Heading') + tb('Sub', 'formatBlock', 'h3', 'Subheading') + sep +
      tb('<b>B</b>', 'bold', null, 'Bold') + tb('<i>I</i>', 'italic', null, 'Italic') + tb('<u>U</u>', 'underline', null, 'Underline') + sep +
      tb(svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), 'insertUnorderedList', null, 'Bullet list') + tb('1.', 'insertOrderedList', null, 'Numbered list') + sep +
      tb('S', 'fontSize', '2', 'Small text') + tb('M', 'fontSize', '3', 'Normal size') + tb('L', 'fontSize', '5', 'Large text') + tb('XL', 'fontSize', '6', 'Extra large text') + sep +
      PLAN_COLORS.map(function (c) { return '<button type="button" class="tb sw" data-act="pcmd" data-cmd="foreColor" data-val="' + c[1] + '" aria-label="Text colour: ' + c[0] + '" title="' + c[0] + '"><i style="background:' + c[1] + '"></i></button>'; }).join('') + sep +
      tb('Clear', 'removeFormat', null, 'Clear formatting');
    return header('My Plan', 'Your personal workout notebook') +
      '<div class="plan-bar" id="plan-toolbar" role="toolbar" aria-label="Formatting">' + bar + '</div>' +
      '<div id="plan-editor" class="plan-editor is-empty" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Workout plan" data-placeholder="Write or paste your workout plan here" spellcheck="true"></div>' +
      '<p id="plan-status" class="muted small plan-status"></p>' +
      '<div class="plan-foot"><button class="btn" data-act="pcopy">Copy</button><button class="btn" data-act="pdownload">Download</button></div>' +
      '<p class="muted small">Saves automatically as you type. Your plan is separate from workout logging, so logging a workout never changes it. Formatting applies to the text you select.</p>';
  }

  /* ---------- Workout History ---------- */
  function monthLabel(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  function histActive() { var h = ui.hist; return !!(h.q.trim() || h.ex || h.from || h.to); }

  function filteredWorkouts() {
    var h = ui.hist, q = h.q.trim().toLowerCase();
    return db.workouts.slice().sort(byNewest).filter(function (w) {
      if (h.from && w.date < h.from) return false;
      if (h.to && w.date > h.to) return false;
      if (h.ex && !w.exercises.some(function (x) { return x.exerciseId === h.ex; })) return false;
      if (q) {
        var hit = (w.notes || '').toLowerCase().indexOf(q) > -1 || w.exercises.some(function (x) {
          return exName(x.exerciseId).toLowerCase().indexOf(q) > -1 ||
            x.sets.some(function (s) { return (s.note || '').toLowerCase().indexOf(q) > -1; });
        });
        if (!hit) return false;
      }
      return true;
    });
  }

  function workoutSummary(w) {
    var h = ui.hist;
    if (!w.exercises.length) return '<span class="muted">No exercises</span>';
    if (h.ex) { // reviewing one exercise: show its sets for every session
      return w.exercises.filter(function (x) { return x.exerciseId === h.ex; }).map(function (x) {
        var bw = isBW(x.exerciseId), done = x.sets.filter(isDone);
        return '<span class="muted">' + (done.length ? done.map(function (s) { return fmtSet(s, bw); }).join(', ') : 'No finished sets') + '</span>';
      }).join('<br>');
    }
    return '<span class="muted">' + w.exercises.map(function (x) {
      return esc(exName(x.exerciseId)) + ' (' + x.sets.length + ')';
    }).join(', ') + '</span>';
  }

  function renderHistoryResults() {
    if (!db.workouts.length) {
      return '<div class="card empty-card"><h2>No workouts yet</h2><p>Workouts you log will show up here.</p><a class="btn primary" href="#/log">Log workout</a></div>';
    }
    var list = filteredWorkouts();
    if (!list.length) return '<div class="card empty-card"><p style="margin:0">No workouts match these filters.</p></div>';
    var html = '<p class="muted count">' + list.length + ' workout' + (list.length === 1 ? '' : 's') + '</p>', month = '';
    list.forEach(function (w) {
      var m = monthLabel(w.date);
      if (m !== month) { month = m; html += '<h2 class="section">' + m + '</h2>'; }
      html += '<button class="card item" data-act="hopen" data-id="' + esc(w.id) + '"><span class="grow"><strong>' + fmtDate(w.date) + '</strong><br>' +
        workoutSummary(w) + '</span><span class="muted">Open</span></button>';
    });
    return html;
  }

  function renderHistoryList() {
    var h = ui.hist;
    var used = {};
    db.workouts.forEach(function (w) { w.exercises.forEach(function (x) { used[x.exerciseId] = true; }); });
    var opts = db.exercises.filter(function (e) { return used[e.id]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (e) { return '<option value="' + esc(e.id) + '"' + (h.ex === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('');
    return header('Workout History', 'Browse, search and edit past workouts') +
      '<div class="card">' +
      '<input class="search" type="search" placeholder="Search exercises or notes" autocomplete="off" value="' + esc(h.q) + '" data-in="hq">' +
      '<label class="field">Exercise<select data-in="hex"><option value="">All exercises</option>' + opts + '</select></label>' +
      '<div class="two"><label class="field">From<input type="date" value="' + esc(h.from) + '" data-in="hfrom"></label>' +
      '<label class="field">To<input type="date" value="' + esc(h.to) + '" data-in="hto"></label></div>' +
      (histActive() ? '<button class="btn" data-act="hclear">Clear filters</button>' : '') + '</div>' +
      '<div id="hist-results">' + renderHistoryResults() + '</div>';
  }

  function renderHistoryDetail(w) {
    var sets = 0; w.exercises.forEach(function (x) { sets += x.sets.length; });
    var html = '<div class="topbar left"><button class="btn" data-act="hback">Back</button></div>' +
      header(fmtDate(w.date), w.exercises.length + ' exercise' + (w.exercises.length === 1 ? '' : 's') + ', ' + sets + ' set' + (sets === 1 ? '' : 's') + (w.duration ? ', ' + w.duration + ' min' : '')) +
      strainCardHtml(w);
    if ((w.notes || '').trim()) html += '<div class="card"><h2>Notes</h2><p class="notes">' + esc(w.notes) + '</p></div>';
    if (!w.exercises.length) html += '<div class="card empty-card"><p style="margin:0">No exercises in this workout.</p></div>';
    var prMap = prSetMap();
    w.exercises.forEach(function (we) {
      var bw = isBW(we.exerciseId);
      html += '<div class="card"><h2>' + esc(exName(we.exerciseId)) + (bw ? ' <span class="badge">Bodyweight</span>' : '') + '</h2>';
      if (!we.sets.length) html += '<p class="muted" style="margin:0">No sets recorded.</p>';
      we.sets.forEach(function (s, i) {
        html += '<div class="row"><span>Set ' + (i + 1) + '</span><span>' + (isDone(s) ? fmtSet(s, bw) + (prMap[s.id] ? ' <span class="badge">PR</span>' : '') + (s.max ? ' <span class="badge amber">1RM attempt</span>' : '') : '<span class="muted">Incomplete</span>') + '</span></div>' +
          (s.note ? '<div class="snote">' + esc(s.note) + '</div>' : '');
      });
      html += '</div>';
    });
    return html + '<button class="btn primary wide" data-act="hedit">Edit workout</button><button class="btn danger wide" data-act="hdel">Delete workout</button>';
  }

  function renderHistory() {
    var w = ui.histOpen ? find(db.workouts, function (x) { return x.id === ui.histOpen; }) : null;
    if (!w) ui.histOpen = null;
    return w ? renderHistoryDetail(w) : renderHistoryList();
  }

  var PAGES = {
    dashboard: function () {
      var n = loggedWorkouts().length;
      var latest = loggedWorkouts().sort(byNewest)[0];
      return header('Dashboard', 'Your progress at a glance') + renderDots() +
        (latest ? '<h2 class="section">Latest workout · ' + fmtDate(latest.date) + '</h2>' + strainCardHtml(latest) : '') +
        '<div class="grid">' +
          bodyStatCard('weight', 'Body weight') + bodyStatCard('bodyfat', 'Body fat') +
          '<div class="card"><div class="stat-label">Workouts logged</div><div class="stat-value' + (n ? '' : ' empty') + '">' + (n || 'None yet') + '</div></div>' +
          '<div class="card"><div class="stat-label">Exercises in library</div><div class="stat-value">' + db.exercises.length + '</div></div>' +
        '</div>' +
        '<div class="card empty-card"><h2>Start tracking</h2><p>Your stats appear here as soon as you log your first workout or measurement.</p>' +
        '<a class="btn primary" href="#/log">Log workout</a><a class="btn" href="#/body">Add measurement</a></div>';
    },
    log: function () { var w = activeWorkout(); return w ? renderEditor(w) : renderLogHome(); },
    strength: function () { return renderStrength(); },
    body: function () { return renderBody(); },
    history: function () { return renderHistory(); },
    plan: function () { return renderPlan(); },
    settings: function () {
      var t = db.createdAt ? db.createdAt.slice(0, 10) : '-';
      return header('Settings and Backups', 'Storage and data safety') +
        '<div class="notice"><strong>Your data lives only on this device.</strong> It is stored in this browser and is not backed up to any cloud or synced between devices. ' +
        'Clearing Safari data or deleting the app can erase it. Backup export arrives in Stage 9, so until then treat your data as unprotected.</div>' +
        (loadError ? '<div class="notice"><strong>Warning:</strong> saved data could not be read, so saving is paused to protect it. Do not log anything. Tell Claude what you see.</div>' : '') +
        '<div class="card">' +
          '<div class="row"><span>Weight unit</span><span>' + db.settings.unit + '</span></div>' +
          '<div class="row"><span>Workouts stored</span><span>' + db.workouts.length + '</span></div>' +
          '<div class="row"><span>Measurements stored</span><span>' + db.measurements.length + '</span></div>' +
          '<div class="row"><span>Data created</span><span>' + t + '</span></div>' +
          '<div class="row"><span>Protected storage</span><span id="persist-status">checking...</span></div>' +
          '<div class="row"><span>App version</span><span>Stage 7: my plan</span></div>' +
        '</div>';
    }
  };

  /* ================= Navigation ================= */
  var TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'log', label: 'Log' },
    { id: 'strength', label: 'Strength' },
    { id: 'body', label: 'Body' }
  ];
  var MORE_PAGES = ['history', 'plan', 'settings'];

  var view = document.getElementById('view');
  var tabbar = document.getElementById('tabbar');
  var sheet = document.getElementById('more-sheet');
  var backdrop = document.getElementById('more-backdrop');

  function currentId() {
    var id = (location.hash || '').replace('#/', '');
    return PAGES[id] ? id : 'dashboard';
  }

  function renderTabs(active) {
    var html = TABS.map(function (t) {
      return '<a href="#/' + t.id + '" class="' + (t.id === active ? 'active' : '') + '">' + icon(t.id) + '<span>' + t.label + '</span></a>';
    }).join('');
    html += '<button type="button" id="more-btn" class="' + (MORE_PAGES.indexOf(active) > -1 ? 'active' : '') + '">' + icon('more') + '<span>More</span></button>';
    tabbar.innerHTML = html;
    document.getElementById('more-btn').addEventListener('click', function () { toggleSheet(sheet.hidden); });
  }

  function toggleSheet(show) { sheet.hidden = !show; backdrop.hidden = !show; }
  backdrop.addEventListener('click', function () { toggleSheet(false); });
  sheet.addEventListener('click', function () { toggleSheet(false); });

  function route() {
    var id = currentId();
    flushPlan(); planEl = null; planRange = null;
    toggleSheet(false);
    ui.picking = false; ui.search = '';
    if (id !== 'history' && !ui.returnTo) ui.histOpen = null;
    view.innerHTML = PAGES[id]();
    renderTabs(id);
    window.scrollTo(0, 0);
    if (id === 'settings') showPersistStatus();
    if (id === 'plan') initPlan();
  }

  function rerender() { // redraw the current page but keep the scroll position
    var y = window.scrollY;
    view.innerHTML = PAGES[currentId()]();
    window.scrollTo(0, y);
  }

  function showPersistStatus() {
    var el = document.getElementById('persist-status');
    if (!el) return;
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) { el.textContent = p ? 'Yes' : 'Not granted'; if (p) el.className = 'ok'; });
    } else { el.textContent = 'Not supported'; }
  }

  /* ================= Workout actions ================= */
  function weOf(w, id) { return find(w.exercises, function (x) { return x.id === id; }); }
  function setOf(we, id) { return find(we.sets, function (x) { return x.id === id; }); }
  function hasData(we) { return we.sets.some(function (s) { return s.weight != null || s.reps != null; }); }

  function addExerciseToWorkout(w, exerciseId) {
    w.exercises.push({ id: uid(), exerciseId: exerciseId, sets: [] });
    ui.picking = false; ui.search = '';
    touch(w); rerender();
  }

  function focusSet(setId) {
    var el = view.querySelector('input[data-in="weight"][data-set="' + setId + '"]');
    if (el) el.focus();
  }

  function onClick(ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (currentId() === 'history') { onHistoryClick(act, btn); return; }
    if (currentId() === 'strength') { onStrengthClick(act, btn); return; }
    if (currentId() === 'body') { onBodyClick(act, btn); return; }
    if (currentId() === 'plan') { onPlanClick(act, btn); return; }
    if (currentId() === 'dashboard') {
      if (act === 'dday') { var dd = btn.getAttribute('data-d'); ui.dashDay = ui.dashDay === dd ? null : dd; rerender(); }
      else if (act === 'dopen') { ui.histOpen = btn.getAttribute('data-id'); location.hash = '#/history'; }
      return;
    }
    if (currentId() !== 'log') return;
    var w = activeWorkout();
    var we = w ? weOf(w, btn.getAttribute('data-we')) : null;

    if (act === 'start') {
      var d = document.getElementById('nw-date').value;
      if (!validDate(d)) { alert('Please choose a valid date.'); return; }
      var nw = { id: uid(), date: d, notes: '', exercises: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db.workouts.push(nw); save();
      ui.activeId = nw.id; saveUi(); rerender(); window.scrollTo(0, 0);
    } else if (act === 'open') {
      ui.activeId = btn.getAttribute('data-id'); saveUi(); rerender(); window.scrollTo(0, 0);
    } else if (!w) {
      return;
    } else if (act === 'done') {
      if (!w.exercises.length && !(w.notes || '').trim()) { // do not keep empty workouts
        db.workouts = db.workouts.filter(function (x) { return x.id !== w.id; }); save();
      }
      ui.activeId = null; saveUi(); ui.picking = false;
      if (ui.returnTo) { ui.returnTo = null; location.hash = '#/history'; } else { rerender(); window.scrollTo(0, 0); }
    } else if (act === 'addex') {
      ui.picking = true; rerender();
    } else if (act === 'cancelpick') {
      ui.picking = false; ui.search = ''; rerender();
    } else if (act === 'pick') {
      addExerciseToWorkout(w, btn.getAttribute('data-eid'));
    } else if (act === 'createex') {
      var name = document.getElementById('new-ex-name').value.replace(/\s+/g, ' ').trim();
      if (!name) { alert('Please type a name for the exercise.'); return; }
      var dup = find(db.exercises, function (e) { return e.name.toLowerCase() === name.toLowerCase(); });
      if (dup) { addExerciseToWorkout(w, dup.id); return; }
      var ne = { id: uid(), name: name, custom: true, bodyweight: document.getElementById('new-ex-bw').checked };
      db.exercises.push(ne); save();
      addExerciseToWorkout(w, ne.id);
    } else if (act === 'rmex' && we) {
      if (hasData(we) && !confirm('Remove "' + exName(we.exerciseId) + '" and its sets from this workout?')) return;
      w.exercises = w.exercises.filter(function (x) { return x.id !== we.id; });
      touch(w); rerender();
    } else if (act === 'addset' && we) {
      var last = we.sets.length ? we.sets[we.sets.length - 1] : null;
      var prev = previousSession(we.exerciseId, w);
      var src = last || (prev ? find(prev.we.sets, isDone) : null);
      var ns = { id: uid(), weight: src ? src.weight : null, reps: src ? src.reps : null, note: '' };
      we.sets.push(ns); touch(w); rerender(); focusSet(ns.id);
    } else if (act === 'copylast' && we) {
      var p = previousSession(we.exerciseId, w);
      if (!p) return;
      we.sets = p.we.sets.filter(isDone).map(function (s) { return { id: uid(), weight: s.weight, reps: s.reps, note: '' }; });
      touch(w); rerender();
    } else if (act === 'rmset' && we) {
      we.sets = we.sets.filter(function (s) { return s.id !== btn.getAttribute('data-set'); });
      touch(w); rerender();
    } else if (act === 'note') {
      var sid = btn.getAttribute('data-set');
      ui.noteOpen[sid] = !ui.noteOpen[sid]; rerender();
    } else if (act === 'delworkout') {
      if (!confirm('Delete this whole workout (' + fmtDate(w.date) + ')? This cannot be undone.')) return;
      db.workouts = db.workouts.filter(function (x) { return x.id !== w.id; }); save();
      ui.activeId = null; saveUi();
      if (ui.returnTo) { ui.returnTo = null; ui.histOpen = null; location.hash = '#/history'; } else { rerender(); window.scrollTo(0, 0); }
    }
  }

  function onStrengthClick(act, btn) {
    if (act === 'smetric') { ui.str.metric = btn.getAttribute('data-v'); ui.str.point = null; }
    else if (act === 'srange') { ui.str.range = btn.getAttribute('data-v'); ui.str.point = null; }
    else if (act === 'cpoint') { ui.str.point = parseInt(btn.getAttribute('data-i'), 10); }
    else return;
    rerender();
  }

  function onHistoryClick(act, btn) {
    if (act === 'hopen') { ui.histOpen = btn.getAttribute('data-id'); rerender(); window.scrollTo(0, 0); }
    else if (act === 'hback') { ui.histOpen = null; rerender(); window.scrollTo(0, 0); }
    else if (act === 'hclear') { ui.hist = { q: '', ex: '', from: '', to: '' }; rerender(); }
    else if (act === 'hedit' && ui.histOpen) { ui.activeId = ui.histOpen; saveUi(); ui.returnTo = 'history'; location.hash = '#/log'; }
    else if (act === 'hdel' && ui.histOpen) {
      var w = find(db.workouts, function (x) { return x.id === ui.histOpen; });
      if (!w || !confirm('Delete this whole workout (' + fmtDate(w.date) + ')? This cannot be undone.')) return;
      db.workouts = db.workouts.filter(function (x) { return x.id !== w.id; }); save();
      if (ui.activeId === w.id) { ui.activeId = null; saveUi(); }
      ui.histOpen = null; rerender(); window.scrollTo(0, 0);
    }
  }

  function parseDuration(v) {
    v = v.trim();
    if (v === '') return { ok: true, val: null };
    if (!/^\d{1,3}$/.test(v)) return { ok: false };
    var n = parseInt(v, 10);
    return (n >= 1 && n <= 600) ? { ok: true, val: n } : { ok: false };
  }
  function parseWeight(v) {
    v = v.trim().replace(',', '.');
    if (v === '') return { ok: true, val: null };
    if (!/^\d{1,4}(\.\d{0,2})?$/.test(v)) return { ok: false };
    var n = parseFloat(v);
    return (n >= 0 && n <= 1000) ? { ok: true, val: n } : { ok: false };
  }
  function parseReps(v) {
    v = v.trim();
    if (v === '') return { ok: true, val: null };
    if (!/^\d{1,3}$/.test(v)) return { ok: false };
    var n = parseInt(v, 10);
    return (n >= 1 && n <= 500) ? { ok: true, val: n } : { ok: false };
  }

  function onInput(ev) {
    var el = ev.target, kind = el.getAttribute && el.getAttribute('data-in');
    if (!kind) return;
    if (kind === 'hq' || kind === 'hex' || kind === 'hfrom' || kind === 'hto') { onHistoryFilter(kind, el); return; }
    if (kind === 'bf') { ui.body.draft[el.getAttribute('data-t')] = el.value; el.classList.remove('bad'); ui.body.msg = ''; var okm = view.querySelector('.card .ok'); if (okm) okm.remove(); return; }
    if (kind === 'bdate') { if (validDate(el.value)) ui.body.date = el.value; return; }
    if (kind === 'btype') { ui.body.filter = el.value; ui.body.limit = 30; ui.body.edit = null; rerender(); return; }
    if (kind === 'sex') { if (currentId() === 'strength') { ui.str.ex = el.value; ui.str.point = null; rerender(); } return; }
    if (currentId() !== 'log') return;

    if (kind === 'exsearch') { ui.search = el.value; var l = document.getElementById('ex-list'); if (l) l.innerHTML = renderExList(el.value); return; }

    var w = activeWorkout();
    if (!w) return;

    if (kind === 'date') { if (validDate(el.value)) { w.date = el.value; touch(w); refreshStrain(w); } return; }
    if (kind === 'dur') { var dr = parseDuration(el.value); el.classList.toggle('bad', !dr.ok); if (dr.ok) { w.duration = dr.val; touch(w); refreshStrain(w); } return; }
    if (kind === 'wnotes') { w.notes = el.value; touch(w); return; }

    var we = weOf(w, el.getAttribute('data-we'));
    var s = we ? setOf(we, el.getAttribute('data-set')) : null;
    if (!s) return;

    if (kind === 'snote') { s.note = el.value; touch(w); return; }
    if (kind === 'smax') { s.max = !!el.checked; touch(w); return; }

    var r = kind === 'weight' ? parseWeight(el.value) : parseReps(el.value);
    el.classList.toggle('bad', !r.ok);
    if (!r.ok) return; // keep the last good value until the field is fixed
    s[kind] = r.val; touch(w); refreshStrain(w);
  }

  function onHistoryFilter(kind, el) {
    if (currentId() !== 'history') return;
    var key = { hq: 'q', hex: 'ex', hfrom: 'from', hto: 'to' }[kind];
    var v = el.value;
    if ((key === 'from' || key === 'to') && v && !validDate(v)) return;
    ui.hist[key] = v;
    var r = document.getElementById('hist-results'); if (r) r.innerHTML = renderHistoryResults();
    var clr = view.querySelector('[data-act="hclear"]');
    if (histActive() && !clr) { var card = el.closest('.card'); if (card) card.insertAdjacentHTML('beforeend', '<button class="btn" data-act="hclear">Clear filters</button>'); }
    if (!histActive() && clr) clr.remove();
  }

  function onChange(ev) { // when leaving a field: put back the saved value if the typed one was invalid
    var el = ev.target, kind = el.getAttribute && el.getAttribute('data-in');
    if (kind === 'hex' || kind === 'hfrom' || kind === 'hto') { onHistoryFilter(kind, el); return; }
    if (kind === 'sex' || kind === 'btype') { onInput(ev); return; }
    if (kind === 'dur' && currentId() === 'log') { var wd = activeWorkout(); if (wd && !parseDuration(el.value).ok) { el.value = num(wd.duration); el.classList.remove('bad'); } return; }
    if ((kind !== 'weight' && kind !== 'reps') || currentId() !== 'log') return;
    var w = activeWorkout(); if (!w) return;
    var we = weOf(w, el.getAttribute('data-we')); var s = we ? setOf(we, el.getAttribute('data-set')) : null;
    if (!s) return;
    var r = kind === 'weight' ? parseWeight(el.value) : parseReps(el.value);
    if (!r.ok) { el.value = num(s[kind]); el.classList.remove('bad'); }
  }

  document.addEventListener('selectionchange', onSelChange);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushPlan(); });
  window.addEventListener('pagehide', flushPlan);
  view.addEventListener('mousedown', function (ev) { if (ev.target.closest && ev.target.closest('#plan-toolbar')) ev.preventDefault(); });
  view.addEventListener('click', onClick);
  view.addEventListener('input', onInput);
  view.addEventListener('change', onChange);
  window.addEventListener('hashchange', route);
  route();

  /* ================= Ask the browser to keep our data, and work offline ================= */
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () {}); }
})();
