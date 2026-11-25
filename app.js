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
    'view-spoc-teams',
    'view-spoc-readiness'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = id !== targetId;
  });
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
    page === 'admin' ? 'admin-overview' : page === 'spoc' ? 'spoc-teams' : 'teams';
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
      state.supabase.from('rubric_criteria').select('*').order('sort_order', { ascending: true })
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
    }

    const results = await Promise.all(queries);
    const [teamsRes, assignRes, evalsRes, roundsRes, critRes, spocsRes, spocUpdatesRes, judgesRes, auditRes, accountsRes, settingsRes] = results;

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
    if (spocsRes && !spocsRes.error) state.spocs = spocsRes.data || [];
    if (spocUpdatesRes && !spocUpdatesRes.error) state.spocUpdates = spocUpdatesRes.data || [];
    if (judgesRes && !judgesRes.error) state.judges = judgesRes.data || [];
    if (auditRes && !auditRes.error) state.auditLogs = auditRes.data || [];
    if (accountsRes && !accountsRes.error) state.allAccounts = accountsRes.data || [];
    if (settingsRes && !settingsRes.error && settingsRes.data) {
      state.resultsEngine = settingsRes.data.value;
    }

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

    if (state.activeTeamId && !document.getElementById('view-evaluate').hidden) {
      openTeamEvaluation(state.activeTeamId);
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
  if (document.body.dataset.page !== 'judge') return;
  const visible = getVisibleTeams();
  document.getElementById('kpi-total').textContent = String(visible.length);
  document.getElementById('kpi-evaluated').textContent = String(visible.filter((t) => t.status === 'EVALUATED').length);
  document.getElementById('kpi-drafted').textContent = String(visible.filter((t) => t.status === 'DRAFTED').length);
  document.getElementById('kpi-pending').textContent = String(visible.filter((t) => t.status === 'PENDING').length);
}

function renderTeamsGrid() {
  if (document.body.dataset.page !== 'judge') return;
  const grid = document.getElementById('teams-grid');
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

  if (state.inspectRole && !document.getElementById('roster-modal').hidden) {
    renderRosterModalTable();
  }

  // 2. Judge Assignments
  const assignedTeamIds = new Set(state.assignments.map((a) => a.team_id));
  const unassignedCount = state.allTeams.filter((t) => !assignedTeamIds.has(t.id)).length;

  document.getElementById('admin-kpi-teams').textContent = String(state.allTeams.length);
  document.getElementById('admin-kpi-judges').textContent = String(state.judges.length);
  document.getElementById('admin-kpi-pairs').textContent = String(state.assignments.length);
  document.getElementById('admin-kpi-unassigned').textContent = String(unassignedCount);

  const q = state.assignFilter.trim().toLowerCase();
  const filteredTeams = state.allTeams.filter(
    (t) => t.name.toLowerCase().includes(q) || t.leader.toLowerCase().includes(q) || t.sem.toLowerCase().includes(q)
  );

  document.getElementById('admin-assign-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Team</th>
          <th>Semester</th>
          <th>Round</th>
          <th>Assigned Judge (Max 1 per Team)</th>
        </tr>
      </thead>
      <tbody>
        ${filteredTeams
          .map((t) => {
            const teamJudges = new Set(state.assignments.filter((a) => a.team_id === t.id).map((a) => a.judge_id));
            return `
              <tr>
                <td><strong>${t.name}</strong><br><span class="team-leader">${t.leader}</span></td>
                <td><span class="sem-label">${t.sem}</span></td>
                <td>Round ${t.round}</td>
                <td>
                  <div class="assign-pills">
                    ${state.judges
                      .map((j) => {
                        const assigned = teamJudges.has(j.username);
                        return `
                          <button
                            type="button"
                            class="assign-toggle ${assigned ? 'is-assigned' : ''}"
                            data-assign-team="${t.id}"
                            data-assign-judge="${j.username}"
                            data-assigned="${assigned}"
                          >
                            ${assigned ? '✓ ' : '+ '}${j.display_name}
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;

  // 3. Evaluation Matrix
  document.getElementById('admin-matrix-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Team</th>
          ${state.judges.map((j) => `<th>${j.display_name}</th>`).join('')}
          <th>Average</th>
        </tr>
      </thead>
      <tbody>
        ${state.allTeams
          .map((t) => {
            const cells = state.judges.map((j) => {
              const ev = state.allEvaluations.find((e) => e.team_id === t.id && e.judge_id === j.username);
              if (!ev) return `<td><span class="status-pill">PENDING</span></td>`;
              const cls = ev.status === 'EVALUATED' ? 'is-evaluated' : 'is-drafted';
              return `<td><span class="status-pill ${cls}">${ev.total_score} / ${maxTotal}</span></td>`;
            });
            const teamEvals = state.allEvaluations.filter((e) => e.team_id === t.id && e.status !== 'PENDING');
            const avg =
              teamEvals.length > 0
                ? (teamEvals.reduce((s, e) => s + Number(e.total_score || 0), 0) / teamEvals.length).toFixed(1)
                : '0.0';
            return `
              <tr>
                <td><strong>${t.name}</strong><br><span class="team-leader">${t.sem} · ${t.leader}</span></td>
                ${cells.join('')}
                <td><strong style="color: var(--accent-primary);">${avg} / ${maxTotal}</strong></td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;

  // 4. Rounds & Criteria
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
          <button type="button" class="btn-draft" data-round-status="${r.id}" data-next-status="ACTIVE">Set Active</button>
          <button type="button" class="btn-draft" data-round-status="${r.id}" data-next-status="LOCKED">Lock</button>
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

  // 5. SPOC Management
  const teamSelect = document.getElementById('new-spoc-team');
  if (teamSelect) {
    teamSelect.innerHTML = `<option value="">Unassigned</option>` + state.allTeams.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
  }

  document.getElementById('admin-spocs-table-wrap').innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Contact</th>
          <th>Assigned Team</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.spocs
          .map((s) => {
            const teamObj = state.allTeams.find((t) => t.id === s.assigned_team_id);
            return `
              <tr>
                <td><strong>${s.name}</strong><br><span class="team-leader">${s.department}</span></td>
                <td>${s.email}<br><span class="team-leader">${s.phone || '—'}</span></td>
                <td>${teamObj ? teamObj.name : 'Unassigned'}</td>
                <td><span class="status-pill ${s.status === 'ACTIVE' ? 'is-evaluated' : 'is-drafted'}">${s.status}</span></td>
                <td>
                  <div class="assign-pills">
                    <button type="button" class="btn-draft" data-toggle-spoc="${s.id}" data-spoc-status="${s.status}">
                      ${s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" class="btn-danger-ghost" data-delete-spoc="${s.id}">REMOVE</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;

  // 6. Audit Logs
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

    if (state.activeTeamId === teamId && !document.getElementById('view-evaluate').hidden) {
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

  document.getElementById('spoc-kpi-total').textContent = String(myTeams.length);
  document.getElementById('spoc-kpi-checked').textContent = String(checkedCount);
  document.getElementById('spoc-kpi-deck').textContent = String(deckCount);
  document.getElementById('spoc-kpi-ready').textContent = String(readyCount);

  document.getElementById('spoc-teams-grid').innerHTML = myTeams
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

  document.getElementById('spoc-readiness-table-wrap').innerHTML = `
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

function renderAll() {
  renderKpis();
  renderTeamsGrid();
  renderAdminViews();
  renderSpocViews();
}

document.addEventListener('DOMContentLoaded', () => {
  initSupabaseClient();
  applyAuthUI();
  if (document.body.dataset.page !== 'login') {
    renderAll();
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
      e.preventDefault();
      const view = item.dataset.view;
      if (view.startsWith('admin-') && !isAdmin()) return;
      setActiveNav(view);
      showView(view);
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
      setActiveNav(btn.dataset.navJump);
      showView(btn.dataset.navJump);
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

  document.getElementById('admin-assign-table-wrap')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-assign-team]');
    if (btn) {
      toggleAssignment(btn.dataset.assignTeam, btn.dataset.assignJudge, btn.dataset.assigned === 'true');
    }
  });

  // Admin: Rounds & Criteria actions
  document.getElementById('admin-rounds-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-round-status]');
    if (!btn || !isAdmin() || !state.supabase) return;
    const roundId = btn.dataset.roundStatus;
    const nextStatus = btn.dataset.nextStatus;
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

  // Admin: SPOC Management
  document.getElementById('admin-add-spoc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdmin() || !state.supabase) return;
    const name = document.getElementById('new-spoc-name').value.trim();
    const email = document.getElementById('new-spoc-email').value.trim();
    const phone = document.getElementById('new-spoc-phone').value.trim();
    const assignedTeamId = document.getElementById('new-spoc-team').value || null;
    const { error } = await state.supabase.from('spocs').insert({
      name,
      email,
      phone,
      assigned_team_id: assignedTeamId,
      status: 'ACTIVE'
    });
    if (error) {
      showToast('Could not add SPOC.');
      return;
    }
    await writeAuditLog('SPOC_ADDED', name, email);
    e.target.reset();
    showToast(`Added SPOC ${name}.`);
    await syncFromSupabase();
  });

  document.getElementById('admin-spocs-table-wrap')?.addEventListener('click', async (e) => {
    if (!isAdmin() || !state.supabase) return;
    const toggleBtn = e.target.closest('[data-toggle-spoc]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleSpoc;
      const next = toggleBtn.dataset.spocStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await state.supabase.from('spocs').update({ status: next }).eq('id', id);
      await writeAuditLog('SPOC_STATUS', id, `Changed to ${next}`);
      showToast(`SPOC marked ${next}.`);
      await syncFromSupabase();
      return;
    }
    const delBtn = e.target.closest('[data-delete-spoc]');
    if (delBtn) {
      const id = delBtn.dataset.deleteSpoc;
      await state.supabase.from('spocs').delete().eq('id', id);
      await writeAuditLog('SPOC_REMOVED', id, 'Removed from registry');
      showToast('Removed SPOC.');
      await syncFromSupabase();
    }
  });

  // Admin: Audit search
  document.getElementById('admin-audit-search')?.addEventListener('input', (e) => {
    state.auditFilter = e.target.value;
    renderAdminViews();
  });

  // Round filter (Judge view)
  document.getElementById('round-select')?.addEventListener('change', (e) => {
    state.round = e.target.value;
    renderAll();
  });

  // Open Team Evaluation page
  document.getElementById('teams-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-team-id]');
    if (btn) openTeamEvaluation(btn.dataset.teamId);
  });

  // Back to Assigned Teams
  document.getElementById('btn-back-teams')?.addEventListener('click', () => {
    showView('teams');
    setActiveNav('teams');
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
    showView('teams');
    setActiveNav('teams');
    showToast(`Submitted evaluation for ${team.name}.`);
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
