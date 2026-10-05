let editingId = null;

function uid(){ return 'b_' + Math.random().toString(36).slice(2,10); }
function getParam(name){ return new URLSearchParams(window.location.search).get(name); }

function bindCheckPills(container){
  container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(inp => {
    inp.addEventListener('change', () => {
      if(inp.type === 'radio'){
        document.querySelectorAll(`input[name="${inp.name}"]`).forEach(sib => {
          sib.closest('.check-pill').classList.toggle('active', sib.checked);
        });
      } else {
        inp.closest('.check-pill').classList.toggle('active', inp.checked);
      }
    });
  });
}
document.querySelectorAll('.pillrow').forEach(bindCheckPills);

document.getElementById('typeOtherCheck').addEventListener('change', (e) => {
  document.getElementById('fTypeOther').style.display = e.target.checked ? 'block' : 'none';
});
document.getElementById('fFormat').addEventListener('change', (e) => {
  document.getElementById('fFormatOther').style.display = e.target.value === 'other' ? 'block' : 'none';
});
document.getElementById('fOwner').addEventListener('change', (e) => {
  document.getElementById('fOwnerOther').style.display = e.target.value === 'other' ? 'block' : 'none';
});

// --- Dynamic team rows ---
function addTeamRow(name = '', role = ''){
  const list = document.getElementById('teamList');
  const row = document.createElement('div');
  row.className = 'dyn-row';
  row.innerHTML = `
    <div class="field"><input type="text" class="team-name" placeholder="Name" value="${escapeHtml(name)}"></div>
    <div class="field"><input type="text" class="team-role" placeholder="Role (e.g. Instructional designer)" value="${escapeHtml(role)}"></div>
    <button type="button" class="remove-row">×</button>
  `;
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  list.appendChild(row);
}
document.getElementById('addTeamBtn').addEventListener('click', () => addTeamRow());

// --- Dynamic milestone rows ---
// Makes a date input open its native picker on any click in the field, not
// just the small calendar icon. Falls back silently on browsers without
// showPicker() (e.g. Safari) (the native icon still works there either way).
function wireDatePicker(input){
  input.addEventListener('click', () => {
    try { input.showPicker(); } catch(e){ /* unsupported; icon still works */ }
  });
}
document.querySelectorAll('input[type="date"]').forEach(wireDatePicker);

// Local-time YYYY-MM-DD, comparable as a string against a date input's value.
function todayStr(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The reason block appears once a milestone is missed (its date has passed
// and it isn't done), and stays visible if a reason has already been saved.
function updateMissedVisibility(row){
  const date = row.querySelector('.ms-date').value;
  const done = row.querySelector('.ms-done').checked;
  const sel = row.querySelector('.ms-missed-reason');
  const missed = !!date && date < todayStr() && !done;
  row.querySelector('.ms-missed-field').style.display = (missed || sel.value) ? '' : 'none';
  row.querySelector('.ms-missed-other-field').style.display = sel.value === 'Other' ? '' : 'none';
}

function addMilestoneRow(label = '', date = '', done = false, notes = '', missedReason = '', missedReasonOther = ''){
  const list = document.getElementById('milestoneList');
  const row = document.createElement('div');
  row.className = 'milestone-entry';
  row.innerHTML = `
    <div class="dyn-row">
      <div class="field"><input type="text" class="ms-label" placeholder="Milestone (e.g. Script approved)" value="${escapeHtml(label)}"></div>
      <div class="field"><input type="date" class="ms-date" value="${escapeHtml(date)}"></div>
      <div class="field-check">
        <label class="check-pill" style="padding:9px 10px;">
          <input type="checkbox" class="ms-done" ${done ? 'checked' : ''}>
          <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l6 6L20 6"/></svg></span>Done
        </label>
      </div>
      <button type="button" class="remove-row">×</button>
    </div>
    <div class="field ms-notes-field">
      <textarea class="ms-notes" placeholder="Notes for this milestone (optional)" rows="2">${escapeHtml(notes)}</textarea>
    </div>
    <div class="ms-missed-field" style="display:none;">
      <div class="ms-missed-row">
        <div class="field">
          <label>Reason missed</label>
          <select class="ms-missed-reason" aria-label="Reason this milestone was missed">
            <option value="">Select a reason</option>
            <option value="Client delay">Client delay</option>
            <option value="Workload">Workload</option>
            <option value="Technical">Technical</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="field ms-missed-other-field" style="display:none;">
          <label>Details</label>
          <input type="text" class="ms-missed-other" placeholder="Describe the reason" aria-label="Details of the reason this milestone was missed">
        </div>
      </div>
    </div>
  `;
  const msBox = row.querySelector('.check-pill');
  row.querySelector('.ms-done').addEventListener('change', e => msBox.classList.toggle('active', e.target.checked));
  if(done) msBox.classList.add('active');
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  wireDatePicker(row.querySelector('.ms-date'));

  // Set via properties (not interpolated into the HTML string) so free text
  // can never be parsed as markup.
  row.querySelector('.ms-missed-reason').value = missedReason || '';
  row.querySelector('.ms-missed-other').value = missedReasonOther || '';
  ['.ms-date', '.ms-done', '.ms-missed-reason'].forEach(sel => {
    const el = row.querySelector(sel);
    el.addEventListener('change', () => updateMissedVisibility(row));
    if(sel === '.ms-date') el.addEventListener('input', () => updateMissedVisibility(row));
  });
  updateMissedVisibility(row);

  list.appendChild(row);
}
document.getElementById('addMilestoneBtn').addEventListener('click', () => addMilestoneRow());

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// See app.js for why this guard exists: Firestore enforces no schema, so a
// malformed document could have team/milestones set to something other
// than an array.
function asArray(x){ return Array.isArray(x) ? x : []; }

function setChecked(container, selector, values){
  container.querySelectorAll(selector).forEach(inp => {
    if(values.includes(inp.value)){
      inp.checked = true;
      inp.closest('.check-pill').classList.add('active');
    }
  });
}
function setRadio(name, value){
  const inp = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if(inp){ inp.checked = true; inp.closest('.check-pill').classList.add('active'); }
}

async function loadForEdit(id){
  let b = null;
  try{
    b = await window.BuildsAPI.fetchOne(id);
  }catch(e){
    console.error('Could not load project:', e);
    document.getElementById('formStatus').textContent = 'Could not load this project. Check firebase-config.js';
    return;
  }
  if(!b){
    document.getElementById('formStatus').textContent = 'Project not found.';
    return;
  }

  document.getElementById('pageHeading').textContent = 'Edit project';
  document.getElementById('saveBtn').textContent = 'Save changes';
  document.getElementById('fTitle').value = b.title || '';
  document.getElementById('fDescription').value = b.description || '';

  const types = b.projectTypes || [];
  const knownTypes = ['Credential','Short Course','Professional Development'];
  setChecked(document.getElementById('typePills'), 'input[type="checkbox"]', types.filter(t => knownTypes.includes(t)));
  const otherType = types.find(t => !knownTypes.includes(t));
  if(otherType){
    document.getElementById('typeOtherCheck').checked = true;
    document.getElementById('typeOtherPill').classList.add('active');
    document.getElementById('fTypeOther').style.display = 'block';
    document.getElementById('fTypeOther').value = otherType;
  }

  if(b.creditStatus) setRadio('credit', b.creditStatus);
  if(b.buildApproach) setRadio('approach', b.buildApproach);
  if(b.isVideoProject){
    document.getElementById('fIsVideo').checked = true;
    document.getElementById('fIsVideo').closest('.check-pill').classList.add('active');
  }

  document.getElementById('fFormat').value = b.format || 'video';
  if(b.format === 'other'){
    document.getElementById('fFormatOther').style.display = 'block';
    document.getElementById('fFormatOther').value = b.formatOther || '';
  }
  document.getElementById('fStage').value = b.stage || 'idea';
  document.getElementById('fPriority').value = b.priority || 'medium';
  document.getElementById('fCanvasNumber').value = b.canvasNumber || '';
  const namedOwners = ['Oliver','Becca','Miah','Eleanor','Glenn','Gorgia'];
  if(b.owner && namedOwners.includes(b.owner)){
    document.getElementById('fOwner').value = b.owner;
  } else if(b.owner){
    document.getElementById('fOwner').value = 'other';
    document.getElementById('fOwnerOther').style.display = 'block';
    document.getElementById('fOwnerOther').value = b.owner;
  }

  asArray(b.team).forEach(t => addTeamRow(t.name, t.role));

  if(b.stakeholderType) setRadio('stakeholder', b.stakeholderType);
  const c = b.contact || {};
  document.getElementById('fContactName').value = c.name || '';
  document.getElementById('fContactOrg').value = c.org || '';
  document.getElementById('fContactEmail').value = c.email || '';
  document.getElementById('fContactPhone').value = c.phone || '';

  document.getElementById('fStart').value = b.start || '';
  document.getElementById('fDue').value = b.due || '';
  asArray(b.milestones).forEach(m => addMilestoneRow(m.label, m.date, m.done, m.notes, m.missedReason, m.missedReasonOther));

  document.getElementById('fTags').value = (b.tags || []).join(', ');
  document.getElementById('fLinks').value = b.links || '';
  document.getElementById('fNotes').value = b.notes || '';

  if(window.location.hash === '#milestones'){
    const panel = document.getElementById('milestones');
    if(panel){
      panel.scrollIntoView({ behavior:'smooth', block:'start' });
      panel.classList.add('jump-highlight');
      setTimeout(() => panel.classList.remove('jump-highlight'), 2400);
    }
  }
}

document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('fTitle').value.trim();
  const ownerSel = document.getElementById('fOwner').value;
  const owner = ownerSel === 'other' ? document.getElementById('fOwnerOther').value.trim() : ownerSel;
  if(!title){ document.getElementById('fTitle').focus(); return; }
  if(!owner){ document.getElementById('fOwner').focus(); return; }

  const projectTypes = [...document.querySelectorAll('#typePills input[type="checkbox"]:checked')]
    .map(inp => inp.value === 'Other' ? (document.getElementById('fTypeOther').value.trim() || 'Other') : inp.value);

  const team = [...document.querySelectorAll('#teamList .dyn-row')].map(row => ({
    name: row.querySelector('.team-name').value.trim(),
    role: row.querySelector('.team-role').value.trim()
  })).filter(t => t.name || t.role);

  const milestones = [...document.querySelectorAll('#milestoneList .milestone-entry')].map(row => ({
    label: row.querySelector('.ms-label').value.trim(),
    date: row.querySelector('.ms-date').value,
    notes: row.querySelector('.ms-notes').value.trim(),
    done: row.querySelector('.ms-done').checked,
    missedReason: row.querySelector('.ms-missed-reason').value,
    missedReasonOther: row.querySelector('.ms-missed-reason').value === 'Other'
      ? row.querySelector('.ms-missed-other').value.trim()
      : ''
  })).filter(m => m.label || m.date);

  const creditEl = document.querySelector('input[name="credit"]:checked');
  const approachEl = document.querySelector('input[name="approach"]:checked');
  const stakeholderEl = document.querySelector('input[name="stakeholder"]:checked');

  const data = {
    title,
    description: document.getElementById('fDescription').value.trim(),
    projectTypes,
    creditStatus: creditEl ? creditEl.value : '',
    buildApproach: approachEl ? approachEl.value : '',
    isVideoProject: document.getElementById('fIsVideo').checked,
    format: document.getElementById('fFormat').value,
    formatOther: document.getElementById('fFormatOther').value.trim(),
    stage: document.getElementById('fStage').value,
    priority: document.getElementById('fPriority').value,
    canvasNumber: document.getElementById('fCanvasNumber').value.trim(),
    owner,
    team,
    stakeholderType: stakeholderEl ? stakeholderEl.value : '',
    contact: {
      name: document.getElementById('fContactName').value.trim(),
      org: document.getElementById('fContactOrg').value.trim(),
      email: document.getElementById('fContactEmail').value.trim(),
      phone: document.getElementById('fContactPhone').value.trim()
    },
    start: document.getElementById('fStart').value,
    due: document.getElementById('fDue').value,
    milestones,
    tags: document.getElementById('fTags').value.split(',').map(t => t.trim()).filter(Boolean),
    links: document.getElementById('fLinks').value.trim(),
    notes: document.getElementById('fNotes').value.trim()
  };

  const statusEl = document.getElementById('formStatus');
  statusEl.textContent = 'Saving…';
  try{
    if(editingId){
      await window.BuildsAPI.update(editingId, data);
    } else {
      await window.BuildsAPI.insert({ id: uid(), createdAt: new Date().toISOString(), ...data });
    }
    window.location.href = 'index.html';
  }catch(err){
    console.error(err);
    statusEl.textContent = 'Could not save. Try again.';
  }
});

// Init
function initPage(){
  addMilestoneRow();
  const idParam = getParam('id');
  if(idParam){
    editingId = idParam;
    loadForEdit(idParam);
  }
}
if(window.Identity){
  window.Identity.require(() => { initPage(); });
} else {
  initPage();
}
