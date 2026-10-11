(function () {
  'use strict';

  /* ---------- Storage (everything is saved in this browser only) ---------- */
  var KEY = 'ironlog.v1';
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
      exercises: STARTER_EXERCISES.map(function (n, i) { return { id: 'ex' + (i + 1), name: n, custom: false }; }),
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

  /* ---------- Icons ---------- */
  var ICONS = {
    dashboard: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    log: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    strength: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    body: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }

  /* ---------- Pages ---------- */
  function header(title, sub) { return '<h1>' + title + '</h1><p class="sub">' + sub + '</p>'; }
  function comingSoon(title, sub, stage, text) {
    return header(title, sub) +
      '<div class="card empty-card"><h2>Nothing here yet</h2><p>' + text + '</p>' +
      '<p style="margin:0">This page is built in ' + stage + '.</p></div>';
  }

  var PAGES = {
    dashboard: function () {
      var n = db.workouts.length;
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
    log: function () {
      return comingSoon('Log Workout', 'Record exercises, sets, weight and reps', 'Stage 3', 'You will be able to log a workout in a few taps.');
    },
    strength: function () {
      return comingSoon('Strength Progress', 'Graphs, estimated 1RM and personal records', 'Stage 5', 'Graphs and records appear once you have logged workouts.');
    },
    body: function () {
      return comingSoon('Body Progress', 'Weight, body fat and measurements', 'Stage 6', 'Measurement entry and graphs appear here.');
    },
    history: function () {
      return comingSoon('Workout History', 'Browse and edit past workouts', 'Stage 4', 'Past workouts will be listed here by date.');
    },
    plan: function () {
      return comingSoon('My Plan', 'Your personal workout notebook', 'Stage 7', 'A free-form editor with formatting and automatic saving.');
    },
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
          '<div class="row"><span>App version</span><span>Stage 2 skeleton</span></div>' +
        '</div>';
    }
  };

  /* ---------- Navigation ---------- */
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
    view.innerHTML = PAGES[id]();
    renderTabs(id);
    window.scrollTo(0, 0);
    if (id === 'settings') showPersistStatus();
  }

  function showPersistStatus() {
    var el = document.getElementById('persist-status');
    if (!el) return;
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) { el.textContent = p ? 'Yes' : 'Not granted'; if (p) el.className = 'ok'; });
    } else { el.textContent = 'Not supported'; }
  }

  window.addEventListener('hashchange', route);
  route();

  /* ---------- Ask the browser to keep our data, and work offline ---------- */
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () {}); }
})();
