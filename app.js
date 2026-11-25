/* ==========================================================================
   EVENTRA | IVC PULSE — Judge Portal Logic + Supabase Integration
   ========================================================================== */

const CRITERIA = [
  { id: 'innovation', name: 'Innovation & Originality', max: 25, desc: 'Novelty of idea, technical differentiation, and problem framing.' },
  { id: 'execution', name: 'Technical Execution', max: 25, desc: 'Prototype completeness, architecture, and live demo stability.' },
  { id: 'impact', name: 'Market & Social Impact', max: 20, desc: 'Real-world applicability, scalability, and measurable value.' },
  { id: 'design', name: 'UI / UX & Usability', max: 15, desc: 'Clarity of user flow, visual polish, and accessibility.' },
  { id: 'pitch', name: 'Pitch & Q&A Clarity', max: 15, desc: 'Presentation structure, time discipline, and Q&A defense.' }
];

const INITIAL_TEAMS = [
  { id: 'cyber-titans', sem: '1ST SEM', name: 'CYBER TITANS', leader: 'Keerthana KK', members: 4, round: '1', status: 'PENDING', deckUrl: '#deck-cyber-titans', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'parallax', sem: '1ST SEM', name: 'PARALLAX', leader: 'Lakshya M', members: 4, round: '1', status: 'PENDING', deckUrl: '#deck-parallax', repoUrl: '#repo-parallax', demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'vs3', sem: '3RD SEM', name: 'VS³', leader: 'VINEETH JAGADEESH', members: 3, round: '1', status: 'PENDING', deckUrl: '#deck-vs3', repoUrl: null, demoUrl: '#demo-vs3', scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'fast-track', sem: '1ST SEM', name: 'FAST TRACK', leader: 'Yuvaraj S P', members: 4, round: '1', status: 'PENDING', deckUrl: '#deck-fast-track', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'team-glitch', sem: '1ST SEM', name: 'TEAM GLITCH', leader: 'Harman Banga', members: 3, round: '2', status: 'PENDING', deckUrl: '#deck-team-glitch', repoUrl: '#repo-team-glitch', demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'whtt-the-hack', sem: '3RD SEM', name: 'WHTT THE HACK', leader: 'MAANSI M', members: 4, round: '2', status: 'PENDING', deckUrl: '#deck-whtt-the-hack', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'quadrax', sem: '3RD SEM', name: 'QUADRAX', leader: 'Harshini T', members: 4, round: '2', status: 'PENDING', deckUrl: '#deck-quadrax', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'zero-bug-zone', sem: '1ST SEM', name: 'ZERO BUG ZONE', leader: 'Nisarga PK', members: 3, round: '1', status: 'PENDING', deckUrl: '#deck-zero-bug', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } },
  { id: 'macroheart', sem: '1ST SEM', name: 'MACROHEART', leader: 'Rishikesh P', members: 4, round: '2', status: 'PENDING', deckUrl: '#deck-macroheart', repoUrl: null, demoUrl: null, scores: { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 } }
];

const STORAGE_KEY = 'eventra_judge_portal_v3';
const AUTH_STORAGE_KEY = 'eventra_portal_session_v1';

const state = {
  teams: loadLocalTeams(),
  round: 'all',
  activeTeamId: null,
  timerInterval: null,
  timerSeconds: 300,
  supabase: null,
  user: loadSavedUser(),
  judgeId: window.EVENTRA_CONFIG?.JUDGE_ID || 'judge-04'
};

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

function applyAuthUI() {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  const isAuthed = Boolean(state.user);

  loginScreen.hidden = isAuthed;
  appShell.hidden = !isAuthed;

  if (isAuthed) {
    state.judgeId = state.user.username || 'judge-04';
    const roleLabel = state.user.role === 'admin' ? 'ADMIN PORTAL' : 'JUDGE PORTAL';
    const titleEl = document.querySelector('.portal-title');
    const authTitleEl = document.querySelector('.jury-auth-title');
    const signoutEl = document.querySelector('#btn-sign-out span');
    if (titleEl) titleEl.textContent = roleLabel;
    if (authTitleEl) authTitleEl.textContent = `${state.user.display_name} (${state.user.role.toUpperCase()})`;
    if (signoutEl) signoutEl.textContent = `SIGN OUT (${state.user.role.toUpperCase()})`;
    syncFromSupabase();
  }
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

async function syncFromSupabase() {
  if (!state.supabase) {
    setSyncStatus('Local Mode (Add config.js)');
    return;
  }

  setSyncStatus('Syncing...');
  try {
    const [{ data: dbTeams, error: teamsErr }, { data: dbEvals, error: evalsErr }] = await Promise.all([
      state.supabase.from('teams').select('*').order('name', { ascending: true }),
      state.supabase.from('evaluations').select('*').eq('judge_id', state.judgeId)
    ]);

    if (teamsErr) throw teamsErr;
    if (evalsErr) throw evalsErr;

    if (Array.isArray(dbTeams) && dbTeams.length > 0) {
      const evalMap = new Map((dbEvals || []).map((e) => [e.team_id, e]));
      state.teams = dbTeams.map((t) => {
        const ev = evalMap.get(t.id);
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
          scores: ev?.scores || { innovation: 0, execution: 0, impact: 0, design: 0, pitch: 0 }
        };
      });
      saveLocalTeams();
      renderAll();
      if (state.activeTeamId && !document.getElementById('view-evaluate').hidden) {
        openTeamEvaluation(state.activeTeamId);
      }
    }
    setSyncStatus('Supabase Connected');
  } catch (err) {
    console.error('Supabase sync failed:', err);
    setSyncStatus('Sync Error (Local Fallback)');
    showToast('Could not reach Supabase — using local cache.');
  }
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
    setSyncStatus('Supabase Connected');
  } catch (err) {
    console.error('Supabase upsert failed:', err);
    setSyncStatus('Save Error (Cached Locally)');
    showToast('Saved locally; Supabase sync failed.');
  }
}

function totalScore(scores) {
  return CRITERIA.reduce((acc, c) => acc + (Number(scores[c.id]) || 0), 0);
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
  const visible = getVisibleTeams();
  document.getElementById('kpi-total').textContent = String(visible.length);
  document.getElementById('kpi-evaluated').textContent = String(visible.filter((t) => t.status === 'EVALUATED').length);
  document.getElementById('kpi-drafted').textContent = String(visible.filter((t) => t.status === 'DRAFTED').length);
  document.getElementById('kpi-pending').textContent = String(visible.filter((t) => t.status === 'PENDING').length);
}

function renderTeamsGrid() {
  const grid = document.getElementById('teams-grid');
  grid.innerHTML = getVisibleTeams()
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
              <span>${team.status === 'PENDING' ? 'Evaluation' : `Score: ${totalScore(team.scores)} / 100`}</span>
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

function showView(viewId) {
  const targetId = viewId.startsWith('view-') ? viewId : `view-${viewId}`;
  ['view-teams', 'view-rubrics', 'view-evaluate'].forEach((id) => {
    document.getElementById(id).hidden = id !== targetId;
  });
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
      team.scores = {
        innovation: Number(data.scores.innovation) || 0,
        execution: Number(data.scores.execution) || 0,
        impact: Number(data.scores.impact) || 0,
        design: Number(data.scores.design) || 0,
        pitch: Number(data.scores.pitch) || 0
      };
    }
    saveLocalTeams();
    renderAll();

    if (state.activeTeamId === teamId && !document.getElementById('view-evaluate').hidden) {
      document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / 100 PTS`;
      CRITERIA.forEach((c) => {
        const val = team.scores[c.id] ?? 0;
        const valEl = document.getElementById(`eval-val-${c.id}`);
        const sliderEl = document.querySelector(`.score-slider[data-criterion="${c.id}"]`);
        if (valEl) valEl.textContent = `${val} / ${c.max}`;
        if (sliderEl) sliderEl.value = String(val);
      });
      document.getElementById('btn-submit-eval').querySelector('span').textContent =
        team.status === 'EVALUATED' ? 'UPDATE EVALUATION' : 'SUBMIT FINAL EVALUATION';
    }
  } catch {
    // Ignore transient fetch errors
  }
}

function openTeamEvaluation(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;
  state.activeTeamId = teamId;
  const isEvaluated = team.status === 'EVALUATED';

  document.getElementById('eval-team-sem').textContent = team.sem;
  document.getElementById('eval-team-name').textContent = team.name;
  document.getElementById('eval-team-meta').textContent = `Leader: ${team.leader} | Members: ${team.members}`;
  document.getElementById('eval-active-round').textContent = team.round === '2' ? 'FINAL ROUND' : 'PRELIMINARY ROUND';

  document.getElementById('deliverables-grid').innerHTML = `
    <div class="deliverable-item">
      <span class="deliverable-kicker is-gold">MANDATORY DECK</span>
      <div class="deliverable-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FBC815" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span>PRESENTATION FILE</span>
      </div>
      ${team.deckUrl
        ? `<a href="${team.deckUrl}" class="deliverable-link" data-deliverable="Presentation Deck">OPEN / DOWNLOAD FILE ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>

    <div class="deliverable-item">
      <span class="deliverable-kicker">SOURCE CODE</span>
      <div class="deliverable-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
        <span>GITHUB REPOSITORY</span>
      </div>
      ${team.repoUrl
        ? `<a href="${team.repoUrl}" class="deliverable-link" data-deliverable="GitHub Repository">OPEN REPOSITORY ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>

    <div class="deliverable-item">
      <span class="deliverable-kicker">INTERACTIVE DEMO</span>
      <div class="deliverable-name">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF007F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <span>LIVE DEMO / PROTOTYPE</span>
      </div>
      ${team.demoUrl
        ? `<a href="${team.demoUrl}" class="deliverable-link" data-deliverable="Live Demo">LAUNCH DEMO ↗</a>`
        : `<span class="deliverable-empty">Not provided</span>`}
    </div>
  `;

  document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / 100 PTS`;

  document.getElementById('eval-criteria-list').innerHTML = CRITERIA.map(
    (c) => `
    <div class="eval-criterion-row">
      <div class="eval-criterion-top">
        <div>
          <strong style="color: var(--color-10);">${c.name}</strong>
          <div class="team-leader">${c.desc}</div>
        </div>
        <strong id="eval-val-${c.id}" style="color: var(--accent-primary);">${team.scores[c.id] ?? 0} / ${c.max}</strong>
      </div>
      <input
        type="range"
        class="score-slider"
        min="0"
        max="${c.max}"
        value="${team.scores[c.id] ?? 0}"
        data-criterion="${c.id}"
        aria-label="${c.name} score"
      />
    </div>
  `
  ).join('');

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

function renderAll() {
  renderKpis();
  renderTeamsGrid();
}

document.addEventListener('DOMContentLoaded', () => {
  initSupabaseClient();
  renderAll();
  applyAuthUI();

  // Password visibility toggle
  document.getElementById('btn-toggle-pw').addEventListener('click', () => {
    const pwInput = document.getElementById('login-password');
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  });

  // Login form submit -> Supabase RPC portal_login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
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
      if (!state.supabase) {
        throw new Error('Supabase client not initialized');
      }
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
      document.querySelectorAll('.nav-item').forEach((n) => {
        const active = n === item;
        n.classList.toggle('is-active', active);
        if (active) n.setAttribute('aria-current', 'page');
        else n.removeAttribute('aria-current');
      });
      showView(view === 'rubrics' ? 'rubrics' : 'teams');
    });
  });

  // Round filter
  document.getElementById('round-select').addEventListener('change', (e) => {
    state.round = e.target.value;
    renderAll();
  });

  // Open Team Evaluation page
  document.getElementById('teams-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-team-id]');
    if (btn) openTeamEvaluation(btn.dataset.teamId);
  });

  // Back to Assigned Teams
  document.getElementById('btn-back-teams').addEventListener('click', () => {
    showView('teams');
  });

  // Slider live updates
  document.getElementById('eval-criteria-list').addEventListener('input', (e) => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team || !e.target.matches('.score-slider')) return;
    const cid = e.target.dataset.criterion;
    const crit = CRITERIA.find((c) => c.id === cid);
    team.scores[cid] = Number(e.target.value);
    document.getElementById(`eval-val-${cid}`).textContent = `${e.target.value} / ${crit.max}`;
    document.getElementById('eval-cumulative-score').textContent = `${totalScore(team.scores)} / 100 PTS`;
    saveLocalTeams();
  });

  // Save Draft
  document.getElementById('btn-save-draft').addEventListener('click', async () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team) return;
    team.status = 'DRAFTED';
    await upsertEvaluationToSupabase(team);
    renderAll();
    showToast(`Saved draft for ${team.name}.`);
  });

  // Submit Final Evaluation
  document.getElementById('btn-submit-eval').addEventListener('click', async () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    if (!team) return;
    team.status = 'EVALUATED';
    await upsertEvaluationToSupabase(team);
    renderAll();
    showView('teams');
    showToast(`Submitted final evaluation for ${team.name}.`);
  });

  // Pitch Timekeeper actions
  document.getElementById('btn-call-pitch').addEventListener('click', () => {
    const team = state.teams.find((t) => t.id === state.activeTeamId);
    document.getElementById('tk-visibility-badge').textContent = 'CALLED';
    showToast(`Called ${team ? team.name : 'team'} to pitch stage.`);
  });

  document.getElementById('btn-launch-timer').addEventListener('click', (e) => {
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

  // Deliverable link preview
  document.getElementById('deliverables-grid').addEventListener('click', (e) => {
    const link = e.target.closest('[data-deliverable]');
    if (link) {
      e.preventDefault();
      showToast(`Opening ${link.dataset.deliverable}...`);
    }
  });

  // Sign out
  document.getElementById('btn-sign-out').addEventListener('click', () => {
    clearSessionUser();
    state.user = null;
    applyAuthUI();
    showToast('Signed out.');
  });
});
