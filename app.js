'use strict';

// ============================================================
// Supabase Config (anon key only — safe for frontend)
// ============================================================
const SUPABASE_URL = 'https://pitusmyxrffefhxjzokd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpdHVzbXl4cmZmZWZoeGp6b2tkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDE3ODcsImV4cCI6MjA5NjExNzc4N30.pRpYsUH5Dd6gAUJqpSEXqBoedGakEfAe6XLB69qztw0';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// Constants
// ============================================================
const DAYS_TH   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ============================================================
// State
// ============================================================
const S = {
  employees: [],
  duties:    [],
  holidays:  [],
  schedule:  [],   // current month
  page:      'calendar',
  year:      new Date().getFullYear(),
  month:     new Date().getMonth() + 1,
};

// ============================================================
// Utilities
// ============================================================
function isoDate(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth()+1).padStart(2,'0') + '-' +
         String(d.getDate()).padStart(2,'0');
}

function dateTH(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDate() + ' ' + MONTHS_TH[d.getMonth()] + ' ' + (d.getFullYear() + 543);
}

function dowTH(dateStr) {
  return DAYS_TH[new Date(dateStr + 'T00:00:00').getDay()];
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// Availability Logic
// ============================================================
function empAvailable(emp, dateStr) {
  if (emp.contract_type === 'จ้างเหมา') return { ok: true, reason: '' };
  const dow = dowTH(dateStr);
  if (emp.day_off1 === dow || emp.day_off2 === dow)
    return { ok: false, reason: 'วันหยุดประจำสัปดาห์ (วัน' + dow + ')' };

  for (const h of S.holidays) {
    if (h.date === dateStr && h.type === 'ชดเชย' && h.ref_date) {
      const origDow = dowTH(h.ref_date);
      if (emp.day_off1 === origDow || emp.day_off2 === origDow)
        return { ok: false, reason: 'วันหยุดชดเชย (ชดเชยวัน' + origDow + ')' };
    }
  }
  return { ok: true, reason: '' };
}

// ============================================================
// Loading & Toast
// ============================================================
let _loadCount = 0;
function showLoading(on) {
  _loadCount = on ? _loadCount + 1 : Math.max(0, _loadCount - 1);
  const el = document.getElementById('global-loading');
  el.style.display = _loadCount > 0 ? 'flex' : 'none';
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ============================================================
// Modal
// ============================================================
function openModal(html, wide = false) {
  const box = document.getElementById('modal-box');
  box.className = 'modal' + (wide ? ' modal-wide' : '');
  box.innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ============================================================
// Navigation
// ============================================================
function navigate(page) {
  S.page = page;
  const titles = { calendar:'ปฏิทินปฏิบัติงาน', employees:'ข้อมูลพนักงาน',
                   holidays:'วันหยุดนักขัตฤกษ์', duties:'หน้าที่และอัตรากำลัง' };

  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.bottom-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === 'page-' + page));
  document.getElementById('page-title').textContent = titles[page] || page;

  closeSidebar();
  const renders = { calendar: renderCalendar, employees: renderEmployees,
                    holidays: renderHolidays, duties: renderDuties };
  if (renders[page]) renders[page]();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ============================================================
// Calendar Page
// ============================================================
function renderCalendar() {
  const { year, month } = S;
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = isoDate(new Date());

  const holMap = {};
  S.holidays.forEach(h => { holMap[h.date] = h; });

  const schMap = {};
  S.schedule.forEach(s => { schMap[s.date] = (schMap[s.date] || 0) + 1; });

  let html = `
    <div class="calendar-header">
      <button class="btn-icon" onclick="changeMonth(-1)">&#8249;</button>
      <h2>${MONTHS_TH[month-1]} ${year+543}</h2>
      <button class="btn-icon" onclick="changeMonth(1)">&#8250;</button>
    </div>
    <div class="cal-grid">
      ${DAYS_TH.map(d => `<div class="cal-dow">${d.slice(0,3)}</div>`).join('')}
  `;

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const dow     = new Date(dateStr + 'T00:00:00').getDay();
    const hol     = holMap[dateStr];
    const cnt     = schMap[dateStr] || 0;
    const isToday = dateStr === today;

    let cls = 'cal-cell';
    if (dow === 0 || dow === 6) cls += ' weekend';
    if (hol)    cls += ' holiday';
    if (isToday) cls += ' today';

    html += `
      <div class="${cls}" onclick="openDayDetail('${dateStr}')">
        <div class="cal-day">${day}</div>
        ${hol ? `<div class="cal-hol-name">${esc(hol.name)}</div>` : ''}
        ${cnt  ? `<div class="cal-sch-count">${cnt} คน</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  document.getElementById('calendar-content').innerHTML = html;
}

async function changeMonth(delta) {
  S.month += delta;
  if (S.month > 12) { S.month = 1;  S.year++; }
  if (S.month < 1)  { S.month = 12; S.year--; }
  showLoading(true);
  try {
    await loadScheduleForMonth();
    renderCalendar();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// Day Detail Modal
// ============================================================
async function openDayDetail(dateStr) {
  showLoading(true);
  try {
    const { data: quotas, error: qErr } = await db.from('quotas').select('*').eq('date', dateStr);
    if (qErr) throw qErr;

    const daySchedule = S.schedule.filter(s => s.date === dateStr);
    const holiday     = S.holidays.find(h => h.date === dateStr);
    const dow         = dowTH(dateStr);

    const qMap = {};
    (quotas || []).forEach(q => { qMap[q.duty_id] = q.count; });

    let html = `
      <div class="modal-header">
        <h3>${dateTH(dateStr)}&nbsp;<small style="font-weight:400;font-size:14px">(วัน${dow})</small></h3>
        ${holiday ? `<span class="badge badge-holiday">${esc(holiday.name)}</span>` : ''}
        <button class="btn-close" onclick="closeModal()">&#215;</button>
      </div>
      <div class="modal-body">
    `;

    // Schedule grouped by duty
    html += '<div class="section-title">ผู้ปฏิบัติงานวันนี้</div>';
    if (daySchedule.length === 0) {
      html += '<p class="text-muted" style="font-size:14px;margin-bottom:8px">ยังไม่มีผู้ปฏิบัติงาน</p>';
    } else {
      S.duties.forEach(duty => {
        const entries = daySchedule.filter(s => s.duty_id === duty.id);
        if (!entries.length) return;
        html += `<div class="duty-group"><div class="duty-label">${esc(duty.name)}</div>`;
        entries.forEach(s => {
          const emp  = S.employees.find(e => e.id === s.emp_id);
          const name = emp ? emp.first_name + ' ' + emp.last_name : s.emp_id;
          html += `
            <div class="schedule-item">
              <span>${esc(name)}</span>
              ${s.note ? `<small class="text-muted">(${esc(s.note)})</small>` : ''}
              <button class="btn-remove" onclick="removeEntry('${s.id}','${dateStr}')">&#215;</button>
            </div>`;
        });
        html += '</div>';
      });
    }

    // Add employee
    html += `
      <div class="section-title">เพิ่มผู้ปฏิบัติงาน</div>
      <div class="form-row">
        <select id="dd-emp" class="form-select">
          <option value="">-- เลือกพนักงาน --</option>
          ${S.employees.map(emp => {
            const av = empAvailable(emp, dateStr);
            return `<option value="${esc(emp.id)}" ${!av.ok ? 'disabled' : ''}>
              ${esc(emp.id + ' ' + emp.first_name + ' ' + emp.last_name)}
              ${!av.ok ? ' (' + esc(av.reason) + ')' : ''}
            </option>`;
          }).join('')}
        </select>
        <select id="dd-duty" class="form-select">
          <option value="">-- เลือกหน้าที่ --</option>
          ${S.duties.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
        </select>
        <input id="dd-note" class="form-input" placeholder="หมายเหตุ">
        <button class="btn btn-primary" onclick="addEntry('${dateStr}')">+ เพิ่ม</button>
      </div>
    `;

    // Quotas + auto
    html += `
      <div class="section-title">
        อัตรากำลัง
        <button class="btn btn-sm btn-secondary" onclick="openQuotaModal('${dateStr}')">แก้ไขอัตรา</button>
        <button class="btn btn-sm btn-accent" onclick="runAutoSchedule('${dateStr}')">จัดอัตโนมัติ</button>
      </div>
      <div class="quota-list">
        ${S.duties.map(d => {
          const q  = qMap[d.id] || 0;
          if (!q) return '';
          const assigned = daySchedule.filter(s => s.duty_id === d.id).length;
          const color = assigned >= q ? '#27ae60' : '#e74c3c';
          return `<div class="quota-item">
            <span>${esc(d.name)}</span>
            <span style="color:${color}">${assigned}/${q}</span>
          </div>`;
        }).join('')}
      </div>
    `;

    html += '</div>';
    openModal(html, true);

  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

async function addEntry(dateStr) {
  const empId  = document.getElementById('dd-emp').value;
  const dutyId = document.getElementById('dd-duty').value;
  const note   = document.getElementById('dd-note').value.trim();
  if (!empId || !dutyId) { toast('กรุณาเลือกพนักงานและหน้าที่', 'error'); return; }

  const emp   = S.employees.find(e => e.id === empId);
  const avail = empAvailable(emp, dateStr);
  if (!avail.ok) { toast(emp.first_name + ' ' + emp.last_name + ': ' + avail.reason, 'error'); return; }

  const dup = S.schedule.some(s => s.date === dateStr && s.emp_id === empId && s.duty_id === dutyId);
  if (dup) { toast('พนักงานนี้ถูกจัดหน้าที่นี้ในวันนี้แล้ว', 'error'); return; }

  showLoading(true);
  try {
    const { error } = await db.from('schedule').insert(
      { date: dateStr, emp_id: empId, duty_id: dutyId, note, recorded_by: 'user' }
    );
    if (error) throw error;
    await loadScheduleForMonth();
    toast('เพิ่มผู้ปฏิบัติงานสำเร็จ');
    closeModal();
    renderCalendar();
    await openDayDetail(dateStr);
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

async function removeEntry(id, dateStr) {
  if (!confirm('ยืนยันลบรายการนี้?')) return;
  showLoading(true);
  try {
    const { error } = await db.from('schedule').delete().eq('id', id);
    if (error) throw error;
    S.schedule = S.schedule.filter(s => s.id !== id);
    toast('ลบรายการสำเร็จ');
    closeModal();
    renderCalendar();
    await openDayDetail(dateStr);
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

async function runAutoSchedule(dateStr) {
  showLoading(true);
  try {
    const { data: quotas, error: qErr } = await db.from('quotas').select('*').eq('date', dateStr);
    if (qErr) throw qErr;
    if (!quotas || !quotas.length) throw new Error('ไม่พบอัตรากำลัง กรุณากำหนดอัตรากำลังก่อน');

    const existing    = S.schedule.filter(s => s.date === dateStr);
    const assignedIds = existing.map(s => s.emp_id);
    const todaySch    = [...existing];
    const toInsert    = [];

    for (const q of quotas) {
      const already = todaySch.filter(s => s.duty_id === q.duty_id).length;
      let needed    = q.count - already;
      if (needed <= 0) continue;

      let candidates = S.employees.filter(emp => {
        if (assignedIds.includes(emp.id)) return false;
        return empAvailable(emp, dateStr).ok;
      });

      candidates.sort((a, b) => {
        const aM = (a.duties || []).includes(q.duty_id) ? 0 : 1;
        const bM = (b.duties || []).includes(q.duty_id) ? 0 : 1;
        return aM - bM;
      });

      candidates.slice(0, needed).forEach(emp => {
        toInsert.push({ date: dateStr, emp_id: emp.id, duty_id: q.duty_id, note: 'จัดอัตโนมัติ', recorded_by: 'auto' });
        assignedIds.push(emp.id);
        todaySch.push({ date: dateStr, emp_id: emp.id, duty_id: q.duty_id });
      });
    }

    if (toInsert.length) {
      const { error } = await db.from('schedule').insert(toInsert);
      if (error) throw error;
      await loadScheduleForMonth();
    }

    toast('จัดอัตโนมัติสำเร็จ เพิ่ม ' + toInsert.length + ' รายการ');
    closeModal();
    renderCalendar();
    await openDayDetail(dateStr);
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// Quota Modal
// ============================================================
function openQuotaModal(dateStr) {
  showLoading(true);
  db.from('quotas').select('*').eq('date', dateStr).then(({ data, error }) => {
    showLoading(false);
    if (error) { toast(error.message, 'error'); return; }

    const qMap = {};
    (data || []).forEach(q => { qMap[q.duty_id] = q.count; });

    const html = `
      <div class="modal-header">
        <h3>อัตรากำลัง ${dateTH(dateStr)}</h3>
        <button class="btn-close" onclick="closeModal()">&#215;</button>
      </div>
      <div class="modal-body">
        <form onsubmit="saveQuotas(event,'${dateStr}')">
          ${S.duties.map(d => `
            <div class="form-group">
              <label>${esc(d.name)} (${esc(d.id)})</label>
              <input type="number" class="form-input quota-input"
                data-duty="${esc(d.id)}" value="${qMap[d.id] || 0}" min="0" step="1" style="max-width:140px">
            </div>
          `).join('')}
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
            <button type="submit" class="btn btn-primary">บันทึก</button>
          </div>
        </form>
      </div>
    `;
    openModal(html);
  });
}

async function saveQuotas(e, dateStr) {
  e.preventDefault();
  const quotas = [...document.querySelectorAll('.quota-input')]
    .map(inp => ({ duty_id: inp.dataset.duty, count: parseInt(inp.value) || 0 }))
    .filter(q => q.count > 0);

  showLoading(true);
  try {
    await db.from('quotas').delete().eq('date', dateStr);
    if (quotas.length) {
      const { error } = await db.from('quotas').insert(
        quotas.map(q => ({ date: dateStr, duty_id: q.duty_id, count: q.count }))
      );
      if (error) throw error;
    }
    toast('บันทึกอัตรากำลังสำเร็จ');
    closeModal();
    await openDayDetail(dateStr);
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// Employees Page
// ============================================================
function renderEmployees() {
  const rows = S.employees.map(emp => {
    const dutyNames = (emp.duties || []).map(id => {
      const d = S.duties.find(x => x.id === id);
      return d ? esc(d.name) : esc(id);
    }).join(', ');
    return `
      <tr>
        <td>${esc(emp.id)}</td>
        <td><strong>${esc(emp.first_name)} ${esc(emp.last_name)}</strong></td>
        <td>${esc(emp.position)}</td>
        <td>${esc(emp.day_off1)}${emp.day_off2 ? ', ' + esc(emp.day_off2) : ''}</td>
        <td><span class="badge ${emp.contract_type === 'จ้างเหมา' ? 'badge-contract' : ''}">${esc(emp.contract_type)}</span></td>
        <td>${dutyNames}</td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" onclick="openEmpModal('${esc(emp.id)}')">แก้ไข</button>
          <button class="btn btn-sm btn-danger"    onclick="deleteEmp('${esc(emp.id)}')">ลบ</button>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('emp-content').innerHTML = `
    <div class="page-header">
      <h2>ข้อมูลพนักงาน (${S.employees.length} คน)</h2>
      <button class="btn btn-primary" onclick="openEmpModal()">+ เพิ่มพนักงาน</button>
    </div>
    <div class="search-bar">
      <input class="form-input" id="emp-search" placeholder="ค้นหาชื่อหรือรหัส..." oninput="filterTable('emp-table',this.value)">
    </div>
    <div class="table-wrap">
      <table class="data-table" id="emp-table">
        <thead>
          <tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>วันหยุด</th><th>ประเภท</th><th>หน้าที่</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty-state">ยังไม่มีข้อมูลพนักงาน</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function filterTable(tableId, q) {
  const lq = q.toLowerCase();
  document.querySelectorAll('#' + tableId + ' tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(lq) ? '' : 'none';
  });
}

function openEmpModal(id) {
  const emp  = id ? S.employees.find(e => e.id === id) : null;
  const chkd = emp ? (emp.duties || []) : [];

  const html = `
    <div class="modal-header">
      <h3>${emp ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน'}</h3>
      <button class="btn-close" onclick="closeModal()">&#215;</button>
    </div>
    <div class="modal-body">
      <form onsubmit="saveEmployee(event)">
        <input type="hidden" id="ef-orig" value="${emp ? esc(emp.id) : ''}">
        <div class="form-grid">
          <div class="form-group">
            <label>เลขประจำตัว *</label>
            <input class="form-input" id="ef-id" value="${emp ? esc(emp.id) : ''}" ${emp?'readonly':''} required>
          </div>
          <div class="form-group">
            <label>ประเภทพนักงาน</label>
            <select class="form-select" id="ef-contract">
              <option value="ปกติ"     ${(!emp||emp.contract_type==='ปกติ')    ?'selected':''}>ปกติ</option>
              <option value="จ้างเหมา" ${emp&&emp.contract_type==='จ้างเหมา'  ?'selected':''}>จ้างเหมา</option>
            </select>
          </div>
          <div class="form-group">
            <label>ชื่อ *</label>
            <input class="form-input" id="ef-fname" value="${emp ? esc(emp.first_name) : ''}" required>
          </div>
          <div class="form-group">
            <label>นามสกุล *</label>
            <input class="form-input" id="ef-lname" value="${emp ? esc(emp.last_name) : ''}" required>
          </div>
          <div class="form-group">
            <label>ตำแหน่ง</label>
            <input class="form-input" id="ef-pos" value="${emp ? esc(emp.position) : ''}">
          </div>
          <div class="form-group">
            <label>ประเภทค่าจ้าง</label>
            <select class="form-select" id="ef-wage">
              <option value="รายเดือน" ${(!emp||emp.wage_type==='รายเดือน')?'selected':''}>รายเดือน</option>
              <option value="รายวัน"   ${emp&&emp.wage_type==='รายวัน'      ?'selected':''}>รายวัน</option>
            </select>
          </div>
          <div class="form-group">
            <label>วันหยุด 1</label>
            <select class="form-select" id="ef-off1">
              <option value="">-</option>
              ${DAYS_TH.map(d=>`<option value="${d}" ${emp&&emp.day_off1===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>วันหยุด 2</label>
            <select class="form-select" id="ef-off2">
              <option value="">-</option>
              ${DAYS_TH.map(d=>`<option value="${d}" ${emp&&emp.day_off2===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>เงินเดือน / ค่าจ้าง</label>
            <input class="form-input" id="ef-salary" type="number" min="0" step="0.01"
              value="${emp ? emp.salary : 0}" style="max-width:200px">
          </div>
        </div>
        <div class="form-group">
          <label>หน้าที่ที่รับผิดชอบ</label>
          <div class="checkbox-group">
            ${S.duties.map(d=>`
              <label class="checkbox-label">
                <input type="checkbox" class="duty-chk" value="${esc(d.id)}" ${chkd.includes(d.id)?'checked':''}>
                ${esc(d.name)}
              </label>`).join('')}
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">บันทึก</button>
        </div>
      </form>
    </div>`;
  openModal(html, true);
}

async function saveEmployee(e) {
  e.preventDefault();
  const origId = document.getElementById('ef-orig').value;
  const data = {
    id:            document.getElementById('ef-id').value.trim(),
    first_name:    document.getElementById('ef-fname').value.trim(),
    last_name:     document.getElementById('ef-lname').value.trim(),
    position:      document.getElementById('ef-pos').value.trim(),
    contract_type: document.getElementById('ef-contract').value,
    day_off1:      document.getElementById('ef-off1').value,
    day_off2:      document.getElementById('ef-off2').value,
    wage_type:     document.getElementById('ef-wage').value,
    salary:        parseFloat(document.getElementById('ef-salary').value) || 0,
    duties:        [...document.querySelectorAll('.duty-chk:checked')].map(c => c.value),
  };

  if (!data.id || !data.first_name || !data.last_name)
    { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }

  showLoading(true);
  try {
    if (origId) {
      const { id, ...rest } = data;
      const { error } = await db.from('employees').update(rest).eq('id', id);
      if (error) throw error;
      toast('แก้ไขข้อมูลสำเร็จ');
    } else {
      if (S.employees.some(e => e.id === data.id))
        throw new Error('เลขประจำตัว ' + data.id + ' มีอยู่ในระบบแล้ว');
      const { error } = await db.from('employees').insert(data);
      if (error) throw error;
      toast('เพิ่มพนักงานสำเร็จ');
    }

    const { data: all, error: e2 } = await db.from('employees').select('*').order('id');
    if (e2) throw e2;
    S.employees = all;
    closeModal();
    renderEmployees();
  } catch(err) { toast(err.message, 'error'); }
  finally      { showLoading(false); }
}

async function deleteEmp(id) {
  if (!confirm('ยืนยันลบพนักงาน ' + id + '?')) return;
  showLoading(true);
  try {
    const { error } = await db.from('employees').delete().eq('id', id);
    if (error) throw error;
    S.employees = S.employees.filter(e => e.id !== id);
    toast('ลบพนักงานสำเร็จ');
    renderEmployees();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// Holidays Page
// ============================================================
function renderHolidays() {
  const yr      = S.year;
  const yearHols = [...S.holidays]
    .filter(h => h.date.startsWith(String(yr)))
    .sort((a,b) => a.date > b.date ? 1 : -1);

  const typeClass = { 'นักขัตฤกษ์':'nat', 'ประเพณี':'trad', 'ชดเชย':'comp' };

  const rows = yearHols.map(h => `
    <tr>
      <td>${dateTH(h.date)}</td>
      <td>${esc(dowTH(h.date))}</td>
      <td>${esc(h.name)}</td>
      <td><span class="badge badge-type-${typeClass[h.type]||'nat'}">${esc(h.type)}</span></td>
      <td>${esc(h.note)}${h.ref_date ? ' <small>(ชดเชย '+dateTH(h.ref_date)+')</small>' : ''}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openHolModal('${h.date}')">แก้ไข</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteHol('${h.date}')">ลบ</button>
      </td>
    </tr>`).join('');

  document.getElementById('hol-content').innerHTML = `
    <div class="page-header">
      <h2>วันหยุดนักขัตฤกษ์</h2>
      <button class="btn btn-primary" onclick="openHolModal()">+ เพิ่มวันหยุด</button>
    </div>
    <div class="year-nav">
      <button class="btn-icon" onclick="changeHolYear(-1)">&#8249;</button>
      <span>ปี พ.ศ. ${yr + 543}</span>
      <button class="btn-icon" onclick="changeHolYear(1)">&#8250;</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>วันที่</th><th>วัน</th><th>ชื่อวันหยุด</th><th>ประเภท</th><th>หมายเหตุ</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty-state">ไม่มีวันหยุดในปีนี้</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function changeHolYear(d) { S.year += d; renderHolidays(); }

function openHolModal(date) {
  const hol   = date ? S.holidays.find(h => h.date === date) : null;
  const isComp = hol && hol.type === 'ชดเชย';

  const html = `
    <div class="modal-header">
      <h3>${hol ? 'แก้ไขวันหยุด' : 'เพิ่มวันหยุด'}</h3>
      <button class="btn-close" onclick="closeModal()">&#215;</button>
    </div>
    <div class="modal-body">
      <form onsubmit="saveHoliday(event)">
        <input type="hidden" id="hf-orig" value="${hol ? hol.date : ''}">
        <div class="form-group">
          <label>วันที่ *</label>
          <input type="date" class="form-input" id="hf-date" value="${hol ? hol.date : ''}" required>
        </div>
        <div class="form-group">
          <label>ชื่อวันหยุด *</label>
          <input class="form-input" id="hf-name" value="${hol ? esc(hol.name) : ''}" required>
        </div>
        <div class="form-group">
          <label>ประเภท</label>
          <select class="form-select" id="hf-type" onchange="document.getElementById('ref-grp').style.display=this.value==='ชดเชย'?'block':'none'">
            ${['นักขัตฤกษ์','ประเพณี','ชดเชย'].map(t=>
              `<option value="${t}" ${hol&&hol.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="ref-grp" style="display:${isComp?'block':'none'}">
          <label>วันที่อ้างอิง (วันหยุดที่ถูกชดเชย)</label>
          <input type="date" class="form-input" id="hf-refdate" value="${hol && hol.ref_date ? hol.ref_date : ''}">
        </div>
        <div class="form-group">
          <label>หมายเหตุ</label>
          <input class="form-input" id="hf-note" value="${hol ? esc(hol.note) : ''}">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">บันทึก</button>
        </div>
      </form>
    </div>`;
  openModal(html);
}

async function saveHoliday(e) {
  e.preventDefault();
  const origDate = document.getElementById('hf-orig').value;
  const type     = document.getElementById('hf-type').value;
  const data = {
    date:     document.getElementById('hf-date').value,
    name:     document.getElementById('hf-name').value.trim(),
    type,
    ref_date: type === 'ชดเชย' ? (document.getElementById('hf-refdate').value || null) : null,
    note:     document.getElementById('hf-note').value.trim(),
  };

  showLoading(true);
  try {
    if (origDate) {
      const { error } = await db.from('public_holidays').update(data).eq('date', origDate);
      if (error) throw error;
      toast('แก้ไขวันหยุดสำเร็จ');
    } else {
      if (S.holidays.some(h => h.date === data.date))
        throw new Error('วันที่ ' + data.date + ' มีวันหยุดอยู่แล้ว');
      const { error } = await db.from('public_holidays').insert(data);
      if (error) throw error;
      toast('เพิ่มวันหยุดสำเร็จ');
    }

    const { data: all, error: e2 } = await db.from('public_holidays').select('*').order('date');
    if (e2) throw e2;
    S.holidays = all;
    closeModal();
    renderHolidays();
    if (S.page === 'calendar') renderCalendar();
  } catch(err) { toast(err.message, 'error'); }
  finally      { showLoading(false); }
}

async function deleteHol(date) {
  if (!confirm('ยืนยันลบวันหยุด ' + dateTH(date) + '?')) return;
  showLoading(true);
  try {
    const { error } = await db.from('public_holidays').delete().eq('date', date);
    if (error) throw error;
    S.holidays = S.holidays.filter(h => h.date !== date);
    toast('ลบวันหยุดสำเร็จ');
    renderHolidays();
    renderCalendar();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// Duties Page
// ============================================================
function renderDuties() {
  const rows = S.duties.map(d => `
    <tr>
      <td>${esc(d.id)}</td>
      <td><strong>${esc(d.name)}</strong></td>
      <td>${esc(d.description)}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openDutyModal('${esc(d.id)}')">แก้ไข</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteDutyItem('${esc(d.id)}')">ลบ</button>
      </td>
    </tr>`).join('');

  document.getElementById('duties-content').innerHTML = `
    <div class="page-header">
      <h2>หน้าที่และอัตรากำลัง</h2>
      <button class="btn btn-primary" onclick="openDutyModal()">+ เพิ่มหน้าที่</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>รหัส</th><th>ชื่อหน้าที่</th><th>คำอธิบาย</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty-state">ยังไม่มีหน้าที่</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function openDutyModal(id) {
  const duty = id ? S.duties.find(d => d.id === id) : null;
  const html = `
    <div class="modal-header">
      <h3>${duty ? 'แก้ไขหน้าที่' : 'เพิ่มหน้าที่'}</h3>
      <button class="btn-close" onclick="closeModal()">&#215;</button>
    </div>
    <div class="modal-body">
      <form onsubmit="saveDuty(event)">
        <input type="hidden" id="df-orig" value="${duty ? esc(duty.id) : ''}">
        <div class="form-group">
          <label>รหัสหน้าที่ *</label>
          <input class="form-input" id="df-id" value="${duty ? esc(duty.id) : ''}" ${duty?'readonly':''} required>
        </div>
        <div class="form-group">
          <label>ชื่อหน้าที่ *</label>
          <input class="form-input" id="df-name" value="${duty ? esc(duty.name) : ''}" required>
        </div>
        <div class="form-group">
          <label>คำอธิบาย</label>
          <input class="form-input" id="df-desc" value="${duty ? esc(duty.description) : ''}">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">บันทึก</button>
        </div>
      </form>
    </div>`;
  openModal(html);
}

async function saveDuty(e) {
  e.preventDefault();
  const origId = document.getElementById('df-orig').value;
  const data   = {
    id:          document.getElementById('df-id').value.trim(),
    name:        document.getElementById('df-name').value.trim(),
    description: document.getElementById('df-desc').value.trim(),
  };

  showLoading(true);
  try {
    if (origId) {
      const { id, ...rest } = data;
      const { error } = await db.from('duties').update(rest).eq('id', id);
      if (error) throw error;
      toast('แก้ไขหน้าที่สำเร็จ');
    } else {
      if (S.duties.some(d => d.id === data.id))
        throw new Error('รหัสหน้าที่ ' + data.id + ' มีอยู่แล้ว');
      const { error } = await db.from('duties').insert(data);
      if (error) throw error;
      toast('เพิ่มหน้าที่สำเร็จ');
    }

    const { data: all, error: e2 } = await db.from('duties').select('*').order('id');
    if (e2) throw e2;
    S.duties = all;
    closeModal();
    renderDuties();
  } catch(err) { toast(err.message, 'error'); }
  finally      { showLoading(false); }
}

async function deleteDutyItem(id) {
  if (!confirm('ยืนยันลบหน้าที่ ' + id + '?\n(จะลบรายการตารางและอัตรากำลังที่เกี่ยวข้องด้วย)')) return;
  showLoading(true);
  try {
    const { error } = await db.from('duties').delete().eq('id', id);
    if (error) throw error;
    S.duties = S.duties.filter(d => d.id !== id);
    toast('ลบหน้าที่สำเร็จ');
    renderDuties();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// DB Helpers
// ============================================================
async function loadScheduleForMonth() {
  const { year, month } = S;
  const start = year + '-' + String(month).padStart(2,'0') + '-01';
  const end   = isoDate(new Date(year, month, 0));
  const { data, error } = await db.from('schedule').select('*').gte('date', start).lte('date', end);
  if (error) throw error;
  S.schedule = data || [];
}

// ============================================================
// Init
// ============================================================
async function init() {
  showLoading(true);
  try {
    const [empRes, dutRes, holRes] = await Promise.all([
      db.from('employees').select('*').order('id'),
      db.from('duties').select('*').order('id'),
      db.from('public_holidays').select('*').order('date'),
    ]);

    if (empRes.error) throw empRes.error;
    if (dutRes.error) throw dutRes.error;
    if (holRes.error) throw holRes.error;

    S.employees = empRes.data || [];
    S.duties    = dutRes.data || [];
    S.holidays  = holRes.data || [];

    await loadScheduleForMonth();
    renderCalendar();
  } catch(e) {
    toast('โหลดข้อมูลล้มเหลว: ' + e.message, 'error');
    console.error(e);
  } finally {
    showLoading(false);
  }
}

init();
