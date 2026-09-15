const STAGES = [
  {id:'idea', label:'Idea', color:'var(--gold)'},
  {id:'production', label:'In production', color:'var(--teal)'},
  {id:'review', label:'In review', color:'var(--lavender)'},
  {id:'published', label:'Published', color:'#7FA6A0'}
];
const FORMATS = {
  canvas:{ label:'Canvas build', color:'#5B8DEF' },
  video:{ label:'Video project', color:'#E0A73A' },
  written:{ label:'Comms build', color:'#4FBFA8' },
  other:{ label:'Other', color:'#9A9A9A' }
};
const PRIORITY_COLOR = { high:'#E2735A', medium:'#E0A73A', low:'#4FBFA8' };

let builds = [];
let editingId = null;
let draggingId = null;
let currentView = 'board';
let ganttDayWidth = 34;
let ganttNeedsScrollToToday = true;
const GANTT_DAY_WIDTH_MIN = 14;
const GANTT_DAY_WIDTH_MAX = 70;
const GANTT_DAY_WIDTH_DEFAULT = 34;

// Rough text-width estimate for milestone labels (bold 10.5px Inter). Doesn't
// need to be pixel-perfect, just close enough to catch real collisions.
// Deliberately generous (overestimates slightly) since underestimating is
// what causes visible overlaps.
function estimateLabelWidth(text){
  return Math.ceil((text || '').length * 7.1) + 12;
}

// Full label stays in data-label (used by the click popover); the on-timeline
// text is capped so dense rows don't turn into a wall of overlapping text.
function truncateLabel(text, max = 20){
  if(!text || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

// Greedy lane assignment so overlapping milestone labels on the same row
// stack onto separate lines instead of visually colliding. Milestones must
// already be sorted by mOffset ascending. Returns { lanes: number[], laneCount }
// where lanes[i] is the vertical lane index assigned to milestones[i].
function assignMilestoneLanes(milestones){
  const laneEndX = []; // rightmost occupied x per lane
  const lanes = [];
  const GAP = 12;
  milestones.forEach(m => {
    const start = m.mOffset + 9;
    const end = start + estimateLabelWidth(truncateLabel(m.label));
    let assigned = -1;
    for(let lane = 0; lane < laneEndX.length; lane++){
      if(start >= laneEndX[lane] + GAP){ assigned = lane; break; }
    }
    if(assigned === -1){
      assigned = laneEndX.length;
      laneEndX.push(end);
    } else {
      laneEndX[assigned] = end;
    }
    lanes.push(assigned);
  });
  return { lanes, laneCount: Math.max(laneEndX.length, 1) };
}
let filterFormats = [];   // empty array = no filter, show all
let filterOwners = [];    // empty array = no filter, show all
let filterFormatText = '';
let filterOwnerText = '';
let formatFilterOpen = false;
let ownerFilterOpen = false;
const NAMED_OWNERS = ['Oliver','Becca','Miah','Eleanor','Glenn','Gorgia'];
function matchesOwnerFilter(owner){
  if(filterOwners.length === 0) return true;
  const isNamed = owner && NAMED_OWNERS.includes(owner);
  if(isNamed) return filterOwners.includes(owner);
  if(!filterOwners.includes('__other__')) return false;
  if(!owner) return false;
  if(filterOwnerText) return owner.toLowerCase().includes(filterOwnerText.toLowerCase());
  return true;
}
function matchesFormatFilter(b){
  if(filterFormats.length === 0) return true;
  if(!filterFormats.includes(b.format)) return false;
  if(b.format === 'other' && filterFormatText){
    return (b.formatOther || '').toLowerCase().includes(filterFormatText.toLowerCase());
  }
  return true;
}

function uid(){ return 'b_' + Math.random().toString(36).slice(2,10); }
function initials(name){
  if(!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}
function fmtDate(d){
  if(!d) return 'No due date';
  const dt = new Date(d+'T00:00:00');
  return dt.toLocaleDateString(undefined,{month:'short', day:'numeric'});
}
function isOverdue(d, stage){
  if(!d || stage==='published') return false;
  return new Date(d+'T00:00:00') < new Date(new Date().toDateString());
}

function daysUntil(dateStr){
  const target = new Date(dateStr+'T00:00:00');
  const today = new Date(new Date().toDateString());
  return Math.round((target - today) / 86400000);
}
function milestoneBucket(days){
  if(days <= 0) return 'red';
  if(days <= 5) return 'orange';
  if(days <= 9) return 'yellow';
  return 'green';
}
function milestoneDayLabel(days){
  if(days === 0) return 'Due today';
  if(days > 0) return `T\u2212${days} day${days===1?'':'s'}`;
  const abs = Math.abs(days);
  return `T+${abs} day${abs===1?'':'s'}`;
}
function collectUpcomingMilestones(){
  const list = [];
  builds.forEach(b => {
    (b.milestones || []).forEach((m, mIdx) => {
      if(m.done || !m.date) return;
      list.push({
        buildId: b.id,
        buildTitle: b.title,
        label: m.label || `Milestone ${mIdx+1}`,
        days: daysUntil(m.date)
      });
    });
  });
  list.sort((a,b) => a.days - b.days);
  return list;
}
function renderMilestonesPanel(){
  const wrap = document.getElementById('milestonesList');
  if(!wrap) return;
  const items = collectUpcomingMilestones();
  if(items.length === 0){
    wrap.innerHTML = `<div class="milestones-empty">No upcoming milestones.</div>`;
    return;
  }
  wrap.innerHTML = items.map(it => `
    <div class="milestone-row" data-build-id="${it.buildId}" tabindex="0" role="button" aria-label="${escapeHtml(it.label)}, ${escapeHtml(it.buildTitle)}, ${milestoneDayLabel(it.days)}">
      <div class="milestone-row-main">
        <span class="milestone-row-label">${escapeHtml(it.label)}</span>
        <span class="milestone-row-project">${escapeHtml(it.buildTitle)}</span>
      </div>
      <span class="milestone-badge milestone-badge-${milestoneBucket(it.days)}">${milestoneDayLabel(it.days)}</span>
    </div>
  `).join('');
  wrap.querySelectorAll('.milestone-row').forEach(row => {
    const open = () => openEdit(row.dataset.buildId);
    row.addEventListener('click', open);
    row.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
  });
}

async function loadBuilds(){
  try{
    builds = await window.BuildsAPI.fetchAll();
    markSynced();
  }catch(e){
    console.error('Could not load builds:', e);
    document.getElementById('updatedAt').textContent = 'Could not connect. Check firebase-config.js';
  }
  render();
}

function markSynced(){
  document.getElementById('updatedAt').textContent = 'Synced ' + new Date().toLocaleTimeString(undefined,{hour:'numeric', minute:'2-digit'});
}

function seedData(){
  const today = new Date();
  const inDays = n => { const d=new Date(today); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  return [
    { id:uid(), title:'Intro to Compound Interest', format:'video', stage:'production', owner:'Oliver', start:inDays(-2), due:inDays(4), priority:'high', notes:'Script locked, filming Thursday.' },
    { id:uid(), title:'Reading a Payslip', format:'written', stage:'idea', owner:'Miah', start:inDays(1), due:inDays(10), priority:'medium', notes:'' },
    { id:uid(), title:'Budgeting 101 Quiz', format:'canvas', stage:'review', owner:'Eleanor', start:inDays(-6), due:inDays(2), priority:'high', notes:'Waiting on final answer-key check.' },
    { id:uid(), title:'What Is a Credit Score', format:'written', stage:'published', owner:'Glenn', start:inDays(-10), due:inDays(-3), priority:'low', notes:'Live on the app.' }
  ];
}

function summarizeSelection(selected, labelMap, allLabel){
  if(selected.length === 0) return allLabel;
  if(selected.length <= 2) return selected.map(v => labelMap[v] || v).join(', ');
  return `${selected.length} selected`;
}

function populateFilterPills(){
  // Format dropdown
  const fmtTrigger = document.getElementById('formatFilterTrigger');
  const fmtTriggerLabel = document.getElementById('formatFilterTriggerLabel');
  const fmtPanel = document.getElementById('formatFilterPanel');
  const fmtLabelMap = Object.fromEntries(Object.entries(FORMATS).map(([k,v])=>[k,v.label]));

  fmtTriggerLabel.textContent = summarizeSelection(filterFormats, fmtLabelMap, 'All formats');
  fmtTrigger.classList.toggle('has-selection', filterFormats.length > 0);
  fmtTrigger.setAttribute('aria-expanded', formatFilterOpen ? 'true' : 'false');
  fmtPanel.style.display = formatFilterOpen ? 'block' : 'none';
  fmtPanel.innerHTML = Object.entries(FORMATS).map(([val,v]) => `
    <label class="dropdown-item" role="option">
      <input type="checkbox" data-filter="format" value="${val}" ${filterFormats.includes(val)?'checked':''}>
      ${v.label}
    </label>
  `).join('') + `<div class="dropdown-panel-footer"><button type="button" class="dropdown-clear" data-clear="format">Clear</button></div>`;

  fmtPanel.querySelectorAll('input[data-filter="format"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if(cb.checked) filterFormats = [...filterFormats, cb.value];
      else filterFormats = filterFormats.filter(v => v !== cb.value);
      ganttNeedsScrollToToday = true;
      render();
    });
  });
  fmtPanel.querySelector('[data-clear="format"]').addEventListener('click', () => {
    filterFormats = []; ganttNeedsScrollToToday = true; render();
  });

  // Owner dropdown
  const ownerTrigger = document.getElementById('ownerFilterTrigger');
  const ownerTriggerLabel = document.getElementById('ownerFilterTriggerLabel');
  const ownerPanel = document.getElementById('ownerFilterPanel');
  const hasOtherOwner = builds.some(b => b.owner && !NAMED_OWNERS.includes(b.owner));
  const ownerOptions = NAMED_OWNERS.slice();
  if(hasOtherOwner || filterOwners.includes('__other__')) ownerOptions.push('__other__');
  const ownerLabelMap = Object.fromEntries(NAMED_OWNERS.map(o=>[o,o]).concat([['__other__','Other']]));

  ownerTriggerLabel.textContent = summarizeSelection(filterOwners, ownerLabelMap, 'All owners');
  ownerTrigger.classList.toggle('has-selection', filterOwners.length > 0);
  ownerTrigger.setAttribute('aria-expanded', ownerFilterOpen ? 'true' : 'false');
  ownerPanel.style.display = ownerFilterOpen ? 'block' : 'none';
  ownerPanel.innerHTML = ownerOptions.map(val => `
    <label class="dropdown-item" role="option">
      <input type="checkbox" data-filter="owner" value="${val}" ${filterOwners.includes(val)?'checked':''}>
      ${ownerLabelMap[val]}
    </label>
  `).join('') + `<div class="dropdown-panel-footer"><button type="button" class="dropdown-clear" data-clear="owner">Clear</button></div>`;

  ownerPanel.querySelectorAll('input[data-filter="owner"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if(cb.checked) filterOwners = [...filterOwners, cb.value];
      else filterOwners = filterOwners.filter(v => v !== cb.value);
      ganttNeedsScrollToToday = true;
      render();
    });
  });
  ownerPanel.querySelector('[data-clear="owner"]').addEventListener('click', () => {
    filterOwners = []; ganttNeedsScrollToToday = true; render();
  });

  document.getElementById('formatOtherFilterInput').style.display = filterFormats.includes('other') ? 'block' : 'none';
  document.getElementById('ownerOtherFilterInput').style.display = filterOwners.includes('__other__') ? 'block' : 'none';
}

// Toggling a dropdown open/closed is a pure UI-state change, not a filter
// change; redraw just the dropdowns rather than the whole board.
document.getElementById('formatFilterTrigger').addEventListener('click', () => {
  formatFilterOpen = !formatFilterOpen;
  ownerFilterOpen = false;
  populateFilterPills();
});
document.getElementById('ownerFilterTrigger').addEventListener('click', () => {
  ownerFilterOpen = !ownerFilterOpen;
  formatFilterOpen = false;
  populateFilterPills();
});
document.addEventListener('click', (e) => {
  if(!formatFilterOpen && !ownerFilterOpen) return;
  const insideFormat = document.getElementById('formatFilterDropdown').contains(e.target);
  const insideOwner = document.getElementById('ownerFilterDropdown').contains(e.target);
  if(!insideFormat && !insideOwner){
    formatFilterOpen = false; ownerFilterOpen = false;
    populateFilterPills();
  }
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && (formatFilterOpen || ownerFilterOpen)){
    formatFilterOpen = false; ownerFilterOpen = false;
    populateFilterPills();
  }
});

(function initMilestonesCollapse(){
  const head = document.getElementById('milestonesPanelHead');
  const list = document.getElementById('milestonesList');
  const btn = document.getElementById('milestonesCollapseBtn');
  const STORAGE_KEY = 'sfl-milestones-collapsed';

  function setCollapsed(collapsed){
    list.classList.toggle('collapsed', collapsed);
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }

  setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  window.setMilestonesCollapsed = setCollapsed;

  head.addEventListener('click', () => {
    setCollapsed(!list.classList.contains('collapsed'));
  });
})();

function jumpToMilestones(){
  window.setMilestonesCollapsed(false);
  const panel = document.getElementById('milestonesPanel');
  panel.scrollIntoView({ behavior:'smooth', block:'start' });
  panel.classList.remove('flash');
  requestAnimationFrame(() => panel.classList.add('flash'));
}
document.getElementById('stats').addEventListener('click', (e) => {
  if(e.target.closest('#statMilestonesOverdue')) jumpToMilestones();
});
document.getElementById('stats').addEventListener('keydown', (e) => {
  if((e.key === 'Enter' || e.key === ' ') && e.target.closest('#statMilestonesOverdue')){
    e.preventDefault();
    jumpToMilestones();
  }
});

function renderStats(){
  const total = builds.length;
  const inReview = builds.filter(b=>b.stage==='review').length;
  const published = builds.filter(b=>b.stage==='published').length;
  const overdueMilestones = collectUpcomingMilestones().filter(m => milestoneBucket(m.days) === 'red').length;
  document.getElementById('stats').innerHTML = `
    <div class="stat-card">
      <span class="label">Total builds</span>
      <div class="value gold">${total}</div>
      <span class="sub">across all stages</span>
    </div>
    <div class="stat-card">
      <span class="label">In review</span>
      <div class="value">${inReview}</div>
      <span class="sub">awaiting sign-off</span>
    </div>
    <div class="stat-card">
      <span class="label">Published</span>
      <div class="value">${published}</div>
      <span class="sub">live builds</span>
    </div>
    <div class="stat-card clickable" id="statMilestonesOverdue" tabindex="0" role="button" aria-label="Show overdue milestones">
      <span class="label">Milestones Overdue</span>
      <div class="value ${overdueMilestones>0?'red':''}">${overdueMilestones}</div>
      <span class="sub">past milestone date</span>
    </div>
  `;
}

function render(){
  const popEl = document.getElementById('milestonePopover');
  if(popEl) popEl.style.display = 'none';
  populateFilterPills();
  renderStats();
  renderMilestonesPanel();
  const label = currentView === 'gantt' ? 'Build timeline' : 'Build pipeline';
  document.getElementById('mainPanelLabel').textContent = label;
  if(currentView === 'gantt'){
    document.getElementById('board').style.display = 'none';
    document.getElementById('gantt').style.display = 'block';
    document.getElementById('ganttZoomControls').style.display = 'flex';
    renderGantt();
  } else {
    document.getElementById('board').style.display = 'grid';
    document.getElementById('gantt').style.display = 'none';
    document.getElementById('ganttZoomControls').style.display = 'none';
    renderBoard();
  }
}

function renderBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';

  STAGES.forEach(stage => {
    const col = document.createElement('div');
    col.className = 'column';
    col.dataset.stage = stage.id;

    const items = builds.filter(b => b.stage === stage.id)
      .filter(b => matchesFormatFilter(b))
      .filter(b => matchesOwnerFilter(b.owner));

    col.innerHTML = `
      <div class="col-head">
        <span class="dot" style="background:${stage.color}"></span>
        <span class="name">${stage.label}</span>
        <span class="count">${items.length}</span>
      </div>
      <div class="cardlist" data-stage="${stage.id}"></div>
    `;

    const list = col.querySelector('.cardlist');
    if(items.length === 0){
      list.innerHTML = `<div class="empty-hint">Nothing here yet</div>`;
    } else {
      items.forEach(b => list.appendChild(renderCard(b)));
    }

    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('dragover');
      if(draggingId){
        const b = builds.find(x=>x.id===draggingId);
        if(b){
          const prevStage = b.stage;
          b.stage = stage.id;
          render();
          try{
            await window.BuildsAPI.update(b.id, { stage: stage.id, title: b.title }, `moved to "${stage.label}"`);
            markSynced();
          }catch(err){
            console.error('Could not save stage change:', err);
            b.stage = prevStage;
            render();
          }
        }
      }
    });

    board.appendChild(col);
  });
}

function renderCard(b){
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  const fmt = FORMATS[b.format] || FORMATS.other;
  const fmtLabel = (b.format === 'other' && b.formatOther) ? b.formatOther : fmt.label;
  const overdue = isOverdue(b.due, b.stage);
  card.innerHTML = `
    <h3>${escapeHtml(b.title)}</h3>
    <div class="meta-row">
      <span class="format-chip" style="background:${fmt.color}22; border:1px solid ${fmt.color}66; color:${fmt.color};">${escapeHtml(fmtLabel)}</span>
      <span class="due ${overdue?'overdue':''}">${overdue ? 'Overdue · ' : ''}${fmtDate(b.due)}</span>
    </div>
    <div class="card-bottom">
      <span class="avatar" title="${escapeHtml(b.owner||'Unassigned')}">${initials(b.owner)}</span>
      <span class="prio" title="${b.priority} priority" style="background:${PRIORITY_COLOR[b.priority]}"></span>
    </div>
  `;
  card.addEventListener('dragstart', () => { draggingId = b.id; card.classList.add('dragging'); });
  card.addEventListener('dragend', () => { draggingId = null; card.classList.remove('dragging'); });
  card.addEventListener('click', () => openEdit(b.id));
  return card;
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function dayMs(){ return 24*60*60*1000; }
function toDate(str){ return new Date(str + 'T00:00:00'); }
function addDays(date, n){ const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function daysBetween(a,b){ return Math.round((b-a)/dayMs()); }

function renderGantt(){
  const gantt = document.getElementById('gantt');
  const todayMidnight = new Date(new Date().toDateString());
  const isPastDue = (b) => b.due && toDate(b.due) < todayMidnight;

  const items = builds
    .filter(b => matchesFormatFilter(b))
    .filter(b => matchesOwnerFilter(b.owner))
    .filter(b => b.due)
    .slice()
    .sort((a,b) => {
      const aPast = isPastDue(a) ? 1 : 0;
      const bPast = isPastDue(b) ? 1 : 0;
      if(aPast !== bPast) return aPast - bPast;
      return (a.start||a.due).localeCompare(b.start||b.due);
    });

  if(items.length === 0){
    gantt.innerHTML = `<div class="gantt-empty">No builds with dates to show. Add a start or due date to see them on the timeline.</div>`;
    return;
  }

  const starts = items.map(b => toDate(b.start || (b.createdAt ? b.createdAt.slice(0,10) : null) || b.due));
  const dues = items.map(b => toDate(b.due));
  const milestoneDates = items.flatMap(b => (b.milestones || []).filter(m => m.date).map(m => toDate(m.date)));
  const today = todayMidnight;
  let rangeStart = new Date(Math.min(...starts, ...dues, ...milestoneDates, +addDays(today, -7)));
  let rangeEnd = new Date(Math.max(...starts, ...dues, ...milestoneDates, +addDays(today, 60)));
  rangeStart = addDays(rangeStart, -2);
  rangeEnd = addDays(rangeEnd, 3);
  const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 7);
  const dayWidth = ganttDayWidth;
  const trackWidth = totalDays * dayWidth;
  const todayStr = new Date().toDateString();

  // Day-number row + weekend/today highlighting
  let daysHtml = '';
  let weekendBandsHtml = '';
  for(let i=0;i<totalDays;i++){
    const d = addDays(rangeStart, i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isToday = d.toDateString() === todayStr;
    const cls = ['unit', isWeekend ? 'weekend' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' ');
    daysHtml += `<div class="${cls}" style="width:${dayWidth}px;">${d.getDate()}</div>`;
    if(isWeekend){
      weekendBandsHtml += `<div class="weekend-band" style="left:${i*dayWidth}px; width:${dayWidth}px;"></div>`;
    }
  }

  // Month-band row: group consecutive days that share a month/year
  let monthsHtml = '';
  let i = 0;
  while(i < totalDays){
    const d = addDays(rangeStart, i);
    const monthKey = d.getMonth() + '-' + d.getFullYear();
    let span = 0;
    while(i + span < totalDays){
      const dd = addDays(rangeStart, i + span);
      if((dd.getMonth() + '-' + dd.getFullYear()) !== monthKey) break;
      span++;
    }
    const label = d.toLocaleDateString(undefined, {month:'long', year:'numeric'});
    monthsHtml += `<div class="month-block" style="width:${span*dayWidth}px;">${label}</div>`;
    i += span;
  }

  const todayOffset = daysBetween(rangeStart, new Date(new Date().toDateString())) * dayWidth;

  let rowsHtml = '';
  let dividerInserted = false;
  const hasActiveAndDone = items.some(b => !isPastDue(b)) && items.some(b => isPastDue(b));
  items.forEach(b => {
    if(hasActiveAndDone && !dividerInserted && isPastDue(b)){
      rowsHtml += `<div class="gantt-section-divider">Past due date</div>`;
      dividerInserted = true;
    }
    const fmt = FORMATS[b.format] || FORMATS.other;
    const impliedStart = b.start || (b.createdAt ? b.createdAt.slice(0,10) : null) || b.due;
    let s = toDate(impliedStart);
    let e = toDate(b.due);
    if(isNaN(s.getTime())) s = e;
    if(isNaN(e.getTime())) e = s;
    if(e < s) e = s;
    let offset = Math.max(daysBetween(rangeStart, s), 0) * dayWidth;
    let span = Math.max(daysBetween(s, e), 1) * dayWidth;
    if(!isFinite(offset)) offset = 0;
    if(!isFinite(span) || span <= 0) span = dayWidth;
    const stage = STAGES.find(st => st.id === b.stage);

    let gridlines = '';
    for(let i=0;i<=totalDays;i++){
      gridlines += `<div class="gridline" style="left:${i*dayWidth}px;"></div>`;
    }

    let milestonesHtml = '';
    const showMilestoneLabels = dayWidth >= GANTT_DAY_WIDTH_DEFAULT;
    const LANE_HEIGHT = 22;
    const BASE_ROW_HEIGHT = 46;

    const msData = (b.milestones || [])
      .map((m, mIdx) => {
        if(!m.date) return null;
        const md = toDate(m.date);
        return {
          mOffset: daysBetween(rangeStart, md) * dayWidth,
          doneClass: m.done ? 'done' : '',
          label: m.label || 'Milestone',
          date: m.date,
          done: !!m.done,
          mIdx
        };
      })
      .filter(Boolean)
      .sort((a, b2) => a.mOffset - b2.mOffset);

    let laneCount = 1;
    let laneOf = () => 0;
    if(showMilestoneLabels && msData.length > 0){
      const assignment = assignMilestoneLanes(msData);
      laneCount = assignment.laneCount;
      laneOf = (i) => assignment.lanes[i];
    }
    const rowHeight = showMilestoneLabels
      ? BASE_ROW_HEIGHT + Math.max(laneCount - 1, 0) * LANE_HEIGHT
      : BASE_ROW_HEIGHT;

    msData.forEach((m, i) => {
      milestonesHtml += `<div class="gantt-milestone ${m.doneClass}" style="left:${m.mOffset}px;" data-label="${escapeHtml(m.label)}" data-date="${escapeHtml(m.date)}" data-done="${m.done ? '1' : '0'}" data-project="${escapeHtml(b.title)}" data-build-id="${b.id}" data-index="${m.mIdx}"></div>`;
      if(showMilestoneLabels){
        const lane = laneOf(i);
        const top = 12 + lane * LANE_HEIGHT;
        milestonesHtml += `<div class="gantt-milestone-label ${m.doneClass}" style="left:${m.mOffset + 9}px; top:${top}px;" title="${escapeHtml(m.label)}">${escapeHtml(truncateLabel(m.label))}</div>`;
      }
    });

    rowsHtml += `
      <div class="gantt-row" style="height:${rowHeight}px;">
        <div class="gantt-label" data-id="${b.id}" title="${escapeHtml(b.title)}">
          <span class="dot" style="background:${stage.color}"></span>
          <span class="title-text">${escapeHtml(b.title)}</span>
        </div>
        <div class="gantt-track" style="width:${trackWidth}px;">
          ${weekendBandsHtml}
          ${gridlines}
          <div class="today-line" style="left:${todayOffset}px;" title="Today"></div>
          <div class="gantt-bar ${b.stage === 'idea' ? 'stage-idea' : ''}" data-id="${b.id}" title="${escapeHtml(b.title)}" style="left:${offset}px; width:${span}px; background:${fmt.color}${b.stage === 'idea' ? '18' : '33'}; border-color:${fmt.color};"></div>
          ${milestonesHtml}
        </div>
      </div>`;
  });

  gantt.innerHTML = `
    <div class="gantt-inner" style="width:${260 + trackWidth}px;">
      <div class="gantt-axis">
        <div class="axis-months"><div class="axis-corner"></div>${monthsHtml}</div>
        <div class="axis-days"><div class="axis-corner"></div>${daysHtml}</div>
      </div>
      ${rowsHtml}
    </div>`;

  if(ganttNeedsScrollToToday){
    const desiredScroll = Math.max(0, todayOffset - gantt.clientWidth * 0.25);
    gantt.scrollLeft = desiredScroll;
    ganttNeedsScrollToToday = false;
  }

  gantt.querySelectorAll('.gantt-bar').forEach(bar => {
    bar.addEventListener('click', () => openEdit(bar.dataset.id));
  });
  gantt.querySelectorAll('.gantt-label').forEach(label => {
    label.addEventListener('click', () => openEdit(label.dataset.id));
  });
  gantt.querySelectorAll('.gantt-milestone').forEach(marker => {
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      showMilestonePopover(marker, e);
    });
  });
}

let currentMilestoneRef = null;

function showMilestonePopover(marker, evt){
  const pop = document.getElementById('milestonePopover');
  const done = marker.dataset.done === '1';
  const buildId = marker.dataset.buildId;
  const mIndex = parseInt(marker.dataset.index, 10);
  currentMilestoneRef = { buildId, mIndex, marker };

  const labelLink = document.getElementById('mpLabel');
  labelLink.textContent = marker.dataset.label || 'Milestone';
  labelLink.onclick = (e) => {
    e.preventDefault();
    window.location.href = `new-project.html?id=${buildId}#milestones`;
  };

  document.getElementById('mpDate').textContent = fmtDate(marker.dataset.date);
  document.getElementById('mpDoneCheck').checked = done;
  document.getElementById('mpProject').textContent = 'Part of: ' + (marker.dataset.project || '');

  pop.style.display = 'block';
  const rect = marker.getBoundingClientRect();
  const popWidth = 220;
  let left = rect.left + rect.width/2 - popWidth/2;
  left = Math.max(12, Math.min(left, window.innerWidth - popWidth - 12));
  let top = rect.bottom + 8;
  if(top + 160 > window.innerHeight) top = rect.top - 168;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

async function toggleMilestoneDone(newDone){
  if(!currentMilestoneRef) return;
  const { buildId, mIndex, marker } = currentMilestoneRef;
  const b = builds.find(x => x.id === buildId);
  if(!b || !b.milestones || !b.milestones[mIndex]) return;

  const updatedMilestones = b.milestones.map((m, i) => i === mIndex ? { ...m, done: newDone } : m);
  b.milestones = updatedMilestones;
  marker.dataset.done = newDone ? '1' : '0';
  marker.classList.toggle('done', newDone);

  try{
    const label = marker.dataset.label || 'Milestone';
    await window.BuildsAPI.update(buildId, { milestones: updatedMilestones, title: b.title }, `marked "${label}" as ${newDone ? 'done' : 'pending'}`);
    markSynced();
  }catch(err){
    console.error('Could not update milestone:', err);
    document.getElementById('updatedAt').textContent = 'Could not save. Try again.';
  }
}
document.getElementById('mpDoneCheck').addEventListener('change', (e) => {
  toggleMilestoneDone(e.target.checked);
});
function hideMilestonePopover(){
  document.getElementById('milestonePopover').style.display = 'none';
  currentMilestoneRef = null;
}
document.getElementById('milestonePopoverClose').addEventListener('click', hideMilestonePopover);
document.addEventListener('click', (e) => {
  const pop = document.getElementById('milestonePopover');
  if(pop.style.display === 'none') return;
  if(pop.contains(e.target) || e.target.classList.contains('gantt-milestone')) return;
  hideMilestonePopover();
});

// Modal handling
const overlay = document.getElementById('overlay');
function openEdit(id){
  const b = builds.find(x=>x.id===id);
  if(!b) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit build';
  document.getElementById('fTitle').value = b.title;
  document.getElementById('fFormat').value = b.format;
  document.getElementById('fFormatOther').style.display = b.format === 'other' ? 'block' : 'none';
  document.getElementById('fFormatOther').value = b.formatOther || '';
  document.getElementById('fStage').value = b.stage;
  if(b.owner && NAMED_OWNERS.includes(b.owner)){
    document.getElementById('fOwner').value = b.owner;
    document.getElementById('fOwnerOther').style.display = 'none';
  } else if(b.owner){
    document.getElementById('fOwner').value = 'other';
    document.getElementById('fOwnerOther').style.display = 'block';
    document.getElementById('fOwnerOther').value = b.owner;
  } else {
    document.getElementById('fOwner').value = '';
    document.getElementById('fOwnerOther').style.display = 'none';
  }
  document.getElementById('fStart').value = b.start || '';
  document.getElementById('fDue').value = b.due || '';
  document.getElementById('fPriority').value = b.priority;
  document.getElementById('fNotes').value = b.notes || '';
  document.getElementById('deleteBtn').style.display = 'inline-block';
  document.getElementById('fullDetailsLink').href = 'new-project.html?id=' + id;
  overlay.classList.add('show');
}
function closeModal(){ overlay.classList.remove('show'); editingId = null; }

document.getElementById('cancelBtn').addEventListener('click', closeModal);

function relativeTime(iso){
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.round(diffMs / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return mins + ' min ago';
  const hours = Math.round(mins / 60);
  if(hours < 24) return hours + ' hr ago';
  const days = Math.round(hours / 24);
  if(days < 7) return days + ' day' + (days===1?'':'s') + ' ago';
  return then.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}
const ACTION_VERBS = { created:'created', updated:'updated', deleted:'deleted' };
async function openActivityLog(){
  const overlay = document.getElementById('activityOverlay');
  const list = document.getElementById('activityList');
  list.innerHTML = '<div class="activity-empty">Loading…</div>';
  overlay.classList.add('show');
  try{
    const entries = await window.BuildsAPI.fetchActivity(50);
    if(entries.length === 0){
      list.innerHTML = '<div class="activity-empty">No activity yet.</div>';
      return;
    }
    list.innerHTML = entries.map(e => {
      const verb = ACTION_VERBS[e.action] || e.action;
      const title = e.buildTitle ? `“${escapeHtml(e.buildTitle)}”` : 'a project';
      const detail = e.details ? `: ${escapeHtml(e.details)}` : '';
      return `<div class="activity-entry">
        <div class="action"><span class="who">${escapeHtml(e.by)}</span> ${verb} ${title}${detail}</div>
        <div class="when">${relativeTime(e.at)}</div>
      </div>`;
    }).join('');
  }catch(err){
    console.error('Could not load activity:', err);
    list.innerHTML = '<div class="activity-empty">Could not load activity log.</div>';
  }
}
document.getElementById('openActivity').addEventListener('click', openActivityLog);
document.getElementById('activityCloseBtn').addEventListener('click', () => {
  document.getElementById('activityOverlay').classList.remove('show');
});
document.getElementById('activityOverlay').addEventListener('click', (e) => {
  if(e.target.id === 'activityOverlay') e.target.classList.remove('show');
});
overlay.addEventListener('click', e => { if(e.target === overlay) closeModal(); });
document.getElementById('fFormat').addEventListener('change', (e) => {
  document.getElementById('fFormatOther').style.display = e.target.value === 'other' ? 'block' : 'none';
});
document.getElementById('fOwner').addEventListener('change', (e) => {
  document.getElementById('fOwnerOther').style.display = e.target.value === 'other' ? 'block' : 'none';
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const title = document.getElementById('fTitle').value.trim();
  if(!title){ document.getElementById('fTitle').focus(); return; }
  const ownerSel = document.getElementById('fOwner').value;
  const owner = ownerSel === 'other' ? document.getElementById('fOwnerOther').value.trim() : ownerSel;
  const data = {
    title,
    format: document.getElementById('fFormat').value,
    formatOther: document.getElementById('fFormatOther').value.trim(),
    stage: document.getElementById('fStage').value,
    owner,
    start: document.getElementById('fStart').value,
    due: document.getElementById('fDue').value,
    priority: document.getElementById('fPriority').value,
    notes: document.getElementById('fNotes').value.trim()
  };
  try{
    if(editingId){
      const b = builds.find(x=>x.id===editingId);
      Object.assign(b, data);
      await window.BuildsAPI.update(editingId, data);
    } else {
      const newBuild = { id: uid(), ...data };
      builds.push(newBuild);
      await window.BuildsAPI.insert(newBuild);
    }
    markSynced();
    closeModal();
    render();
  }catch(err){
    console.error('Could not save build:', err);
    document.getElementById('updatedAt').textContent = 'Could not save. Try again.';
  }
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if(!editingId) return;
  const deletedBuild = builds.find(x => x.id === editingId);
  try{
    await window.BuildsAPI.remove(editingId, deletedBuild ? deletedBuild.title : '');
    builds = builds.filter(x => x.id !== editingId);
    markSynced();
    closeModal();
    render();
  }catch(err){
    console.error('Could not delete build:', err);
    document.getElementById('updatedAt').textContent = 'Could not delete. Try again.';
  }
});

document.getElementById('viewBoardBtn').addEventListener('click', () => {
  currentView = 'board';
  document.getElementById('viewBoardBtn').classList.add('active');
  document.getElementById('viewGanttBtn').classList.remove('active');
  render();
});
document.getElementById('viewGanttBtn').addEventListener('click', () => {
  currentView = 'gantt';
  ganttNeedsScrollToToday = true;
  document.getElementById('viewGanttBtn').classList.add('active');
  document.getElementById('viewBoardBtn').classList.remove('active');
  render();
});

document.getElementById('zoomInBtn').addEventListener('click', () => {
  ganttDayWidth = Math.min(GANTT_DAY_WIDTH_MAX, ganttDayWidth + 8);
  ganttNeedsScrollToToday = true;
  renderGantt();
});
document.getElementById('zoomOutBtn').addEventListener('click', () => {
  ganttDayWidth = Math.max(GANTT_DAY_WIDTH_MIN, ganttDayWidth - 8);
  ganttNeedsScrollToToday = true;
  renderGantt();
});
document.getElementById('zoomFitBtn').addEventListener('click', () => {
  ganttDayWidth = GANTT_DAY_WIDTH_DEFAULT;
  ganttNeedsScrollToToday = true;
  renderGantt();
});

document.getElementById('formatOtherFilterInput').addEventListener('input', (e) => {
  filterFormatText = e.target.value;
  renderStats();
  if(currentView === 'gantt') renderGantt(); else renderBoard();
});
document.getElementById('ownerOtherFilterInput').addEventListener('input', (e) => {
  filterOwnerText = e.target.value;
  renderStats();
  if(currentView === 'gantt') renderGantt(); else renderBoard();
});

if(window.Identity){
  window.Identity.require(() => {
    loadBuilds();
    if(window.BuildsAPI){
      window.BuildsAPI.subscribeToChanges(() => { loadBuilds(); });
    }
  });
} else {
  loadBuilds();
}
