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
  var ui = { activeId: null, picking: false, noteOpen: {}, search: '' };
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
    }
    return html;
  }

  function renderSet(we, s, i, bw) {
    var noteOpen = s.note || ui.noteOpen[s.id];
    return '<div class="set">' +
      '<span class="set-n">' + (i + 1) + '</span>' +
      '<input class="num" inputmode="decimal" autocomplete="off" placeholder="' + (bw ? '+kg' : 'kg') + '" aria-label="Weight in kilograms" value="' + esc(num(s.weight)) + '" data-in="weight" data-we="' + we.id + '" data-set="' + s.id + '">' +
      '<input class="num" inputmode="numeric" autocomplete="off" placeholder="reps" aria-label="Repetitions" value="' + esc(num(s.reps)) + '" data-in="reps" data-we="' + we.id + '" data-set="' + s.id + '">' +
      '<button class="icon-btn" aria-label="Set note" data-act="note" data-set="' + s.id + '">' + NOTE + '</button>' +
      '<button class="icon-btn" aria-label="Delete set" data-act="rmset" data-we="' + we.id + '" data-set="' + s.id + '">' + X + '</button>' +
      (noteOpen ? '<input class="note" maxlength="200" placeholder="Set note (optional)" value="' + esc(s.note || '') + '" data-in="snote" data-we="' + we.id + '" data-set="' + s.id + '">' : '') +
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
      '<label class="field">Notes (optional)<textarea rows="2" maxlength="1000" placeholder="How did the session feel?" data-in="wnotes">' + esc(w.notes || '') + '</textarea></label></div>';
    if (!w.exercises.length) html += '<div class="card empty-card"><p style="margin:0">No exercises yet. Add your first one below.</p></div>';
    w.exercises.forEach(function (we) { html += renderExerciseCard(w, we); });
    html += ui.picking ? renderPicker() : '<button class="btn primary wide" data-act="addex">Add exercise</button>';
    html += '<button class="btn danger wide" data-act="delworkout">Delete this workout</button>';
    return html;
  }

  var PAGES = {
    dashboard: function () {
      var n = loggedWorkouts().length;
      return header('Dashboard', 'Your progress at a glance') +
        '<div class="grid">' +
          '<div class="card"><div class="stat-label">Body weight</div><div class="stat-value empty">No data</div></div>' +
          '<div class="card"><div class="stat-label">Body fat</div><div class="stat-value empty">No data</div></div>' +
          '<div class="card"><div class="stat-label">Workouts logged</div><div class="stat-value' + (n ? '' : ' empty') + '">' + (n || 'None yet') + '</div></div>' +
          '<div class="card"><div class="stat-label">Exercises in library</div><div class="stat-value">' + db.exercises.length + '</div></div>' +
        '</div>' +
        '<div class="card empty-card"><h2>Start tracking</h2><p>Your stats appear here as soon as you log your first workout or measurement.</p>' +
        '<a class="btn primary" href="#/log">Log workout</a><a class="btn" href="#/body">Add measurement</a></div>';
    },
    log: function () { var w = activeWorkout(); return w ? renderEditor(w) : renderLogHome(); },
    strength: function () { return comingSoon('Strength Progress', 'Graphs, estimated 1RM and personal records', 'Stage 5', 'Graphs and records appear once you have logged workouts.'); },
    body: function () { return comingSoon('Body Progress', 'Weight, body fat and measurements', 'Stage 6', 'Measurement entry and graphs appear here.'); },
    history: function () { return comingSoon('Workout History', 'Browse and edit past workouts', 'Stage 4', 'Past workouts will be listed here by date.'); },
    plan: function () { return comingSoon('My Plan', 'Your personal workout notebook', 'Stage 7', 'A free-form editor with formatting and automatic saving.'); },
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
          '<div class="row"><span>App version</span><span>Stage 3: workout logging</span></div>' +
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
    toggleSheet(false);
    ui.picking = false; ui.search = '';
    view.innerHTML = PAGES[id]();
    renderTabs(id);
    window.scrollTo(0, 0);
    if (id === 'settings') showPersistStatus();
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
    if (!btn || currentId() !== 'log') return;
    var act = btn.getAttribute('data-act');
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
      ui.activeId = null; saveUi(); ui.picking = false; rerender(); window.scrollTo(0, 0);
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
      ui.activeId = null; saveUi(); rerender(); window.scrollTo(0, 0);
    }
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
    if (!kind || currentId() !== 'log') return;

    if (kind === 'exsearch') { ui.search = el.value; var l = document.getElementById('ex-list'); if (l) l.innerHTML = renderExList(el.value); return; }

    var w = activeWorkout();
    if (!w) return;

    if (kind === 'date') { if (validDate(el.value)) { w.date = el.value; touch(w); } return; }
    if (kind === 'wnotes') { w.notes = el.value; touch(w); return; }

    var we = weOf(w, el.getAttribute('data-we'));
    var s = we ? setOf(we, el.getAttribute('data-set')) : null;
    if (!s) return;

    if (kind === 'snote') { s.note = el.value; touch(w); return; }

    var r = kind === 'weight' ? parseWeight(el.value) : parseReps(el.value);
    el.classList.toggle('bad', !r.ok);
    if (!r.ok) return; // keep the last good value until the field is fixed
    s[kind] = r.val; touch(w);
  }

  function onChange(ev) { // when leaving a field: put back the saved value if the typed one was invalid
    var el = ev.target, kind = el.getAttribute && el.getAttribute('data-in');
    if ((kind !== 'weight' && kind !== 'reps') || currentId() !== 'log') return;
    var w = activeWorkout(); if (!w) return;
    var we = weOf(w, el.getAttribute('data-we')); var s = we ? setOf(we, el.getAttribute('data-set')) : null;
    if (!s) return;
    var r = kind === 'weight' ? parseWeight(el.value) : parseReps(el.value);
    if (!r.ok) { el.value = num(s[kind]); el.classList.remove('bad'); }
  }

  view.addEventListener('click', onClick);
  view.addEventListener('input', onInput);
  view.addEventListener('change', onChange);
  window.addEventListener('hashchange', route);
  route();

  /* ================= Ask the browser to keep our data, and work offline ================= */
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () {}); }
})();
