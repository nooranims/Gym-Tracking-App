/**
 * GymFit Pro — High-Performance SaaS Application Engine
 * Matches Google Stitch UI: Modern Light Athletic Theme
 * Measurements, Longitudinal Progress, Accounts & Fee Collection,
 * 3-Month Admission Expiry Tracking, and Daily Member Attendance.
 */

class GymApp {
  constructor() {
    this.STORAGE_KEY = 'gymfit_tracker_clients_v3';
    this.clients = [];
    this.activeClientId = null;
    this.currentMainTab = 'measurements'; // 'measurements' | 'accounts' | 'attendance'
    this.currentClientSubtab = 'measurements'; // 'measurements' | 'accounts' | 'attendance'
    
    // Directory Filters & Pagination
    this.currentFilterVolume = 'ALL';
    this.currentSearchQuery = '';
    this.currentSortMode = 'name_asc';
    this.viewMode = 'cards'; // 'cards' | 'table'
    this.currentPage = 1;
    this.pageSize = 6;
    
    // Accounts
    this.accountsSearchQuery = '';
    this.accountsFilterDues = 'ALL';
    this.fastFeeSelectedType = 'combined';
    this.fastFeeRate = 5000;

    // Attendance
    this.attendanceFilter = 'ALL';

    // Chart Mode
    this.chartMode = 'weight'; // 'weight' | 'waist_hip' | 'all'

    // Spotlight Quick Jump
    this.spotlightSelectedIndex = 0;
    this.spotlightResults = [];

    // PWA Install prompt
    this.deferredPrompt = null;

    // Firebase Cloud Database
    this.db = null;
    this.isFirebaseConnected = false;
    this.firebaseUnsubscribe = null;
    this.isSeedingFirebase = false;

    this.init();
  }

  init() {
    this.loadData();
    this.sanitizeAndEnrichData();
    this.renderAll();
    this.setupKeyboardShortcuts();
    this.setDefaultDates();
    this.populateClientSelectDropdowns();
    this.initInstallPromptListener();
    this.initFirebase();

    console.log(`GymFit Pro initialized with ${this.clients.length} clients.`);
  }

  // --- Data Loading & Storage ---
  loadData() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.clients = JSON.parse(stored);
      } else {
        const storedV2 = localStorage.getItem('gymfit_tracker_clients_v2');
        if (storedV2) {
          this.clients = JSON.parse(storedV2);
        } else if (window.INITIAL_GYM_DATA && Array.isArray(window.INITIAL_GYM_DATA)) {
          this.clients = JSON.parse(JSON.stringify(window.INITIAL_GYM_DATA));
        } else {
          this.clients = [];
        }
      }
    } catch (e) {
      console.error('Error loading data from localStorage, using initial dataset:', e);
      if (window.INITIAL_GYM_DATA) {
        this.clients = JSON.parse(JSON.stringify(window.INITIAL_GYM_DATA));
      }
    }
  }

  saveData(targetClient = null) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.clients));
    } catch (e) {
      console.error('Error saving data to localStorage:', e);
      this.showToast('Could not save to localStorage (storage full?)', 'danger');
    }

    // Real-time synchronization to Firebase Cloud Firestore if connected
    if (this.db && this.isFirebaseConnected) {
      if (targetClient && targetClient.id) {
        this.db.collection('gym_clients').doc(targetClient.id).set(targetClient, { merge: true })
          .then(() => console.log(`Cloud sync: Client ${targetClient.id} updated.`))
          .catch(err => console.warn('Firebase document save warning:', err));
      } else {
        this.syncAllClientsToFirebase(false);
      }
    }
  }

  // Numerical Helpers (Strictly 1 Decimal Place)
  round1(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? val : Math.round(num * 10) / 10;
  }

  format1Dec(val, withSign = false) {
    if (val === null || val === undefined || val === '') return '-';
    const num = Number(val);
    if (isNaN(num)) return val;
    const rounded = Math.round(num * 10) / 10;
    if (Math.abs(rounded) < 0.0001) return '0.0';
    const formatted = rounded.toFixed(1);
    return (withSign && rounded > 0) ? `+${formatted}` : formatted;
  }

  // Ensure every client has Accounts, 3-Month Admission, and Attendance structures
  sanitizeAndEnrichData() {
    const today = new Date('2026-10-09');

    this.clients.forEach(c => {
      // 1. Admission Date
      if (!c.admissionDate) {
        c.admissionDate = c.firstDate || '2026-08-01';
      }

      // 2. 3-Month Admission Validity
      if (!c.admissionExpiryDate) {
        c.admissionExpiryDate = this.calculateAdmissionExpiry(c.admissionDate);
      }

      // 3. Financial rates and balances
      if (c.admissionFee === undefined || c.admissionFee === null) c.admissionFee = 2000;
      if (c.monthlyFeeRate === undefined || c.monthlyFeeRate === null) c.monthlyFeeRate = 3000;
      if (c.feeDues === undefined || c.feeDues === null) {
        // Realistic distribution for demo if not set
        c.feeDues = (c.id && (c.id.charCodeAt(c.id.length - 1) % 5 === 0)) ? 3000 : 0;
      }
      if (c.totalFeePaid === undefined || c.totalFeePaid === null) c.totalFeePaid = 15000;

      // 4. Payments history array
      if (!Array.isArray(c.payments) || !c.payments.length) {
        c.payments = [
          {
            id: `pay_${c.id}_init`,
            receiptNo: `REC-${1000 + Math.floor(Math.random() * 8999)}`,
            date: c.latestDate || '2026-10-01',
            type: 'Adm + Monthly',
            amountPaid: 5000,
            duesRemaining: c.feeDues || 0,
            paymentMethod: 'Cash',
            period: 'Oct 2026',
            notes: 'Enrollment & monthly fee cleared'
          }
        ];
      }

      // 5. Attendance array
      if (!Array.isArray(c.attendance) || !c.attendance.length) {
        c.attendance = [
          {
            id: `att_${c.id}_prev`,
            date: c.latestDate || '2026-10-08',
            time: '06:45 PM',
            status: 'Present',
            notes: 'Scheduled strength workout'
          }
        ];
      }

      // 6. Round all client metrics and sessions strictly to 1 decimal place
      if (c.initialWeight !== null && c.initialWeight !== undefined) c.initialWeight = this.round1(c.initialWeight);
      if (c.latestWeight !== null && c.latestWeight !== undefined) c.latestWeight = this.round1(c.latestWeight);
      if (c.weightChange !== null && c.weightChange !== undefined) c.weightChange = this.round1(c.weightChange);
      if (c.initialWaist !== null && c.initialWaist !== undefined) c.initialWaist = this.round1(c.initialWaist);
      if (c.latestWaist !== null && c.latestWaist !== undefined) c.latestWaist = this.round1(c.latestWaist);
      if (c.waistChange !== null && c.waistChange !== undefined) c.waistChange = this.round1(c.waistChange);
      if (c.initialHip !== null && c.initialHip !== undefined) c.initialHip = this.round1(c.initialHip);
      if (c.latestHip !== null && c.latestHip !== undefined) c.latestHip = this.round1(c.latestHip);
      if (c.hipChange !== null && c.hipChange !== undefined) c.hipChange = this.round1(c.hipChange);

      if (Array.isArray(c.sessions)) {
        c.sessions.forEach(s => {
          ['arm', 'chest', 'waist', 'lowerWaist', 'thigh', 'hip', 'calves', 'weight', 'weightChg'].forEach(k => {
            if (s[k] !== null && s[k] !== undefined && s[k] !== '') {
              s[k] = this.round1(s[k]);
            }
          });
        });
      }
    });
  }

  calculateAdmissionExpiry(startDateStr) {
    if (!startDateStr) return '';
    try {
      const parts = startDateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        d.setMonth(d.getMonth() + 3);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  getAdmissionStatus(expiryDateStr) {
    if (!expiryDateStr) {
      return { status: 'unknown', text: 'No Expiry Set', pillClass: 'active', daysLeft: 0 };
    }
    const today = new Date('2026-10-09');
    const exp = new Date(expiryDateStr);
    const diffMs = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        status: 'expired',
        text: 'Expired',
        pillClass: 'expired',
        daysLeft: diffDays
      };
    } else if (diffDays <= 14) {
      return {
        status: 'expiring',
        text: `Expiring Soon (${diffDays}d)`,
        pillClass: 'expiring',
        daysLeft: diffDays
      };
    } else {
      return {
        status: 'active',
        text: `Active (${diffDays} days left)`,
        pillClass: 'active',
        daysLeft: diffDays
      };
    }
  }

  setDefaultDates() {
    const today = '2026-10-09';
    const inputs = ['form-session-date', 'new-client-date'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = today;
    });

    const attDate = document.getElementById('attendance-station-today-date');
    if (attDate) attDate.textContent = 'Friday, October 9, 2026';
  }

  populateClientSelectDropdowns() {
    const fastFeeSelect = document.getElementById('fast-record-client-select');
    const attSelect = document.getElementById('attendance-station-client-select');

    const optionsHtml = this.clients.map(c => 
      `<option value="${c.id}">${this.escapeHtml(c.name)} — ${c.volume || 'Vol'} · Pg ${c.page || '-'}</option>`
    ).join('');

    if (fastFeeSelect) {
      fastFeeSelect.innerHTML = optionsHtml;
      if (this.clients.length) this.handleFastRecordClientChange(this.clients[0].id);
    }

    if (attSelect) {
      attSelect.innerHTML = optionsHtml;
      if (this.clients.length) this.handleAttendanceStationClientChange(this.clients[0].id);
    }
  }

  // --- Master Render Routine ---
  renderAll() {
    this.renderStats();
    this.renderMeasurementsSection();
    this.renderAccountsSection();
    this.renderAttendanceSection();
  }

  // ========================================================
  // TOP STATS & KPI CHIPS (STITCH EXACT)
  // ========================================================
  renderStats() {
    const totalClients = this.clients.length;
    let totalSessions = 0;
    let totalDues = 0;
    let duesCount = 0;

    this.clients.forEach(c => {
      const sessCount = (c.sessions && c.sessions.length) || c.totalSessions || 0;
      totalSessions += sessCount;

      if (c.feeDues && c.feeDues > 0) {
        totalDues += c.feeDues;
        duesCount++;
      }
    });

    // Top Header Status Chips
    const chipMembers = document.getElementById('header-chip-members');
    if (chipMembers) chipMembers.textContent = totalClients;

    const chipSessions = document.getElementById('header-chip-sessions');
    if (chipSessions) chipSessions.textContent = totalSessions.toLocaleString();

    const chipDues = document.getElementById('header-chip-dues');
    if (chipDues) chipDues.textContent = `Rs. ${totalDues.toLocaleString()}`;

    // Nav Badges
    const tabMembersBadge = document.getElementById('tab-members-badge');
    if (tabMembersBadge) tabMembersBadge.textContent = totalClients;

    const tabAccountsBadge = document.getElementById('tab-accounts-badge');
    if (tabAccountsBadge) {
      tabAccountsBadge.textContent = duesCount > 0 ? `${duesCount} Dues Alert` : '0 Dues';
      tabAccountsBadge.style.background = duesCount > 0 ? '#fee2e2' : '#dcfce7';
      tabAccountsBadge.style.color = duesCount > 0 ? '#b91c1c' : '#15803d';
    }

    const sideDuesBadge = document.getElementById('side-dues-badge');
    if (sideDuesBadge) {
      sideDuesBadge.style.display = duesCount > 0 ? 'inline-block' : 'none';
      sideDuesBadge.textContent = `${duesCount} Dues`;
    }

    const countAll = document.getElementById('count-all');
    if (countAll) countAll.textContent = totalClients;

    const countDuesPill = document.getElementById('count-dues-pill');
    if (countDuesPill) countDuesPill.textContent = duesCount;
  }

  // ========================================================
  // SECTION 1: DIRECTORY & MEASUREMENTS (IMAGE 4)
  // ========================================================
  switchMainTab(tab) {
    this.currentMainTab = tab;

    // Side nav items
    document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
    if (tab === 'measurements') document.getElementById('side-nav-members')?.classList.add('active');
    else if (tab === 'accounts') document.getElementById('side-nav-accounts')?.classList.add('active');
    else if (tab === 'attendance') document.getElementById('side-nav-attendance')?.classList.add('active');

    // Content view tabs
    document.getElementById('tab-btn-measurements')?.classList.toggle('active', tab === 'measurements');
    document.getElementById('tab-btn-accounts')?.classList.toggle('active', tab === 'accounts');
    document.getElementById('tab-btn-attendance')?.classList.toggle('active', tab === 'attendance');

    // Section view containers
    document.getElementById('view-measurements').style.display = tab === 'measurements' ? 'block' : 'none';
    document.getElementById('view-accounts').style.display = tab === 'accounts' ? 'block' : 'none';
    document.getElementById('view-attendance').style.display = tab === 'attendance' ? 'block' : 'none';

    if (tab === 'accounts') this.renderAccountsSection();
    if (tab === 'attendance') this.renderAttendanceSection();
  }

  filterByVolume(volumeKey) {
    this.currentFilterVolume = volumeKey;
    this.currentPage = 1;

    // Update pill styles
    document.querySelectorAll('.vol-pill').forEach(pill => {
      const text = pill.textContent;
      if (volumeKey === 'ALL' && text.includes('All')) pill.classList.add('active');
      else if (volumeKey === 'Vol 1' && text.includes('Vol 1')) pill.classList.add('active');
      else if (volumeKey === 'Vol 2' && text.includes('Vol 2')) pill.classList.add('active');
      else if (volumeKey === 'Vol 3' && text.includes('Vol 3')) pill.classList.add('active');
      else if (volumeKey === 'Vol 4' && text.includes('Vol 4')) pill.classList.add('active');
      else if (volumeKey === 'HAS_DUES' && text.includes('Pending Dues')) pill.classList.add('active');
      else pill.classList.remove('active');
    });

    this.renderMeasurementsSection();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    document.getElementById('view-toggle-grid').classList.toggle('active', mode === 'cards');
    document.getElementById('view-toggle-table').classList.toggle('active', mode === 'table');
    document.getElementById('clients-cards-container').style.display = mode === 'cards' ? 'grid' : 'none';
    document.getElementById('clients-table-container').style.display = mode === 'table' ? 'block' : 'none';
    this.renderMeasurementsSection();
  }

  getFilteredClients() {
    let list = this.clients.filter(client => {
      if (this.currentFilterVolume !== 'ALL') {
        if (this.currentFilterVolume === 'HAS_DUES') {
          if (!client.feeDues || client.feeDues <= 0) return false;
        } else if (client.volume && !client.volume.includes(this.currentFilterVolume)) {
          return false;
        }
      }

      if (this.currentSearchQuery) {
        const q = this.currentSearchQuery;
        const nameMatch = client.name.toLowerCase().includes(q);
        const volMatch = (client.volume || '').toLowerCase().includes(q);
        const pageMatch = (client.page || '').toString().includes(q);
        if (!nameMatch && !volMatch && !pageMatch) return false;
      }

      return true;
    });

    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  renderMeasurementsSection() {
    const allFiltered = this.getFilteredClients();
    const totalCount = allFiltered.length;

    // Pagination
    const totalPages = Math.ceil(totalCount / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const endIdx = Math.min(startIdx + this.pageSize, totalCount);
    const pageClients = allFiltered.slice(startIdx, endIdx);

    const showingCount = document.getElementById('showing-clients-count');
    if (showingCount) {
      showingCount.textContent = totalCount ? `Showing ${startIdx + 1} to ${endIdx} of ${totalCount} members` : 'No members found';
    }

    this.renderPagination(totalPages);

    if (this.viewMode === 'cards') {
      this.renderCards(pageClients);
    } else {
      this.renderTable(pageClients);
    }
  }

  renderPagination(totalPages) {
    const container = document.getElementById('pagination-buttons');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = `
      <button class="btn-page" ${this.currentPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="app.setPage(${this.currentPage - 1})">Previous</button>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.currentPage - 1 && p <= this.currentPage + 1)) {
        html += `<button class="btn-page ${p === this.currentPage ? 'active' : ''}" onclick="app.setPage(${p})">${p}</button>`;
      } else if (p === this.currentPage - 2 || p === this.currentPage + 2) {
        html += `<span style="padding: 0 0.25rem; color: var(--text-dim);">...</span>`;
      }
    }

    html += `
      <button class="btn-page" ${this.currentPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="app.setPage(${this.currentPage + 1})">Next</button>
    `;

    container.innerHTML = html;
  }

  setPage(page) {
    this.currentPage = page;
    this.renderMeasurementsSection();
  }

  // Exact Card Replica from Image 4
  renderCards(clients) {
    const container = document.getElementById('clients-cards-container');
    if (!clients.length) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted); background: #ffffff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main);">No matching members found</h3>
          <p style="font-size: 0.85rem; margin-top: 0.25rem;">Try clearing your filter or searching for a different name.</p>
          <button class="btn-sidebar-quick" style="width: auto; margin: 1rem auto 0 auto;" onclick="app.filterByVolume('ALL')">Clear Filters</button>
        </div>
      `;
      return;
    }

    container.innerHTML = clients.map(c => {
      const initials = this.getInitials(c.name);
      const admitStatus = this.getAdmissionStatus(c.admissionExpiryDate);
      const dues = c.feeDues || 0;

      // Fee status strip (Image 4 exact)
      const feeStripHtml = dues > 0
        ? `<div class="card-fee-strip due">
             <span>Fee Status</span>
             <span>⚠️ Due Rs. ${dues.toLocaleString()}</span>
           </div>`
        : `<div class="card-fee-strip paid">
             <span>Fee Status</span>
             <span>✓ Paid</span>
           </div>`;

      // 3-Metric deltas (1-decimal strictly)
      const wtDeltaClass = c.weightChange < 0 ? 'loss' : (c.weightChange > 0 ? 'gain' : 'neutral');
      const wtDeltaText = this.format1Dec(c.weightChange, true) + ' kg';

      const waistDeltaClass = c.waistChange < 0 ? 'loss' : (c.waistChange > 0 ? 'gain' : 'neutral');
      const waistDeltaText = this.format1Dec(c.waistChange, true) + ' in';

      const hipDeltaClass = c.hipChange < 0 ? 'loss' : (c.hipChange > 0 ? 'gain' : 'neutral');
      const hipDeltaText = this.format1Dec(c.hipChange, true) + ' in';

      // Collect button state
      const collectBtnHtml = dues > 0
        ? `<button class="btn-card-action btn-card-collect" onclick="event.stopPropagation(); app.openCollectFeeModalForClient('${c.id}')">Collect</button>`
        : `<button class="btn-card-action btn-card-paid-disabled" disabled onclick="event.stopPropagation()">Paid</button>`;

      return `
        <div class="member-card" onclick="app.openMeasurementWindow('${c.id}')">
          <!-- Top Row: Avatar, Identity, 3-Month Status -->
          <div class="member-card-top">
            <div class="member-card-identity">
              <div class="member-card-avatar">${initials}</div>
              <div class="member-card-meta">
                <div class="member-card-name">${this.escapeHtml(c.name)}</div>
                <div class="member-card-sub">${this.escapeHtml(c.volume || 'Vol')} · Pg ${c.page || '-'} &nbsp;|&nbsp; ID: #GP-${c.id.slice(-4)}</div>
              </div>
            </div>
            <span class="status-pill ${admitStatus.pillClass}">
              ● ${admitStatus.text}
            </span>
          </div>

          <!-- Fee Status Banner Strip -->
          ${feeStripHtml}

          <!-- 3-Metrics Strip (Weight, Waist, Hip) -->
          <div class="card-metrics-strip">
            <div class="card-metric-col">
              <span class="card-metric-label">Weight</span>
              <span class="card-metric-value">${this.format1Dec(c.latestWeight)} kg</span>
              <span class="card-metric-delta ${wtDeltaClass}">${wtDeltaText}</span>
            </div>
            <div class="card-metric-col">
              <span class="card-metric-label">Waist</span>
              <span class="card-metric-value">${this.format1Dec(c.latestWaist)} in</span>
              <span class="card-metric-delta ${waistDeltaClass}">${waistDeltaText}</span>
            </div>
            <div class="card-metric-col">
              <span class="card-metric-label">Hip</span>
              <span class="card-metric-value">${this.format1Dec(c.latestHip)} in</span>
              <span class="card-metric-delta ${hipDeltaClass}">${hipDeltaText}</span>
            </div>
          </div>

          <!-- Actions Row: Profile, Collect, Check-In -->
          <div class="card-actions-row">
            <button class="btn-card-action btn-card-profile" onclick="event.stopPropagation(); app.openMeasurementWindow('${c.id}')">Profile</button>
            ${collectBtnHtml}
            <button class="btn-card-action btn-card-checkin" onclick="event.stopPropagation(); app.checkinClientDirectly('${c.id}')">Check-In</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Dense Table View
  renderTable(clients) {
    const tbody = document.getElementById('clients-table-body');
    if (!clients.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2.5rem;">No matching members found.</td></tr>`;
      return;
    }

    tbody.innerHTML = clients.map(c => {
      const admitStatus = this.getAdmissionStatus(c.admissionExpiryDate);
      const dues = c.feeDues || 0;
      const duesBadge = dues > 0
        ? `<span class="status-pill expired">Rs. ${dues.toLocaleString()}</span>`
        : `<span class="status-pill active">Paid</span>`;

      return `
        <tr style="cursor: pointer;" onclick="app.openMeasurementWindow('${c.id}')">
          <td style="font-weight: 700; color: var(--text-main);">${this.escapeHtml(c.name)}</td>
          <td>${this.escapeHtml(c.volume || 'Vol')} · Pg ${c.page || '-'}</td>
          <td><span class="content-tab-badge">${(c.sessions && c.sessions.length) || c.totalSessions || 0}</span></td>
          <td style="font-weight: 700;">${this.format1Dec(c.latestWeight)} kg</td>
          <td style="font-weight: 700; color: ${c.weightChange < 0 ? 'var(--accent-success)' : (c.weightChange > 0 ? 'var(--accent-danger)' : 'var(--text-dim)')};">${this.format1Dec(c.weightChange, true)} kg</td>
          <td>${this.format1Dec(c.latestWaist)} in</td>
          <td>${this.format1Dec(c.latestHip)} in</td>
          <td><span class="status-pill ${admitStatus.pillClass}">● ${admitStatus.text}</span></td>
          <td>${duesBadge}</td>
          <td style="font-size: 0.75rem; color: var(--text-muted);">${c.latestDate || '-'}</td>
          <td onclick="event.stopPropagation()">
            <button class="btn-page" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="app.openMeasurementWindow('${c.id}')">View</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ========================================================
  // SECTION 2: ACCOUNTS & FEE COLLECTION ENGINE (IMAGE 3)
  // ========================================================
  renderAccountsSection() {
    let totalLifetimeRev = 2845000;
    let thisMonthRev = 248500;
    let totalDues = 0;
    let duesClientsCount = 0;
    let expiredAdmissionsCount = 0;

    const allPayments = [];

    this.clients.forEach(c => {
      if (c.feeDues && c.feeDues > 0) {
        totalDues += c.feeDues;
        duesClientsCount++;
      }

      const admitStatus = this.getAdmissionStatus(c.admissionExpiryDate);
      if (admitStatus.status === 'expired') {
        expiredAdmissionsCount++;
      }

      (c.payments || []).forEach(p => {
        allPayments.push({
          ...p,
          clientName: c.name,
          clientId: c.id,
          volume: c.volume,
          page: c.page
        });
      });
    });

    // 4 KPI Stat Cards
    document.getElementById('kpi-total-revenue').textContent = `Rs. ${totalLifetimeRev.toLocaleString()}`;
    document.getElementById('kpi-month-revenue').textContent = `Rs. ${thisMonthRev.toLocaleString()}`;
    document.getElementById('kpi-total-dues').textContent = `Rs. ${totalDues.toLocaleString()}`;
    document.getElementById('kpi-dues-clients-count').textContent = `${duesClientsCount} Members Pending`;
    document.getElementById('kpi-expired-admissions').textContent = `${expiredAdmissionsCount} Members`;

    // Master Financial Ledger Table
    const tbody = document.getElementById('master-payments-tbody');
    let displayPayments = allPayments;

    if (this.accountsFilterDues === 'DUES') {
      displayPayments = displayPayments.filter(p => (p.duesRemaining && p.duesRemaining > 0));
    }

    if (!displayPayments.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;">No matching financial transactions.</td></tr>`;
      return;
    }

    tbody.innerHTML = displayPayments.slice(0, 30).map(p => {
      const duesLeft = p.duesRemaining || 0;
      const duesHtml = duesLeft > 0
        ? `<span style="font-weight: 800; color: #dc2626;">Rs. ${duesLeft.toLocaleString()}</span>`
        : `<span style="font-weight: 700; color: var(--accent-success);">Rs. 0</span>`;

      return `
        <tr>
          <td><code style="color: var(--brand-blue); font-weight: 700; font-size: 0.78rem;">#${p.receiptNo || 'REC-8492'}</code></td>
          <td style="font-weight: 600;">${p.date || '2026-10-09'}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">${this.escapeHtml(p.clientName)}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${this.escapeHtml(p.volume || 'Vol 1')} · Pg ${p.page || '-'}</div>
          </td>
          <td><span class="content-tab-badge" style="background: #e0f2fe; color: var(--brand-blue);">${this.escapeHtml(p.type || 'Fee')}</span></td>
          <td style="font-weight: 800;">Rs. ${(p.amountPaid || 0).toLocaleString()}</td>
          <td>${duesHtml}</td>
          <td><span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 600;">● ${p.paymentMethod || 'Cash'}</span></td>
        </tr>
      `;
    }).join('');
  }

  handleAccountsDuesFilter(val) {
    this.accountsFilterDues = val;
    this.renderAccountsSection();
  }

  handleFastRecordClientChange(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    document.getElementById('fast-record-avatar').textContent = this.getInitials(client.name);
    document.getElementById('fast-record-member-sub').textContent = `${client.volume || 'Vol 1'} · Page ${client.page || '-'} · ID #GP-${client.id.slice(-4)}`;

    const admitStatus = this.getAdmissionStatus(client.admissionExpiryDate);
    const statusPill = document.getElementById('fast-record-status-pill');
    statusPill.textContent = admitStatus.text;
    statusPill.className = `status-pill ${admitStatus.pillClass}`;

    this.calculateFastFeeDues();
  }

  selectFastFeeType(type, rate) {
    this.fastFeeSelectedType = type;
    this.fastFeeRate = rate;

    document.querySelectorAll('.fee-structure-pill').forEach(el => el.classList.remove('selected'));
    const pill = document.getElementById(`pill-fee-${type}`);
    if (pill) pill.classList.add('selected');

    document.getElementById('fast-amount-charged').value = rate;
    document.getElementById('fast-amount-collected').value = rate;
    this.calculateFastFeeDues();
  }

  calculateFastFeeDues() {
    const charged = parseFloat(document.getElementById('fast-amount-charged').value) || 0;
    const collected = parseFloat(document.getElementById('fast-amount-collected').value) || 0;
    const dues = Math.max(0, charged - collected);

    const duesDisplay = document.getElementById('fast-remaining-dues-display');
    if (duesDisplay) duesDisplay.textContent = `Rs. ${dues.toLocaleString()}`;

    // Auto-computed 3-month extension preview
    const today = '2026-10-09';
    const newExp = this.calculateAdmissionExpiry(today);
    const expDisplay = document.getElementById('fast-new-expiry-date');
    if (expDisplay) expDisplay.textContent = `Valid to ${newExp}`;
  }

  submitFastRecordFee() {
    const clientId = document.getElementById('fast-record-client-select').value;
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    const charged = parseFloat(document.getElementById('fast-amount-charged').value) || 0;
    const collected = parseFloat(document.getElementById('fast-amount-collected').value) || 0;
    const dues = Math.max(0, charged - collected);
    const method = document.getElementById('fast-payment-method').value;
    const today = '2026-10-09';

    if (!Array.isArray(client.payments)) client.payments = [];

    const newPayment = {
      id: `pay_${Date.now()}`,
      receiptNo: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      date: today,
      type: this.fastFeeSelectedType === 'combined' ? 'Adm + Monthly' : (this.fastFeeSelectedType === 'monthly' ? 'Monthly Fee' : 'Admission Fee'),
      amountPaid: collected,
      duesRemaining: dues,
      paymentMethod: method,
      period: 'Oct 2026',
      notes: 'Recorded via Fast Desk Ledger'
    };

    client.payments.unshift(newPayment);
    client.feeDues = dues;
    client.totalFeePaid = (client.totalFeePaid || 0) + collected;

    // Extend 3-Month validity
    client.admissionExpiryDate = this.calculateAdmissionExpiry(today);

    this.saveData();
    this.renderAll();
    this.showToast(`Receipt #${newPayment.receiptNo} created for ${client.name}!`, 'success');
  }

  // ========================================================
  // SECTION 3: DAILY MEMBER ATTENDANCE (IMAGE 2)
  // ========================================================
  renderAttendanceSection() {
    const totalClients = this.clients.length;
    let todayCheckins = 0;
    let morningCheckins = 0;
    let eveningCheckins = 0;

    const todayList = [];

    this.clients.forEach(c => {
      (c.attendance || []).forEach(a => {
        if (a.date === '2026-10-09' || a.date === '2026-10-08') {
          todayCheckins++;
          if (a.time && (a.time.includes('AM') || a.time < '12:00')) morningCheckins++;
          else eveningCheckins++;

          todayList.push({
            ...a,
            clientId: c.id,
            clientName: c.name,
            volume: c.volume,
            page: c.page,
            dues: c.feeDues || 0,
            expiry: c.admissionExpiryDate,
            totalVisits: (c.attendance || []).length
          });
        }
      });
    });

    // Populate KPI Cards
    const totalEl = document.getElementById('att-kpi-total');
    if (totalEl) totalEl.textContent = todayCheckins;

    const pct = Math.min(100, Math.round((todayCheckins / (totalClients || 1)) * 100));
    const pctEl = document.getElementById('att-kpi-percent');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const barEl = document.getElementById('att-kpi-occupancy-bar');
    if (barEl) barEl.style.width = `${pct}%`;

    const morningEl = document.getElementById('att-kpi-morning');
    if (morningEl) morningEl.textContent = morningCheckins;

    const eveningEl = document.getElementById('att-kpi-evening');
    if (eveningEl) eveningEl.textContent = eveningCheckins;

    // Filter count pills
    const countAll = document.getElementById('att-count-all');
    if (countAll) countAll.textContent = todayList.length;

    const countEvening = document.getElementById('att-count-evening');
    if (countEvening) countEvening.textContent = eveningCheckins;

    const duesAlertList = todayList.filter(t => t.dues > 0);
    const countDues = document.getElementById('att-count-dues');
    if (countDues) countDues.textContent = duesAlertList.length;

    // Live Ledger Table
    let displayList = todayList;
    if (this.attendanceFilter === 'EVENING') displayList = todayList.filter(t => t.time && t.time.includes('PM'));
    else if (this.attendanceFilter === 'DUES') displayList = duesAlertList;

    const tbody = document.getElementById('attendance-station-tbody');
    if (!tbody) return;

    if (!displayList.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No attendees logged yet for this filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = displayList.map(item => {
      const admitStatus = this.getAdmissionStatus(item.expiry);
      const duesBadge = item.dues > 0
        ? `<span class="status-pill expired">Due alert Rs. ${item.dues.toLocaleString()}</span>`
        : `<span class="status-pill active">✓ Paid</span>`;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--brand-blue);">${item.time || '10:00 AM'}</td>
          <td>
            <div style="font-weight: 800; color: var(--text-main);">${this.escapeHtml(item.clientName)}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${this.escapeHtml(item.volume || 'Vol')} · Pg ${item.page || '-'}</div>
          </td>
          <td><span class="status-pill ${admitStatus.pillClass}">● Valid: Exp ${item.expiry ? item.expiry.slice(5) : 'Dec 14'}</span></td>
          <td>${duesBadge}</td>
          <td><span class="content-tab-badge">Visit #${item.totalVisits}</span></td>
          <td>
            <button class="btn-page" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="app.openMeasurementWindow('${item.clientId}')">Profile</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  handleAttendanceStationClientChange(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;
    const tier = document.getElementById('fast-tier-label');
    if (tier) tier.textContent = `${client.volume || 'Volume 1'} · Regular Pass`;
  }

  checkinSelectedStationMember() {
    const select = document.getElementById('attendance-station-client-select');
    if (!select || !select.value) return;
    this.checkinClientDirectly(select.value);
  }

  filterAttendanceLedger(mode) {
    this.attendanceFilter = mode;
    document.getElementById('att-filter-all')?.classList.toggle('active', mode === 'ALL');
    document.getElementById('att-filter-evening')?.classList.toggle('active', mode === 'EVENING');
    document.getElementById('att-filter-dues')?.classList.toggle('active', mode === 'DUES');
    this.renderAttendanceSection();
  }

  checkinClientDirectly(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    if (!Array.isArray(client.attendance)) client.attendance = [];

    const today = '2026-10-09';
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Duplicate check
    const existing = client.attendance.find(a => a.date === today);
    if (existing) {
      this.showToast(`${client.name} is already checked in today at ${existing.time}!`, 'info');
      return;
    }

    const newAtt = {
      id: `att_${Date.now()}`,
      date: today,
      time: timeStr || '06:00 PM',
      status: 'Present',
      notes: 'Station Desk Check-In'
    };

    client.attendance.unshift(newAtt);
    this.saveData();
    this.renderAll();
    this.showToast(`Checked in ${client.name} successfully!`, 'success');
  }

  // ========================================================
  // SECTION 4: CLIENT PROFILE & MEASUREMENT MODAL (IMAGE 1)
  // ========================================================
  openMeasurementWindow(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    this.activeClientId = clientId;

    // Header Banner
    document.getElementById('modal-client-avatar').textContent = this.getInitials(client.name);
    document.getElementById('modal-client-name').textContent = client.name;
    document.getElementById('modal-client-id').textContent = `#GP-${client.id.slice(-4)}`;
    document.getElementById('modal-client-volume').textContent = `${client.volume || 'Vol 1'} · Pg ${client.page || '-'}`;
    document.getElementById('modal-client-enrolled').textContent = client.admissionDate || 'Oct 12, 2023';
    document.getElementById('modal-client-sessions-badge').textContent = (client.sessions && client.sessions.length) || client.totalSessions || 0;

    // Admission Status & Dues Badges
    const admitStatus = this.getAdmissionStatus(client.admissionExpiryDate);
    const admitBadge = document.getElementById('modal-client-admission-status');
    admitBadge.textContent = admitStatus.text;
    admitBadge.className = `status-pill ${admitStatus.pillClass}`;

    const dues = client.feeDues || 0;
    const duesBadge = document.getElementById('modal-client-dues-badge');
    if (dues > 0) {
      duesBadge.textContent = `Fee status: Due Rs. ${dues.toLocaleString()}`;
      duesBadge.className = 'card-fee-strip due';
      duesBadge.style.display = 'inline-flex';
    } else {
      duesBadge.textContent = 'Fee status: Clear ✓ Paid';
      duesBadge.className = 'card-fee-strip paid';
      duesBadge.style.display = 'inline-flex';
    }

    // Populate Subtabs
    this.populateKPIs(client);
    this.renderChart(client);
    this.setupAddSessionForm(client);
    this.renderSessionsTable(client);
    this.populateClientAccountsWindow(client);
    this.populateClientAttendanceWindow(client);

    this.switchClientSubtab('measurements');

    const modal = document.getElementById('measurement-modal-overlay');
    if (modal) modal.classList.add('active');
  }

  closeMeasurementWindow() {
    const modal = document.getElementById('measurement-modal-overlay');
    if (modal) modal.classList.remove('active');
    this.activeClientId = null;
  }

  navigateClient(step) {
    if (!this.activeClientId) return;
    const currentList = this.getFilteredClients();
    if (!currentList.length) return;

    let idx = currentList.findIndex(c => c.id === this.activeClientId);
    if (idx === -1) idx = 0;

    let newIdx = idx + step;
    if (newIdx < 0) newIdx = currentList.length - 1;
    if (newIdx >= currentList.length) newIdx = 0;

    this.openMeasurementWindow(currentList[newIdx].id);
  }

  switchClientSubtab(tab) {
    this.currentClientSubtab = tab;

    document.getElementById('subtab-btn-measurements')?.classList.toggle('active', tab === 'measurements');
    document.getElementById('subtab-btn-accounts')?.classList.toggle('active', tab === 'accounts');
    document.getElementById('subtab-btn-attendance')?.classList.toggle('active', tab === 'attendance');

    document.getElementById('client-subtab-measurements-content').style.display = tab === 'measurements' ? 'flex' : 'none';
    document.getElementById('client-subtab-accounts-content').style.display = tab === 'accounts' ? 'flex' : 'none';
    document.getElementById('client-subtab-attendance-content').style.display = tab === 'attendance' ? 'flex' : 'none';

    const client = this.clients.find(c => c.id === this.activeClientId);
    if (client && tab === 'measurements') {
      this.renderChart(client);
    }
  }

  // 8 Physical Metrics Overview Cards (Image 1 Exact)
  populateKPIs(client) {
    const sessions = client.sessions || [];
    const firstSess = sessions[0] || {};
    const lastSess = sessions[sessions.length - 1] || {};

    const checkpointHint = document.getElementById('modal-metrics-checkpoint-hint');
    if (checkpointHint) {
      checkpointHint.textContent = `Baseline: ${client.firstDate || 'Enrolled'} → Latest: Session #${sessions.length || 1}`;
    }

    // 1. Weight
    document.getElementById('kpi-latest-weight').textContent = this.format1Dec(client.latestWeight);
    document.getElementById('kpi-base-weight').textContent = this.format1Dec(client.initialWeight);
    const wtDelta = document.getElementById('kpi-weight-change-badge');
    wtDelta.textContent = this.format1Dec(client.weightChange, true) + ' kg';
    wtDelta.className = `metric-kpi-delta-pill ${client.weightChange < 0 ? 'loss' : (client.weightChange > 0 ? 'gain' : 'blue')}`;

    // 2. Waist
    document.getElementById('kpi-latest-waist').textContent = this.format1Dec(client.latestWaist);
    document.getElementById('kpi-base-waist').textContent = this.format1Dec(client.initialWaist);
    const waistDelta = document.getElementById('kpi-waist-change-badge');
    waistDelta.textContent = this.format1Dec(client.waistChange, true) + ' in';
    waistDelta.className = `metric-kpi-delta-pill ${client.waistChange < 0 ? 'loss' : (client.waistChange > 0 ? 'gain' : 'blue')}`;

    // 3. Lower Waist
    document.getElementById('kpi-latest-lowwaist').textContent = this.format1Dec(lastSess.lowerWaist || client.latestWaist);
    document.getElementById('kpi-base-lowwaist').textContent = this.format1Dec(firstSess.lowerWaist || client.initialWaist);
    const lowWaistDelta = (lastSess.lowerWaist && firstSess.lowerWaist) ? this.round1(lastSess.lowerWaist - firstSess.lowerWaist) : client.waistChange;
    const lowWaistBadge = document.getElementById('kpi-lowwaist-change-badge');
    lowWaistBadge.textContent = this.format1Dec(lowWaistDelta, true) + ' in';
    lowWaistBadge.className = `metric-kpi-delta-pill ${lowWaistDelta < 0 ? 'loss' : 'gain'}`;

    // 4. Hip
    document.getElementById('kpi-latest-hip').textContent = this.format1Dec(client.latestHip);
    document.getElementById('kpi-base-hip').textContent = this.format1Dec(client.initialHip);
    const hipDelta = document.getElementById('kpi-hip-change-badge');
    hipDelta.textContent = this.format1Dec(client.hipChange, true) + ' in';
    hipDelta.className = `metric-kpi-delta-pill ${client.hipChange < 0 ? 'loss' : (client.hipChange > 0 ? 'gain' : 'blue')}`;

    // 5. Arm
    document.getElementById('kpi-latest-arm').textContent = this.format1Dec(lastSess.arm);
    document.getElementById('kpi-base-arm').textContent = this.format1Dec(firstSess.arm);
    const armDelta = (lastSess.arm && firstSess.arm) ? this.round1(lastSess.arm - firstSess.arm) : 0;
    const armBadge = document.getElementById('kpi-arm-change-badge');
    armBadge.textContent = this.format1Dec(armDelta, true) + ' in';
    armBadge.className = 'metric-kpi-delta-pill blue';

    // 6. Chest
    document.getElementById('kpi-latest-chest').textContent = this.format1Dec(lastSess.chest);
    document.getElementById('kpi-base-chest').textContent = this.format1Dec(firstSess.chest);
    const chestDelta = (lastSess.chest && firstSess.chest) ? this.round1(lastSess.chest - firstSess.chest) : 0;
    const chestBadge = document.getElementById('kpi-chest-change-badge');
    chestBadge.textContent = this.format1Dec(chestDelta, true) + ' in';
    chestBadge.className = 'metric-kpi-delta-pill blue';

    // 7. Thigh
    document.getElementById('kpi-latest-thigh').textContent = this.format1Dec(lastSess.thigh);
    document.getElementById('kpi-base-thigh').textContent = this.format1Dec(firstSess.thigh);
    const thighDelta = (lastSess.thigh && firstSess.thigh) ? this.round1(lastSess.thigh - firstSess.thigh) : 0;
    const thighBadge = document.getElementById('kpi-thigh-change-badge');
    thighBadge.textContent = this.format1Dec(thighDelta, true) + ' in';
    thighBadge.className = `metric-kpi-delta-pill ${thighDelta < 0 ? 'loss' : 'gain'}`;

    // 8. Calves
    document.getElementById('kpi-latest-calves').textContent = this.format1Dec(lastSess.calves);
    document.getElementById('kpi-calves-status').textContent = this.format1Dec(firstSess.calves);
    const calvesDelta = (lastSess.calves && firstSess.calves) ? this.round1(lastSess.calves - firstSess.calves) : 0;
    const calvesBadge = document.getElementById('kpi-calves-change-badge');
    calvesBadge.textContent = this.format1Dec(calvesDelta, true) + ' in';
    calvesBadge.className = 'metric-kpi-delta-pill blue';
  }

  // Native Interactive SVG Trajectory Chart (Image 1 Exact)
  setChartMode(mode) {
    this.chartMode = mode;
    document.getElementById('pill-chart-weight')?.classList.toggle('active', mode === 'weight');
    document.getElementById('pill-chart-waist-hip')?.classList.toggle('active', mode === 'waist_hip');
    document.getElementById('pill-chart-all')?.classList.toggle('active', mode === 'all');

    const client = this.clients.find(c => c.id === this.activeClientId);
    if (client) this.renderChart(client);
  }

  renderChart(client) {
    const container = document.getElementById('chart-svg-container');
    const sessions = client.sessions || [];

    if (!sessions.length) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:0.85rem;">No measurement sessions logged yet to chart.</div>`;
      return;
    }

    // Chart subtitle & summary stats
    const baseWt = client.initialWeight || sessions[0].weight;
    const latestWt = client.latestWeight || sessions[sessions.length - 1].weight;
    const subTitle = document.getElementById('chart-trajectory-subtitle');
    if (subTitle) subTitle.textContent = `Descent progress from baseline ${this.format1Dec(baseWt)} kg to ${this.format1Dec(latestWt)} kg`;

    const netLossEl = document.getElementById('chart-net-weight-loss');
    if (netLossEl) netLossEl.textContent = `${this.format1Dec(client.weightChange, true)} kg`;

    const width = container.clientWidth || 600;
    const height = 220;
    const padding = { top: 25, right: 35, bottom: 35, left: 45 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    let points = [];
    if (this.chartMode === 'weight') {
      points = sessions
        .map((s, idx) => ({ x: idx, val: s.weight, label: s.sessionNum ? `#${s.sessionNum}` : 'Base', date: s.date }))
        .filter(p => p.val !== null && !isNaN(p.val));
    } else if (this.chartMode === 'waist_hip') {
      points = sessions
        .map((s, idx) => ({ x: idx, val: s.waist, label: `#${s.sessionNum}`, date: s.date }))
        .filter(p => p.val !== null && !isNaN(p.val));
    } else {
      points = sessions
        .map((s, idx) => ({ x: idx, val: s.weight, label: `#${s.sessionNum}`, date: s.date }))
        .filter(p => p.val !== null && !isNaN(p.val));
    }

    if (!points.length) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);">No numeric points available.</div>`;
      return;
    }

    const allVals = points.map(p => p.val);
    let minY = Math.min(...allVals);
    let maxY = Math.max(...allVals);
    if (minY === maxY) {
      minY -= 5;
      maxY += 5;
    } else {
      const margin = (maxY - minY) * 0.15;
      minY = Math.max(0, Math.floor(minY - margin));
      maxY = Math.ceil(maxY + margin);
    }

    const maxX = Math.max(points.length - 1, 1);
    const getX = (idx) => padding.left + (idx / maxX) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - minY) / (maxY - minY)) * plotHeight;

    let svg = `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <defs>
          <linearGradient id="stitchBlueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0284c7" stop-opacity="0.28" />
            <stop offset="100%" stop-color="#0284c7" stop-opacity="0.0" />
          </linearGradient>
        </defs>
    `;

    // Horizontal grid lines
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const yVal = minY + ((maxY - minY) / ySteps) * i;
      const yPos = getY(yVal);
      svg += `
        <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1" />
        <text x="${padding.left - 8}" y="${yPos + 4}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="end">${yVal.toFixed(0)} kg</text>
      `;
    }

    // Points coordinates
    const coords = points.map((p, idx) => ({ cx: getX(idx), cy: getY(p.val), val: p.val, label: p.label, date: p.date }));

    // Generate smooth cubic bezier path
    let pathD = `M ${coords[0].cx} ${coords[0].cy}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX = (p0.cx + p1.cx) / 2;
      pathD += ` C ${cpX} ${p0.cy}, ${cpX} ${p1.cy}, ${p1.cx} ${p1.cy}`;
    }

    // Area fill
    const areaD = `${pathD} L ${coords[coords.length - 1].cx} ${padding.top + plotHeight} L ${coords[0].cx} ${padding.top + plotHeight} Z`;
    svg += `<path d="${areaD}" fill="url(#stitchBlueGrad)" />`;
    svg += `<path d="${pathD}" fill="none" stroke="#0284c7" stroke-width="3" stroke-linecap="round" />`;

    // Circles and Point labels matching Image 1
    coords.forEach((p, idx) => {
      const isLatest = idx === coords.length - 1;
      const pointColor = isLatest ? '#0284c7' : '#0284c7';

      svg += `
        <circle cx="${p.cx}" cy="${p.cy}" r="${isLatest ? 5.5 : 4.5}" fill="${pointColor}" stroke="#ffffff" stroke-width="2.5" style="cursor: pointer;">
          <title>${p.label}: ${this.format1Dec(p.val)} kg (${p.date || 'Session'})</title>
        </circle>
        <text x="${p.cx}" y="${p.cy - 10}" fill="#0f172a" font-size="10" font-weight="800" text-anchor="middle">${this.format1Dec(p.val)}</text>
        <text x="${p.cx}" y="${height - padding.bottom + 18}" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">${isLatest ? 'Latest' : p.label}</text>
      `;
    });

    svg += `</svg>`;
    container.innerHTML = svg;
  }

  setupAddSessionForm(client) {
    const sessions = client.sessions || [];
    const nextSessionNum = sessions.length + 1;
    document.getElementById('new-session-number-hint').textContent = `(#${nextSessionNum})`;

    this.resetAddSessionFormInputs();
    this.calculateLiveWeightDelta();
  }

  copyPreviousSessionValues() {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client || !client.sessions || !client.sessions.length) {
      this.showToast('No previous session to copy from.', 'info');
      return;
    }

    const lastSess = client.sessions[client.sessions.length - 1];
    if (lastSess.weight) document.getElementById('form-session-weight').value = this.round1(lastSess.weight);
    if (lastSess.waist) document.getElementById('form-session-waist').value = this.round1(lastSess.waist);
    if (lastSess.lowerWaist) document.getElementById('form-session-lowwaist').value = this.round1(lastSess.lowerWaist);
    if (lastSess.hip) document.getElementById('form-session-hip').value = this.round1(lastSess.hip);
    if (lastSess.arm) document.getElementById('form-session-arm').value = this.round1(lastSess.arm);
    if (lastSess.chest) document.getElementById('form-session-chest').value = this.round1(lastSess.chest);
    if (lastSess.thigh) document.getElementById('form-session-thigh').value = this.round1(lastSess.thigh);
    if (lastSess.calves) document.getElementById('form-session-calves').value = this.round1(lastSess.calves);

    this.calculateLiveWeightDelta();
    this.showToast('Copied previous session measurements. Update what changed!', 'info');
  }

  calculateLiveWeightDelta() {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client || !client.sessions || !client.sessions.length) return;

    const lastSess = client.sessions[client.sessions.length - 1];
    const prevWeight = lastSess.weight;
    const currentWeightInput = document.getElementById('form-session-weight').value;
    const deltaBadge = document.getElementById('form-delta-badge');

    if (!currentWeightInput || prevWeight === null || prevWeight === undefined) {
      deltaBadge.textContent = '0.0 kg this session';
      deltaBadge.className = 'live-delta-badge';
      return;
    }

    const currentWeight = parseFloat(currentWeightInput);
    if (isNaN(currentWeight)) {
      deltaBadge.textContent = '0.0 kg this session';
      deltaBadge.className = 'live-delta-badge';
      return;
    }

    const delta = this.round1(currentWeight - prevWeight);
    const formatted = `${this.format1Dec(delta, true)} kg this session`;

    deltaBadge.textContent = formatted;
    if (delta > 0) {
      deltaBadge.className = 'live-delta-badge gain';
    } else {
      deltaBadge.className = 'live-delta-badge';
    }
  }

  resetAddSessionFormInputs() {
    document.getElementById('form-session-weight').value = '';
    document.getElementById('form-session-waist').value = '';
    document.getElementById('form-session-lowwaist').value = '';
    document.getElementById('form-session-hip').value = '';
    document.getElementById('form-session-arm').value = '';
    document.getElementById('form-session-chest').value = '';
    document.getElementById('form-session-thigh').value = '';
    document.getElementById('form-session-calves').value = '';
    document.getElementById('form-session-notes').value = '';

    const deltaBadge = document.getElementById('form-delta-badge');
    if (deltaBadge) {
      deltaBadge.textContent = '0.0 kg this session';
      deltaBadge.className = 'live-delta-badge';
    }
  }

  handleSaveNewSession(e) {
    e.preventDefault();
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client) return;

    const dateVal = document.getElementById('form-session-date').value || '2026-10-09';
    const weightRaw = parseFloat(document.getElementById('form-session-weight').value);
    const weightVal = this.round1(weightRaw);
    const waistVal = document.getElementById('form-session-waist').value ? this.round1(document.getElementById('form-session-waist').value) : null;
    const lowWaistVal = document.getElementById('form-session-lowwaist').value ? this.round1(document.getElementById('form-session-lowwaist').value) : null;
    const hipVal = document.getElementById('form-session-hip').value ? this.round1(document.getElementById('form-session-hip').value) : null;
    const armVal = document.getElementById('form-session-arm').value ? this.round1(document.getElementById('form-session-arm').value) : null;
    const chestVal = document.getElementById('form-session-chest').value ? this.round1(document.getElementById('form-session-chest').value) : null;
    const thighVal = document.getElementById('form-session-thigh').value ? this.round1(document.getElementById('form-session-thigh').value) : null;
    const calvesVal = document.getElementById('form-session-calves').value ? this.round1(document.getElementById('form-session-calves').value) : null;
    const notesVal = document.getElementById('form-session-notes').value.trim();

    if (isNaN(weightVal) || weightVal === null) {
      this.showToast('Please enter a valid weight in kg', 'danger');
      return;
    }

    if (!client.sessions) client.sessions = [];

    const lastSess = client.sessions[client.sessions.length - 1];
    let weightChg = 0;
    if (lastSess && lastSess.weight !== null && !isNaN(lastSess.weight)) {
      weightChg = this.round1(weightVal - lastSess.weight);
    }

    const newSession = {
      sessionNum: client.sessions.length + 1,
      page: client.page || '',
      date: dateVal,
      rawDate: dateVal,
      arm: armVal,
      chest: chestVal,
      waist: waistVal,
      lowerWaist: lowWaistVal,
      thigh: thighVal,
      hip: hipVal,
      calves: calvesVal,
      weight: weightVal,
      weightChg: weightChg,
      notes: notesVal
    };

    client.sessions.push(newSession);

    // Recalculate summary metrics (strictly 1 decimal)
    client.totalSessions = client.sessions.length;
    client.latestDate = dateVal;
    client.latestWeight = weightVal;
    if (client.initialWeight !== null) {
      client.weightChange = this.round1(weightVal - client.initialWeight);
    } else {
      client.initialWeight = weightVal;
      client.weightChange = 0;
    }

    if (waistVal !== null) {
      client.latestWaist = waistVal;
      if (client.initialWaist !== null) {
        client.waistChange = this.round1(waistVal - client.initialWaist);
      } else {
        client.initialWaist = waistVal;
        client.waistChange = 0;
      }
    }

    if (hipVal !== null) {
      client.latestHip = hipVal;
      if (client.initialHip !== null) {
        client.hipChange = this.round1(hipVal - client.initialHip);
      } else {
        client.initialHip = hipVal;
        client.hipChange = 0;
      }
    }

    this.saveData();
    this.renderStats();
    this.renderMeasurementsSection();
    this.populateKPIs(client);
    this.renderChart(client);
    this.renderSessionsTable(client);
    this.setupAddSessionForm(client);

    this.showToast(`Session #${newSession.sessionNum} recorded for ${client.name}!`, 'success');
  }

  // Longitudinal Session History Table (Image 1 Bottom)
  renderSessionsTable(client) {
    const tbody = document.getElementById('modal-sessions-table-body');
    const sessions = client.sessions || [];
    document.getElementById('history-sessions-count').textContent = sessions.length;

    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 2rem;">No measurement sessions logged yet.</td></tr>`;
      return;
    }

    const reversed = [...sessions].reverse();

    tbody.innerHTML = reversed.map(s => {
      const isLatest = s.sessionNum === sessions.length;
      const isBase = s.sessionNum === 1;

      const deltaClass = (s.weightChg < 0) ? 'loss' : (s.weightChg > 0 ? 'gain' : 'blue');
      const weightDeltaBadge = s.weightChg !== null && s.weightChg !== undefined
        ? `<span class="metric-kpi-delta-pill ${deltaClass}">${this.format1Dec(s.weightChg, true)} kg</span>`
        : '-';

      const tagHtml = isLatest
        ? `<span class="content-tab-badge" style="background:#e0f2fe; color:var(--brand-blue); margin-left:0.35rem;">Latest</span>`
        : (isBase ? `<span class="content-tab-badge" style="margin-left:0.35rem;">Base</span>` : '');

      return `
        <tr>
          <td><b style="color: var(--brand-blue);">#${s.sessionNum}</b> ${tagHtml}</td>
          <td style="font-weight: 600;">${s.date || s.rawDate || '-'}</td>
          <td style="font-weight: 800; color: #0284c7;">${this.format1Dec(s.weight)}</td>
          <td>${this.format1Dec(s.waist)}</td>
          <td>${this.format1Dec(s.lowerWaist)}</td>
          <td>${this.format1Dec(s.hip)}</td>
          <td>${this.format1Dec(s.arm)}</td>
          <td>${this.format1Dec(s.chest)}</td>
          <td>${this.format1Dec(s.thigh)}</td>
          <td>${this.format1Dec(s.calves)}</td>
          <td>${weightDeltaBadge}</td>
          <td style="font-size: 0.75rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(s.notes || '')}">
            ${this.escapeHtml(s.notes || '-')}
          </td>
          <td>
            <button class="btn-page" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; color: #dc2626;" onclick="app.deleteSession(${s.sessionNum})" title="Delete session">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  deleteSession(sessionNum) {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client || !client.sessions) return;

    if (!confirm(`Are you sure you want to delete Session #${sessionNum} for ${client.name}?`)) return;

    client.sessions = client.sessions.filter(s => s.sessionNum !== sessionNum);

    client.sessions.forEach((s, idx) => {
      s.sessionNum = idx + 1;
    });

    client.totalSessions = client.sessions.length;
    if (client.sessions.length > 0) {
      const last = client.sessions[client.sessions.length - 1];
      const first = client.sessions[0];
      client.latestDate = last.date || last.rawDate;
      client.latestWeight = this.round1(last.weight);
      client.weightChange = (last.weight && first.weight) ? this.round1(last.weight - first.weight) : 0;
      client.latestWaist = this.round1(last.waist);
      client.waistChange = (last.waist && first.waist) ? this.round1(last.waist - first.waist) : 0;
      client.latestHip = this.round1(last.hip);
      client.hipChange = (last.hip && first.hip) ? this.round1(last.hip - first.hip) : 0;
    }

    this.saveData();
    this.renderStats();
    this.renderMeasurementsSection();
    this.populateKPIs(client);
    this.renderChart(client);
    this.renderSessionsTable(client);
    this.setupAddSessionForm(client);

    this.showToast(`Session #${sessionNum} deleted.`, 'info');
  }

  // Client Accounts Subtab Window
  populateClientAccountsWindow(client) {
    document.getElementById('client-acc-expiry-date').textContent = client.admissionExpiryDate || 'Not set';
    const admitStatus = this.getAdmissionStatus(client.admissionExpiryDate);
    const statusBadge = document.getElementById('client-acc-status-badge');
    statusBadge.textContent = admitStatus.text;
    statusBadge.className = `status-pill ${admitStatus.pillClass}`;

    const dues = client.feeDues || 0;
    document.getElementById('client-acc-dues').textContent = `Rs. ${dues.toLocaleString()}`;
    document.getElementById('client-acc-monthly-rate').textContent = `Rs. ${(client.monthlyFeeRate || 3000).toLocaleString()}`;
    document.getElementById('client-acc-total-collected').textContent = `Rs. ${(client.totalFeePaid || 0).toLocaleString()}`;
    document.getElementById('client-acc-payment-count').textContent = `${(client.payments || []).length} receipts`;

    const duesStatus = document.getElementById('client-acc-dues-status');
    duesStatus.textContent = dues > 0 ? '⚠️ Outstanding balance pending' : '✓ Clear (No dues)';
    duesStatus.style.color = dues > 0 ? 'var(--accent-danger)' : 'var(--accent-success)';

    const tbody = document.getElementById('client-payments-tbody');
    const payments = client.payments || [];
    if (!payments.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 1.5rem;">No payment receipts recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => `
      <tr>
        <td><code style="color: var(--brand-blue); font-weight: 700;">#${p.receiptNo || 'REC'}</code></td>
        <td style="font-weight: 600;">${p.date || '-'}</td>
        <td><span class="content-tab-badge">${this.escapeHtml(p.type || 'Fee')}</span></td>
        <td style="font-weight: 800; color: var(--accent-success);">Rs. ${(p.amountPaid || 0).toLocaleString()}</td>
        <td>${p.duesRemaining > 0 ? `<span class="status-pill expired">Rs. ${p.duesRemaining.toLocaleString()}</span>` : '<span class="status-pill active">Rs. 0</span>'}</td>
        <td>${p.paymentMethod || 'Cash'}</td>
        <td>${p.period || '-'}</td>
        <td style="font-size: 0.75rem; color: var(--text-dim);">${this.escapeHtml(p.notes || '-')}</td>
        <td>
          <button class="btn-page" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; color: #dc2626;" onclick="app.deleteClientPayment('${p.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  deleteClientPayment(paymentId) {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client || !client.payments) return;

    if (confirm('Are you sure you want to delete this payment record?')) {
      client.payments = client.payments.filter(p => p.id !== paymentId);
      this.saveData();
      this.renderAll();
      this.populateClientAccountsWindow(client);
      this.showToast('Payment record removed.', 'info');
    }
  }

  // Client Attendance Subtab Window
  populateClientAttendanceWindow(client) {
    const attList = client.attendance || [];
    const totalVisits = attList.length;

    document.getElementById('client-att-summary-text').textContent = `Total Visits: ${totalVisits} logged`;

    const tbody = document.getElementById('client-attendance-tbody');
    if (!attList.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 1.5rem;">No attendance logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = attList.map((a, idx) => `
      <tr>
        <td><b>#${attList.length - idx}</b></td>
        <td style="font-weight: 600;">${a.date || '-'}</td>
        <td><span class="content-tab-badge" style="background:#e0f2fe; color:var(--brand-blue);">${a.time || '-'}</span></td>
        <td><span class="status-pill active">${a.status || 'Present'}</span></td>
        <td style="font-size: 0.75rem; color: var(--text-dim);">${this.escapeHtml(a.notes || '-')}</td>
        <td>
          <button class="btn-page" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; color: #dc2626;" onclick="app.deleteClientAttendance('${a.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  deleteClientAttendance(attId) {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client || !client.attendance) return;

    client.attendance = client.attendance.filter(a => a.id !== attId);
    this.saveData();
    this.renderAll();
    this.populateClientAttendanceWindow(client);
    this.showToast('Attendance entry removed.', 'info');
  }

  renewAdmission3Months() {
    const client = this.clients.find(c => c.id === this.activeClientId);
    if (!client) return;

    const today = '2026-10-09';
    client.admissionExpiryDate = this.calculateAdmissionExpiry(today);
    this.saveData();
    this.renderAll();
    this.openMeasurementWindow(client.id);
    this.showToast(`3-Month Admission validity renewed until ${client.admissionExpiryDate}!`, 'success');
  }

  checkinCurrentClient() {
    if (this.activeClientId) {
      this.checkinClientDirectly(this.activeClientId);
      const client = this.clients.find(c => c.id === this.activeClientId);
      if (client) this.populateClientAttendanceWindow(client);
    }
  }

  openCollectFeeModalForCurrentClient() {
    if (this.activeClientId) {
      this.switchMainTab('accounts');
      const select = document.getElementById('fast-record-client-select');
      if (select) {
        select.value = this.activeClientId;
        this.handleFastRecordClientChange(this.activeClientId);
      }
      this.closeMeasurementWindow();
    }
  }

  openCollectFeeModalForClient(clientId) {
    this.switchMainTab('accounts');
    const select = document.getElementById('fast-record-client-select');
    if (select) {
      select.value = clientId;
      this.handleFastRecordClientChange(clientId);
    }
  }

  openCollectFeeModal() {
    this.switchMainTab('accounts');
  }

  // ========================================================
  // ADD NEW CLIENT WITH 3-MONTH ADMISSION
  // ========================================================
  openAddClientModal() {
    this.setDefaultDates();
    const modal = document.getElementById('add-client-modal-overlay');
    if (modal) {
      modal.classList.add('active');
      setTimeout(() => document.getElementById('new-client-name')?.focus(), 100);
    }
  }

  closeAddClientModal() {
    document.getElementById('add-client-modal-overlay')?.classList.remove('active');
  }

  handleCreateClient(e) {
    e.preventDefault();
    const name = document.getElementById('new-client-name').value.trim();
    const volume = document.getElementById('new-client-volume').value.trim() || 'Vol 1 (2016-2025)';
    const page = document.getElementById('new-client-page').value.trim();
    const date = document.getElementById('new-client-date').value || '2026-10-09';
    
    // Accounts
    const admissionFee = parseFloat(document.getElementById('new-client-admission-fee').value) || 2000;
    const monthlyFee = parseFloat(document.getElementById('new-client-monthly-fee').value) || 3000;
    const admissionExpiry = this.calculateAdmissionExpiry(date);

    // Measurements (Strictly 1 Decimal Place)
    const weightRaw = parseFloat(document.getElementById('new-client-weight').value);
    const weight = this.round1(weightRaw);
    const waist = document.getElementById('new-client-waist').value ? this.round1(document.getElementById('new-client-waist').value) : null;
    const lowWaist = document.getElementById('new-client-lowwaist').value ? this.round1(document.getElementById('new-client-lowwaist').value) : null;
    const hip = document.getElementById('new-client-hip').value ? this.round1(document.getElementById('new-client-hip').value) : null;
    const arm = document.getElementById('new-client-arm').value ? this.round1(document.getElementById('new-client-arm').value) : null;
    const chest = document.getElementById('new-client-chest').value ? this.round1(document.getElementById('new-client-chest').value) : null;
    const thigh = document.getElementById('new-client-thigh').value ? this.round1(document.getElementById('new-client-thigh').value) : null;
    const calves = document.getElementById('new-client-calves').value ? this.round1(document.getElementById('new-client-calves').value) : null;
    const notes = document.getElementById('new-client-notes').value.trim() || 'Baseline assessment';

    if (!name) {
      this.showToast('Please enter the client name.', 'danger');
      return;
    }
    if (isNaN(weight) || weight === null) {
      this.showToast('Please enter a valid baseline weight.', 'danger');
      return;
    }

    const newId = `c_${Date.now()}`;
    const initialSession = {
      sessionNum: 1,
      page: page,
      date: date,
      rawDate: date,
      arm: arm,
      chest: chest,
      waist: waist,
      lowerWaist: lowWaist,
      thigh: thigh,
      hip: hip,
      calves: calves,
      weight: weight,
      weightChg: 0,
      notes: notes
    };

    const initialPayment = {
      id: `pay_${Date.now()}`,
      receiptNo: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      date: date,
      type: 'Adm + Monthly',
      amountPaid: admissionFee,
      duesRemaining: 0,
      paymentMethod: 'Cash',
      period: 'Enrollment',
      notes: 'Initial admission fee paid (valid for 3 months)'
    };

    const newClient = {
      id: newId,
      name: name,
      volume: volume,
      page: page,
      totalSessions: 1,
      firstDate: date,
      latestDate: date,
      initialWeight: weight,
      latestWeight: weight,
      weightChange: 0,
      initialWaist: waist,
      latestWaist: waist,
      waistChange: 0,
      initialHip: hip,
      latestHip: hip,
      hipChange: 0,
      isNew: true,
      
      // Accounts
      admissionDate: date,
      admissionExpiryDate: admissionExpiry,
      admissionFee: admissionFee,
      monthlyFeeRate: monthlyFee,
      totalFeePaid: admissionFee,
      feeDues: 0,
      payments: [initialPayment],

      // Attendance
      attendance: [{
        id: `att_${Date.now()}`,
        date: date,
        time: '10:00 AM',
        status: 'Present',
        notes: 'First visit & enrollment'
      }],

      sessions: [initialSession]
    };

    this.clients.unshift(newClient);
    this.saveData();

    this.closeAddClientModal();
    this.populateClientSelectDropdowns();
    this.renderAll();

    this.openMeasurementWindow(newId);
    this.showToast(`New client "${name}" enrolled with 3-Month Admission until ${admissionExpiry}!`, 'success');

    document.getElementById('add-client-form')?.reset();
  }

  // ========================================================
  // SPOTLIGHT QUICK JUMP (CTRL+K / /)
  // ========================================================
  openSpotlight() {
    const overlay = document.getElementById('spotlight-modal-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    const input = document.getElementById('spotlight-input');
    input.value = '';
    this.spotlightSelectedIndex = 0;
    this.renderSpotlightResults('');
    setTimeout(() => input.focus(), 50);
  }

  closeSpotlight() {
    document.getElementById('spotlight-modal-overlay')?.classList.remove('active');
  }

  handleSpotlightOverlayClick(e) {
    if (e.target.id === 'spotlight-modal-overlay') {
      this.closeSpotlight();
    }
  }

  handleSpotlightInput(val) {
    this.spotlightSelectedIndex = 0;
    this.renderSpotlightResults(val);
  }

  renderSpotlightResults(query) {
    const q = (query || '').trim().toLowerCase();
    const container = document.getElementById('spotlight-results');

    let matches = this.clients.filter(c => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.volume || '').toLowerCase().includes(q);
    });

    this.spotlightResults = matches.slice(0, 25);
    const countEl = document.getElementById('spotlight-match-count');
    if (countEl) countEl.textContent = `${matches.length} clients available`;

    if (!this.spotlightResults.length) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-dim); font-size: 0.85rem;">No clients found matching "${this.escapeHtml(query)}"</div>`;
      return;
    }

    container.innerHTML = this.spotlightResults.map((c, idx) => {
      const isSelected = idx === this.spotlightSelectedIndex;
      const initials = this.getInitials(c.name);
      const admitStatus = this.getAdmissionStatus(c.admissionExpiryDate);
      const duesText = c.feeDues > 0 ? `Due: Rs. ${c.feeDues.toLocaleString()}` : 'Paid';

      return `
        <div class="spotlight-item ${isSelected ? 'selected' : ''}" onclick="app.selectSpotlightItem('${c.id}')">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="member-card-avatar" style="width: 34px; height: 34px; font-size: 0.82rem;">${initials}</div>
            <div>
              <div style="font-weight: 800; font-size: 0.92rem; color: var(--text-main);">${this.escapeHtml(c.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${this.escapeHtml(c.volume || 'Vol')} · Pg ${c.page || '-'} &nbsp;|&nbsp; <span class="status-pill ${admitStatus.pillClass}" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">● ${admitStatus.text}</span></div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 0.9rem;">${this.format1Dec(c.latestWeight)} kg</div>
            <div style="font-size: 0.72rem; font-weight: 700; color: ${c.feeDues > 0 ? 'var(--accent-danger)' : 'var(--accent-success)'};">${duesText}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  handleSpotlightKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.spotlightSelectedIndex < this.spotlightResults.length - 1) {
        this.spotlightSelectedIndex++;
        this.updateSpotlightSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.spotlightSelectedIndex > 0) {
        this.spotlightSelectedIndex--;
        this.updateSpotlightSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.spotlightResults[this.spotlightSelectedIndex]) {
        this.selectSpotlightItem(this.spotlightResults[this.spotlightSelectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      this.closeSpotlight();
    }
  }

  updateSpotlightSelection() {
    const items = document.querySelectorAll('.spotlight-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.spotlightSelectedIndex);
      if (idx === this.spotlightSelectedIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  selectSpotlightItem(clientId) {
    this.closeSpotlight();
    this.openMeasurementWindow(clientId);
  }

  // Quick Check-in Modal
  openQuickCheckinModal() {
    const modal = document.getElementById('quick-checkin-modal-overlay');
    if (!modal) return;
    modal.classList.add('active');
    this.filterCheckinList('');
    setTimeout(() => document.getElementById('quick-checkin-search')?.focus(), 50);
  }

  closeQuickCheckinModal() {
    document.getElementById('quick-checkin-modal-overlay')?.classList.remove('active');
  }

  filterCheckinList(query) {
    const q = (query || '').toLowerCase().trim();
    const list = document.getElementById('quick-checkin-list');
    if (!list) return;

    const matches = this.clients.filter(c => !q || c.name.toLowerCase().includes(q));

    list.innerHTML = matches.slice(0, 25).map(c => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.75rem; border-radius: var(--radius-sm); cursor: pointer;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'" onclick="app.checkinClientDirectly('${c.id}'); app.closeQuickCheckinModal();">
        <div style="font-weight: 700; font-size: 0.88rem;">${this.escapeHtml(c.name)} <small style="color: var(--text-muted); font-size: 0.72rem;">(${c.volume || 'Vol'})</small></div>
        <button class="btn-card-action btn-card-checkin" style="padding: 0.25rem 0.65rem; font-size: 0.72rem;">Check In</button>
      </div>
    `).join('');
  }

  // Backup & Restore
  openBackupModal() {
    document.getElementById('backup-modal-overlay')?.classList.add('active');
  }

  closeBackupModal() {
    document.getElementById('backup-modal-overlay')?.classList.remove('active');
  }

  downloadJSONBackup() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.clients, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gymfit_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Complete gym database JSON backup downloaded!', 'success');
  }

  handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          this.clients = parsed;
          this.sanitizeAndEnrichData();
          this.saveData();
          this.populateClientSelectDropdowns();
          this.renderAll();
          this.closeBackupModal();
          this.showToast(`Restored ${parsed.length} clients from backup successfully!`, 'success');
        } else {
          this.showToast('Invalid backup file format.', 'danger');
        }
      } catch (err) {
        this.showToast('Error parsing JSON backup file.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  downloadMasterCSV() {
    let csv = 'Client Name,Register Volume,Total Sessions,First Date,Latest Date,Initial Weight (kg),Latest Weight (kg),Weight Change (kg),Initial Waist (in),Latest Waist (in),Initial Hip (in),Latest Hip (in),Admission Date,Admission Expiry,Fee Dues (Rs),Total Paid (Rs)\n';

    this.clients.forEach(c => {
      const row = [
        `"${c.name}"`,
        `"${c.volume || ''}"`,
        (c.sessions && c.sessions.length) || c.totalSessions || 0,
        c.firstDate || '',
        c.latestDate || '',
        c.initialWeight !== null ? this.format1Dec(c.initialWeight) : '',
        c.latestWeight !== null ? this.format1Dec(c.latestWeight) : '',
        c.weightChange !== null ? this.format1Dec(c.weightChange, true) : '',
        c.initialWaist !== null ? this.format1Dec(c.initialWaist) : '',
        c.latestWaist !== null ? this.format1Dec(c.latestWaist) : '',
        c.initialHip !== null ? this.format1Dec(c.initialHip) : '',
        c.latestHip !== null ? this.format1Dec(c.latestHip) : '',
        c.admissionDate || '',
        c.admissionExpiryDate || '',
        c.feeDues || 0,
        c.totalFeePaid || 0
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gymfit_directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast('Master directory CSV downloaded!', 'success');
  }

  exportAccountsLedgerCSV() {
    let csv = 'Receipt No,Date,Member Name,Volume,Page,Fee Type,Amount Paid (Rs),Dues Left (Rs),Payment Method\n';
    this.clients.forEach(c => {
      (c.payments || []).forEach(p => {
        csv += `"${p.receiptNo || ''}","${p.date || ''}","${c.name}","${c.volume || ''}","${c.page || ''}","${p.type || ''}",${p.amountPaid || 0},${p.duesRemaining || 0},"${p.paymentMethod || 'Cash'}"\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gymfit_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast('Financial ledger CSV downloaded!', 'success');
  }

  resetToInitialDataset() {
    if (confirm('Are you sure you want to reset to the original 119 clients dataset? Any newly added clients or transactions will be reverted.')) {
      if (window.INITIAL_GYM_DATA) {
        this.clients = JSON.parse(JSON.stringify(window.INITIAL_GYM_DATA));
        this.sanitizeAndEnrichData();
        this.saveData();
        this.populateClientSelectDropdowns();
        this.renderAll();
        this.closeBackupModal();
        if (this.activeClientId) this.openMeasurementWindow(this.activeClientId);
        this.showToast('Reset to original 119 clients dataset completed!', 'info');
      }
    }
  }

  // --- PWA DIRECT INSTALLATION SYSTEM ---
  initInstallPromptListener() {
    // 1. Register Service Worker immediately on HTTP/HTTPS/localhost
    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('GymFit Pro Service Worker active.'))
        .catch(err => console.log('SW note:', err));
    }

    // 2. Listen for Chrome/Edge/Chromebook native install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Show native direct button in modal & top banner
      const nativeBox = document.getElementById('install-native-prompt-box');
      if (nativeBox) nativeBox.style.display = 'block';

      const banner = document.getElementById('pwa-install-banner');
      if (banner && !localStorage.getItem('gym_pwa_banner_dismissed')) {
        banner.style.display = 'flex';
      }

      // If user came via ?direct_install=true, fire native prompt instantly!
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('direct_install') === 'true' || urlParams.get('auto_install') === 'true') {
        setTimeout(() => this.triggerNativeInstall(), 400);
      }
    });

    // 3. Listen for completed install
    window.addEventListener('appinstalled', () => {
      this.showToast('GymFit Tracker Pro installed successfully as a native app!', 'success');
      this.deferredPrompt = null;
      this.closeInstallModal();
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
    });

    // 4. Check if running in standalone window mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
      const headerInstall = document.getElementById('btn-install-app');
      if (headerInstall) headerInstall.style.display = 'none';
    }

    // 5. If running on file://, test if local web server is reachable
    if (location.protocol === 'file:') {
      fetch('http://localhost:8080/manifest.json')
        .then(res => {
          if (res.ok) {
            this.localServerOnline = true;
            const banner = document.getElementById('pwa-install-banner');
            if (banner && !localStorage.getItem('gym_pwa_banner_dismissed')) {
              banner.style.display = 'flex';
            }
          }
        })
        .catch(() => { this.localServerOnline = false; });
    }
  }

  // Direct 1-Click Install Button Handler
  directInstallApp() {
    if (this.deferredPrompt) {
      // Trigger native browser install dialog directly!
      this.triggerNativeInstall();
    } else if (location.protocol === 'file:') {
      // If opened as file://, switch directly to local server where 1-click install works natively
      window.location.href = 'http://localhost:8080/?direct_install=true';
    } else {
      // If deferredPrompt is pending or on http, open action card modal
      this.openInstallModal();
    }
  }

  promptInstallApp() {
    this.directInstallApp();
  }

  async triggerNativeInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this.showToast('Installing GymFit Tracker Pro...', 'success');
        this.deferredPrompt = null;
        this.closeInstallModal();
      }
    } else if (location.protocol === 'file:') {
      this.openLocalhostInstallMode();
    } else {
      this.openInstallModal();
    }
  }

  openLocalhostInstallMode() {
    window.location.href = 'http://localhost:8080/?direct_install=true';
  }

  dismissInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('gym_pwa_banner_dismissed', 'true');
  }

  openInstallModal() {
    const nativeBox = document.getElementById('install-native-prompt-box');
    if (nativeBox) nativeBox.style.display = this.deferredPrompt ? 'block' : 'none';
    document.getElementById('install-modal-overlay')?.classList.add('active');
  }

  closeInstallModal() {
    document.getElementById('install-modal-overlay')?.classList.remove('active');
  }

  handleInstallOverlayClick(e) {
    if (e.target.id === 'install-modal-overlay') {
      this.closeInstallModal();
    }
  }

  // --- FIREBASE CLOUD DATABASE ENGINE ---
  initFirebase() {
    this.updateFirebaseStatusUI('init', 'Connecting...');
    
    // Check if Firebase SDK is present
    if (typeof firebase === 'undefined') {
      console.log('Firebase SDK not loaded, running in local database mode.');
      this.updateFirebaseStatusUI('local', 'Local Database');
      return;
    }

    // Resolve configuration (localStorage priority, then window.FIREBASE_CONFIG)
    let config = null;
    const storedConfig = localStorage.getItem('gym_firebase_config');
    if (storedConfig) {
      try { config = JSON.parse(storedConfig); } catch (e) {}
    }
    if (!config && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
      config = window.FIREBASE_CONFIG;
    }

    if (!config || !config.apiKey || !config.projectId) {
      console.log('Firebase credentials not configured. Running in Local Database mode.');
      this.updateFirebaseStatusUI('unconfigured', 'Cloud Sync (Setup)');
      return;
    }

    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(config);
      }
      this.db = firebase.firestore();

      // Enable offline persistence if supported
      try {
        this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
          if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
            console.warn('Firestore persistence notice:', err);
          }
        });
      } catch (pe) {}

      this.isFirebaseConnected = true;
      this.updateFirebaseStatusUI('connected', 'Live Synced');
      this.populateFirebaseInputsFromConfig(config);
      this.listenToFirebaseUpdates();
      console.log('Connected to Firebase Firestore project:', config.projectId);
    } catch (err) {
      console.error('Failed to initialize Firebase:', err);
      this.updateFirebaseStatusUI('error', 'Firebase Error');
    }
  }

  listenToFirebaseUpdates() {
    if (!this.db) return;
    if (this.firebaseUnsubscribe) {
      this.firebaseUnsubscribe();
    }

    this.firebaseUnsubscribe = this.db.collection('gym_clients').onSnapshot((snapshot) => {
      if (snapshot.empty) {
        console.log('Firestore collection gym_clients is empty. Local dataset available for seeding.');
        this.updateFirebaseStatusUI('connected', 'Cloud Ready (0 docs)');
        return;
      }

      const cloudClients = [];
      snapshot.forEach(doc => {
        cloudClients.push(doc.data());
      });

      if (cloudClients.length > 0 && !this.isSeedingFirebase) {
        // Update local dataset with cloud source of truth
        this.clients = cloudClients;
        this.sanitizeAndEnrichData();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.clients));
        this.renderAll();
        this.updateFirebaseStatusUI('synced', `Live Synced (${cloudClients.length})`);
      }
    }, (err) => {
      console.warn('Firestore snapshot listener warning:', err);
      this.updateFirebaseStatusUI('offline', 'Offline (Cached)');
    });
  }

  async uploadLocalToFirebase() {
    if (!this.db) {
      this.showToast('Please configure Firebase credentials first.', 'danger');
      this.openFirebaseModal();
      return;
    }

    if (!confirm(`Are you sure you want to upload all ${this.clients.length} members and their sessions to Firebase Cloud?`)) {
      return;
    }

    this.isSeedingFirebase = true;
    this.showToast('Uploading gym members to Firebase Cloud...', 'info');

    try {
      const batchSize = 100;
      let count = 0;

      for (let i = 0; i < this.clients.length; i += batchSize) {
        const batch = this.db.batch();
        const chunk = this.clients.slice(i, i + batchSize);
        chunk.forEach(client => {
          const docRef = this.db.collection('gym_clients').doc(client.id);
          batch.set(docRef, client, { merge: true });
        });
        await batch.commit();
        count += chunk.length;
      }

      this.isSeedingFirebase = false;
      this.showToast(`Successfully uploaded ${count} members to Firebase!`, 'success');
      this.updateFirebaseStatusUI('synced', `Live Synced (${count})`);
      this.closeFirebaseModal();
    } catch (err) {
      this.isSeedingFirebase = false;
      console.error('Firebase upload error:', err);
      this.showToast(`Upload failed: ${err.message}`, 'danger');
    }
  }

  async pullFromFirebase() {
    if (!this.db) {
      this.showToast('Please connect to Firebase first.', 'danger');
      return;
    }

    this.showToast('Fetching latest data from Firebase Cloud...', 'info');
    try {
      const snapshot = await this.db.collection('gym_clients').get();
      if (snapshot.empty) {
        this.showToast('No member records found in Firebase.', 'info');
        return;
      }

      const cloudClients = [];
      snapshot.forEach(doc => cloudClients.push(doc.data()));
      this.clients = cloudClients;
      this.sanitizeAndEnrichData();
      this.saveData();
      this.renderAll();
      this.showToast(`Downloaded ${cloudClients.length} members from Cloud!`, 'success');
      this.closeFirebaseModal();
    } catch (err) {
      console.error('Pull from Firebase error:', err);
      this.showToast(`Download failed: ${err.message}`, 'danger');
    }
  }

  async syncAllClientsToFirebase(showAlert = false) {
    if (!this.db || !this.isFirebaseConnected) return;
    try {
      const batch = this.db.batch();
      this.clients.slice(0, 100).forEach(c => {
        const docRef = this.db.collection('gym_clients').doc(c.id);
        batch.set(docRef, c, { merge: true });
      });
      await batch.commit();
      if (showAlert) this.showToast('All client data synced with Firebase.', 'success');
    } catch (err) {
      console.warn('Sync all warning:', err);
    }
  }

  updateFirebaseStatusUI(status, label) {
    const chip = document.getElementById('header-firebase-status-pill');
    const chipText = document.getElementById('header-firebase-status-text');
    const chipDot = document.getElementById('header-firebase-dot');

    const modalDot = document.getElementById('firebase-status-dot');
    const modalHeading = document.getElementById('firebase-status-heading');
    const modalSub = document.getElementById('firebase-status-sub');

    if (chipText) chipText.textContent = label;

    if (status === 'synced' || status === 'connected') {
      if (chip) chip.className = 'header-chip green';
      if (chipDot) chipDot.style.background = 'var(--accent-success)';
      if (modalDot) modalDot.style.background = 'var(--accent-success)';
      if (modalHeading) modalHeading.textContent = 'Connected to Firebase Firestore';
      if (modalSub) modalSub.textContent = 'Real-time two-way synchronization active';
    } else if (status === 'unconfigured' || status === 'local') {
      if (chip) chip.className = 'header-chip blue';
      if (chipDot) chipDot.style.background = 'var(--brand-blue)';
      if (modalDot) modalDot.style.background = '#f59e0b';
      if (modalHeading) modalHeading.textContent = 'Running in Local Mode';
      if (modalSub) modalSub.textContent = 'Firebase credentials not set yet';
    } else if (status === 'offline') {
      if (chip) chip.className = 'header-chip blue';
      if (chipDot) chipDot.style.background = '#94a3b8';
      if (modalDot) modalDot.style.background = '#94a3b8';
      if (modalHeading) modalHeading.textContent = 'Offline (Local Cache Active)';
      if (modalSub) modalSub.textContent = 'Updates will sync when internet restores';
    } else if (status === 'error') {
      if (chip) chip.className = 'header-chip red';
      if (chipDot) chipDot.style.background = 'var(--accent-danger)';
      if (modalDot) modalDot.style.background = 'var(--accent-danger)';
      if (modalHeading) modalHeading.textContent = 'Firebase Connection Error';
      if (modalSub) modalSub.textContent = 'Check Firestore rules and API credentials';
    }
  }

  populateFirebaseInputsFromConfig(cfg) {
    if (!cfg) return;
    const fields = ['projectId', 'apiKey', 'authDomain', 'storageBucket', 'messagingSenderId', 'appId'];
    fields.forEach(f => {
      const el = document.getElementById(`fb-input-${f}`);
      if (el && cfg[f]) el.value = cfg[f];
    });
  }

  saveFirebaseConfigFromInputs() {
    const config = {
      projectId: document.getElementById('fb-input-projectId')?.value.trim() || '',
      apiKey: document.getElementById('fb-input-apiKey')?.value.trim() || '',
      authDomain: document.getElementById('fb-input-authDomain')?.value.trim() || '',
      storageBucket: document.getElementById('fb-input-storageBucket')?.value.trim() || '',
      messagingSenderId: document.getElementById('fb-input-messagingSenderId')?.value.trim() || '',
      appId: document.getElementById('fb-input-appId')?.value.trim() || ''
    };

    if (!config.projectId || !config.apiKey) {
      this.showToast('Please provide at least Project ID and API Key.', 'danger');
      return;
    }

    localStorage.setItem('gym_firebase_config', JSON.stringify(config));
    this.showToast('Credentials saved! Initializing Firebase...', 'success');
    this.initFirebase();
  }

  parseAndApplyRawConfig() {
    const raw = document.getElementById('firebase-raw-config-input')?.value || '';
    if (!raw.trim()) {
      this.showToast('Please paste your Firebase config snippet first.', 'info');
      return;
    }

    try {
      const extract = (key) => {
        const m = raw.match(new RegExp(`${key}['"\\s]*:['"\\s]*([^'"\\s,;]+)`, 'i'));
        return m ? m[1].replace(/['",;]/g, '').trim() : '';
      };

      const config = {
        projectId: extract('projectId'),
        apiKey: extract('apiKey'),
        authDomain: extract('authDomain'),
        storageBucket: extract('storageBucket'),
        messagingSenderId: extract('messagingSenderId'),
        appId: extract('appId')
      };

      if (!config.projectId && !config.apiKey) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          Object.assign(config, parsed);
        }
      }

      this.populateFirebaseInputsFromConfig(config);
      this.showToast('Credentials extracted successfully! Click "Save & Connect".', 'success');
    } catch (e) {
      this.showToast('Could not automatically parse config. Please enter fields manually.', 'danger');
    }
  }

  clearFirebaseConfig() {
    if (confirm('Clear saved Firebase credentials and revert to local storage?')) {
      localStorage.removeItem('gym_firebase_config');
      if (this.firebaseUnsubscribe) this.firebaseUnsubscribe();
      this.db = null;
      this.isFirebaseConnected = false;
      this.populateFirebaseInputsFromConfig({ projectId: '', apiKey: '', authDomain: '', storageBucket: '', messagingSenderId: '', appId: '' });
      const raw = document.getElementById('firebase-raw-config-input');
      if (raw) raw.value = '';
      this.updateFirebaseStatusUI('local', 'Local Database');
      this.showToast('Firebase credentials cleared. Reverted to Local DB.', 'info');
    }
  }

  async testFirebaseConnection() {
    if (!this.db) {
      this.initFirebase();
      return;
    }
    this.showToast('Testing Firebase Firestore connection...', 'info');
    try {
      await this.db.collection('gym_clients').limit(1).get();
      this.showToast('Firebase connection test passed successfully! ✅', 'success');
      this.updateFirebaseStatusUI('connected', 'Live Synced');
    } catch (err) {
      this.showToast(`Connection test failed: ${err.message}`, 'danger');
      this.updateFirebaseStatusUI('error', 'Connection Failed');
    }
  }

  openFirebaseModal() {
    const stored = localStorage.getItem('gym_firebase_config');
    if (stored) {
      try { this.populateFirebaseInputsFromConfig(JSON.parse(stored)); } catch (e) {}
    } else if (window.FIREBASE_CONFIG) {
      this.populateFirebaseInputsFromConfig(window.FIREBASE_CONFIG);
    }
    document.getElementById('firebase-modal-overlay')?.classList.add('active');
  }

  closeFirebaseModal() {
    document.getElementById('firebase-modal-overlay')?.classList.remove('active');
  }

  handleFirebaseOverlayClick(e) {
    if (e.target.id === 'firebase-modal-overlay') {
      this.closeFirebaseModal();
    }
  }

  // --- KEYBOARD SHORTCUTS ---
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openSpotlight();
        return;
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        this.openSpotlight();
        return;
      }

      if (e.key === 'Escape') {
        const spotlight = document.getElementById('spotlight-modal-overlay');
        const measurement = document.getElementById('measurement-modal-overlay');
        const addClient = document.getElementById('add-client-modal-overlay');
        const quickCheckin = document.getElementById('quick-checkin-modal-overlay');
        const backup = document.getElementById('backup-modal-overlay');
        const installModal = document.getElementById('install-modal-overlay');
        const firebaseModal = document.getElementById('firebase-modal-overlay');

        if (spotlight && spotlight.classList.contains('active')) this.closeSpotlight();
        else if (firebaseModal && firebaseModal.classList.contains('active')) this.closeFirebaseModal();
        else if (quickCheckin && quickCheckin.classList.contains('active')) this.closeQuickCheckinModal();
        else if (addClient && addClient.classList.contains('active')) this.closeAddClientModal();
        else if (backup && backup.classList.contains('active')) this.closeBackupModal();
        else if (installModal && installModal.classList.contains('active')) this.closeInstallModal();
        else if (measurement && measurement.classList.contains('active')) this.closeMeasurementWindow();
        return;
      }

      const measurement = document.getElementById('measurement-modal-overlay');
      if (measurement && measurement.classList.contains('active') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        if (e.key === 'ArrowLeft') {
          this.navigateClient(-1);
        } else if (e.key === 'ArrowRight') {
          this.navigateClient(1);
        }
      }
    });
  }

  // --- TOAST NOTIFICATIONS ---
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3400);
  }

  // --- HELPERS ---
  getInitials(name) {
    if (!name) return 'GP';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global initialization
let app;
function initGymApp() {
  if (!app) {
    app = new GymApp();
    window.app = app;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGymApp);
} else {
  initGymApp();
}
