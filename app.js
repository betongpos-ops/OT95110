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
const DAYS_TH       = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const DAYS_TH_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                   'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ============================================================
// State
// ============================================================
const S = {
  employees:    [],
  duties:       [],
  holidays:     [],
  schedule:     [],   // current month
  page:         'calendar',
  year:         new Date().getFullYear(),
  month:        new Date().getMonth() + 1,
  selectedDate: null, // OT detail page
  calView:      'month', // 'month' | 'cards'
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

// Short day-off label: e.g. "ส,อา"
function empDayOffLabel(emp) {
  return [emp.day_off1, emp.day_off2].filter(Boolean)
    .map(d => { const i = DAYS_TH.indexOf(d); return i >= 0 ? DAYS_TH_SHORT[i] : d; })
    .join(',');
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
  const titles = {
    calendar: 'ปฏิทินปฏิบัติงาน', employees: 'ข้อมูลพนักงาน',
    holidays: 'วันหยุดนักขัตฤกษ์', duties: 'หน้าที่และอัตรากำลัง',
    ot: 'จัดตารางปฏิบัติงาน'
  };

  // sidebar/bottom-nav highlights — ot maps visually to calendar
  const navPage = page === 'ot' ? 'calendar' : page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === navPage));
  document.querySelectorAll('.bottom-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === navPage));

  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === 'page-' + page));
  document.getElementById('page-title').textContent = titles[page] || page;

  closeSidebar();
  const renders = {
    calendar: renderCalendar, employees: renderEmployees,
    holidays: renderHolidays, duties: renderDuties, ot: renderOTPage,
    report: renderReport
  };
  if (renders[page]) renders[page]();
}

function openOTPage(dateStr) {
  S.selectedDate = dateStr;
  navigate('ot');
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
function setCalView(view) {
  S.calView = view;
  renderCalendar();
}

function renderCalendar() {
  const { year, month, calView } = S;
  const toolbar = `
    <div class="cal-toolbar">
      <div class="calendar-header" style="margin:0">
        <button class="btn-icon" onclick="changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
        <h2>${MONTHS_TH[month-1]} ${year+543}</h2>
        <button class="btn-icon" onclick="changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="cal-view-toggle">
        <button class="cal-view-btn ${calView==='month'?'active':''}" onclick="setCalView('month')" title="ปฏิทิน">
          <i class="fas fa-calendar-days"></i>
        </button>
        <button class="cal-view-btn ${calView==='cards'?'active':''}" onclick="setCalView('cards')" title="การ์ด">
          <i class="fas fa-table-cells-large"></i>
        </button>
      </div>
    </div>`;

  const body = calView === 'cards' ? renderCalendarCardView(year, month) : renderCalendarGrid(year, month);
  document.getElementById('calendar-content').innerHTML = toolbar + body;
}

function renderCalendarGrid(year, month) {
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = isoDate(new Date());

  const holMap = {};
  S.holidays.forEach(h => { holMap[h.date] = h; });
  const schMap = {};
  S.schedule.forEach(s => { schMap[s.date] = (schMap[s.date] || 0) + 1; });

  let html = `<div class="cal-grid">
    ${DAYS_TH.map(d => `<div class="cal-dow">${d.slice(0,3)}</div>`).join('')}`;

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const dow     = new Date(dateStr + 'T00:00:00').getDay();
    const hol     = holMap[dateStr];
    const cnt     = schMap[dateStr] || 0;
    const isToday = dateStr === today;

    let cls = 'cal-cell';
    if (dow === 0 || dow === 6) cls += ' weekend';
    if (hol)     cls += ' holiday';
    if (isToday) cls += ' today';

    html += `
      <div class="${cls}" onclick="openOTPage('${dateStr}')">
        <div class="cal-day">${day}</div>
        ${hol ? `<div class="cal-hol-name">${esc(hol.name)}</div>` : ''}
        ${cnt  ? `<div class="cal-sch-count">${cnt} คน</div>` : ''}
      </div>`;
  }

  return html + '</div>';
}

function renderCalendarCardView(year, month) {
  const today  = isoDate(new Date());
  const holMap = {};
  S.holidays.forEach(h => { holMap[h.date] = h; });

  // Group schedule by date — only days that have entries
  const schedByDate = {};
  S.schedule.forEach(s => {
    if (!schedByDate[s.date]) schedByDate[s.date] = [];
    schedByDate[s.date].push(s);
  });

  const prefix      = year + '-' + String(month).padStart(2,'0');
  const activeDates = Object.keys(schedByDate)
    .filter(d => d.startsWith(prefix))
    .sort();

  if (activeDates.length === 0) {
    return `<div class="empty-state" style="padding:60px 20px;text-align:center">
      <i class="fas fa-calendar-xmark" style="font-size:40px;color:var(--border);display:block;margin-bottom:14px"></i>
      <p style="font-weight:700">ยังไม่มีรายการปฏิบัติงานในเดือนนี้</p>
      <p style="font-size:13px;color:var(--text-muted);margin-top:6px">
        สลับไปมุมมอง <i class="fas fa-calendar-days"></i> แล้วคลิกวันที่ต้องการจัด
      </p>
    </div>`;
  }

  let html = '<div class="day-cards-grid-lg">';

  activeDates.forEach(dateStr => {
    const daySchedule = schedByDate[dateStr];
    const d           = new Date(dateStr + 'T00:00:00');
    const dow         = d.getDay();
    const hol         = holMap[dateStr];
    const isWeekend   = dow === 0 || dow === 6;
    const isToday     = dateStr === today;

    // Group entries by duty
    const byDuty = {};
    daySchedule.forEach(s => {
      if (!byDuty[s.duty_id]) byDuty[s.duty_id] = [];
      byDuty[s.duty_id].push(s);
    });

    let cls = 'day-card';
    if (isWeekend) cls += ' day-card-weekend';
    if (hol)       cls += ' day-card-holiday';
    if (isToday)   cls += ' day-card-today';

    // Duty sections with all employee names
    const dutySections = S.duties
      .filter(duty => byDuty[duty.id]?.length)
      .map(duty => {
        const entries = byDuty[duty.id];
        const pills   = entries.map(s => {
          const emp  = S.employees.find(e => e.id === s.emp_id);
          const name = emp ? `${emp.first_name} ${emp.last_name}` : s.emp_id;
          const dl   = emp ? empDayOffLabel(emp) : '';
          return `<span class="emp-name-pill">
            ${esc(name)}${dl ? `<span class="dayoff-mini" style="margin-left:4px">${esc(dl)}</span>` : ''}
          </span>`;
        }).join('');
        return `
          <div class="duty-section">
            <div class="duty-section-header">
              <span class="duty-badge-id" style="font-size:9px">${esc(duty.id)}</span>
              <span class="duty-section-name">${esc(duty.name)}</span>
              <span class="duty-section-count">${entries.length} คน</span>
            </div>
            <div class="emp-name-pills">${pills}</div>
          </div>`;
      }).join('');

    html += `
      <div class="${cls}" onclick="openOTPage('${dateStr}')">
        <div class="day-card-header-lg">
          <div style="display:flex;align-items:baseline;gap:10px">
            <span class="day-card-num-lg">${d.getDate()}</span>
            <div>
              <div class="day-card-dow-lg">วัน${DAYS_TH[dow]}</div>
              <div class="day-card-mon-lg">${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            ${hol ? `<span class="badge badge-holiday" style="font-size:11px">${esc(hol.name)}</span>` : ''}
            <span class="day-card-total-badge">${daySchedule.length} ราย</span>
          </div>
        </div>
        <div class="day-card-body-lg">${dutySections}</div>
      </div>`;
  });

  return html + '</div>';
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
    const workTime = emp.work_start && emp.work_end
      ? esc(emp.work_start.slice(0,5)) + '–' + esc(emp.work_end.slice(0,5))
      : '—';
    return `
      <tr>
        <td>${esc(emp.id)}</td>
        <td><strong>${esc(emp.first_name)} ${esc(emp.last_name)}</strong></td>
        <td>${esc(emp.position)}</td>
        <td>${esc(emp.day_off1)}${emp.day_off2 ? ', ' + esc(emp.day_off2) : ''}</td>
        <td>${workTime}</td>
        <td><span class="badge ${emp.contract_type === 'จ้างเหมา' ? 'badge-contract' : ''}">${esc(emp.contract_type)}</span></td>
        <td>${dutyNames}</td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" data-id="${esc(emp.id)}" onclick="openEmpModal(this.dataset.id)">แก้ไข</button>
          <button class="btn btn-sm btn-danger"    data-id="${esc(emp.id)}" onclick="deleteEmp(this.dataset.id)">ลบ</button>
        </td>
      </tr>`;
  }).join('');

  document.getElementById('emp-content').innerHTML = `
    <div class="page-header">
      <h2>ข้อมูลพนักงาน (${S.employees.length} คน)</h2>
      <div class="btn-group">
        <button class="btn btn-outline" onclick="renderEmployeeDashboard()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          Dashboard
        </button>
        <button class="btn btn-outline" onclick="downloadTemplate()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Template CSV
        </button>
        <button class="btn btn-outline" onclick="triggerImport()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          นำเข้า CSV
        </button>
        <button class="btn btn-primary" onclick="openEmpModal()">+ เพิ่มพนักงาน</button>
      </div>
    </div>
    <input type="file" id="csv-file-input" accept=".xlsx,.xls" style="display:none" onchange="handleCSVFile(event)">
    <div class="search-bar">
      <input class="form-input" id="emp-search" placeholder="ค้นหาชื่อหรือรหัส..." oninput="filterTable('emp-table',this.value)">
    </div>
    <div class="table-wrap">
      <table class="data-table" id="emp-table">
        <thead>
          <tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>วันหยุด</th><th>เวลาทำงาน</th><th>ประเภท</th><th>หน้าที่</th><th></th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8" class="empty-state">ยังไม่มีข้อมูลพนักงาน</td></tr>'}</tbody>
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

        <div class="form-section-label">เวลาทำงาน</div>
        <div class="form-grid">
          <div class="form-group">
            <label>เวลาเริ่มงาน</label>
            <input type="time" class="form-input" id="ef-work-start"
              value="${emp && emp.work_start ? emp.work_start.slice(0,5) : '08:00'}">
          </div>
          <div class="form-group">
            <label>เวลาเลิกงาน</label>
            <input type="time" class="form-input" id="ef-work-end"
              value="${emp && emp.work_end ? emp.work_end.slice(0,5) : '17:00'}">
          </div>
          <div class="form-group">
            <label>เวลาพักเริ่ม</label>
            <input type="time" class="form-input" id="ef-break-start"
              value="${emp && emp.break_start ? emp.break_start.slice(0,5) : '12:00'}">
          </div>
          <div class="form-group">
            <label>เวลาพักสิ้นสุด</label>
            <input type="time" class="form-input" id="ef-break-end"
              value="${emp && emp.break_end ? emp.break_end.slice(0,5) : '13:00'}">
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
    work_start:    document.getElementById('ef-work-start').value || '08:00',
    work_end:      document.getElementById('ef-work-end').value   || '17:00',
    break_start:   document.getElementById('ef-break-start').value || '12:00',
    break_end:     document.getElementById('ef-break-end').value   || '13:00',
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
        <button class="btn btn-sm btn-secondary" data-date="${h.date}" onclick="openHolModal(this.dataset.date)">แก้ไข</button>
        <button class="btn btn-sm btn-danger"    data-date="${h.date}" onclick="deleteHol(this.dataset.date)">ลบ</button>
      </td>
    </tr>`).join('');

  document.getElementById('hol-content').innerHTML = `
    <div class="page-header">
      <h2>วันหยุดนักขัตฤกษ์</h2>
      <div class="btn-group">
        <button class="btn btn-outline" onclick="openMultiHolModal()">+ เพิ่มหลายวัน</button>
        <button class="btn btn-primary" onclick="openHolModal()">+ เพิ่มวันเดียว</button>
      </div>
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
        <button class="btn btn-sm btn-secondary" data-id="${esc(d.id)}" onclick="openDutyModal(this.dataset.id)">แก้ไข</button>
        <button class="btn btn-sm btn-danger"    data-id="${esc(d.id)}" onclick="deleteDutyItem(this.dataset.id)">ลบ</button>
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
// Work Time Config (localStorage)
// ============================================================

const WORK_TIME_KEY = 'ot_work_time';
const DEFAULT_WORK_TIME = [
  { name: 'รับฝาก',                       start: '09.00', end: '12.00', bStart: '',      bEnd: '' },
  { name: 'ปฏิบัติงาน ขาเข้า – ขาออก',    start: '10.30', end: '13.30', bStart: '',      bEnd: '' },
  { name: 'นำจ่าย',                        start: '09.30', end: '17.00', bStart: '12.00', bEnd: '13.00' },
];

function getWorkTimeConfig() {
  try { return JSON.parse(localStorage.getItem(WORK_TIME_KEY)) || DEFAULT_WORK_TIME; }
  catch(e) { return DEFAULT_WORK_TIME; }
}

function saveWorkTimeConfig() {
  const rows = document.querySelectorAll('.wt-row');
  const cfg  = [...rows].map(r => ({
    name:   r.querySelector('.wt-name').value.trim(),
    start:  r.querySelector('.wt-start').value.trim(),
    end:    r.querySelector('.wt-end').value.trim(),
    bStart: r.querySelector('.wt-bstart').value.trim(),
    bEnd:   r.querySelector('.wt-bend').value.trim(),
  })).filter(r => r.name);
  localStorage.setItem(WORK_TIME_KEY, JSON.stringify(cfg));
  toast('บันทึกตารางเวลาสำเร็จ');
}

function _workTimeTableHTML(cfg) {
  return cfg.map((wt, i) => `
    <tr class="wt-row">
      <td><input class="form-input wt-name"  value="${esc(wt.name)}"  placeholder="ชื่องาน"></td>
      <td><input class="form-input wt-start" value="${esc(wt.start)}" placeholder="09.00" style="width:70px"></td>
      <td><input class="form-input wt-end"   value="${esc(wt.end)}"   placeholder="17.00" style="width:70px"></td>
      <td><input class="form-input wt-bstart" value="${esc(wt.bStart)}" placeholder="12.00" style="width:70px"></td>
      <td><input class="form-input wt-bend"   value="${esc(wt.bEnd)}"   placeholder="13.00" style="width:70px"></td>
      <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">
        <i class="fas fa-times"></i>
      </button></td>
    </tr>`).join('');
}

function addWorkTimeRow() {
  const tbody = document.getElementById('wt-tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.className = 'wt-row';
  tr.innerHTML = `
    <td><input class="form-input wt-name" placeholder="ชื่องาน"></td>
    <td><input class="form-input wt-start" placeholder="09.00" style="width:70px"></td>
    <td><input class="form-input wt-end"   placeholder="17.00" style="width:70px"></td>
    <td><input class="form-input wt-bstart" placeholder="12.00" style="width:70px"></td>
    <td><input class="form-input wt-bend"   placeholder="13.00" style="width:70px"></td>
    <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">
      <i class="fas fa-times"></i>
    </button></td>`;
  tbody.appendChild(tr);
}

// ============================================================
// Report Page
// ============================================================

function renderReport() {
  document.getElementById('report-content').innerHTML = `
    <div class="page-header" style="margin-bottom:0">
      <h2>รายงาน OT</h2>
    </div>
    <div class="report-tabs">
      <button class="report-tab active" id="tab-summary" onclick="switchReportTab('summary')">
        <i class="fas fa-chart-bar"></i> ภาพรวม OT
      </button>
      <button class="report-tab" id="tab-monthly" onclick="switchReportTab('monthly')">
        <i class="fas fa-file-lines"></i> รายงานประจำเดือน
      </button>
    </div>
    <div id="report-tab-body"></div>
  `;
  switchReportTab('summary');
}

function switchReportTab(tab) {
  document.querySelectorAll('.report-tab').forEach(el =>
    el.classList.toggle('active', el.id === 'tab-' + tab));
  if (tab === 'summary') renderOTSummaryTab();
  else renderMonthlyReportTab();
}

// ─── OT Summary Tab ────────────────────────────────────────

function renderOTSummaryTab() {
  const now  = new Date();
  const year = now.getFullYear();
  const mon  = now.getMonth() + 1;

  document.getElementById('report-tab-body').innerHTML = `
    <div class="report-filter">
      <div class="filter-group">
        <label>ปี</label>
        <select id="rpt-year" class="form-select">
          ${[year-1, year, year+1].map(y =>
            `<option value="${y}" ${y===year?'selected':''}>${y+543}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <label>เดือน</label>
        <select id="rpt-month" class="form-select">
          <option value="0">ทั้งปี</option>
          ${MONTHS_TH.map((m,i) =>
            `<option value="${i+1}" ${i+1===mon?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="loadOTSummary()">
        <i class="fas fa-magnifying-glass"></i> ค้นหา
      </button>
    </div>
    <div id="ot-summary-cards" class="ot-summary-grid">
      <div class="empty-state">เลือกช่วงเวลาแล้วกด "ค้นหา" ครับ</div>
    </div>`;
}

async function loadOTSummary() {
  const year  = parseInt(document.getElementById('rpt-year').value);
  const month = parseInt(document.getElementById('rpt-month').value);

  const startDate = month === 0
    ? `${year}-01-01`
    : `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate   = month === 0
    ? `${year}-12-31`
    : isoDate(new Date(year, month, 0));

  showLoading(true);
  try {
    const { data, error } = await db.from('schedule').select('*').gte('date', startDate).lte('date', endDate);
    if (error) throw error;

    const stats = {};
    S.employees.forEach(emp => { stats[emp.id] = { emp, days: new Set(), byDuty: {} }; });
    (data || []).forEach(s => {
      if (!stats[s.emp_id]) return;
      stats[s.emp_id].days.add(s.date);
      stats[s.emp_id].byDuty[s.duty_id] = (stats[s.emp_id].byDuty[s.duty_id] || 0) + 1;
    });

    const sorted = Object.values(stats)
      .filter(e => e.days.size > 0)
      .sort((a, b) => b.days.size - a.days.size);

    const periodLabel = month === 0
      ? `ปี พ.ศ. ${year+543}`
      : `${MONTHS_TH[month-1]} ${year+543}`;

    const maxDays = sorted[0]?.days.size || 1;

    const cards = sorted.map(({ emp, days, byDuty }) => {
      const totalDays = days.size;
      const totalOcc  = Object.values(byDuty).reduce((a,b) => a+b, 0);

      const dutyBars = S.duties.filter(d => byDuty[d.id]).map(d => {
        const cnt = byDuty[d.id];
        const pct = Math.round((cnt / totalOcc) * 100);
        return `
          <div class="ot-duty-stat">
            <span class="duty-badge-id" style="font-size:9px">${esc(d.id)}</span>
            <span class="ot-duty-stat-name">${esc(d.name)}</span>
            <div class="ot-duty-stat-bar">
              <div class="ot-duty-stat-fill" style="width:${pct}%"></div>
            </div>
            <span class="ot-duty-stat-cnt">${cnt}</span>
          </div>`;
      }).join('');

      return `
        <div class="ot-summary-card">
          <div class="ot-summary-header">
            <div class="emp-avatar" style="width:42px;height:42px;font-size:17px;flex-shrink:0">
              ${esc((emp.first_name||'?')[0])}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px">${esc(emp.first_name)} ${esc(emp.last_name)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${esc(emp.position)||'—'}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="ot-big-num">${totalDays}</div>
              <div class="ot-big-unit">วัน OT</div>
            </div>
          </div>
          <div class="ot-period-label">
            <i class="fas fa-calendar-check fa-xs"></i>
            ${totalOcc} ครั้ง / ${periodLabel}
          </div>
          <div>${dutyBars}</div>
        </div>`;
    }).join('');

    document.getElementById('ot-summary-cards').innerHTML = cards ||
      '<div class="empty-state">ไม่มีข้อมูล OT ในช่วงเวลานี้</div>';

  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ─── Monthly Report Tab ────────────────────────────────────

function renderMonthlyReportTab() {
  const now  = new Date();
  const year = now.getFullYear();
  const mon  = now.getMonth() + 1;
  const cfg  = getWorkTimeConfig();

  document.getElementById('report-tab-body').innerHTML = `
    <div class="report-filter">
      <div class="filter-group">
        <label>ปี</label>
        <select id="mrt-year" class="form-select">
          ${[year-1, year, year+1].map(y =>
            `<option value="${y}" ${y===year?'selected':''}>${y+543}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <label>เดือน</label>
        <select id="mrt-month" class="form-select">
          ${MONTHS_TH.map((m,i) =>
            `<option value="${i+1}" ${i+1===mon?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <label>หน่วยงาน / องค์กร</label>
        <input class="form-input" id="mrt-org" placeholder="ชื่อหน่วยงาน" style="min-width:200px"
          value="${localStorage.getItem('ot_org_name')||''}">
      </div>
      <button class="btn btn-primary" onclick="generateMonthlyReport()">
        <i class="fas fa-print"></i> สร้างและพิมพ์
      </button>
    </div>

    <div class="table-wrap" style="margin-bottom:8px">
      <div style="padding:12px 16px;font-weight:700;font-size:13px;border-bottom:1px solid var(--border);background:#fafafa;display:flex;align-items:center;gap:10px">
        <i class="fas fa-clock"></i> ตารางเวลาปฏิบัติงาน (แก้ไขได้)
        <button class="btn btn-sm btn-outline" onclick="addWorkTimeRow()" style="margin-left:auto">
          <i class="fas fa-plus"></i> เพิ่มแถว
        </button>
        <button class="btn btn-sm btn-primary" onclick="saveWorkTimeConfig()">
          <i class="fas fa-floppy-disk"></i> บันทึก
        </button>
      </div>
      <div style="padding:12px 16px">
        <table class="work-time-table">
          <thead>
            <tr>
              <th style="text-align:left;width:35%">ปฏิบัติงาน</th>
              <th style="width:13%">เริ่ม</th>
              <th style="width:13%">สิ้นสุด</th>
              <th style="width:13%">พักเริ่ม</th>
              <th style="width:13%">พักสิ้นสุด</th>
              <th style="width:8%"></th>
            </tr>
          </thead>
          <tbody id="wt-tbody">${_workTimeTableHTML(cfg)}</tbody>
        </table>
      </div>
    </div>`;
}

async function generateMonthlyReport() {
  const year    = parseInt(document.getElementById('mrt-year').value);
  const month   = parseInt(document.getElementById('mrt-month').value);
  const orgName = document.getElementById('mrt-org').value.trim();
  localStorage.setItem('ot_org_name', orgName);

  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = isoDate(new Date(year, month, 0));

  showLoading(true);
  try {
    const { data, error } = await db.from('schedule').select('*')
      .gte('date', start).lte('date', end).order('date').order('duty_id');
    if (error) throw error;
    if (!data?.length) { toast('ไม่มีข้อมูล OT ในเดือนนี้', 'error'); return; }

    const html = buildReportHTML(data, orgName, year, month);
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 1200);
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

function buildReportHTML(schedData, orgName, year, month) {
  const cfg       = getWorkTimeConfig();
  const monthName = MONTHS_TH[month - 1];
  const yearTH    = year + 543;

  const byDate = {};
  schedData.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });
  const sortedDates = Object.keys(byDate).sort();

  // Build reusable time table rows
  const timeRows = cfg.map(wt => `
    <tr>
      <td>${wt.name}</td>
      <td class="tc">${wt.start} – ${wt.end} น.</td>
      <td class="tc">${wt.bStart && wt.bEnd ? wt.bStart + ' – ' + wt.bEnd + ' น.' : ''}</td>
    </tr>`).join('');

  const sections = sortedDates.map((dateStr, idx) => {
    const daySched  = byDate[dateStr];
    const d         = new Date(dateStr + 'T00:00:00');
    const dayName   = DAYS_TH[d.getDay()];
    const dayNum    = d.getDate();

    // Sort by duty, then name
    daySched.sort((a, b) => {
      if (a.duty_id !== b.duty_id) return a.duty_id < b.duty_id ? -1 : 1;
      const ea = S.employees.find(e => e.id === a.emp_id);
      const eb = S.employees.find(e => e.id === b.emp_id);
      const na = ea ? ea.first_name : '';
      const nb = eb ? eb.first_name : '';
      return na < nb ? -1 : 1;
    });

    const empRows = daySched.map((s, i) => {
      const emp  = S.employees.find(e => e.id === s.emp_id);
      const duty = S.duties.find(d => d.id === s.duty_id);
      if (!emp) return '';
      const daysOff = [emp.day_off1, emp.day_off2].filter(Boolean).join(' – ');
      return `<tr>
        <td class="tc">${i + 1}</td>
        <td>${emp.first_name} ${emp.last_name}</td>
        <td class="tc">${daysOff}</td>
        <td>${emp.position || ''}</td>
        <td class="tc">${duty ? duty.name : s.duty_id}</td>
        <td class="sig"></td>
      </tr>`;
    }).join('');

    // First section: no forced break. Subsequent: break before.
    const breakClass = idx > 0 ? ' class="page-break"' : '';

    return `
      <div${breakClass}>
        <p class="day-heading">${idx + 1}.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ปฏิบัติงานใน วัน${dayName} ที่ ${dayNum} เดือน ${monthName} ${yearTH} จำนวน ${daySched.length} ราย ดังนี้</p>
        <table class="emp-table">
          <thead>
            <tr>
              <th class="col-no">ลำดับที่</th>
              <th class="col-name">ชื่อ – นามสกุล</th>
              <th class="col-dayoff">วันหยุดประจำสัปดาห์</th>
              <th class="col-pos">ตำแหน่ง</th>
              <th class="col-duty">ปฏิบัติงาน</th>
              <th class="col-sig">ลงนามรับทราบ</th>
            </tr>
          </thead>
          <tbody>${empRows}</tbody>
        </table>
        <p class="time-label">เวลาปฏิบัติงาน</p>
        <table class="time-table">
          <thead>
            <tr><th class="col-tname">ปฏิบัติงาน</th><th class="col-tw">เวลา</th><th class="col-tw">พัก</th></tr>
          </thead>
          <tbody>${timeRows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>รายงาน OT ${monthName} ${yearTH}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    /* ── Reset ──────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Base ───────────────────────────── */
    body {
      font-family: 'Sarabun', sans-serif;
      font-size: 13pt;
      color: #000;
      background: #fff;
    }

    /* ── Page setup ─────────────────────── */
    @page {
      size: A4 portrait;
      margin: 18mm 20mm 20mm 20mm;
    }

    /* ── Screen wrapper (preview before print) ── */
    .page-wrap {
      max-width: 170mm;
      margin: 0 auto;
      padding: 18mm 0;
    }

    /* ── Header ─────────────────────────── */
    .rpt-header  { text-align: center; margin-bottom: 24px; }
    .rpt-org     { font-size: 15pt; font-weight: 700; margin-bottom: 4px; }
    .rpt-title   { font-size: 14pt; font-weight: 700; }

    /* ── Day sections ───────────────────── */
    .page-break  { break-before: page; page-break-before: always; }
    .day-heading { font-size: 13pt; margin-bottom: 10px; line-height: 1.6; }

    /* ── Employee table ─────────────────── */
    .emp-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 11.5pt;
      table-layout: fixed;
    }

    /* Repeat header on every new page */
    .emp-table thead { display: table-header-group; }
    .emp-table tfoot { display: table-footer-group; }

    .emp-table th, .emp-table td {
      border: 1px solid #000;
      padding: 5px 7px;
      vertical-align: middle;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .emp-table th { background: #f2f2f2; font-weight: 700; text-align: center; }

    /* Don't break a row across pages */
    .emp-table tr { page-break-inside: avoid; break-inside: avoid; }

    /* Signature cell — tall enough to sign */
    .sig { height: 40px; }

    /* Column widths (total ≈ 170mm) */
    .col-no     { width: 8%; }
    .col-name   { width: 26%; }
    .col-dayoff { width: 14%; }
    .col-pos    { width: 18%; }
    .col-duty   { width: 14%; }
    .col-sig    { width: 20%; }

    /* ── Time table ─────────────────────── */
    .time-label { font-weight: 700; margin-bottom: 6px; font-size: 12pt; margin-top: 4px; }

    .time-table {
      width: 62%;
      border-collapse: collapse;
      font-size: 11pt;
      table-layout: fixed;
      margin-bottom: 24px;
    }
    .time-table thead { display: table-header-group; }
    .time-table tr    { page-break-inside: avoid; break-inside: avoid; }
    .time-table th, .time-table td {
      border: 1px solid #000;
      padding: 4px 8px;
      vertical-align: middle;
    }
    .time-table th { background: #f2f2f2; font-weight: 700; text-align: center; }

    .col-tname { width: 50%; }
    .col-tw    { width: 25%; }

    /* ── Utilities ──────────────────────── */
    .tc { text-align: center; }

    /* ── Print overrides ────────────────── */
    @media print {
      .page-wrap { max-width: 100%; padding: 0; }
      body { font-size: 12pt; }
      .emp-table { font-size: 11pt; }
      .time-table { font-size: 10.5pt; }
    }
  </style>
</head>
<body>
  <div class="page-wrap">
    <div class="rpt-header">
      ${orgName ? `<div class="rpt-org">${orgName}</div>` : ''}
      <div class="rpt-title">รายละเอียดเรียกตัวมาปฏิบัติงาน ดังนี้</div>
    </div>
    ${sections}
  </div>
  <script>
    // Wait for Google Fonts to load before printing
    document.fonts.ready.then(function() {
      setTimeout(function() { window.print(); }, 500);
    });
  </script>
</body>
</html>`;
}

// ============================================================
// Employee Dashboard
// ============================================================

function renderEmployeeDashboard() {
  const dutyMap = {};
  S.duties.forEach(d => { dutyMap[d.id] = { ...d, emps: [] }; });
  S.employees.forEach(emp => {
    (emp.duties || []).forEach(did => { if (dutyMap[did]) dutyMap[did].emps.push(emp); });
  });
  const noDuty = S.employees.filter(e => !(e.duties || []).length);

  const cards = S.duties.map(d => {
    const emps = dutyMap[d.id].emps;
    return `
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <span class="duty-badge-id">${esc(d.id)}</span>
          <h3>${esc(d.name)}</h3>
          <span class="dashboard-count">${emps.length}</span>
        </div>
        <div class="dashboard-emp-list">
          ${emps.length ? emps.map(emp => `
            <div class="dashboard-emp-row" data-id="${esc(emp.id)}" onclick="openEmpModal(this.dataset.id)">
              <div class="emp-avatar">${esc(emp.first_name[0] || '?')}</div>
              <div class="dashboard-emp-info">
                <div class="dashboard-emp-name">${esc(emp.first_name)} ${esc(emp.last_name)}</div>
                <div class="dashboard-emp-pos">${esc(emp.position) || '—'}</div>
              </div>
            </div>`).join('')
          : '<p class="card-empty" style="padding:8px 4px">ยังไม่มีพนักงาน</p>'}
        </div>
      </div>`;
  }).join('');

  const noDutyCard = noDuty.length ? `
    <div class="dashboard-card">
      <div class="dashboard-card-header">
        <h3 style="color:var(--text-muted)">ยังไม่ได้กำหนดหน้าที่</h3>
        <span class="dashboard-count" style="background:var(--text-muted)">${noDuty.length}</span>
      </div>
      <div class="dashboard-emp-list">
        ${noDuty.map(emp => `
          <div class="dashboard-emp-row" data-id="${esc(emp.id)}" onclick="openEmpModal(this.dataset.id)">
            <div class="emp-avatar" style="background:var(--text-muted)">${esc(emp.first_name[0] || '?')}</div>
            <div class="dashboard-emp-info">
              <div class="dashboard-emp-name">${esc(emp.first_name)} ${esc(emp.last_name)}</div>
              <div class="dashboard-emp-pos">${esc(emp.position) || '—'}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  document.getElementById('emp-content').innerHTML = `
    <div class="page-header">
      <h2>Dashboard พนักงาน</h2>
      <button class="btn btn-outline" onclick="renderEmployees()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        รายชื่อ
      </button>
    </div>
    <div class="dashboard-grid">${cards}${noDutyCard}</div>
  `;
}

// ============================================================
// Multi-holiday Modal
// ============================================================

let _holRowIdx = 0;

function _holRowHTML(i) {
  return `
    <div class="multi-hol-row" id="hrow-${i}">
      <div class="form-group">
        <label>วันที่ *</label>
        <input type="date" class="form-input" id="mhd-${i}">
      </div>
      <div class="form-group">
        <label>ชื่อวันหยุด *</label>
        <input class="form-input" id="mhn-${i}" placeholder="เช่น วันสงกรานต์">
      </div>
      <div class="form-group">
        <label>ประเภท</label>
        <select class="form-select" id="mht-${i}">
          <option>นักขัตฤกษ์</option><option>ประเพณี</option><option>ชดเชย</option>
        </select>
      </div>
      <button class="btn btn-sm btn-danger" style="margin-bottom:14px" data-row="${i}" onclick="removeHolRow(this.dataset.row)">×</button>
    </div>`;
}

function openMultiHolModal() {
  _holRowIdx = 0;
  const html = `
    <div class="modal-header">
      <h3>เพิ่มวันหยุดหลายวัน</h3>
      <button class="btn-close" onclick="closeModal()">&#215;</button>
    </div>
    <div class="modal-body">
      <div class="multi-hol-rows" id="mhol-rows">${_holRowHTML(0)}</div>
      <button class="btn btn-outline" style="margin-bottom:12px" onclick="addHolRow()">+ เพิ่มวันหยุด</button>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
        <button class="btn btn-primary" onclick="saveMultiHolidays()">บันทึกทั้งหมด</button>
      </div>
    </div>`;
  openModal(html, true);
}

function addHolRow() {
  _holRowIdx++;
  document.getElementById('mhol-rows').insertAdjacentHTML('beforeend', _holRowHTML(_holRowIdx));
}

function removeHolRow(i) {
  const el = document.getElementById('hrow-' + i);
  if (el) el.remove();
}

async function saveMultiHolidays() {
  const rows = document.querySelectorAll('.multi-hol-row');
  const toSave = [];
  rows.forEach(row => {
    const i    = row.id.replace('hrow-', '');
    const date = document.getElementById('mhd-' + i)?.value;
    const name = document.getElementById('mhn-' + i)?.value.trim();
    const type = document.getElementById('mht-' + i)?.value || 'นักขัตฤกษ์';
    if (date && name) toSave.push({ date, name, type, ref_date: null, note: '' });
  });

  if (!toSave.length) { toast('กรุณาระบุวันที่และชื่อวันหยุดอย่างน้อย 1 รายการ', 'error'); return; }

  const existing = new Set(S.holidays.map(h => h.date));
  const dups = toSave.filter(h => existing.has(h.date));
  if (dups.length) { toast('วันที่ซ้ำ: ' + dups.map(d => d.date).join(', '), 'error'); return; }

  showLoading(true);
  try {
    const { error } = await db.from('public_holidays').insert(toSave);
    if (error) throw error;
    const { data: all, error: e2 } = await db.from('public_holidays').select('*').order('date');
    if (e2) throw e2;
    S.holidays = all;
    toast('เพิ่มวันหยุด ' + toSave.length + ' รายการสำเร็จ');
    closeModal();
    renderHolidays();
    renderCalendar();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

// ============================================================
// OT Scheduling Page
// ============================================================

async function renderOTPage() {
  const dateStr = S.selectedDate;
  if (!dateStr) { navigate('calendar'); return; }

  const el = document.getElementById('ot-content');
  el.innerHTML = '<div class="empty-state">กำลังโหลด...</div>';

  showLoading(true);
  try {
    const { data: quotas, error: qErr } = await db.from('quotas').select('*').eq('date', dateStr);
    if (qErr) throw qErr;

    const daySchedule = S.schedule.filter(s => s.date === dateStr);
    const holiday     = S.holidays.find(h => h.date === dateStr);
    const dow         = dowTH(dateStr);

    const qMap = {};
    (quotas || []).forEach(q => { qMap[q.duty_id] = q.count; });

    const schedByDuty = {};
    daySchedule.forEach(s => {
      if (!schedByDuty[s.duty_id]) schedByDuty[s.duty_id] = [];
      schedByDuty[s.duty_id].push(s);
    });

    const assignedSet = new Set(daySchedule.map(s => s.emp_id));
    const avMap = {};
    S.employees.forEach(emp => { avMap[emp.id] = empAvailable(emp, dateStr); });

    // ─── Header ────────────────────────────────────────────
    let html = `
      <div class="ot-header">
        <button class="btn-back" onclick="navigate('calendar')">
          <i class="fas fa-arrow-left"></i> ปฏิทิน
        </button>
        <div class="ot-title">
          <h2>${dateTH(dateStr)}</h2>
          <span class="ot-dow">(วัน${dow})</span>
          ${holiday ? `<span class="badge badge-holiday">${esc(holiday.name)}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-accent" data-date="${dateStr}" onclick="runAutoOT(this.dataset.date)">
          <i class="fas fa-bolt"></i> จัดอัตโนมัติ
        </button>
      </div>

      <div class="quota-strip">
        <span class="quota-strip-label">อัตรากำลัง</span>
        ${S.duties.map(d => `
          <div class="quota-item">
            <label>${esc(d.name)}</label>
            <div class="quota-input-group">
              <button class="quota-btn" data-duty="${esc(d.id)}" onclick="adjustQuota(this.dataset.duty,-1)">
                <i class="fas fa-minus"></i>
              </button>
              <input type="number" class="quota-num-input" id="q-${esc(d.id)}"
                value="${qMap[d.id] || 0}" min="0">
              <button class="quota-btn" data-duty="${esc(d.id)}" onclick="adjustQuota(this.dataset.duty,1)">
                <i class="fas fa-plus"></i>
              </button>
            </div>
          </div>`).join('')}
        <button class="btn btn-primary btn-sm" data-date="${dateStr}" onclick="saveOTQuotas(this.dataset.date)">
          <i class="fas fa-floppy-disk"></i> บันทึกอัตรา
        </button>
      </div>

      <div class="duty-grid">`;

    // ─── Duty cards ─────────────────────────────────────────
    S.duties.forEach(duty => {
      const quota    = qMap[duty.id] || 0;
      const assigned = schedByDuty[duty.id] || [];
      const cnt      = assigned.length;
      const pct      = quota > 0 ? Math.min(100, Math.round((cnt / quota) * 100)) : 0;
      const full     = quota > 0 && cnt >= quota;
      const over     = cnt > quota && quota > 0;

      const fillClass = over ? 'quota-fill-over' : full ? 'quota-fill-ok' : 'quota-fill-warn';
      const cntClass  = over ? 'over' : full ? 'full' : 'short';
      let statusIcon, statusTxt;
      if (quota === 0) {
        statusIcon = '<i class="fas fa-minus-circle" style="color:var(--text-muted)"></i>';
        statusTxt  = 'ยังไม่กำหนดอัตรา';
      } else if (full && !over) {
        statusIcon = '<i class="fas fa-circle-check" style="color:var(--success)"></i>';
        statusTxt  = 'ครบแล้ว';
      } else if (over) {
        statusIcon = '<i class="fas fa-triangle-exclamation" style="color:var(--danger)"></i>';
        statusTxt  = `เกิน ${cnt - quota} คน`;
      } else {
        statusIcon = '<i class="fas fa-triangle-exclamation" style="color:var(--primary)"></i>';
        statusTxt  = `ขาด ${quota - cnt} คน`;
      }

      // ─── Assigned chips ────────────────────────────────
      const assignedChips = assigned.map(s => {
        const emp  = S.employees.find(e => e.id === s.emp_id);
        const name = emp ? `${esc(emp.first_name)} ${esc(emp.last_name)}` : esc(s.emp_id);
        const dl   = emp ? empDayOffLabel(emp) : '';
        return `<span class="emp-chip">
          ${name}${dl ? `<span class="dayoff-mini">${esc(dl)}</span>` : ''}
          <button class="chip-remove" data-id="${esc(s.id)}" data-date="${dateStr}"
            onclick="removeFromOT(this.dataset.id,this.dataset.date)">
            <i class="fas fa-times"></i>
          </button>
        </span>`;
      }).join('');

      // ─── Primary employees (have this duty, not assigned) ─
      const empInDuty = S.employees.filter(e =>
        !assignedSet.has(e.id) && (e.duties || []).includes(duty.id));

      const pillsHTML = quota === 0
        ? `<div class="quota-locked-msg">
            <i class="fas fa-lock"></i>
            กำหนดอัตรากำลังในแถบด้านบนก่อน แล้วกด "บันทึกอัตรา"
           </div>`
        : !full || over
          ? empInDuty.length
            ? empInDuty.map(emp => {
                const av = avMap[emp.id];
                const dl = empDayOffLabel(emp);
                const nameStr = `${esc(emp.first_name)} ${esc(emp.last_name)}`;
                if (!av.ok) {
                  return `<span class="emp-pill emp-pill-unavail" title="${esc(av.reason)}">
                    ${nameStr}
                    <span class="dayoff-mini dayoff-conflict">${esc(dl)}</span>
                  </span>`;
                }
                return `<button class="emp-pill emp-pill-avail"
                  data-date="${dateStr}" data-emp="${esc(emp.id)}" data-duty="${esc(duty.id)}"
                  onclick="addToOT(this.dataset.date,this.dataset.emp,this.dataset.duty)">
                  <i class="fas fa-plus fa-xs"></i> ${nameStr}
                  ${dl ? `<span class="dayoff-mini">${esc(dl)}</span>` : ''}
                </button>`;
              }).join('')
            : `<span class="card-empty">ไม่มีพนักงานที่มีหน้าที่นี้เหลืออยู่</span>`
          : `<span class="card-empty" style="color:var(--success)">
               <i class="fas fa-circle-check"></i> จัดครบแล้ว
             </span>`;

      // ─── Cross-duty employees (override section) ──────────
      // All unassigned employees NOT (having this duty AND available in main)
      const empCross = S.employees.filter(e => {
        if (assignedSet.has(e.id)) return false;
        const hasDuty = (e.duties || []).includes(duty.id);
        const isAvail = avMap[e.id].ok;
        // Skip if already shown as green pill in primary section
        return !(hasDuty && isAvail);
      });

      const crossHTML = empCross.map(emp => {
        const av  = avMap[emp.id];
        const dl  = empDayOffLabel(emp);
        const nameStr = `${esc(emp.first_name)} ${esc(emp.last_name)}`;
        if (!av.ok) {
          return `<button class="emp-pill emp-pill-warn"
            data-date="${dateStr}" data-emp="${esc(emp.id)}" data-duty="${esc(duty.id)}"
            onclick="addToOT(this.dataset.date,this.dataset.emp,this.dataset.duty)"
            title="จัดแบบข้ามเงื่อนไข — ${esc(av.reason)}">
            <i class="fas fa-plus fa-xs"></i> ${nameStr}
            <span class="dayoff-mini dayoff-conflict">${esc(dl)}</span>
          </button>`;
        }
        return `<button class="emp-pill emp-pill-cross"
          data-date="${dateStr}" data-emp="${esc(emp.id)}" data-duty="${esc(duty.id)}"
          onclick="addToOT(this.dataset.date,this.dataset.emp,this.dataset.duty)">
          <i class="fas fa-plus fa-xs"></i> ${nameStr}
          ${dl ? `<span class="dayoff-mini">${esc(dl)}</span>` : ''}
        </button>`;
      }).join('');

      html += `
        <div class="duty-card ${full && !over ? 'duty-card-full' : over ? 'duty-card-over' : ''}">
          <div class="duty-card-header">
            <div class="duty-card-title">
              <span class="duty-badge-id">${esc(duty.id)}</span>
              ${esc(duty.name)}
            </div>
            <div>
              <div class="quota-progress-wrap">
                <div class="quota-progress-fill ${fillClass}" style="width:${quota > 0 ? pct : 0}%"></div>
              </div>
              <div class="quota-meta">
                <span class="quota-count ${cntClass}">${cnt}${quota > 0 ? '/'+quota+' คน' : ' คน'}</span>
                <span class="quota-status-text">${statusIcon} ${statusTxt}</span>
              </div>
            </div>
          </div>

          ${assigned.length ? `
            <div class="card-section">
              <div class="card-section-label">กำลังปฏิบัติงาน</div>
              <div class="assigned-chips">${assignedChips}</div>
            </div>` : ''}

          <div class="card-section">
            <div class="card-section-label">เพิ่มผู้ปฏิบัติงาน (หน้าที่นี้)</div>
            <div class="emp-pills">${pillsHTML}</div>
          </div>

          <button class="btn-cross-toggle" id="cross-btn-${esc(duty.id)}"
            data-duty="${esc(duty.id)}" onclick="toggleCrossDuty(this.dataset.duty)">
            <i class="fas fa-chevron-down fa-xs" id="cross-icon-${esc(duty.id)}"></i>
            จัดข้ามหน้าที่
            <span style="font-size:11px;color:var(--text-muted);margin-left:4px">(ข้ามเงื่อนไขหน้าที่และวันหยุด)</span>
          </button>
          <div class="cross-duty-panel card-section" id="cross-${esc(duty.id)}">
            <div class="card-section-label" style="color:var(--warning)">
              <i class="fas fa-triangle-exclamation"></i>
              พนักงานทุกคนที่ยังไม่ได้จัด — คลิกเพื่อจัดแบบข้ามเงื่อนไข
            </div>
            <div class="emp-pills">
              ${crossHTML || `<span class="card-empty">ไม่มีพนักงานเหลือ</span>`}
            </div>
          </div>
        </div>`;
    });

    html += '</div>';
    el.innerHTML = html;

  } catch(e) {
    toast(e.message, 'error');
    el.innerHTML = `<div class="empty-state">โหลดข้อมูลไม่สำเร็จ
      <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="renderOTPage()">
        <i class="fas fa-rotate-right"></i> ลองใหม่
      </button></div>`;
  } finally {
    showLoading(false);
  }
}

function adjustQuota(dutyId, delta) {
  const inp = document.getElementById('q-' + dutyId);
  if (inp) inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
}

async function saveOTQuotas(dateStr) {
  const quotas = S.duties
    .map(d => ({ duty_id: d.id, count: parseInt(document.getElementById('q-' + d.id)?.value) || 0 }))
    .filter(q => q.count > 0);

  showLoading(true);
  try {
    await db.from('quotas').delete().eq('date', dateStr);
    if (quotas.length) {
      const { error } = await db.from('quotas').insert(quotas.map(q => ({ date: dateStr, ...q })));
      if (error) throw error;
    }
    toast('บันทึกอัตรากำลังสำเร็จ');
    await renderOTPage();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

async function addToOT(dateStr, empId, dutyId) {
  const emp = S.employees.find(e => e.id === empId);
  if (emp) {
    const av = empAvailable(emp, dateStr);
    if (!av.ok) { toast(`${emp.first_name}: ${av.reason}`, 'error'); return; }
  }
  if (S.schedule.some(s => s.date === dateStr && s.emp_id === empId && s.duty_id === dutyId)) {
    toast('พนักงานนี้ถูกจัดแล้ว', 'error'); return;
  }

  showLoading(true);
  try {
    const { error } = await db.from('schedule').insert({ date: dateStr, emp_id: empId, duty_id: dutyId, note: '', recorded_by: 'user' });
    if (error) throw error;
    await loadScheduleForMonth();
    await renderOTPage();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

async function removeFromOT(id, dateStr) {
  showLoading(true);
  try {
    const { error } = await db.from('schedule').delete().eq('id', id);
    if (error) throw error;
    S.schedule = S.schedule.filter(s => s.id !== id);
    await renderOTPage();
  } catch(e) { toast(e.message, 'error'); }
  finally    { showLoading(false); }
}

function toggleCrossDuty(dutyId) {
  const panel = document.getElementById('cross-' + dutyId);
  const btn   = document.getElementById('cross-btn-' + dutyId);
  const icon  = document.getElementById('cross-icon-' + dutyId);
  if (!panel) return;
  panel.classList.toggle('open');
  const open = panel.classList.contains('open');
  if (btn)  btn.classList.toggle('active', open);
  if (icon) icon.style.transform = open ? 'rotate(180deg)' : '';
}

async function runAutoOT(dateStr) {
  showLoading(true);
  try {
    const { data: quotas, error: qErr } = await db.from('quotas').select('*').eq('date', dateStr);
    if (qErr) throw qErr;
    if (!quotas?.length) throw new Error('ยังไม่ได้กำหนดอัตรากำลัง กรุณากรอกจำนวนและบันทึกอัตราก่อน');

    const existing    = S.schedule.filter(s => s.date === dateStr);
    const assignedIds = new Set(existing.map(s => s.emp_id));
    const todaySch    = [...existing];
    const toInsert    = [];

    for (const q of quotas) {
      const already = todaySch.filter(s => s.duty_id === q.duty_id).length;
      let needed    = q.count - already;
      if (needed <= 0) continue;

      let candidates = S.employees.filter(emp => {
        if (assignedIds.has(emp.id)) return false;
        if (!(emp.duties || []).includes(q.duty_id)) return false;
        return empAvailable(emp, dateStr).ok;
      });

      candidates.slice(0, needed).forEach(emp => {
        toInsert.push({ date: dateStr, emp_id: emp.id, duty_id: q.duty_id, note: 'จัดอัตโนมัติ', recorded_by: 'auto' });
        assignedIds.add(emp.id);
        todaySch.push({ date: dateStr, emp_id: emp.id, duty_id: q.duty_id });
      });
    }

    if (toInsert.length) {
      const { error } = await db.from('schedule').insert(toInsert);
      if (error) throw error;
      await loadScheduleForMonth();
    }

    toast(toInsert.length ? `จัดอัตโนมัติสำเร็จ เพิ่ม ${toInsert.length} คน` : 'ครบทุกหน้าที่แล้ว ไม่มีที่ต้องจัดเพิ่ม');
    await renderOTPage();
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

// ============================================================
// Excel (.xlsx) Import
// ============================================================

// คอลัมน์ใน Excel template (ลำดับนี้ต้องตรงกับ downloadTemplate)
const XL_COLS = [
  'เลขประจำตัว','ชื่อ','นามสกุล','ตำแหน่ง',
  'วันหยุด1','วันหยุด2','ประเภทพนักงาน',
  'เงินเดือน','ประเภทค่าจ้าง',
  'เวลาเริ่มงาน','เวลาเลิกงาน','พักเริ่ม','พักสิ้นสุด',
  'หน้าที่ (คั่นด้วย |)'
];

function triggerImport() {
  document.getElementById('csv-file-input').value = '';
  document.getElementById('csv-file-input').click();
}

function downloadTemplate() {
  const sample = [
    XL_COLS,
    ['001','สมชาย','ใจดี','พนักงานขับรถ','เสาร์','อาทิตย์','ปกติ',15000,'รายเดือน','08:00','17:00','12:00','13:00','D001|D002'],
    ['002','สมหญิง','รักดี','พนักงาน','เสาร์','อาทิตย์','ปกติ',12000,'รายเดือน','08:00','17:00','12:00','13:00','D003'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sample);

  // ปรับความกว้างคอลัมน์
  ws['!cols'] = [10,10,12,16,8,8,12,10,10,10,10,8,10,18].map(w => ({ wch: w }));

  // Header style (SheetJS community ไม่รองรับ style แต่ใส่ไว้สำหรับ Pro version)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'พนักงาน');
  XLSX.writeFile(wb, 'template_employees.xlsx');
  toast('ดาวน์โหลด template สำเร็จ');
}

function handleCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls'].includes(ext)) {
    toast('กรุณาเลือกไฟล์ .xlsx หรือ .xls เท่านั้น', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      // raw: false → แปลง date/number เป็น string อัตโนมัติ
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

      if (rows.length < 2) { toast('ไฟล์ว่างเปล่าหรือไม่มีข้อมูล', 'error'); return; }

      const parsed = parseExcelRows(rows);
      if (parsed.valid.length === 0 && parsed.skipped === 0) {
        toast('ไม่พบข้อมูลที่ถูกต้องในไฟล์', 'error'); return;
      }

      openImportModal(parsed);
    } catch(err) { toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

function parseExcelRows(rows) {
  // rows[0] คือ header, rows[1...] คือข้อมูล
  // ถ้า header ตรงกับ XL_COLS ให้ใช้ column mapping, ถ้าไม่ตรงใช้ index ตาม template
  let startRow = 0;
  const firstRow = (rows[0] || []).map(c => String(c).trim());
  // ตรวจว่า row แรกเป็น header หรือเปล่า
  if (firstRow[0] === XL_COLS[0] || firstRow[0] === 'เลขประจำตัว' || isNaN(parseFloat(firstRow[0]))) {
    startRow = 1;
  }

  let skipped = 0;
  const valid = [];

  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    const id        = String(r[0]  || '').trim();
    const firstName = String(r[1]  || '').trim();
    const lastName  = String(r[2]  || '').trim();

    // ข้ามแถวที่ขาด field บังคับ
    if (!id || !firstName || !lastName) { skipped++; continue; }

    valid.push({
      id,
      first_name:    firstName,
      last_name:     lastName,
      position:      String(r[3]  || '').trim(),
      day_off1:      String(r[4]  || '').trim(),
      day_off2:      String(r[5]  || '').trim(),
      contract_type: String(r[6]  || 'ปกติ').trim() || 'ปกติ',
      salary:        parseFloat(String(r[7]).replace(/,/g,'')) || 0,
      wage_type:     String(r[8]  || 'รายเดือน').trim() || 'รายเดือน',
      work_start:    String(r[9]  || '08:00').trim() || '08:00',
      work_end:      String(r[10] || '17:00').trim() || '17:00',
      break_start:   String(r[11] || '12:00').trim() || '12:00',
      break_end:     String(r[12] || '13:00').trim() || '13:00',
      duties:        String(r[13] || '').split('|').map(s => s.trim()).filter(Boolean),
    });
  }

  return { valid, skipped };
}

function openImportModal({ valid, skipped }) {
  const existing = new Set(S.employees.map(e => e.id));
  const toInsert = valid.filter(r => !existing.has(r.id));
  const toUpdate = valid.filter(r =>  existing.has(r.id));
  const preview  = valid.slice(0, 30);

  const previewHtml = preview.map(r => {
    const isUpdate = existing.has(r.id);
    return `
      <tr>
        <td>${esc(r.id)}</td>
        <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
        <td>${esc(r.position) || '—'}</td>
        <td>${esc(r.work_start)}–${esc(r.work_end)}</td>
        <td>${esc(r.contract_type)}</td>
        <td>${isUpdate
          ? '<span class="badge badge-type-trad">อัปเดต</span>'
          : '<span class="badge badge-type-nat">ใหม่</span>'}</td>
      </tr>`;
  }).join('');

  const html = `
    <div class="modal-header">
      <h3>ตรวจสอบข้อมูลก่อนนำเข้า</h3>
      <button class="btn-close" onclick="closeModal()">&#215;</button>
    </div>
    <div class="modal-body">
      <div class="import-summary">
        <div class="import-stat">
          <span class="import-stat-num">${valid.length}</span>
          <span>แถวที่อ่านได้</span>
        </div>
        <div class="import-stat import-stat-new">
          <span class="import-stat-num">${toInsert.length}</span>
          <span>เพิ่มใหม่</span>
        </div>
        <div class="import-stat import-stat-dup">
          <span class="import-stat-num">${toUpdate.length}</span>
          <span>อัปเดตของเดิม</span>
        </div>
        ${skipped > 0 ? `
        <div class="import-stat">
          <span class="import-stat-num" style="color:var(--text-muted)">${skipped}</span>
          <span>แถวว่าง (ข้าม)</span>
        </div>` : ''}
      </div>

      ${valid.length > 30 ? `<p class="text-muted" style="font-size:13px;margin-bottom:8px">แสดง 30 รายการแรก จากทั้งหมด ${valid.length} รายการ</p>` : ''}

      <div class="table-wrap" style="max-height:320px;overflow-y:auto">
        <table class="data-table">
          <thead>
            <tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>เวลางาน</th><th>ประเภท</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            ${previewHtml || '<tr><td colspan="6" class="empty-state">ไม่มีข้อมูล</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal()">ยกเลิก</button>
        <button class="btn btn-primary" onclick="executeImport()" ${valid.length === 0 ? 'disabled' : ''}>
          ดำเนินการ ${valid.length} รายการ
          ${toInsert.length ? '(เพิ่ม ' + toInsert.length + ')' : ''}
          ${toUpdate.length ? '(อัปเดต ' + toUpdate.length + ')' : ''}
        </button>
      </div>
    </div>`;

  window._importRows = valid;
  openModal(html, true);
}

async function executeImport() {
  const rows = window._importRows || [];
  if (!rows.length) { toast('ไม่มีรายการที่จะนำเข้า', 'error'); return; }

  showLoading(true);
  try {
    // upsert: insert ถ้าไม่มี, update ถ้ามีอยู่แล้ว (match ด้วย id)
    const { error } = await db.from('employees').upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    const { data: all, error: e2 } = await db.from('employees').select('*').order('id');
    if (e2) throw e2;
    S.employees = all;
    toast('ดำเนินการสำเร็จ ' + rows.length + ' รายการ', 'success');
    closeModal();
    renderEmployees();
  } catch(e) { toast('นำเข้าล้มเหลว: ' + e.message, 'error'); }
  finally    { showLoading(false); }
}

init();
