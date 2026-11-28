/* ==========================================================================
   EVENTRA | IVC PULSE — Judge & Admin Portal Logic + Supabase Realtime
   ========================================================================== */

const DEFAULT_CRITERIA = [
  { id: 'innovation', name: 'Innovation & Originality', max: 25, desc: 'Novelty of idea, technical differentiation, and problem framing.' },
  { id: 'execution', name: 'Technical Execution', max: 25, desc: 'Prototype completeness, architecture, and live demo stability.' },
  { id: 'impact', name: 'Market & Social Impact', max: 20, desc: 'Real-world applicability, scalability, and measurable value.' },
  { id: 'design', name: 'UI / UX & Usability', max: 15, desc: 'Clarity of user flow, visual polish, and accessibility.' },
  { id: 'pitch', name: 'Pitch & Q&A Clarity', max: 15, desc: 'Presentation structure, time discipline, and Q&A defense.' }
];

const INITIAL_TEAMS = [
  { id: 'cyber-titans', sem: '1ST SEM', name: 'CYBER TITANS', leader: 'Keerthana KK', members: 4, round: '1', status: 'PENDING', deckUrl: '#deck-cyber-titans', repoUrl: null, demoUrl: null, scores: {} },
  { id: 'parallax', sem: '1ST SEM', name: 'PARALLAX', leader: 'Lakshya M', members: 4, round: '1', status: 'PENDING', deckUrl: '#deck-parallax', repoUrl: '#repo-parallax', demoUrl: null, scores: {} },
  { id: 'vs3', sem: '3RD SEM', name: 'VS³', leader: 'VINEETH JAGADEESH', members: 3, round: '1', status: 'PENDING', deckUrl: '#deck-vs3', repoUrl: null, demoUrl: '#demo-vs3', scores: {} }
];

const STORAGE_KEY = 'eventra_judge_portal_v3';
const AUTH_STORAGE_KEY = 'eventra_portal_session_v1';

const state = {
  criteria: structuredClone(DEFAULT_CRITERIA),
  rounds: [{ id: '1', name: 'PRELIMINARY ROUND', status: 'ACTIVE' }, { id: '2', name: 'FINAL ROUND', status: 'UPCOMING' }],
  teams: loadLocalTeams(),
  allTeams: [],
  judges: [],
  assignments: [],
  allEvaluations: [],
  allAccounts: [],
  spocs: [],
  spocUpdates: [],
  auditLogs: [],
  resultsEngine: 'Draft / Unreleased',
  inspectRole: null,
  activeSpocEmail: null,
  spocSelectedTeams: new Set(),
  pendingSpocSaves: 0,
  spocStaffSearch: '',
  spocStaffFilter: 'all',
  spocTeamSearch: '',
  spocTrackFilter: 'all',
  spocShowAllotted: true,
  spocOpenDropdownTeamId: null,
  umSearch: '',
  umRoleFilter: 'all',
  contentActivities: [],
  contentItems: [],
  crSearch: '',
  crTypeFilter: 'all',
  activeActivityId: null,
  announcements: [],
  annSearch: '',
  annAudienceFilter: 'all',
  mxSearch: '',
  mxRoundFilter: 'all',
  mxStatusFilter: 'all',
  resSearch: '',
  resRoundFilter: 'all',
  resSemFilter: 'all',
  round: 'all',
  assignFilter: '',
  auditFilter: '',
  activeTeamId: null,
  timerInterval: null,
  timerSeconds: 300,
  supabase: null,
  realtimeChannel: null,
  user: loadSavedUser(),
  judgeId: window.EVENTRA_CONFIG?.JUDGE_ID || 'judge-04'
};

function isAdmin() {
  return state.user?.role === 'admin';
}

function loadSavedUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSessionUser(user, remember) {
  const payload = JSON.stringify(user);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  if (remember) localStorage.setItem(AUTH_STORAGE_KEY, payload);
  else sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
}

function clearSessionUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function setActiveNav(viewName) {
  document.querySelectorAll('.nav-item').forEach((n) => {
    const active = n.dataset.view === viewName;
    n.classList.toggle('is-active', active);
    if (active) n.setAttribute('aria-current', 'page');
    else n.removeAttribute('aria-current');
  });
}

function showView(viewId) {
  const targetId = viewId.startsWith('view-') ? viewId : `view-${viewId}`;
  if (targetId.startsWith('view-admin-') && !isAdmin()) {
    showToast('Admin privileges required.');
    return;
  }
  [
    'view-teams',
    'view-rubrics',
    'view-evaluate',
    'view-admin-overview',
    'view-admin-assignments',
    'view-admin-matrix',
    'view-admin-rounds',
    'view-admin-spocs',
    'view-admin-audit',
    'view-admin-users',
    'view-admin-content',
    'view-admin-announcements',
    'view-admin-results',
    'view-spoc-teams',
    'view-spoc-readiness'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = id !== targetId;
  });
}

const VIEW_URLS = {
  'admin-overview': './admin.html',
  'admin-assignments': './admin-assignments.html',
  'admin-matrix': './admin-evaluation.html',
  'admin-rounds': './admin-rounds.html',
  'admin-spocs': './admin-spocs.html',
  'admin-audit': './admin-audit.html',
  'admin-users': './admin-users.html',
  'admin-content': './admin-content-releases.html',
  'admin-announcements': './admin-announcements.html',
  'admin-results': './admin-results.html',
  teams: './judge.html',
  rubrics: './judge-rubrics.html',
  evaluate: './judge-evaluate.html',
  'spoc-teams': './spoc.html',
  'spoc-readiness': './spoc-readiness.html'
};

function navigateToView(viewName, query = '') {
  const targetId = viewName.startsWith('view-') ? viewName : `view-${viewName}`;
  const rawName = viewName.replace(/^view-/, '');
  if (document.getElementById(targetId)) {
    setActiveNav(rawName);
    showView(rawName);
    return;
  }
  const dest = VIEW_URLS[rawName];
  if (dest) {
    window.location.href = `${dest}${query}`;
  }
}

function roleHomePage(role) {
  if (role === 'admin') return './admin.html';
  if (role === 'spoc') return './spoc.html';
  return './judge.html';
}

function applyAuthUI() {
  const page = document.body.dataset.page || 'login';
  const user = state.user;

  if (page === 'login') {
    if (user) {
      window.location.replace(roleHomePage(user.role));
    }
    return;
  }

  if (!user) {
    window.location.replace('./index.html');
    return;
  }

  if (page === 'admin' && user.role !== 'admin') {
    window.location.replace(roleHomePage(user.role));
    return;
  }

  if (page === 'judge' && user.role !== 'judge') {
    window.location.replace(roleHomePage(user.role));
    return;
  }

  if (page === 'spoc' && user.role !== 'spoc') {
    window.location.replace(roleHomePage(user.role));
    return;
  }

  state.judgeId = user.username || 'judge-04';
  const authLabel = document.getElementById('sidebar-user-label');
  if (authLabel) {
    authLabel.textContent = `${user.display_name} (${user.role.toUpperCase()})`;
  }

  const defaultView =
    document.body.dataset.section ||
    (page === 'admin' ? 'admin-overview' : page === 'spoc' ? 'spoc-teams' : 'teams');
  if (defaultView === 'evaluate') {
    const qTeam = new URLSearchParams(window.location.search).get('team');
    if (qTeam) state.activeTeamId = qTeam;
  }
  setActiveNav(defaultView);
  showView(defaultView);

  syncFromSupabase();
  setupRealtimeSync();
}

function setupRealtimeSync() {
  if (!state.supabase) return;
  if (state.realtimeChannel) {
    state.supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  state.realtimeChannel = state.supabase
    .channel('eventra-live-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'judge_assignments' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluation_rounds' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rubric_criteria' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'spocs' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'spoc_updates' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_activities' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_items' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_settings' }, () => syncFromSupabase())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
      if (isAdmin()) syncFromSupabase();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations' }, (payload) => {
      const changedJudge = payload.new?.judge_id || payload.old?.judge_id;
      if (isAdmin() || !changedJudge || changedJudge === state.judgeId) {
        syncFromSupabase();
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setSyncStatus('Realtime Live');
    });
}

function initSupabaseClient() {
  const cfg = window.EVENTRA_CONFIG || {};
  if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    state.supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return true;
  }
  return false;
}

function setSyncStatus(label) {
  const el = document.getElementById('sync-status-text');
  if (el) el.textContent = label;
}

function loadLocalTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback
  }
  return structuredClone(INITIAL_TEAMS);
}

function saveLocalTeams() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.teams));
  } catch {
    // Ignore
  }
}

async function writeAuditLog(action, target, details = '') {
  if (!state.supabase || !state.user) return;
  try {
    await state.supabase.from('audit_logs').insert({
      actor: state.user.username,
      actor_role: state.user.role,
      action,
      target,
      details
    });
  } catch {
    // Non-blocking
  }
}

async function syncFromSupabase() {
  if (!state.supabase) {
    setSyncStatus('Local Mode');
    return;
  }

  setSyncStatus('Syncing...');
  try {
    const queries = [
      state.supabase.from('teams').select('*').order('name', { ascending: true }),
      state.supabase.from('judge_assignments').select('*'),
      isAdmin()
        ? state.supabase.from('evaluations').select('*')
        : state.supabase.from('evaluations').select('*').eq('judge_id', state.judgeId),
      state.supabase.from('evaluation_rounds').select('*').order('id', { ascending: true }),
      state.supabase.from('rubric_criteria').select('*').order('sort_order', { ascending: true }),
      state.supabase.from('announcements').select('*').order('created_at', { ascending: false })
    ];

    if (isAdmin() || state.user?.role === 'spoc') {
      queries.push(state.supabase.from('spocs').select('*').order('created_at', { ascending: false }));
      queries.push(state.supabase.from('spoc_updates').select('*'));
    }

    if (isAdmin()) {
      queries.push(state.supabase.rpc('list_judges'));
      queries.push(state.supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50));
      queries.push(state.supabase.rpc('list_all_accounts'));
      queries.push(state.supabase.from('event_settings').select('*').eq('key', 'results_engine').maybeSingle());
      queries.push(state.supabase.from('content_activities').select('*').order('created_at', { ascending: true }));
      queries.push(state.supabase.from('content_items').select('*').order('created_at', { ascending: false }));
    }

    const results = await Promise.all(queries);
    const [teamsRes, assignRes, evalsRes, roundsRes, critRes, annRes, spocsRes, spocUpdatesRes, judgesRes, auditRes, accountsRes, settingsRes, crActRes, crItemsRes] = results;

    if (teamsRes.error) throw teamsRes.error;
    if (assignRes.error) throw assignRes.error;
    if (evalsRes.error) throw evalsRes.error;

    const dbTeams = teamsRes.data || [];
    state.allTeams = dbTeams;
    state.assignments = assignRes.data || [];
    state.allEvaluations = evalsRes.data || [];

    if (roundsRes && !roundsRes.error && Array.isArray(roundsRes.data) && roundsRes.data.length > 0) {
      state.rounds = roundsRes.data;
    }
    if (critRes && !critRes.error && Array.isArray(critRes.data) && critRes.data.length > 0) {
      state.criteria = critRes.data.map((c) => ({
        id: c.id,
        name: c.name,
        desc: c.description,
        max: Number(c.max_score)
      }));
    }
    if (annRes && !annRes.error) state.announcements = annRes.data || [];
    if (spocsRes && !spocsRes.error && !state.pendingSpocSaves) {
      state.spocs = spocsRes.data || [];
      if (state.activeSpocEmail) {
        state.spocSelectedTeams = new Set(
          state.spocs
            .filter((s) => (s.email || '').toLowerCase() === state.activeSpocEmail && s.assigned_team_id)
            .map((s) => s.assigned_team_id)
        );
      }
    }
    if (spocUpdatesRes && !spocUpdatesRes.error) state.spocUpdates = spocUpdatesRes.data || [];
    if (judgesRes && !judgesRes.error) {
      state.judges = judgesRes.data || [];
    }
    if (auditRes && !auditRes.error) state.auditLogs = auditRes.data || [];
    if (accountsRes && !accountsRes.error) state.allAccounts = accountsRes.data || [];
    if (settingsRes && !settingsRes.error && settingsRes.data) {
      state.resultsEngine = settingsRes.data.value;
    }
    if (crActRes && !crActRes.error) state.contentActivities = crActRes.data || [];
    if (crItemsRes && !crItemsRes.error) state.contentItems = crItemsRes.data || [];

    const assignedIds = new Set(
      state.assignments.filter((a) => a.judge_id === state.judgeId).map((a) => a.team_id)
    );
    const visibleDbTeams = isAdmin() ? dbTeams : dbTeams.filter((t) => assignedIds.has(t.id));

    const myEvalMap = new Map(
      state.allEvaluations.filter((e) => e.judge_id === state.judgeId).map((e) => [e.team_id, e])
    );

    state.teams = visibleDbTeams.map((t) => {
      const ev = myEvalMap.get(t.id);
      return {
        id: t.id,
        sem: t.sem,
        name: t.name,
        leader: t.leader,
        members: t.members,
        round: t.round,
        deckUrl: t.deck_url,
        repoUrl: t.repo_url,
        demoUrl: t.demo_url,
        status: ev ? ev.status : 'PENDING',
        scores: ev?.scores || {}
      };
    });

    saveLocalTeams();
    renderAll();

    const evalView = document.getElementById('view-evaluate');
    if (evalView && !evalView.hidden) {
      if (!state.activeTeamId && state.teams.length > 0) {
        state.activeTeamId = state.teams[0].id;
      }
      if (state.activeTeamId) {
        openTeamEvaluation(state.activeTeamId);
      }
    }

    setSyncStatus(state.realtimeChannel ? 'Realtime Live' : 'Supabase Connected');
  } catch (err) {
    console.error('Supabase sync failed:', err);
    setSyncStatus('Sync Error (Local Fallback)');
  }
}

function maxPossibleScore() {
  return state.criteria.reduce((sum, c) => sum + Number(c.max || 0), 0);
}

function totalScore(scores) {
  return state.criteria.reduce((acc, c) => acc + (Number(scores?.[c.id]) || 0), 0);
}

async function upsertEvaluationToSupabase(team) {
  saveLocalTeams();
  if (!state.supabase) return;

  setSyncStatus('Saving...');
  try {
    const { error } = await state.supabase
      .from('evaluations')
      .upsert(
        {
          team_id: team.id,
          judge_id: state.judgeId,
          status: team.status,
          scores: team.scores,
          total_score: totalScore(team.scores),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'team_id,judge_id' }
      );
    if (error) throw error;
    await writeAuditLog(
      team.status === 'EVALUATED' ? 'EVALUATION_SUBMITTED' : 'EVALUATION_DRAFTED',
      team.name,
      `Score: ${totalScore(team.scores)} / ${maxPossibleScore()}`
    );
    setSyncStatus(state.realtimeChannel ? 'Realtime Live' : 'Supabase Connected');
  } catch (err) {
    console.error('Supabase upsert failed:', err);
    setSyncStatus('Save Error');
    showToast('Saved locally; Supabase sync failed.');
  }
}

async function toggleAssignment(teamId, judgeId, currentlyAssigned) {
  if (!isAdmin() || !state.supabase) return;
  try {
    if (currentlyAssigned) {
      const { error } = await state.supabase
        .from('judge_assignments')
        .delete()
        .eq('team_id', teamId)
        .eq('judge_id', judgeId);
      if (error) throw error;
      await writeAuditLog('JUDGE_UNASSIGNED', teamId, `Removed ${judgeId}`);
      showToast(`Unassigned ${judgeId} from ${teamId}.`);
    } else {
      // Enforce max 1 judge per team: remove any existing assignment for this team first
      const existing = state.assignments.find((a) => a.team_id === teamId);
      if (existing) {
        const { error: delErr } = await state.supabase
          .from('judge_assignments')
          .delete()
          .eq('team_id', teamId);
        if (delErr) throw delErr;
      }

      const { error } = await state.supabase
        .from('judge_assignments')
        .insert({ team_id: teamId, judge_id: judgeId, assigned_by: state.user.username });
      if (error) throw error;
      await writeAuditLog(
        'JUDGE_ASSIGNED',
        teamId,
        existing ? `Switched ${existing.judge_id} -> ${judgeId}` : `Assigned ${judgeId}`
      );
      showToast(
        existing
          ? `Switched ${teamId} to ${judgeId} (max 1 judge per team).`
          : `Assigned ${judgeId} to ${teamId}.`
      );
    }
    await syncFromSupabase();
  } catch (err) {
    console.error('Assignment update failed:', err);
    showToast('Failed to update assignment.');
  }
}

function showToast(message) {
  const region = document.getElementById('toast-region');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function getVisibleTeams() {
  if (state.round === 'all') return state.teams;
  return state.teams.filter((t) => t.round === state.round);
}

function renderKpis() {
  if (document.body.dataset.page !== 'judge' || !document.getElementById('kpi-total')) return;
  const visible = getVisibleTeams();
  document.getElementById('kpi-total').textContent = String(visible.length);
  document.getElementById('kpi-evaluated').textContent = String(visible.filter((t) => t.status === 'EVALUATED').length);
  document.getElementById('kpi-drafted').textContent = String(visible.filter((t) => t.status === 'DRAFTED').length);
  document.getElementById('kpi-pending').textContent = String(visible.filter((t) => t.status === 'PENDING').length);
}

function renderTeamsGrid() {
  if (document.body.dataset.page !== 'judge') return;
  const grid = document.getElementById('teams-grid');
  if (!grid) return;
  const visible = getVisibleTeams();
  const maxTotal = maxPossibleScore();

  if (visible.length === 0) {
    grid.innerHTML = `<div class="rubrics-empty-card"><p class="rubrics-empty-text">No teams are currently assigned to you.</p></div>`;
    return;
  }

  grid.innerHTML = visible
    .map((team) => {
      const statusClass =
        team.status === 'EVALUATED' ? 'is-evaluated' : team.status === 'DRAFTED' ? 'is-drafted' : '';
      const actionLabel = team.status === 'EVALUATED' ? 'VIEW SCORECARD →' : 'EVALUATE →';

      return `
        <article class="team-card">
          <div class="team-card-header">
            <span class="sem-label">${team.sem}</span>
            <span class="status-pill ${statusClass}">${team.status}</span>
          </div>
          <h2 class="team-title">${team.name}</h2>
          <div class="team-leader">Leader: ${team.leader}</div>
          <div class="team-divider" aria-hidden="true"></div>
          <div class="team-card-footer">
            <span class="eval-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span>${team.status === 'PENDING' ? 'Evaluation' : `Score: ${totalScore(team.scores)} / ${maxTotal}`}</span>
            </span>
            <button type="button" class="btn-evaluate" data-team-id="${team.id}">
              ${actionLabel}
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderAdminViews() {
  if (!isAdmin() || document.body.dataset.page !== 'admin') return;

  const maxTotal = maxPossibleScore();
  const submittedCount = state.allEvaluations.filter((e) => e.status === 'EVALUATED').length;
  const activeSpocs = state.spocs.filter((s) => s.status === 'ACTIVE').length;

  // 1. Overview (Roster Cards + Event Operations Metrics)
  if (document.getElementById('roster-count-participant')) {
    const counts = {
      participant: state.allAccounts.filter((a) => a.role === 'participant').length,
      team_leader: state.allAccounts.filter((a) => a.role === 'team_leader' || a.role === 'team').length,
      judge: state.allAccounts.filter((a) => a.role === 'judge').length,
      staff: state.allAccounts.filter((a) => a.role === 'staff').length
    };
    document.getElementById('roster-count-participant').textContent = String(counts.participant);
    document.getElementById('roster-count-team_leader').textContent = String(counts.team_leader);
    document.getElementById('roster-count-judge').textContent = String(counts.judge);
    document.getElementById('roster-count-staff').textContent = String(counts.staff);

    const activeRoundsCount = state.rounds.filter((r) => r.status === 'ACTIVE').length;
    const evaluatedIds = new Set(state.allEvaluations.filter((e) => e.status === 'EVALUATED').map((e) => e.team_id));
    const pendingEvalsCount = Math.max(0, state.allTeams.length - evaluatedIds.size);

    document.getElementById('ops-registered-teams').textContent = String(state.allTeams.length);
    document.getElementById('ops-active-rounds').textContent = String(activeRoundsCount);
    document.getElementById('ops-pending-evals').textContent = String(pendingEvalsCount);

    const engineEl = document.getElementById('ops-results-engine');
    engineEl.textContent = state.resultsEngine;
    engineEl.classList.toggle('is-live', state.resultsEngine === 'Published / Live');

    if (state.inspectRole && !document.getElementById('roster-modal')?.hidden) {
      renderRosterModalTable();
    }
  }

  // 2. Judge Assignments
  if (document.getElementById('admin-assign-table-wrap')) {
    const assignedTeamIds = new Set(state.assignments.map((a) => a.team_id));
    const unassignedCount = state.allTeams.filter((t) => !assignedTeamIds.has(t.id)).length;

    document.getElementById('admin-kpi-teams').textContent = String(state.allTeams.length);
    document.getElementById('admin-kpi-judges').textContent = String(state.judges.length);
    document.getElementById('admin-kpi-pairs').textContent = String(state.assignments.length);
    document.getElementById('admin-kpi-unassigned').textContent = String(unassignedCount);

  const q = state.assignFilter.trim().toLowerCase();
  const filteredTeams = state.allTeams.filter((t) => {
    const spoc = state.spocs.find((s) => s.assigned_team_id === t.id);
    const spocName = spoc ? spoc.name.toLowerCase() : '';
    return (
      t.name.toLowerCase().includes(q) ||
      t.leader.toLowerCase().includes(q) ||
      t.sem.toLowerCase().includes(q) ||
      spocName.includes(q)
    );
  });

  const uniqueSpocList = [];
  const seenSpocNames = new Set();
  state.spocs.forEach((s) => {
    const key = (s.email || s.name).toLowerCase();
    if (!seenSpocNames.has(key)) {
      seenSpocNames.add(key);
      uniqueSpocList.push(s);
    }
  });
  uniqueSpocList.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('admin-assign-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Team</th>
          <th>Semester</th>
          <th>Round</th>
          <th>SPOC Incharge</th>
          <th>Assigned Judge (Max 1 per Team)</th>
        </tr>
      </thead>
      <tbody>
        ${filteredTeams
          .map((t) => {
            const currentAssign = state.assignments.find((a) => a.team_id === t.id);
            const assignedJudgeId = currentAssign ? currentAssign.judge_id : '';
            const spoc = state.spocs.find((s) => s.assigned_team_id === t.id);
            const currentSpocEmail = spoc ? (spoc.email || '').toLowerCase() : '';
            return `
              <tr>
                <td><strong>${t.name}</strong><br><span class="team-leader">${t.leader}</span></td>
                <td><span class="sem-label">${t.sem}</span></td>
                <td>Round ${t.round}</td>
                <td>
                  <select class="round-select" data-assign-spoc-select="${t.id}" aria-label="Select SPOC incharge for ${t.name}">
                    <option value="">Unassigned</option>
                    ${uniqueSpocList
                      .map(
                        (sp) => `
                      <option value="${sp.email}" ${(sp.email || '').toLowerCase() === currentSpocEmail ? 'selected' : ''}>
                        ${sp.name}
                      </option>
                    `
                      )
                      .join('')}
                  </select>
                </td>
                <td>
                  <select class="round-select" data-assign-judge-select="${t.id}" aria-label="Select judge for ${t.name}">
                    <option value="">Unassigned</option>
                    ${state.judges
                      .map(
                        (j) => `
                      <option value="${j.username}" ${j.username === assignedJudgeId ? 'selected' : ''}>
                        ${j.display_name} (${j.username})
                      </option>
                    `
                      )
                      .join('')}
                  </select>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
  }

  // 3. Evaluation Matrix (/admin/evaluation)
  if (document.getElementById('admin-matrix-table-wrap')) {
    const evalBallots = state.allEvaluations.filter((e) => e.status === 'EVALUATED').length;
  const draftBallots = state.allEvaluations.filter((e) => e.status === 'DRAFTED').length;
  const evaluatedTeamSet = new Set(state.allEvaluations.filter((e) => e.status === 'EVALUATED').map((e) => e.team_id));
  const pendingTeamsCount = Math.max(0, state.allTeams.length - evaluatedTeamSet.size);

  if (document.getElementById('mx-kpi-teams')) {
    document.getElementById('mx-kpi-teams').textContent = String(state.allTeams.length);
    document.getElementById('mx-kpi-evaluated').textContent = String(evalBallots);
    document.getElementById('mx-kpi-drafted').textContent = String(draftBallots);
    document.getElementById('mx-kpi-pending').textContent = String(pendingTeamsCount);
  }

  const mq = state.mxSearch.trim().toLowerCase();
  const mxTeams = state.allTeams.filter((t) => {
    const matchText =
      t.name.toLowerCase().includes(mq) ||
      t.leader.toLowerCase().includes(mq) ||
      t.sem.toLowerCase().includes(mq);
    const matchRound = state.mxRoundFilter === 'all' || t.round === state.mxRoundFilter;
    const teamEvals = state.allEvaluations.filter((e) => e.team_id === t.id);
    const teamStatus = teamEvals.some((e) => e.status === 'EVALUATED')
      ? 'EVALUATED'
      : teamEvals.some((e) => e.status === 'DRAFTED')
        ? 'DRAFTED'
        : 'PENDING';
    const matchStatus = state.mxStatusFilter === 'all' || teamStatus === state.mxStatusFilter;
    return matchText && matchRound && matchStatus;
  });

  document.getElementById('admin-matrix-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Team</th>
          <th>Round</th>
          ${state.judges.map((j) => `<th>${j.display_name}</th>`).join('')}
          <th>Average</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${mxTeams
          .map((t) => {
            const cells = state.judges.map((j) => {
              const ev = state.allEvaluations.find((e) => e.team_id === t.id && e.judge_id === j.username);
              if (!ev) return `<td><span class="status-pill mx-pill-rose">PENDING</span></td>`;
              const cls = ev.status === 'EVALUATED' ? 'is-evaluated' : 'mx-pill-amber';
              return `<td><span class="status-pill ${cls}">${ev.total_score} / ${maxTotal}</span></td>`;
            });
            const teamEvals = state.allEvaluations.filter((e) => e.team_id === t.id && e.status !== 'PENDING');
            const avg =
              teamEvals.length > 0
                ? (teamEvals.reduce((s, e) => s + Number(e.total_score || 0), 0) / teamEvals.length).toFixed(1)
                : '0.0';
            const overallStatus = teamEvals.some((e) => e.status === 'EVALUATED')
              ? 'EVALUATED'
              : teamEvals.some((e) => e.status === 'DRAFTED')
                ? 'DRAFTED'
                : 'PENDING';
            const overallCls =
              overallStatus === 'EVALUATED' ? 'is-evaluated' : overallStatus === 'DRAFTED' ? 'mx-pill-amber' : 'mx-pill-rose';
            return `
              <tr>
                <td><strong>${t.name}</strong><br><span class="team-leader">${t.sem} · ${t.leader}</span></td>
                <td>Round ${t.round}</td>
                ${cells.join('')}
                <td><strong style="color: var(--accent-primary);">${avg} / ${maxTotal}</strong></td>
                <td><span class="status-pill ${overallCls}">${overallStatus}</span></td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
  }

  // 4. Rounds & Criteria
  if (document.getElementById('admin-rounds-list') && document.getElementById('admin-criteria-table-wrap')) {
    document.getElementById('admin-rounds-list').innerHTML = state.rounds
    .map(
      (r) => `
      <div class="round-row">
        <div>
          <strong style="color: var(--color-10);">${r.name}</strong>
          <div class="team-leader">Round ID: ${r.id}</div>
        </div>
        <div class="assign-pills">
          <span class="status-pill ${r.status === 'ACTIVE' ? 'is-evaluated' : r.status === 'LOCKED' ? 'is-drafted' : ''}">${r.status}</span>
          <select class="round-select" data-round-select="${r.id}" aria-label="Status for ${r.name}">
            <option value="ACTIVE" ${r.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="UPCOMING" ${r.status === 'UPCOMING' ? 'selected' : ''}>UPCOMING</option>
            <option value="LOCKED" ${r.status === 'LOCKED' ? 'selected' : ''}>LOCKED</option>
          </select>
        </div>
      </div>
    `
    )
    .join('');

  document.getElementById('admin-criteria-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Criterion</th>
          <th>Description</th>
          <th>Max Score</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${state.criteria
          .map(
            (c) => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.desc}</td>
              <td><strong style="color: var(--accent-primary);">${c.max} PTS</strong></td>
              <td><button type="button" class="btn-danger-ghost" data-delete-criterion="${c.id}">REMOVE</button></td>
            </tr>
          `
          )
          .join('')}
      </tbody>
    </table>
  `;
  }

  // 5. Staff SPOC Allotment Console
  if (document.getElementById('spoc-staff-list') && document.getElementById('spoc-allot-teams-grid')) {
    const staffMap = new Map();
  state.spocs.forEach((s) => {
    const key = (s.email || s.name).toLowerCase();
    if (!staffMap.has(key)) {
      staffMap.set(key, {
        name: s.name,
        email: s.email,
        phone: s.phone || '',
        department: s.department || 'CSE',
        teams: new Set()
      });
    }
    if (s.assigned_team_id) staffMap.get(key).teams.add(s.assigned_team_id);
  });

  const allStaff = Array.from(staffMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const assignedStaffCount = allStaff.filter((s) => s.teams.size > 0).length;
  const allocatedTeamsCount = new Set(state.spocs.map((s) => s.assigned_team_id).filter(Boolean)).size;

  document.getElementById('spoc-kpi-total-staff').textContent = String(allStaff.length);
  document.getElementById('spoc-kpi-eligible').textContent = String(allStaff.length);
  document.getElementById('spoc-kpi-assigned').textContent = String(assignedStaffCount);
  document.getElementById('spoc-kpi-unassigned').textContent = String(allStaff.length - assignedStaffCount);
  document.getElementById('spoc-kpi-allocated').textContent = String(allocatedTeamsCount);

  document.getElementById('spoc-total-count').textContent = String(allStaff.length);
  document.getElementById('spoc-summary-sub').textContent = `${assignedStaffCount} assigned · ${allStaff.length - assignedStaffCount} unassigned`;

  if (!state.activeSpocEmail && allStaff.length > 0) {
    state.activeSpocEmail = allStaff[0].email.toLowerCase();
    state.spocSelectedTeams = new Set(allStaff[0].teams);
  }

  const staffQ = state.spocStaffSearch.trim().toLowerCase();
  const filteredStaff = allStaff.filter((s) => {
    const matchText = s.name.toLowerCase().includes(staffQ) || s.email.toLowerCase().includes(staffQ);
    if (!matchText) return false;
    if (state.spocStaffFilter === 'assigned') return s.teams.size > 0;
    if (state.spocStaffFilter === 'unassigned') return s.teams.size === 0;
    return true;
  });

  document.getElementById('spoc-staff-list').innerHTML = filteredStaff
    .map((s, idx) => {
      const emailKey = s.email.toLowerCase();
      const selected = emailKey === state.activeSpocEmail;
      const initials = s.name.slice(0, 2).toUpperCase();
      return `
        <button type="button" class="spoc-staff-item ${selected ? 'is-selected' : ''}" data-select-spoc="${emailKey}">
          <div class="spoc-staff-left">
            <span class="spoc-idx">#${idx + 1}</span>
            <span class="spoc-avatar">${initials}</span>
            <div class="spoc-staff-meta">
              <div class="spoc-tile-title">${s.name}</div>
              <div class="team-leader" style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.email}</div>
            </div>
          </div>
          <span class="status-pill ${s.teams.size > 0 ? 'is-evaluated' : ''}">${s.teams.size > 0 ? `${s.teams.size} TEAM${s.teams.size > 1 ? 'S' : ''}` : 'UNASSIGNED'}</span>
        </button>
      `;
    })
    .join('');

  const activeStaff = staffMap.get(state.activeSpocEmail);
  if (activeStaff) {
    document.getElementById('spoc-active-avatar').textContent = activeStaff.name.slice(0, 2).toUpperCase();
    document.getElementById('spoc-active-name').textContent = activeStaff.name;
    document.getElementById('spoc-active-email').textContent = activeStaff.email;
    const activeCountEl = document.getElementById('spoc-active-count');
    if (activeCountEl) {
      activeCountEl.textContent = `${state.spocSelectedTeams.size} SELECTED`;
    }
  }

  // Build map of which team is allotted to which SPOC
  const teamToSpoc = new Map();
  allStaff.forEach((s) => {
    s.teams.forEach((tid) => teamToSpoc.set(tid, s));
  });

  const tq = state.spocTeamSearch.trim().toLowerCase();
  const filteredAllotTeams = state.allTeams.filter((t) => {
    const matchText = t.name.toLowerCase().includes(tq) || t.leader.toLowerCase().includes(tq);
    const matchTrack = state.spocTrackFilter === 'all' || t.sem === state.spocTrackFilter;
    const ownerObj = teamToSpoc.get(t.id);
    const isCheckedForActive = state.spocSelectedTeams.has(t.id);
    const matchAvail = state.spocShowAllotted || !ownerObj || isCheckedForActive;
    return matchText && matchTrack && matchAvail;
  });

  document.getElementById('btn-spoc-select-filtered').textContent = `SELECT FILTERED (${filteredAllotTeams.length})`;

  document.getElementById('spoc-allot-teams-grid').innerHTML = filteredAllotTeams
    .map((t, idx) => {
      const ownerObj = teamToSpoc.get(t.id);
      const ownerEmail = ownerObj ? ownerObj.email.toLowerCase() : '';
      const isCheckedForActive = state.spocSelectedTeams.has(t.id);
      const isOwnedByOther = Boolean(ownerObj) && ownerEmail !== state.activeSpocEmail && !isCheckedForActive;
      const tileCls = isCheckedForActive ? 'is-checked' : isOwnedByOther ? 'is-other-allotted' : '';
      const statusCls = isCheckedForActive || isOwnedByOther ? 'spoc-taken' : 'spoc-avail';
      const statusLabel = isCheckedForActive
        ? `Selected: ${activeStaff ? activeStaff.name : 'Active SPOC'}`
        : isOwnedByOther
          ? `Allotted: ${ownerObj.name}`
          : 'Available for Allotment';
      return `
        <div class="spoc-team-tile ${tileCls}" data-toggle-spoc-team="${t.id}" role="checkbox" aria-checked="${isCheckedForActive}" tabindex="0">
          <div class="spoc-tile-top">
            <span class="spoc-idx" style="color:var(--accent-primary);">#${idx + 1}</span>
            <span class="spoc-code-pill">IVC-${String(101 + idx)}</span>
            <div class="spoc-tile-title" style="flex:1;min-width:0;">${t.name}</div>
            <input type="checkbox" class="spoc-tile-checkbox" data-spoc-checkbox="${t.id}" ${isCheckedForActive ? 'checked' : ''} aria-label="Assign ${t.name} to ${activeStaff ? activeStaff.name : 'SPOC'}" />
          </div>
          <div class="spoc-tile-meta">
            <span class="sem-label">[${t.sem}]</span>
            <span class="${statusCls}">${statusLabel}</span>
          </div>
        </div>
      `;
    })
    .join('');
  }

  // 6. Audit Logs
  if (document.getElementById('admin-audit-table-wrap')) {
    const aq = state.auditFilter.trim().toLowerCase();
  const filteredLogs = state.auditLogs.filter(
    (l) =>
      l.actor.toLowerCase().includes(aq) ||
      l.action.toLowerCase().includes(aq) ||
      l.target.toLowerCase().includes(aq) ||
      (l.details || '').toLowerCase().includes(aq)
  );

  document.getElementById('admin-audit-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Target</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${filteredLogs
          .map(
            (l) => `
            <tr>
              <td class="team-leader">${new Date(l.created_at).toLocaleString()}</td>
              <td><strong>${l.actor}</strong> <span class="sem-label">${l.actor_role.toUpperCase()}</span></td>
              <td><span class="status-pill">${l.action}</span></td>
              <td>${l.target}</td>
              <td class="team-leader">${l.details || '—'}</td>
            </tr>
          `
          )
          .join('')}
      </tbody>
    </table>
  `;
  }

  // 7. User Management
  const umWrap = document.getElementById('admin-users-table-wrap');
  if (umWrap) {
    const uq = state.umSearch.trim().toLowerCase();
    const filteredUsers = state.allAccounts.filter((u) => {
      const matchText =
        (u.display_name || '').toLowerCase().includes(uq) ||
        (u.username || '').toLowerCase().includes(uq) ||
        (u.email || '').toLowerCase().includes(uq);
      const matchRole = state.umRoleFilter === 'all' || u.role === state.umRoleFilter;
      return matchText && matchRole;
    });

    umWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Email</th>
            <th>Current Role</th>
            <th>Change Role</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${filteredUsers
            .map(
              (u) => `
            <tr>
              <td><strong>${u.display_name}</strong></td>
              <td><code>${u.username}</code></td>
              <td class="team-leader">${u.email}</td>
              <td><span class="status-pill ${u.role === 'admin' ? 'is-evaluated' : u.role === 'judge' ? 'is-drafted' : ''}">${u.role.toUpperCase()}</span></td>
              <td>
                <select class="round-select" data-um-role-select="${u.id}" data-um-email="${u.email}" data-um-name="${u.display_name}" data-um-old-role="${u.role}" aria-label="Change role for ${u.display_name}">
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                  <option value="judge" ${u.role === 'judge' ? 'selected' : ''}>Judge</option>
                  <option value="spoc" ${u.role === 'spoc' ? 'selected' : ''}>SPOC</option>
                  <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option>
                  <option value="team_leader" ${u.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
                  <option value="participant" ${u.role === 'participant' ? 'selected' : ''}>Participant</option>
                </select>
              </td>
              <td>
                <button type="button" class="btn-danger-ghost" data-um-delete="${u.id}" ${u.role === 'admin' ? 'disabled' : ''}>REMOVE</button>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  // 8. Content Releases
  const crGrid = document.getElementById('cr-cards-grid');
  if (crGrid) {
    const publishedItems = state.contentItems.filter((i) => i.status === 'PUBLISHED');
    const draftItems = state.contentItems.filter((i) => i.status === 'DRAFT');

    document.getElementById('cr-kpi-activities').textContent = String(state.contentActivities.length);
    document.getElementById('cr-kpi-items').textContent = String(state.contentItems.length);
    document.getElementById('cr-kpi-published').textContent = String(publishedItems.length);
    document.getElementById('cr-kpi-drafts').textContent = String(draftItems.length);

    const cq = state.crSearch.trim().toLowerCase();
    const filteredActs = state.contentActivities.filter((a) => {
      const matchText =
        a.title.toLowerCase().includes(cq) ||
        a.kicker.toLowerCase().includes(cq) ||
        a.description.toLowerCase().includes(cq);
      const matchType = state.crTypeFilter === 'all' || a.activity_type === state.crTypeFilter;
      return matchText && matchType;
    });

    crGrid.innerHTML = filteredActs
      .map((act) => {
        const actItems = state.contentItems.filter((i) => i.activity_id === act.id);
        const pubCount = actItems.filter((i) => i.status === 'PUBLISHED').length;
        return `
          <article class="cr-card">
            <div class="cr-card-top">
              <span class="kpi-icon-box kpi-icon-${act.accent === 'gold' ? 'gold' : act.accent === 'cyan' ? 'cyan' : 'pink'}" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              </span>
              <span class="status-pill">${act.activity_type}</span>
            </div>
            <div class="cr-kicker">${act.kicker}</div>
            <h2 class="cr-title">${act.title}</h2>
            <p class="cr-desc">${act.description}</p>
            <div class="cr-pills">
              <span class="status-pill">${actItems.length} ITEM${actItems.length === 1 ? '' : 'S'}</span>
              <span class="status-pill ${pubCount > 0 ? 'is-evaluated' : ''}">${pubCount > 0 ? `${pubCount} PUBLISHED` : 'NO PUBLISHED CONTENT'}</span>
            </div>
            <button type="button" class="btn-open-ws" data-open-cr-ws="${act.id}">
              <span>OPEN WORKSPACE</span>
              <span>→</span>
            </button>
          </article>
        `;
      })
      .join('');

    if (state.activeActivityId && !document.getElementById('cr-workspace-modal').hidden) {
      renderCrWorkspaceTable();
    }
  }

  // 9. Announcements (/admin/announcements)
  const annFeed = document.getElementById('ann-feed-list');
  if (annFeed) {
    const activeAnns = state.announcements.filter((a) => a.is_active);
    const urgentAnns = state.announcements.filter((a) => a.priority === 'URGENT' && a.is_active);
    const archivedAnns = state.announcements.filter((a) => !a.is_active);

    document.getElementById('ann-kpi-total').textContent = String(state.announcements.length);
    document.getElementById('ann-kpi-active').textContent = String(activeAnns.length);
    document.getElementById('ann-kpi-urgent').textContent = String(urgentAnns.length);
    document.getElementById('ann-kpi-archived').textContent = String(archivedAnns.length);

    const aq = state.annSearch.trim().toLowerCase();
    const filteredAnns = state.announcements.filter((a) => {
      const matchText =
        a.title.toLowerCase().includes(aq) ||
        a.message.toLowerCase().includes(aq);
      const matchAud = state.annAudienceFilter === 'all' || a.audience === state.annAudienceFilter;
      return matchText && matchAud;
    });

    if (filteredAnns.length === 0) {
      annFeed.innerHTML = `<div class="rubrics-empty-card"><p class="rubrics-empty-text">No announcements match your filter.</p></div>`;
    } else {
      annFeed.innerHTML = filteredAnns
        .map((a) => {
          const priorityCls = a.priority === 'URGENT' ? 'ann-pill-pink' : a.priority === 'IMPORTANT' ? 'ann-pill-purple' : 'ann-pill-blue';
          const cardCls = a.priority === 'URGENT' ? 'is-urgent' : a.priority === 'IMPORTANT' ? 'is-important' : '';
          return `
            <article class="ann-item-card ${cardCls}">
              <div style="flex:1;min-width:240px;">
                <div class="ann-item-meta">
                  <span class="status-pill ${priorityCls}">${a.priority}</span>
                  <span class="status-pill ann-pill-blue">${a.audience}</span>
                  <span class="status-pill ${a.is_active ? 'ann-pill-green' : ''}">${a.is_active ? 'ACTIVE LIVE' : 'ARCHIVED'}</span>
                  <span class="team-leader">${new Date(a.created_at).toLocaleString()}</span>
                </div>
                <h3 class="ann-item-title">${a.title}</h3>
                <p class="ann-item-msg">${a.message}</p>
              </div>
              <div class="assign-pills">
                <button type="button" class="btn-draft" data-ann-toggle="${a.id}" data-ann-active="${a.is_active}">
                  ${a.is_active ? 'Archive' : 'Activate'}
                </button>
                <button type="button" class="btn-danger-ghost" data-ann-delete="${a.id}">DELETE</button>
              </div>
            </article>
          `;
        })
        .join('');
    }
  }

  // 10. Result Engine (/admin/results)
  const resWrap = document.getElementById('admin-results-table-wrap');
  if (resWrap) {
    const rq = state.resSearch.trim().toLowerCase();
    const ranked = getCalculatedStandings().filter((row) => {
      const matchText =
        row.team.name.toLowerCase().includes(rq) ||
        row.team.leader.toLowerCase().includes(rq) ||
        row.team.sem.toLowerCase().includes(rq);
      const matchRound = state.resRoundFilter === 'all' || row.team.round === state.resRoundFilter;
      const matchSem = state.resSemFilter === 'all' || row.team.sem === state.resSemFilter;
      return matchText && matchRound && matchSem;
    });

    const submittedAll = state.allEvaluations.filter((e) => e.status === 'EVALUATED').length;
    const topRow = ranked[0];

    document.getElementById('res-kpi-teams').textContent = String(ranked.filter((r) => r.judgesScored > 0).length);
    document.getElementById('res-kpi-ballots').textContent = String(submittedAll);
    document.getElementById('res-kpi-top').textContent = topRow ? topRow.avgScore.toFixed(1) : '0.0';
    document.getElementById('res-kpi-leader').textContent = topRow && topRow.avgScore > 0 ? topRow.team.name : 'Awaiting scores';

    const statusEl = document.getElementById('res-kpi-status');
    statusEl.textContent = state.resultsEngine;
    statusEl.classList.toggle('is-live', state.resultsEngine === 'Published / Live');

    const pubBtn = document.getElementById('btn-res-publish');
    if (pubBtn) {
      pubBtn.textContent = state.resultsEngine === 'Published / Live' ? 'SET TO DRAFT' : 'PUBLISH RESULTS';
    }

    resWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Semester</th>
            <th>Round</th>
            <th>Judges</th>
            <th>Final Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${ranked
            .map((row, idx) => {
              const rankNum = idx + 1;
              const badgeCls = rankNum <= 3 && row.avgScore > 0 ? `is-top-${rankNum}` : '';
              return `
                <tr>
                  <td><span class="rank-badge ${badgeCls}">#${rankNum}</span></td>
                  <td><strong>${row.team.name}</strong><br><span class="team-leader">${row.team.leader}</span></td>
                  <td><span class="sem-label">${row.team.sem}</span></td>
                  <td>Round ${row.team.round}</td>
                  <td>${row.judgesScored}</td>
                  <td><strong style="color: var(--accent-primary);">${row.avgScore.toFixed(1)} / ${maxTotal}</strong></td>
                  <td><span class="status-pill ${row.judgesScored > 0 ? 'is-evaluated' : 'mx-pill-rose'}">${row.judgesScored > 0 ? 'QUALIFIED' : 'PENDING'}</span></td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }
}

function getCalculatedStandings() {
  return state.allTeams
    .map((t) => {
      const submitted = state.allEvaluations.filter((e) => e.team_id === t.id && e.status === 'EVALUATED');
      const fallback = state.allEvaluations.filter((e) => e.team_id === t.id && e.status !== 'PENDING');
      const used = submitted.length > 0 ? submitted : fallback;
      const avgScore =
        used.length > 0
          ? used.reduce((sum, e) => sum + Number(e.total_score || 0), 0) / used.length
          : 0;
      return { team: t, judgesScored: used.length, avgScore };
    })
    .sort((a, b) => b.avgScore - a.avgScore || a.team.name.localeCompare(b.team.name));
}

function renderCrWorkspaceTable() {
  const act = state.contentActivities.find((a) => a.id === state.activeActivityId);
  if (!act) return;
  document.getElementById('cr-ws-kicker').textContent = `CONTENT WORKSPACE // ${act.kicker}`;
  document.getElementById('cr-ws-title').textContent = act.title;

  const items = state.contentItems.filter((i) => i.activity_id === act.id);
  const wrap = document.getElementById('cr-ws-table');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="rubrics-empty-card"><p class="rubrics-empty-text">No content items yet. Add one above.</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Content / Details</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
          <tr>
            <td><strong>${item.title}</strong></td>
            <td class="team-leader">${item.body}</td>
            <td><span class="status-pill ${item.status === 'PUBLISHED' ? 'is-evaluated' : 'is-drafted'}">${item.status}</span></td>
            <td>
              <div class="assign-pills">
                <button type="button" class="btn-draft" data-cr-toggle-item="${item.id}" data-cr-item-status="${item.status}">
                  ${item.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                </button>
                <button type="button" class="btn-danger-ghost" data-cr-delete-item="${item.id}">REMOVE</button>
              </div>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

async function refreshTeamFromSupabase(teamId) {
  if (!state.supabase) return;
  try {
    const { data, error } = await state.supabase
      .from('evaluations')
      .select('status, scores')
      .eq('team_id', teamId)
      .eq('judge_id', state.judgeId)
      .maybeSingle();
    if (error || !data) return;

    const team = state.teams.find((t) => t.id === teamId);
    if (!team) return;
    team.status = data.status || team.status;
    if (data.scores && typeof data.scores === 'object') {
      team.scores = data.scores;
    }
    saveLocalTeams();
    renderAll();

    const evalEl = document.getElementById('view-evaluate');
    if (state.activeTeamId === teamId && evalEl && !evalEl.hidden) {
      document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / ${maxPossibleScore()} PTS`;
      state.criteria.forEach((c) => {
        const val = Number(team.scores?.[c.id]) || 0;
        const valEl = document.getElementById(`eval-val-${c.id}`);
        const sliderEl = document.querySelector(`.score-slider[data-criterion="${c.id}"]`);
        if (valEl) valEl.textContent = `${val} / ${c.max}`;
        if (sliderEl) sliderEl.value = String(val);
      });
      document.getElementById('btn-submit-eval').querySelector('span').textContent =
        team.status === 'EVALUATED' ? 'UPDATE EVALUATION' : 'SUBMIT FINAL EVALUATION';
    }
  } catch {
    // Ignore
  }
}

function openTeamEvaluation(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;
  state.activeTeamId = teamId;
  const isEvaluated = team.status === 'EVALUATED';
  const activeRoundObj = state.rounds.find((r) => r.id === team.round) || state.rounds.find((r) => r.status === 'ACTIVE');

  document.getElementById('eval-team-sem').textContent = team.sem;
  document.getElementById('eval-team-name').textContent = team.name;
  document.getElementById('eval-team-meta').textContent = `Leader: ${team.leader} | Members: ${team.members}`;
  document.getElementById('eval-active-round').textContent = activeRoundObj ? activeRoundObj.name : 'PRELIMINARY ROUND';

  document.getElementById('deliverables-grid').innerHTML = `
    <div class="deliverable-item">
      <span class="deliverable-kicker is-gold">MANDATORY DECK</span>
      <div class="deliverable-name"><span>PRESENTATION FILE</span></div>
      ${team.deckUrl
        ? `<a href="${team.deckUrl}" class="deliverable-link" data-deliverable="Presentation Deck">OPEN / DOWNLOAD FILE ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>
    <div class="deliverable-item">
      <span class="deliverable-kicker">SOURCE CODE</span>
      <div class="deliverable-name"><span>GITHUB REPOSITORY</span></div>
      ${team.repoUrl
        ? `<a href="${team.repoUrl}" class="deliverable-link" data-deliverable="GitHub Repository">OPEN REPOSITORY ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>
    <div class="deliverable-item">
      <span class="deliverable-kicker">INTERACTIVE DEMO</span>
      <div class="deliverable-name"><span>LIVE DEMO / PROTOTYPE</span></div>
      ${team.demoUrl
        ? `<a href="${team.demoUrl}" class="deliverable-link" data-deliverable="Live Demo">LAUNCH DEMO ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>
  `;

  document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / ${maxPossibleScore()} PTS`;

  document.getElementById('eval-criteria-list').innerHTML = state.criteria
    .map(
      (c) => `
    <div class="eval-criterion-row">
      <div class="eval-criterion-top">
        <div>
          <strong style="color: var(--color-10);">${c.name}</strong>
          <div class="team-leader">${c.desc}</div>
        </div>
        <strong id="eval-val-${c.id}" style="color: var(--accent-primary);">${Number(team.scores?.[c.id]) || 0} / ${c.max}</strong>
      </div>
      <input
        type="range"
        class="score-slider"
        min="0"
        max="${c.max}"
        value="${Number(team.scores?.[c.id]) || 0}"
        data-criterion="${c.id}"
        aria-label="${c.name} score"
      />
    </div>
  `
    )
    .join('');

  document.getElementById('btn-save-draft').disabled = false;
  document.getElementById('btn-submit-eval').disabled = false;
  document.getElementById('btn-submit-eval').querySelector('span').textContent = isEvaluated
    ? 'UPDATE EVALUATION'
    : 'SUBMIT FINAL EVALUATION';
  showView('evaluate');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshTeamFromSupabase(teamId);
}

function formatTimer(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function renderRosterModalTable() {
  const role = state.inspectRole;
  const rows = state.allAccounts.filter((a) =>
    role === 'team_leader' ? a.role === 'team_leader' || a.role === 'team' : a.role === role
  );
  const roleNames = {
    participant: 'PARTICIPANTS',
    team_leader: 'TEAM LEADERS',
    judge: 'JUDGES',
    staff: 'STAFF & CLUB'
  };
  document.getElementById('roster-modal-kicker').textContent = `ROSTER // ${roleNames[role] || role.toUpperCase()}`;
  document.getElementById('roster-modal-title').textContent = `${roleNames[role] || role} (${rows.length} ENROLLED)`;

  if (rows.length === 0) {
    document.getElementById('roster-modal-table').innerHTML = `<div class="rubrics-empty-card"><p class="rubrics-empty-text">No accounts enrolled in this role yet. Use the form above to add one.</p></div>`;
    return;
  }

  document.getElementById('roster-modal-table').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Username / Email</th>
          <th>Promote / Role</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (acc) => `
          <tr>
            <td><strong>${acc.display_name}</strong></td>
            <td>${acc.username}<br><span class="team-leader">${acc.email}</span></td>
            <td>
              <select class="round-select" data-change-role="${acc.id}" aria-label="Change role for ${acc.display_name}">
                <option value="participant" ${acc.role === 'participant' ? 'selected' : ''}>Participant</option>
                <option value="team_leader" ${acc.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
                <option value="judge" ${acc.role === 'judge' ? 'selected' : ''}>Judge</option>
                <option value="spoc" ${acc.role === 'spoc' ? 'selected' : ''}>SPOC</option>
                <option value="staff" ${acc.role === 'staff' ? 'selected' : ''}>Staff &amp; Club</option>
              </select>
            </td>
            <td>
              <button type="button" class="btn-danger-ghost" data-delete-account="${acc.id}">REMOVE</button>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function openRosterModal(role) {
  if (!isAdmin()) return;
  state.inspectRole = role;
  renderRosterModalTable();
  document.getElementById('roster-modal').hidden = false;
}

function closeRosterModal() {
  document.getElementById('roster-modal').hidden = true;
  state.inspectRole = null;
}

function renderSpocViews() {
  if (document.body.dataset.page !== 'spoc' || !state.user) return;
  const myEmail = (state.user.email || '').toLowerCase();
  const mySpocRows = state.spocs.filter((s) => (s.email || '').toLowerCase() === myEmail);
  const myTeamIds = new Set(mySpocRows.map((s) => s.assigned_team_id).filter(Boolean));
  const myTeams =
    myTeamIds.size > 0
      ? state.allTeams.filter((t) => myTeamIds.has(t.id))
      : state.allTeams;

  const updateMap = new Map(state.spocUpdates.map((u) => [u.team_id, u]));
  const checkedCount = myTeams.filter((t) => updateMap.get(t.id)?.checked_in).length;
  const deckCount = myTeams.filter((t) => updateMap.get(t.id)?.deck_verified).length;
  const readyCount = myTeams.filter((t) => updateMap.get(t.id)?.pitch_ready).length;

  const spocGrid = document.getElementById('spoc-teams-grid');
  if (spocGrid) {
    document.getElementById('spoc-kpi-total').textContent = String(myTeams.length);
    document.getElementById('spoc-kpi-checked').textContent = String(checkedCount);
    document.getElementById('spoc-kpi-deck').textContent = String(deckCount);
    document.getElementById('spoc-kpi-ready').textContent = String(readyCount);

    spocGrid.innerHTML = myTeams
      .map((t) => {
        const up = updateMap.get(t.id) || { checked_in: false, deck_verified: false, pitch_ready: false, spoc_notes: '' };
        const assignedJudge = state.assignments.find((a) => a.team_id === t.id)?.judge_id || 'Unassigned';
        return `
          <article class="team-card">
            <div class="team-card-header">
              <span class="sem-label">${t.sem}</span>
              <span class="status-pill ${up.pitch_ready ? 'is-evaluated' : up.checked_in ? 'is-drafted' : ''}">
                ${up.pitch_ready ? 'PITCH READY' : up.checked_in ? 'CHECKED IN' : 'AWAITING'}
              </span>
            </div>
            <h2 class="team-title">${t.name}</h2>
            <div class="team-leader">Leader: ${t.leader} · Judge: ${assignedJudge}</div>
            <div class="team-divider" aria-hidden="true"></div>
            <div class="assign-pills">
              <button type="button" class="assign-toggle ${up.checked_in ? 'is-assigned' : ''}" data-spoc-toggle="checked_in" data-team-id="${t.id}" data-val="${up.checked_in}">
                ${up.checked_in ? '✓ ' : '+ '}Checked In
              </button>
              <button type="button" class="assign-toggle ${up.deck_verified ? 'is-assigned' : ''}" data-spoc-toggle="deck_verified" data-team-id="${t.id}" data-val="${up.deck_verified}">
                ${up.deck_verified ? '✓ ' : '+ '}Deck OK
              </button>
              <button type="button" class="assign-toggle ${up.pitch_ready ? 'is-assigned' : ''}" data-spoc-toggle="pitch_ready" data-team-id="${t.id}" data-val="${up.pitch_ready}">
                ${up.pitch_ready ? '✓ ' : '+ '}Pitch Ready
              </button>
            </div>
            <div class="team-card-footer" style="margin-top: var(--space-2);">
              <input type="text" class="search-input" style="min-width:0;flex:1;" placeholder="SPOC note..." value="${up.spoc_notes || ''}" data-spoc-note-input="${t.id}" />
              <button type="button" class="btn-draft" data-spoc-save-note="${t.id}">SAVE</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  const spocReadinessWrap = document.getElementById('spoc-readiness-table-wrap');
  if (spocReadinessWrap) {
    spocReadinessWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Assigned Judge</th>
            <th>Checked In</th>
            <th>Deck Verified</th>
            <th>Pitch Ready</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${myTeams
            .map((t) => {
              const up = updateMap.get(t.id) || { checked_in: false, deck_verified: false, pitch_ready: false, spoc_notes: '' };
              const assignedJudge = state.assignments.find((a) => a.team_id === t.id)?.judge_id || 'Unassigned';
              return `
                <tr>
                  <td><strong>${t.name}</strong><br><span class="team-leader">${t.sem} · ${t.leader}</span></td>
                  <td>${assignedJudge}</td>
                  <td><span class="status-pill ${up.checked_in ? 'is-evaluated' : ''}">${up.checked_in ? 'YES' : 'NO'}</span></td>
                  <td><span class="status-pill ${up.deck_verified ? 'is-evaluated' : ''}">${up.deck_verified ? 'YES' : 'NO'}</span></td>
                  <td><span class="status-pill ${up.pitch_ready ? 'is-evaluated' : ''}">${up.pitch_ready ? 'READY' : 'WAIT'}</span></td>
                  <td class="team-leader">${up.spoc_notes || '—'}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }
}

function renderPortalBroadcastBanner() {
  const el = document.getElementById('portal-broadcast-msg');
  if (!el || !state.user) return;
  const targetAud = state.user.role === 'judge' ? 'JUDGES' : state.user.role === 'spoc' ? 'SPOCS' : 'ALL';
  const active = state.announcements.find(
    (a) => a.is_active && (a.audience === 'ALL' || a.audience === targetAud)
  );
  if (active) {
    el.textContent = `[${active.priority}] ${active.title}: ${active.message}`;
  } else {
    el.textContent =
      state.user.role === 'spoc'
        ? 'Verify team check-ins and presentation decks before round start.'
        : 'No active announcements for this portal. All systems operational.';
  }
}

function renderAll() {
  renderKpis();
  renderTeamsGrid();
  renderAdminViews();
  renderSpocViews();
  renderPortalBroadcastBanner();
}

document.addEventListener('DOMContentLoaded', () => {
  initSupabaseClient();
  applyAuthUI();
  if (document.body.dataset.page !== 'login') {
    renderAll();
    if (state.activeTeamId && document.getElementById('view-evaluate') && !document.getElementById('view-evaluate').hidden) {
      openTeamEvaluation(state.activeTeamId);
    }
  }

  // Password visibility toggle
  document.getElementById('btn-toggle-pw')?.addEventListener('click', () => {
    const pwInput = document.getElementById('login-password');
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  });

  // Login form submit
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-signin');

    errEl.hidden = true;
    if (!identifier || !password) {
      errEl.textContent = 'Please enter both email/username and password.';
      errEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'SIGNING IN...';

    try {
      if (!state.supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await state.supabase.rpc('portal_login', {
        p_identifier: identifier,
        p_password: password
      });
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        errEl.textContent = 'Invalid email/username or password.';
        errEl.hidden = false;
        return;
      }

      state.user = data[0];
      saveSessionUser(state.user, remember);
      applyAuthUI();
      await writeAuditLog('USER_LOGIN', state.user.username, `Signed in as ${state.user.role}`);
      showToast(`Signed in as ${state.user.display_name} (${state.user.role}).`);
    } catch (err) {
      console.error('Login error:', err);
      errEl.textContent = 'Unable to verify credentials with Supabase.';
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'SIGN IN →';
    }
  });

  // Sidebar Navigation
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      const view = item.dataset.view;
      if (view.startsWith('admin-') && !isAdmin()) {
        e.preventDefault();
        showToast('Admin privileges required.');
        return;
      }
      if (document.getElementById(`view-${view}`)) {
        e.preventDefault();
        setActiveNav(view);
        showView(view);
      }
    });
  });

  // Overview quick jumps, Roster Cards & Results Engine toggle
  document.getElementById('view-admin-overview')?.addEventListener('click', async (e) => {
    const rosterCard = e.target.closest('[data-inspect-role]');
    if (rosterCard && isAdmin()) {
      openRosterModal(rosterCard.dataset.inspectRole);
      return;
    }
    const btn = e.target.closest('[data-nav-jump]');
    if (btn && isAdmin()) {
      navigateToView(btn.dataset.navJump);
      return;
    }
    if (e.target.id === 'btn-toggle-results-engine' && isAdmin() && state.supabase) {
      const next = state.resultsEngine === 'Draft / Unreleased' ? 'Published / Live' : 'Draft / Unreleased';
      const { error } = await state.supabase
        .from('event_settings')
        .upsert({ key: 'results_engine', value: next, updated_at: new Date().toISOString() });
      if (!error) {
        await writeAuditLog('RESULTS_ENGINE', 'Eventra IVC', `Changed to ${next}`);
        showToast(`Results Engine set to ${next}.`);
        await syncFromSupabase();
      }
    }
  });

  // Roster Modal events
  document.getElementById('btn-close-roster-modal')?.addEventListener('click', closeRosterModal);
  document.getElementById('roster-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'roster-modal') closeRosterModal();
  });

  document.getElementById('roster-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase || !state.inspectRole) return;
    const displayName = document.getElementById('roster-new-name').value.trim();
    const username = document.getElementById('roster-new-username').value.trim();
    const email = document.getElementById('roster-new-email').value.trim();
    const password = document.getElementById('roster-new-password').value;
    const { error } = await state.supabase.rpc('create_portal_account', {
      p_email: email,
      p_username: username,
      p_password: password,
      p_role: state.inspectRole,
      p_display_name: displayName
    });
    if (error) {
      showToast('Could not create account (duplicate email/username?).');
      return;
    }
    await writeAuditLog('ACCOUNT_CREATED', username, `Role: ${state.inspectRole}`);
    e.target.reset();
    showToast(`Added ${displayName} as ${state.inspectRole}.`);
    await syncFromSupabase();
  });

  document.getElementById('roster-modal-table')?.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-change-role]');
    if (!sel || !isAdmin() || !state.supabase) return;
    const id = sel.dataset.changeRole;
    const newRole = sel.value;
    const { error } = await state.supabase.rpc('update_portal_role', { p_id: id, p_role: newRole });
    if (!error) {
      await writeAuditLog('ACCOUNT_ROLE_CHANGED', id, `New role: ${newRole}`);
      showToast(`Updated role to ${newRole}.`);
      await syncFromSupabase();
    }
  });

  document.getElementById('roster-modal-table')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-account]');
    if (!delBtn || !isAdmin() || !state.supabase) return;
    const id = delBtn.dataset.deleteAccount;
    const { error } = await state.supabase.rpc('delete_portal_account', { p_id: id });
    if (!error) {
      await writeAuditLog('ACCOUNT_REMOVED', id, 'Deleted from roster');
      showToast('Removed account.');
      await syncFromSupabase();
    }
  });

  // Admin: Assignment Search & Toggle
  document.getElementById('admin-assign-search')?.addEventListener('input', (e) => {
    state.assignFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('admin-assign-table-wrap')?.addEventListener('change', async (e) => {
    const judgeSel = e.target.closest('[data-assign-judge-select]');
    if (judgeSel) {
      const teamId = judgeSel.dataset.assignJudgeSelect;
      const judgeId = judgeSel.value;
      if (!judgeId) {
        const existing = state.assignments.find((a) => a.team_id === teamId);
        if (existing) toggleAssignment(teamId, existing.judge_id, true);
      } else {
        toggleAssignment(teamId, judgeId, false);
      }
      return;
    }

    const spocSel = e.target.closest('[data-assign-spoc-select]');
    if (spocSel && isAdmin() && state.supabase) {
      const teamId = spocSel.dataset.assignSpocSelect;
      const targetEmail = spocSel.value.trim();

      await state.supabase.from('spocs').delete().eq('assigned_team_id', teamId);
      if (targetEmail) {
        const staff = state.spocs.find((s) => (s.email || '').toLowerCase() === targetEmail.toLowerCase());
        if (staff) {
          await state.supabase.from('spocs').insert({
            name: staff.name,
            email: staff.email,
            phone: staff.phone,
            department: staff.department,
            assigned_team_id: teamId,
            status: 'ACTIVE'
          });
          await writeAuditLog('SPOC_INCHARGE_CHANGED', teamId, `SPOC -> ${staff.name}`);
          showToast(`Updated ${teamId} SPOC incharge to ${staff.name}.`);
        }
      } else {
        await writeAuditLog('SPOC_INCHARGE_CLEARED', teamId, 'Removed SPOC incharge');
        showToast(`Cleared SPOC incharge for ${teamId}.`);
      }
      await syncFromSupabase();
    }
  });

  // Admin: Rounds & Criteria actions
  document.getElementById('admin-rounds-list')?.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-round-select]');
    if (!sel || !isAdmin() || !state.supabase) return;
    const roundId = sel.dataset.roundSelect;
    const nextStatus = sel.value;
    const { error } = await state.supabase.from('evaluation_rounds').update({ status: nextStatus }).eq('id', roundId);
    if (error) {
      showToast('Failed to update round status.');
      return;
    }
    await writeAuditLog('ROUND_UPDATED', `Round ${roundId}`, `Status -> ${nextStatus}`);
    showToast(`Round ${roundId} marked ${nextStatus}.`);
    await syncFromSupabase();
  });

  document.getElementById('admin-add-criterion-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase) return;
    const name = document.getElementById('new-crit-name').value.trim();
    const desc = document.getElementById('new-crit-desc').value.trim();
    const max = Number(document.getElementById('new-crit-max').value) || 10;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { error } = await state.supabase.from('rubric_criteria').insert({
      id,
      name,
      description: desc,
      max_score: max,
      sort_order: state.criteria.length + 1
    });
    if (error) {
      showToast('Could not add criterion.');
      return;
    }
    await writeAuditLog('CRITERION_ADDED', name, `Max: ${max} pts`);
    e.target.reset();
    showToast(`Added criterion ${name}.`);
    await syncFromSupabase();
  });

  document.getElementById('admin-criteria-table-wrap')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-criterion]');
    if (!btn || !isAdmin() || !state.supabase) return;
    const id = btn.dataset.deleteCriterion;
    const { error } = await state.supabase.from('rubric_criteria').delete().eq('id', id);
    if (error) {
      showToast('Could not remove criterion.');
      return;
    }
    await writeAuditLog('CRITERION_REMOVED', id, 'Deleted from rubric');
    showToast(`Removed criterion ${id}.`);
    await syncFromSupabase();
  });

  // Admin: Staff SPOC Allotment Console events
  document.getElementById('spoc-staff-search')?.addEventListener('input', (e) => {
    state.spocStaffSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('spoc-staff-filter')?.addEventListener('change', (e) => {
    state.spocStaffFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('spoc-team-search')?.addEventListener('input', (e) => {
    state.spocTeamSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('spoc-track-filter')?.addEventListener('change', (e) => {
    state.spocTrackFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('spoc-show-allotted')?.addEventListener('change', (e) => {
    state.spocShowAllotted = e.target.checked;
    renderAdminViews();
  });

  let spocSaveQueue = Promise.resolve();

  function commitActiveSpocSelection(showNotice = false) {
    if (!isAdmin() || !state.activeSpocEmail) return;
    const activeEmail = state.activeSpocEmail;
    const sample = state.spocs.find((s) => (s.email || '').toLowerCase() === activeEmail);
    if (!sample) return;

    const selected = Array.from(state.spocSelectedTeams);
    const selectedSet = new Set(selected);

    // Preserve any SPOC whose only assigned teams were reassigned to activeEmail
    const evictedStaffSamples = [];
    const remainingByEmail = new Map();
    state.spocs.forEach((row) => {
      const rowEmail = (row.email || '').toLowerCase();
      if (rowEmail === activeEmail) return;
      if (!remainingByEmail.has(rowEmail)) remainingByEmail.set(rowEmail, { sample: row, count: 0 });
      if (!row.assigned_team_id || !selectedSet.has(row.assigned_team_id)) {
        if (row.assigned_team_id) remainingByEmail.get(rowEmail).count += 1;
      }
    });

    const nextSpocs = state.spocs.filter((row) => {
      const rowEmail = (row.email || '').toLowerCase();
      if (rowEmail === activeEmail) return false;
      if (row.assigned_team_id && selectedSet.has(row.assigned_team_id)) return false;
      return true;
    });

    remainingByEmail.forEach((info, rowEmail) => {
      const stillHasRow = nextSpocs.some((r) => (r.email || '').toLowerCase() === rowEmail);
      if (!stillHasRow) {
        const placeholder = {
          name: info.sample.name,
          email: info.sample.email,
          phone: info.sample.phone,
          department: info.sample.department,
          assigned_team_id: null,
          status: 'ACTIVE'
        };
        nextSpocs.push(placeholder);
        evictedStaffSamples.push(placeholder);
      }
    });

    if (selected.length > 0) {
      selected.forEach((tid) => {
        nextSpocs.push({
          name: sample.name,
          email: sample.email,
          phone: sample.phone,
          department: sample.department,
          assigned_team_id: tid,
          status: 'ACTIVE'
        });
      });
    } else {
      nextSpocs.push({
        name: sample.name,
        email: sample.email,
        phone: sample.phone,
        department: sample.department,
        assigned_team_id: null,
        status: 'ACTIVE'
      });
    }

    // Optimistic UI update so ticking feels instant
    state.spocs = nextSpocs;
    renderAdminViews();

    if (!state.supabase) return;
    state.pendingSpocSaves += 1;
    spocSaveQueue = spocSaveQueue
      .then(async () => {
        if (selected.length > 0) {
          await state.supabase.from('spocs').delete().in('assigned_team_id', selected);
        }
        await state.supabase.from('spocs').delete().ilike('email', sample.email);

        if (evictedStaffSamples.length > 0) {
          await state.supabase.from('spocs').insert(evictedStaffSamples);
        }

        const rows =
          selected.length > 0
            ? selected.map((tid) => ({
                name: sample.name,
                email: sample.email,
                phone: sample.phone,
                department: sample.department,
                assigned_team_id: tid,
                status: 'ACTIVE'
              }))
            : [
                {
                  name: sample.name,
                  email: sample.email,
                  phone: sample.phone,
                  department: sample.department,
                  assigned_team_id: null,
                  status: 'ACTIVE'
                }
              ];

        const { error } = await state.supabase.from('spocs').insert(rows);
        if (error) {
          showToast('Failed to save SPOC allotment.');
          return;
        }
        if (showNotice) {
          await writeAuditLog('SPOC_ALLOTMENT_SAVED', sample.name, `${selected.length} team(s) allotted`);
          showToast(`Saved ${selected.length} team(s) for ${sample.name}.`);
        }
      })
      .catch((err) => {
        console.error('SPOC allotment save error:', err);
        showToast('Failed to save SPOC allotment.');
      })
      .finally(async () => {
        state.pendingSpocSaves = Math.max(0, state.pendingSpocSaves - 1);
        if (state.pendingSpocSaves === 0) {
          await syncFromSupabase();
        }
      });
  }

  document.getElementById('spoc-staff-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-select-spoc]');
    if (!btn) return;
    state.activeSpocEmail = btn.dataset.selectSpoc;
    const teamsForSpoc = state.spocs
      .filter((s) => (s.email || '').toLowerCase() === state.activeSpocEmail && s.assigned_team_id)
      .map((s) => s.assigned_team_id);
    state.spocSelectedTeams = new Set(teamsForSpoc);
    renderAdminViews();
  });

  const handleToggleSpocTile = (tid) => {
    if (!isAdmin()) return;
    if (!state.activeSpocEmail) {
      showToast('Select a SPOC from the left list first.');
      return;
    }
    if (state.spocSelectedTeams.has(tid)) state.spocSelectedTeams.delete(tid);
    else state.spocSelectedTeams.add(tid);
    commitActiveSpocSelection(false);
  };

  document.getElementById('spoc-allot-teams-grid')?.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-toggle-spoc-team]');
    if (!tile) return;
    if (e.target.closest('.spoc-tile-checkbox')) e.preventDefault();
    handleToggleSpocTile(tile.dataset.toggleSpocTeam);
  });

  document.getElementById('spoc-allot-teams-grid')?.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const tile = e.target.closest('[data-toggle-spoc-team]');
    if (!tile) return;
    e.preventDefault();
    handleToggleSpocTile(tile.dataset.toggleSpocTeam);
  });

  document.getElementById('btn-spoc-select-filtered')?.addEventListener('click', () => {
    if (!state.activeSpocEmail) {
      showToast('Select a SPOC from the left list first.');
      return;
    }
    document.querySelectorAll('#spoc-allot-teams-grid [data-toggle-spoc-team]').forEach((el) => {
      state.spocSelectedTeams.add(el.dataset.toggleSpocTeam);
    });
    commitActiveSpocSelection(true);
  });

  document.getElementById('btn-spoc-clear-selected')?.addEventListener('click', () => {
    state.spocSelectedTeams.clear();
    commitActiveSpocSelection(true);
  });

  document.getElementById('btn-spoc-delete-all')?.addEventListener('click', async () => {
    if (!isAdmin() || !state.supabase) return;
    const uniqueStaff = [];
    const seen = new Set();
    state.spocs.forEach((s) => {
      const k = (s.email || '').toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniqueStaff.push(s);
      }
    });
    await state.supabase.from('spocs').delete().neq('email', '');
    if (uniqueStaff.length > 0) {
      await state.supabase.from('spocs').insert(
        uniqueStaff.map((st) => ({
          name: st.name,
          email: st.email,
          phone: st.phone,
          department: st.department,
          assigned_team_id: null,
          status: 'ACTIVE'
        }))
      );
    }
    state.spocSelectedTeams.clear();
    state.spocOpenDropdownTeamId = null;
    await writeAuditLog('SPOC_ALLOTMENTS_CLEARED', 'All Staff SPOCs', 'Cleared all team allotments');
    showToast('Cleared all SPOC team allotments.');
    await syncFromSupabase();
  });

  document.getElementById('btn-spoc-save-all')?.addEventListener('click', () => {
    commitActiveSpocSelection(true);
  });

  // Admin: Import Judges from Excel (.xlsx / .xls / .csv)
  document.getElementById('btn-import-judge-excel')?.addEventListener('click', () => {
    document.getElementById('judge-excel-input')?.click();
  });

  document.getElementById('judge-excel-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin() || !state.supabase) return;
    if (!window.XLSX) {
      showToast('Excel parser still loading — try again in a moment.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      const pickCol = (row, candidates) => {
        const keys = Object.keys(row);
        for (const cand of candidates) {
          const found = keys.find((k) => k.trim().toLowerCase() === cand);
          if (found && String(row[found]).trim() !== '') return String(row[found]).trim();
        }
        return '';
      };

      let importedCount = 0;
      for (const r of rawRows) {
        const name = pickCol(r, ['judge name', 'name', 'judge', 'full name', 'display name']);
        const email = pickCol(r, ['email', 'judge email', 'mail', 'email id']);
        const usernameRaw = pickCol(r, ['username', 'user', 'id', 'judge id']);
        const password = pickCol(r, ['password', 'pass']) || 'Judge@2026';
        const teamVal = pickCol(r, ['team name', 'team', 'assigned team', 'team_id']);

        if (!name && !email && !usernameRaw) continue;
        const displayName = name || usernameRaw || email.split('@')[0];
        const username = (usernameRaw || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).toLowerCase();
        const finalEmail = (email || `${username}@ivc.pulse`).toLowerCase();

        const { error: accErr } = await state.supabase.rpc('create_portal_account', {
          p_email: finalEmail,
          p_username: username,
          p_password: password,
          p_role: 'judge',
          p_display_name: displayName
        });

        if (!accErr) importedCount += 1;

        if (teamVal) {
          const matched = state.allTeams.find(
            (t) => t.name.toLowerCase() === teamVal.toLowerCase() || t.id.toLowerCase() === teamVal.toLowerCase()
          );
          if (matched) {
            await state.supabase.from('judge_assignments').delete().eq('team_id', matched.id);
            await state.supabase.from('judge_assignments').insert({
              team_id: matched.id,
              judge_id: username,
              assigned_by: state.user.username
            });
          }
        }
      }

      if (importedCount === 0) {
        showToast('No new judge accounts imported (check columns or duplicates).');
      } else {
        await writeAuditLog('JUDGE_EXCEL_IMPORTED', file.name, `Imported ${importedCount} judge account(s)`);
        showToast(`Imported ${importedCount} judge(s) into Supabase!`);
      }
      await syncFromSupabase();
    } catch (err) {
      console.error('Judge Excel import error:', err);
      showToast('Failed to import Judges Excel file.');
    } finally {
      e.target.value = '';
    }
  });

  // Admin: Import SPOCs from Excel (.xlsx / .xls / .csv)
  document.getElementById('btn-import-spoc-excel')?.addEventListener('click', () => {
    document.getElementById('spoc-excel-input')?.click();
  });

  document.getElementById('spoc-excel-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin() || !state.supabase) return;
    if (!window.XLSX) {
      showToast('Excel parser still loading — try again in a moment.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      const pickCol = (row, candidates) => {
        const keys = Object.keys(row);
        for (const cand of candidates) {
          const found = keys.find((k) => k.trim().toLowerCase() === cand);
          if (found && String(row[found]).trim() !== '') return String(row[found]).trim();
        }
        return '';
      };

      const spocRows = [];
      for (const r of rawRows) {
        const name = pickCol(r, ['spoc name', 'name', 'spoc', 'full name', 'staff name']);
        const email = pickCol(r, ['email', 'spoc email', 'mail', 'email id']);
        const phone = pickCol(r, ['phone', 'mobile', 'contact', 'phone number']);
        const department = pickCol(r, ['department', 'dept', 'branch']) || 'CSE';
        const teamVal = pickCol(r, ['team name', 'team', 'assigned team', 'team_id']);

        if (!name && !email) continue;
        const finalName = (name || email.split('@')[0]).toUpperCase();
        const finalEmail = (email || `${finalName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@ivc.pulse`).toLowerCase();

        let assignedTeamId = null;
        if (teamVal) {
          const matched = state.allTeams.find(
            (t) => t.name.toLowerCase() === teamVal.toLowerCase() || t.id.toLowerCase() === teamVal.toLowerCase()
          );
          if (matched) assignedTeamId = matched.id;
        }

        spocRows.push({
          name: finalName,
          email: finalEmail,
          phone: phone || null,
          department,
          assigned_team_id: assignedTeamId,
          status: 'ACTIVE'
        });
      }

      if (spocRows.length === 0) {
        showToast('No valid SPOC rows found in Excel (needs Name / Email columns).');
        e.target.value = '';
        return;
      }

      const { error } = await state.supabase.from('spocs').insert(spocRows);
      if (error) throw error;

      await writeAuditLog('SPOC_EXCEL_IMPORTED', file.name, `Imported ${spocRows.length} SPOC record(s)`);
      showToast(`Imported ${spocRows.length} SPOC record(s) into Supabase!`);
      await syncFromSupabase();
    } catch (err) {
      console.error('Excel import error:', err);
      showToast('Failed to import Excel file.');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btn-spoc-autobalance')?.addEventListener('click', async () => {
    if (!isAdmin() || !state.supabase) return;
    const uniqueStaff = [];
    const seen = new Set();
    state.spocs.forEach((s) => {
      const k = (s.email || '').toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniqueStaff.push(s);
      }
    });
    if (uniqueStaff.length === 0 || state.allTeams.length === 0) return;

    // Clear existing team links and evenly distribute teams round-robin
    await state.supabase.from('spocs').delete().neq('email', '');
    const inserts = state.allTeams.map((t, idx) => {
      const st = uniqueStaff[idx % uniqueStaff.length];
      return {
        name: st.name,
        email: st.email,
        phone: st.phone,
        department: st.department,
        assigned_team_id: t.id,
        status: 'ACTIVE'
      };
    });
    // Ensure SPOCs with 0 teams still remain in the list
    uniqueStaff.forEach((st, idx) => {
      if (idx >= state.allTeams.length) {
        inserts.push({
          name: st.name,
          email: st.email,
          phone: st.phone,
          department: st.department,
          assigned_team_id: null,
          status: 'ACTIVE'
        });
      }
    });

    const { error } = await state.supabase.from('spocs').insert(inserts);
    if (error) {
      showToast('Auto-balance failed.');
      return;
    }
    await writeAuditLog('SPOC_AUTOBALANCED', 'All Staff SPOCs', `${state.allTeams.length} teams distributed`);
    showToast('Auto-balanced all teams across Staff SPOCs.');
    await syncFromSupabase();
  });

  // Admin: Audit search
  document.getElementById('admin-audit-search')?.addEventListener('input', (e) => {
    state.auditFilter = e.target.value;
    renderAdminViews();
  });

  // Admin: User Management
  document.getElementById('um-search')?.addEventListener('input', (e) => {
    state.umSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('um-role-filter')?.addEventListener('change', (e) => {
    state.umRoleFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('admin-add-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase) return;
    const displayName = document.getElementById('um-new-name').value.trim();
    const username = document.getElementById('um-new-username').value.trim().toLowerCase();
    const email = document.getElementById('um-new-email').value.trim().toLowerCase();
    const password = document.getElementById('um-new-password').value;
    const role = document.getElementById('um-new-role').value;

    const { error } = await state.supabase.rpc('create_portal_account', {
      p_email: email,
      p_username: username,
      p_password: password,
      p_role: role,
      p_display_name: displayName
    });
    if (error) {
      showToast('Could not create user (duplicate email/username?).');
      return;
    }
    if (role === 'spoc') {
      await state.supabase.from('spocs').insert({
        name: displayName,
        email,
        department: 'CSE',
        assigned_team_id: null,
        status: 'ACTIVE'
      });
    }
    await writeAuditLog('USER_CREATED', username, `Role: ${role}`);
    e.target.reset();
    showToast(`Created ${displayName} (${role}).`);
    await syncFromSupabase();
  });

  document.getElementById('admin-users-table-wrap')?.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-um-role-select]');
    if (!sel || !isAdmin() || !state.supabase) return;
    const id = sel.dataset.umRoleSelect;
    const email = sel.dataset.umEmail;
    const name = sel.dataset.umName;
    const oldRole = sel.dataset.umOldRole;
    const newRole = sel.value;

    const { error } = await state.supabase.rpc('update_portal_role', { p_id: id, p_role: newRole });
    if (error) {
      showToast('Failed to update user role.');
      return;
    }

    // Keep public.spocs synced when promoting to or demoting from SPOC
    if (newRole === 'spoc') {
      const existsInSpocs = state.spocs.some((s) => (s.email || '').toLowerCase() === email.toLowerCase());
      if (!existsInSpocs) {
        await state.supabase.from('spocs').insert({
          name,
          email,
          department: 'CSE',
          assigned_team_id: null,
          status: 'ACTIVE'
        });
      }
    } else if (oldRole === 'spoc') {
      await state.supabase.from('spocs').delete().ilike('email', email);
    }

    await writeAuditLog('USER_ROLE_CHANGED', name, `${oldRole} -> ${newRole}`);
    showToast(`Changed ${name} from ${oldRole} to ${newRole}.`);
    await syncFromSupabase();
  });

  document.getElementById('admin-users-table-wrap')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-um-delete]');
    if (!delBtn || !isAdmin() || !state.supabase) return;
    const id = delBtn.dataset.umDelete;
    const { error } = await state.supabase.rpc('delete_portal_account', { p_id: id });
    if (!error) {
      await writeAuditLog('USER_DELETED', id, 'Removed from User Management');
      showToast('Removed user account.');
      await syncFromSupabase();
    }
  });

  // Admin: Content Releases
  document.getElementById('cr-search')?.addEventListener('input', (e) => {
    state.crSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('cr-type-filter')?.addEventListener('change', (e) => {
    state.crTypeFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('btn-cr-create-activity')?.addEventListener('click', () => {
    document.getElementById('cr-create-modal').hidden = false;
  });

  document.getElementById('btn-close-cr-create')?.addEventListener('click', () => {
    document.getElementById('cr-create-modal').hidden = true;
  });

  document.getElementById('cr-create-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase) return;
    const title = document.getElementById('cr-new-title').value.trim().toUpperCase();
    const kicker = document.getElementById('cr-new-kicker').value.trim().toUpperCase();
    const description = document.getElementById('cr-new-desc').value.trim();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { error } = await state.supabase.from('content_activities').insert({
      id,
      title,
      kicker,
      description,
      activity_type: 'CUSTOM',
      accent: 'cyan'
    });
    if (error) {
      showToast('Could not create activity.');
      return;
    }
    await writeAuditLog('CONTENT_ACTIVITY_CREATED', title, kicker);
    e.target.reset();
    document.getElementById('cr-create-modal').hidden = true;
    showToast(`Created activity ${title}.`);
    await syncFromSupabase();
  });

  document.getElementById('cr-cards-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-cr-ws]');
    if (!btn) return;
    state.activeActivityId = btn.dataset.openCrWs;
    renderCrWorkspaceTable();
    document.getElementById('cr-workspace-modal').hidden = false;
  });

  document.getElementById('btn-close-cr-ws')?.addEventListener('click', () => {
    document.getElementById('cr-workspace-modal').hidden = true;
    state.activeActivityId = null;
  });

  document.getElementById('cr-add-item-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase || !state.activeActivityId) return;
    const title = document.getElementById('cr-item-title').value.trim();
    const body = document.getElementById('cr-item-body').value.trim();
    const status = document.getElementById('cr-item-status').value;
    const { error } = await state.supabase.from('content_items').insert({
      activity_id: state.activeActivityId,
      title,
      body,
      status,
      created_by: state.user.username
    });
    if (error) {
      showToast('Failed to add content item.');
      return;
    }
    await writeAuditLog('CONTENT_ITEM_ADDED', title, `Activity: ${state.activeActivityId} (${status})`);
    e.target.reset();
    showToast(`Added "${title}".`);
    await syncFromSupabase();
  });

  document.getElementById('cr-ws-table')?.addEventListener('click', async (e) => {
    if (!isAdmin() || !state.supabase) return;
    const toggleBtn = e.target.closest('[data-cr-toggle-item]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.crToggleItem;
      const next = toggleBtn.dataset.crItemStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
      await state.supabase.from('content_items').update({ status: next }).eq('id', id);
      await writeAuditLog('CONTENT_ITEM_STATUS', id, `Status -> ${next}`);
      showToast(`Item marked ${next}.`);
      await syncFromSupabase();
      return;
    }
    const delBtn = e.target.closest('[data-cr-delete-item]');
    if (delBtn) {
      const id = delBtn.dataset.crDeleteItem;
      await state.supabase.from('content_items').delete().eq('id', id);
      await writeAuditLog('CONTENT_ITEM_REMOVED', id, 'Deleted content item');
      showToast('Removed content item.');
      await syncFromSupabase();
    }
  });

  // Round filter (Judge view)
  document.getElementById('round-select')?.addEventListener('change', (e) => {
    state.round = e.target.value;
    renderAll();
  });

  // Open Team Evaluation page
  document.getElementById('teams-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-team-id]');
    if (!btn) return;
    if (document.getElementById('view-evaluate')) {
      openTeamEvaluation(btn.dataset.teamId);
    } else {
      navigateToView('evaluate', `?team=${encodeURIComponent(btn.dataset.teamId)}`);
    }
  });

  // Back to Assigned Teams
  document.getElementById('btn-back-teams')?.addEventListener('click', () => {
    navigateToView('teams');
  });

  // Slider live updates
  document.getElementById('eval-criteria-list')?.addEventListener('input', (e) => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team || !e.target.matches('.score-slider')) return;
    const cid = e.target.dataset.criterion;
    const crit = state.criteria.find((c) => c.id === cid);
    if (!team.scores) team.scores = {};
    team.scores[cid] = Number(e.target.value);
    document.getElementById(`eval-val-${cid}`).textContent = `${e.target.value} / ${crit.max}`;
    document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / ${maxPossibleScore()} PTS`;
    saveLocalTeams();
  });

  // Save Draft
  document.getElementById('btn-save-draft')?.addEventListener('click', async () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team) return;
    team.status = 'DRAFTED';
    await upsertEvaluationToSupabase(team);
    renderAll();
    showToast(`Saved draft for ${team.name}.`);
  });

  // Submit Final Evaluation
  document.getElementById('btn-submit-eval')?.addEventListener('click', async () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team) return;
    team.status = 'EVALUATED';
    await upsertEvaluationToSupabase(team);
    renderAll();
    showToast(`Submitted evaluation for ${team.name}.`);
    if (document.getElementById('view-teams')) {
      showView('teams');
      setActiveNav('teams');
    } else {
      setTimeout(() => navigateToView('teams'), 450);
    }
  });

  // Pitch Timekeeper actions
  document.getElementById('btn-call-pitch')?.addEventListener('click', () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    document.getElementById('tk-visibility-badge').textContent = 'CALLED';
    showToast(`Called ${team ? team.name : 'team'} to pitch stage.`);
  });

  document.getElementById('btn-launch-timer')?.addEventListener('click', (e) => {
    const readout = document.getElementById('tk-timer-readout');
    const vis = document.getElementById('tk-visibility-badge');
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      e.currentTarget.textContent = 'LAUNCH PITCH TIMER';
      vis.textContent = 'PAUSED';
      return;
    }
    state.timerSeconds = 300;
    readout.hidden = false;
    readout.textContent = formatTimer(state.timerSeconds);
    vis.textContent = 'LIVE';
    e.currentTarget.textContent = 'PAUSE PITCH TIMER';
    state.timerInterval = setInterval(() => {
      state.timerSeconds = Math.max(0, state.timerSeconds - 1);
      readout.textContent = formatTimer(state.timerSeconds);
      if (state.timerSeconds === 0) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        e.currentTarget.textContent = 'LAUNCH PITCH TIMER';
        showToast('Pitch time elapsed.');
      }
    }, 1000);
  });

  // SPOC Portal: Toggle readiness & save notes
  document.getElementById('spoc-teams-grid')?.addEventListener('click', async (e) => {
    if (!state.supabase || state.user?.role !== 'spoc') return;
    const toggleBtn = e.target.closest('[data-spoc-toggle]');
    if (toggleBtn) {
      const teamId = toggleBtn.dataset.teamId;
      const field = toggleBtn.dataset.spocToggle;
      const nextVal = toggleBtn.dataset.val !== 'true';
      const existing = state.spocUpdates.find((u) => u.team_id === teamId) || {
        team_id: teamId,
        checked_in: false,
        deck_verified: false,
        pitch_ready: false,
        spoc_notes: ''
      };
      const payload = {
        ...existing,
        [field]: nextVal,
        updated_by: state.user.username,
        updated_at: new Date().toISOString()
      };
      const { error } = await state.supabase.from('spoc_updates').upsert(payload, { onConflict: 'team_id' });
      if (!error) {
        await writeAuditLog('SPOC_STATUS_UPDATED', teamId, `${field} -> ${nextVal}`);
        showToast(`Updated ${field.replace('_', ' ')} for ${teamId}.`);
        await syncFromSupabase();
      }
      return;
    }

    const saveNoteBtn = e.target.closest('[data-spoc-save-note]');
    if (saveNoteBtn) {
      const teamId = saveNoteBtn.dataset.spocSaveNote;
      const input = document.querySelector(`[data-spoc-note-input="${teamId}"]`);
      const note = input ? input.value.trim() : '';
      const existing = state.spocUpdates.find((u) => u.team_id === teamId) || {
        team_id: teamId,
        checked_in: false,
        deck_verified: false,
        pitch_ready: false
      };
      const { error } = await state.supabase.from('spoc_updates').upsert(
        {
          ...existing,
          spoc_notes: note,
          updated_by: state.user.username,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'team_id' }
      );
      if (!error) {
        await writeAuditLog('SPOC_NOTE_SAVED', teamId, note || 'Cleared note');
        showToast(`Saved SPOC note for ${teamId}.`);
        await syncFromSupabase();
      }
    }
  });

  // Deliverable link preview
  document.getElementById('deliverables-grid')?.addEventListener('click', (e) => {
    const link = e.target.closest('[data-deliverable]');
    if (link) {
      e.preventDefault();
      showToast(`Opening ${link.dataset.deliverable}...`);
    }
  });

  // Admin: Announcements (/admin/announcements)
  document.getElementById('ann-search')?.addEventListener('input', (e) => {
    state.annSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('ann-audience-filter')?.addEventListener('change', (e) => {
    state.annAudienceFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('admin-add-ann-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase) return;
    const title = document.getElementById('ann-title').value.trim();
    const message = document.getElementById('ann-message').value.trim();
    const audience = document.getElementById('ann-audience').value;
    const priority = document.getElementById('ann-priority').value;

    const { error } = await state.supabase.from('announcements').insert({
      title,
      message,
      audience,
      priority,
      is_active: true,
      created_by: state.user.username
    });
    if (error) {
      showToast('Failed to publish announcement.');
      return;
    }
    await writeAuditLog('ANNOUNCEMENT_PUBLISHED', title, `Audience: ${audience}, Priority: ${priority}`);
    e.target.reset();
    showToast(`Broadcasted "${title}" to ${audience}!`);
    await syncFromSupabase();
  });

  document.getElementById('ann-feed-list')?.addEventListener('click', async (e) => {
    if (!isAdmin() || !state.supabase) return;
    const toggleBtn = e.target.closest('[data-ann-toggle]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.annToggle;
      const next = toggleBtn.dataset.annActive !== 'true';
      await state.supabase.from('announcements').update({ is_active: next }).eq('id', id);
      await writeAuditLog('ANNOUNCEMENT_STATUS', id, next ? 'Activated' : 'Archived');
      showToast(next ? 'Announcement activated.' : 'Announcement archived.');
      await syncFromSupabase();
      return;
    }
    const delBtn = e.target.closest('[data-ann-delete]');
    if (delBtn) {
      const id = delBtn.dataset.annDelete;
      await state.supabase.from('announcements').delete().eq('id', id);
      await writeAuditLog('ANNOUNCEMENT_DELETED', id, 'Deleted announcement');
      showToast('Deleted announcement.');
      await syncFromSupabase();
    }
  });

  // Admin: Evaluation Matrix Filters
  document.getElementById('mx-search')?.addEventListener('input', (e) => {
    state.mxSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('mx-round-filter')?.addEventListener('change', (e) => {
    state.mxRoundFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('mx-status-filter')?.addEventListener('change', (e) => {
    state.mxStatusFilter = e.target.value;
    renderAdminViews();
  });

  // Admin: Result Engine (/admin/results)
  document.getElementById('res-search')?.addEventListener('input', (e) => {
    state.resSearch = e.target.value;
    renderAdminViews();
  });

  document.getElementById('res-round-filter')?.addEventListener('change', (e) => {
    state.resRoundFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('res-sem-filter')?.addEventListener('change', (e) => {
    state.resSemFilter = e.target.value;
    renderAdminViews();
  });

  document.getElementById('btn-res-recalc')?.addEventListener('click', async () => {
    await syncFromSupabase();
    await writeAuditLog('RESULTS_RECALCULATED', 'Result Engine', `Ranked ${state.allTeams.length} teams`);
    showToast('Result Engine recalculated live standings from Supabase.');
  });

  document.getElementById('btn-res-publish')?.addEventListener('click', async () => {
    if (!isAdmin() || !state.supabase) return;
    const next = state.resultsEngine === 'Draft / Unreleased' ? 'Published / Live' : 'Draft / Unreleased';
    const { error } = await state.supabase
      .from('event_settings')
      .upsert({ key: 'results_engine', value: next, updated_at: new Date().toISOString() });
    if (!error) {
      await writeAuditLog('RESULTS_ENGINE', 'Eventra IVC', `Changed to ${next}`);
      showToast(`Result Engine set to ${next}.`);
      await syncFromSupabase();
    }
  });

  document.getElementById('btn-res-export')?.addEventListener('click', () => {
    const standings = getCalculatedStandings();
    const maxTotal = maxPossibleScore();
    const lines = [
      ['Rank', 'Team', 'Leader', 'Semester', 'Round', 'Judges Scored', 'Final Score', 'Max Score'].join(','),
      ...standings.map((r, i) =>
        [
          i + 1,
          `"${r.team.name}"`,
          `"${r.team.leader}"`,
          `"${r.team.sem}"`,
          r.team.round,
          r.judgesScored,
          r.avgScore.toFixed(1),
          maxTotal
        ].join(',')
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eventra-ivc-results.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported official results CSV.');
  });

  // Sign out
  document.getElementById('btn-sign-out')?.addEventListener('click', async () => {
    await writeAuditLog('USER_LOGOUT', state.user?.username || 'unknown', 'Signed out');
    if (state.supabase && state.realtimeChannel) {
      state.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    clearSessionUser();
    state.user = null;
    applyAuthUI();
    showToast('Signed out.');
  });

  // Refresh from Supabase when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.user && state.supabase) {
      syncFromSupabase();
    }
  });
});
