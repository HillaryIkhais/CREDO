const app = {
  state: {
    currentView: 'home',
    demoMode: false,
    scanning: false,
    phase: 'idle',
    flashlightOn: false,
    zoomLevel: 1,
    onboarded: false,
    history: [],
    demoIndex: 0,
    online: navigator.onLine,
    cameraActive: false,
    stream: null,
  },

  DEMO_BATCHES: {
    'PA2128L': { drug: 'Combisunate', dose: '80/480mg', manufacturer: 'Bliss GVS Pharma', expiry: '2025-06-30', status: 'counterfeit', reason: 'Unregistered batch flagged by NAFDAC', date: '2024-11-12', location: 'Lagos Market' },
    'VALID123': { drug: 'Amoxicillin', dose: '500mg', manufacturer: 'Emzor Pharmaceutical', expiry: '2026-12-31', status: 'authentic', date: '2024-11-14', location: 'Lagos Pharmacy' },
    'XC9032': { drug: 'Paracetamol', dose: '500mg', manufacturer: 'Swiss Pharma Nigeria', expiry: '2026-08-15', status: 'authentic', date: '2024-11-15', location: 'Abuja Clinic' },
    'MET500X': { drug: 'Metformin', dose: '500mg', manufacturer: 'Nigerian Ethical Products', expiry: '2026-03-20', status: 'authentic', date: '2024-11-10', location: 'Port Harcourt' },
    'FKE2024': { drug: 'Coartem', dose: '20/120mg', manufacturer: 'Novartis', expiry: '2025-09-01', status: 'counterfeit', reason: 'Batch not in manufacturer database', date: '2024-11-08', location: 'Kano Market' },
  },

  DEMO_SCANS: [
    { batch: 'PA2128L', expected: 'counterfeit' },
    { batch: 'VALID123', expected: 'authentic' },
  ],

  init() {
    if (!localStorage.getItem('credo_onboarded')) {
      document.getElementById('onboarding').classList.remove('hidden');
    }
    window.addEventListener('online', () => this.updateOnlineStatus(true));
    window.addEventListener('offline', () => this.updateOnlineStatus(false));
    this.updateOnlineStatus(navigator.onLine);
    this.renderHistory();
    this.fetchDashboardData();
  },

  updateOnlineStatus(online) {
    this.state.online = online;
    const badge = document.getElementById('offline-badge');
    const liveBadge = document.getElementById('live-badge');
    const modeText = document.getElementById('mode-badge-text');
    const modeBadge = document.getElementById('mode-badge');

    if (online) {
      badge.classList.add('hidden');
      liveBadge.style.display = '';
      modeText.textContent = 'Live Sync';
      modeBadge.className = 'mode-badge live';
    } else {
      badge.classList.remove('hidden');
      liveBadge.style.display = 'none';
      modeText.textContent = 'Offline Mode';
      modeBadge.className = 'mode-badge offline';
    }
  },

  completeOnboarding() {
    this.state.onboarded = true;
    localStorage.setItem('credo_onboarded', '1');
    document.getElementById('onboarding').classList.add('hidden');
  },

  nextOnboardingPage() {
    const pages = document.querySelectorAll('.onboarding-page');
    let current = -1;
    pages.forEach((p, i) => { if (p.classList.contains('active')) current = i; });
    if (current < pages.length - 1) {
      pages[current].classList.remove('active');
      pages[current + 1].classList.add('active');
      document.getElementById('onboarding-prev').disabled = false;
      if (current + 1 === pages.length - 1) {
        document.getElementById('onboarding-next').textContent = 'Get Started';
        document.getElementById('onboarding-next').onclick = () => this.completeOnboarding();
      }
    }
  },

  prevOnboardingPage() {
    const pages = document.querySelectorAll('.onboarding-page');
    let current = -1;
    pages.forEach((p, i) => { if (p.classList.contains('active')) current = i; });
    if (current > 0) {
      pages[current].classList.remove('active');
      pages[current - 1].classList.add('active');
      document.getElementById('onboarding-next').textContent = 'Next';
      document.getElementById('onboarding-next').onclick = () => this.nextOnboardingPage();
      if (current - 1 === 0) document.getElementById('onboarding-prev').disabled = true;
    }
  },

  requestPermissions() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => this.completeOnboarding())
        .catch(() => this.completeOnboarding());
    } else {
      this.completeOnboarding();
    }
  },

  navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById('view-' + view).classList.add('active-view');
    this.state.currentView = view;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (view === 'home') document.querySelectorAll('.nav-item')[0].classList.add('active');
    else if (view === 'scan') document.querySelectorAll('.nav-item')[1].classList.add('active');
    else if (view === 'dashboard' || view === 'arch') document.querySelectorAll('.nav-item')[2].classList.add('active');

    if (view === 'scan' && !this.state.demoMode) this.startScanner();
    if (view === 'dashboard') this.fetchDashboardData();
    if (view !== 'scan' && !this.state.demoMode) this.stopScanner();
  },

  toggleDemo() {
    this.state.demoMode = !this.state.demoMode;
    const label = document.getElementById('demo-label');
    const overlay = document.getElementById('demo-overlay');
    const scanFrame = document.getElementById('scan-frame');
    const liveBadge = document.getElementById('live-badge');
    const offlineBadge = document.getElementById('offline-badge');

    if (this.state.demoMode) {
      label.textContent = 'Exit Demo';
      overlay.classList.remove('hidden');
      scanFrame.style.display = 'none';
      liveBadge.style.display = 'none';
      offlineBadge.classList.add('hidden');
      document.getElementById('camera-feed').style.display = 'none';
      this.setDemoPackage(this.DEMO_SCANS[0].batch);
      document.getElementById('demo-overlay').onclick = () => this.triggerDemoScan();
    } else {
      label.textContent = 'Try Live Demo';
      overlay.classList.add('hidden');
      scanFrame.style.display = '';
      liveBadge.style.display = '';
      document.getElementById('camera-feed').style.display = '';
      this.stopScanner();
    }
  },

  enableDemoFromError() {
    document.getElementById('scan-error').classList.add('hidden');
    this.state.demoMode = true;
    document.getElementById('demo-label').textContent = 'Exit Demo';
    document.getElementById('demo-overlay').classList.remove('hidden');
    document.getElementById('scan-frame').style.display = 'none';
    document.getElementById('live-badge').style.display = 'none';
    document.getElementById('offline-badge').classList.add('hidden');
    document.getElementById('camera-feed').style.display = 'none';
    this.setDemoPackage(this.DEMO_SCANS[0].batch);
    document.getElementById('demo-overlay').onclick = () => this.triggerDemoScan();
  },

  async startScanner() {
    if (this.state.demoMode || this.state.cameraActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      this.state.stream = stream;
      this.state.cameraActive = true;
      const video = document.getElementById('camera-feed');
      video.srcObject = stream;
      document.getElementById('scan-status').textContent = 'ALIGN MEDICATION';
    } catch (err) {
      document.getElementById('scan-error-text').textContent =
        'Camera access needed for live scanning. You can use Demo Mode instead.';
      document.getElementById('scan-error').classList.remove('hidden');
    }
  },

  stopScanner() {
    if (this.state.stream) {
      this.state.stream.getTracks().forEach(t => t.stop());
      this.state.stream = null;
      this.state.cameraActive = false;
    }
  },

  setDemoPackage(batch) {
    const info = this.DEMO_BATCHES[batch];
    if (!info) return;
    const expParts = (info.expiry || '2025-12-31').split('-');
    const expStr = expParts[1] + '/' + expParts[0].slice(2);
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('pkg-drug', info.drug);
    el('pkg-dose', info.dose + ' Tablets');
    el('pkg-mfg', info.manufacturer);
    el('pkg-batch', batch);
    el('pkg-exp', expStr);
  },

  resetScanner() {
    this.state.scanning = false;
    this.state.phase = 'idle';
    document.getElementById('verdict-safe').classList.add('hidden');
    document.getElementById('verdict-fake').classList.add('hidden');
    const aiPanel = document.getElementById('ai-panel');
    const ocrDisplay = document.getElementById('ocr-display');
    const scanLine = document.getElementById('scan-line');
    const scanFrame = document.getElementById('scan-frame');
    const scanFooter = document.querySelector('.scan-footer');
    const scanToolbar = document.querySelector('.scan-toolbar');
    const scanHeader = document.querySelector('.scan-header');
    if (aiPanel) { aiPanel.style.display = ''; aiPanel.classList.add('hidden'); }
    if (ocrDisplay) { ocrDisplay.style.display = ''; ocrDisplay.classList.add('hidden'); }
    if (scanLine) { scanLine.style.display = ''; scanLine.classList.remove('active'); }
    if (scanFrame) scanFrame.style.display = '';
    if (scanFooter) scanFooter.style.display = '';
    if (scanToolbar) scanToolbar.style.display = '';
    if (scanHeader) scanHeader.style.display = '';
    document.getElementById('scan-status').textContent = this.state.demoMode ? 'TAP TO SCAN' : 'ALIGN MEDICATION';
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('step-' + i);
      el.classList.remove('active', 'done');
      el.querySelector('.step-icon').textContent = '\u25CB';
    }
    if (this.state.demoMode) {
      const nextScan = this.DEMO_SCANS[this.state.demoIndex % this.DEMO_SCANS.length];
      this.setDemoPackage(nextScan.batch);
      const demoPkg = document.getElementById('demo-package');
      if (demoPkg) demoPkg.style.display = '';
      const demoOverlay = document.getElementById('demo-overlay');
      if (demoOverlay) demoOverlay.style.display = '';
      document.getElementById('scan-frame').style.display = 'none';
      document.getElementById('demo-overlay').onclick = () => this.triggerDemoScan();
    }
  },

  async triggerDemoScan() {
    if (this.state.scanning) return;
    this.state.scanning = true;
    const scan = this.DEMO_SCANS[this.state.demoIndex % this.DEMO_SCANS.length];
    this.state.demoIndex++;

    document.getElementById('demo-overlay').onclick = null;
    const scanLine = document.getElementById('scan-frame').querySelector('.scan-line') || document.getElementById('scan-line');

    document.getElementById('scan-status').textContent = 'CAPTURING IMAGE';
    const pkg = document.getElementById('demo-package');
    if (pkg) pkg.style.animation = 'pkgFlash 0.3s ease';
    await this.sleep(600);
    if (pkg) pkg.style.animation = '';

    document.getElementById('scan-status').textContent = 'PROCESSING';
    const aiPanel = document.getElementById('ai-panel');
    aiPanel.classList.remove('hidden');

    const steps = [
      { id: 'step-1', delay: 700, text: 'Package detected' },
      { id: 'step-2', delay: 700, text: 'Text region identified' },
      { id: 'step-3', delay: 800, text: 'OCR extraction' },
      { id: 'step-4', delay: 600, text: 'Batch number parsed' },
      { id: 'step-5', delay: 900, text: 'Checking local database' },
    ];

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const el = document.getElementById(s.id);
      el.classList.add('active');
      el.querySelector('.step-icon').textContent = '\u25CF';
      await this.sleep(s.delay);

      if (i === 2) {
        const ocrDisplay = document.getElementById('ocr-display');
        ocrDisplay.classList.remove('hidden');
        document.getElementById('ocr-text').textContent = scan.batch;
      }

      el.classList.remove('active');
      el.classList.add('done');
      el.querySelector('.step-icon').textContent = '\u2713';
    }

    await this.sleep(400);
    this.showVerdict(scan.batch);
  },

  showVerdict(batch) {
    const info = this.DEMO_BATCHES[batch];
    const isFake = info && info.status === 'counterfeit';
    const netStatus = this.state.online ? 'ONLINE' : 'OFFLINE';

    const demoPkg = document.getElementById('demo-package');
    const aiPanel = document.getElementById('ai-panel');
    const ocrDisplay = document.getElementById('ocr-display');
    const scanLine = document.getElementById('scan-line');
    const scanFrame = document.getElementById('scan-frame');
    const scanFooter = document.querySelector('.scan-footer');
    const scanToolbar = document.querySelector('.scan-toolbar');
    const scanHeader = document.querySelector('.scan-header');
    if (demoPkg) demoPkg.style.display = 'none';
    if (aiPanel) aiPanel.style.display = 'none';
    if (ocrDisplay) ocrDisplay.style.display = 'none';
    if (scanLine) scanLine.style.display = 'none';
    if (scanFrame) scanFrame.style.display = 'none';
    if (scanFooter) scanFooter.style.display = 'none';
    if (scanToolbar) scanToolbar.style.display = 'none';
    if (scanHeader) scanHeader.style.display = 'none';
    const demoOverlay = document.getElementById('demo-overlay');
    if (demoOverlay) demoOverlay.style.display = 'none';

    if (isFake) {
      document.getElementById('v-batch-fake').textContent = batch;
      document.getElementById('v-net-fake').textContent = netStatus;
      document.getElementById('verdict-fake').classList.remove('hidden');
      document.getElementById('verdict-fake').className = 'verdict-overlay fake-verdict';
    } else {
      document.getElementById('v-batch-safe').textContent = batch;
      document.getElementById('v-net-safe').textContent = netStatus;
      document.getElementById('verdict-safe').classList.remove('hidden');
      document.getElementById('verdict-safe').className = 'verdict-overlay safe-verdict';
    }

    document.getElementById('scan-status').textContent = isFake ? 'COUNTERFEIT DETECTED' : 'AUTHENTIC VERIFIED';

    this.state.history.unshift({
      batch: batch,
      status: isFake ? 'fake' : 'safe',
      drug: info ? info.drug : 'Unknown',
      time: new Date().toISOString(),
      reason: info ? (info.reason || 'Verified against NAFDAC database') : 'Manual lookup',
    });
    this.renderHistory();
  },

  renderHistory() {
    const container = document.getElementById('history-container');
    if (!this.state.history.length) {
      container.innerHTML = '<div class="history-empty">No scans yet. Tap Start Scan to begin.</div>';
      return;
    }
    container.innerHTML = this.state.history.slice(0, 10).map(h => {
      const d = new Date(h.time);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="scan-card">
          <div class="scan-card-icon ${h.status}">
            ${h.status === 'fake' ? '\u2716' : '\u2714'}
          </div>
          <div class="scan-card-info">
            <div class="scan-card-batch">${h.batch}</div>
            <div class="scan-card-meta">${h.drug} \u00B7 ${timeStr}</div>
          </div>
          <span class="scan-card-badge ${h.status}">
            ${h.status === 'fake' ? 'COUNTERFEIT' : 'VERIFIED'}
          </span>
        </div>`;
    }).join('');
  },

  async fetchDashboardData() {
    const offlineChip = document.getElementById('dash-offline');
    let data = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch('https://credo-g5k2.onrender.com/api/v1/dashboard/stats', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error('bad status');
      data = await resp.json();
      offlineChip.classList.add('hidden');
    } catch (e) {
      offlineChip.classList.remove('hidden');
      data = {
        total_scans: 1247 + Math.floor(Math.random() * 50),
        counterfeit_alerts: 18 + Math.floor(Math.random() * 5),
        alert_rate: 1.4,
        active_locations: 34 + Math.floor(Math.random() * 5),
        recent_threats: [
          { batch_number: 'PA2128L', status: 'counterfeit', drug_name: 'Combisunate 80/480mg', location: 'Lagos', created_at: '2024-11-12T10:30:00Z', reason: 'Unregistered batch flagged by NAFDAC' },
          { batch_number: 'FKE2024', status: 'counterfeit', drug_name: 'Coartem 20/120mg', location: 'Kano', created_at: '2024-11-08T14:15:00Z', reason: 'Batch not in manufacturer database' },
          { batch_number: 'XZ8811', status: 'suspicious', drug_name: 'Artemether 20mg', location: 'Abuja', created_at: '2024-11-06T09:45:00Z', reason: 'Packaging anomaly detected' },
        ],
      };
    }

    document.getElementById('m-total').textContent = (data.total_scans || 0).toLocaleString();
    document.getElementById('m-fake').textContent = data.counterfeit_alerts || 0;
    document.getElementById('m-rate').textContent = (data.alert_rate || 0) + '%';
    document.getElementById('m-loc').textContent = data.active_locations || 0;

    this.renderMap(data);
    this.renderCluster(data);
    this.renderThreats(data.recent_threats || []);
  },

  renderMap(data) {
    const mapArea = document.getElementById('map-area');
    mapArea.innerHTML = '<div class="map-grid"></div>';
    const locations = [
      { x: 35, y: 45, type: 'red' }, { x: 62, y: 30, type: 'red' },
      { x: 48, y: 70, type: 'green' }, { x: 75, y: 55, type: 'green' },
      { x: 25, y: 25, type: 'green' }, { x: 55, y: 50, type: 'green' },
      { x: 80, y: 70, type: 'red' }, { x: 40, y: 35, type: 'green' },
    ];
    locations.forEach(loc => {
      const dot = document.createElement('div');
      dot.className = 'map-dot ' + loc.type;
      dot.style.left = loc.x + '%';
      dot.style.top = loc.y + '%';
      mapArea.appendChild(dot);
    });
  },

  renderCluster(data) {
    const clusterCard = document.getElementById('cluster-card');
    if (data.counterfeit_alerts > 0) {
      clusterCard.innerHTML = `
        <div class="cluster-header">
          <div class="cluster-dot"></div>
          <span class="cluster-title">Lagos Region \u2014 3 Counterfeit Reports</span>
        </div>
        <div class="cluster-detail">
          Multiple counterfeit alerts detected within 5km radius. Batch PA2128L linked to unregistered distributor.
          Recommend increased surveillance in Surulere, Yaba, and Ikeja markets.
        </div>`;
    } else {
      clusterCard.innerHTML = '<div class="cluster-detail">No active clusters detected.</div>';
    }
  },

  renderThreats(threats) {
    const list = document.getElementById('threats-list');
    if (!threats.length) {
      list.innerHTML = '<div class="history-empty">No recent threats.</div>';
      return;
    }
    list.innerHTML = threats.map(t => {
      const d = new Date(t.created_at);
      const timeStr = d.toLocaleDateString();
      const badgeClass = t.status === 'counterfeit' ? 'fake' : 'suspicious';
      return `
        <div class="threat-item">
          <div class="threat-dot ${t.status === 'counterfeit' ? 'red' : 'amber'}"></div>
          <div class="threat-info">
            <div class="threat-batch">${t.batch_number} \u2014 ${t.drug_name || 'Unknown'}</div>
            <div class="threat-meta">${t.location || 'Unknown'} \u00B7 ${timeStr}</div>
          </div>
          <span class="threat-badge ${badgeClass}">${t.status.toUpperCase()}</span>
        </div>`;
    }).join('');
  },

  openManualEntry() {
    document.getElementById('manual-modal').classList.remove('hidden');
    document.getElementById('manual-batch').focus();
  },

  closeManualEntry() {
    document.getElementById('manual-modal').classList.add('hidden');
    document.getElementById('manual-batch').value = '';
  },

  submitManualEntry() {
    const batch = document.getElementById('manual-batch').value.trim().toUpperCase();
    if (!batch) return;
    this.closeManualEntry();
    this.state.scanning = true;
    this.state.phase = 'verdict';
    const isFake = !!this.DEMO_BATCHES[batch] && this.DEMO_BATCHES[batch].status === 'counterfeit';
    if (isFake) {
      this.showVerdict(batch);
    } else if (this.DEMO_BATCHES[batch]) {
      this.showVerdict(batch);
    } else {
      const entry = {
        batch, drug: 'Unknown', status: 'safe', time: new Date().toISOString(),
        reason: 'Batch not found in local database. Manual verification recommended.',
      };
      this.state.history.unshift(entry);
      this.renderHistory();
      document.getElementById('v-batch-safe').textContent = batch;
      document.getElementById('v-net-safe').textContent = this.state.online ? 'ONLINE' : 'OFFLINE';
      document.getElementById('verdict-safe').classList.remove('hidden');
      document.getElementById('verdict-safe').className = 'verdict-overlay safe-verdict';
    }
  },

  toggleFlashlight() {
    this.state.flashlightOn = !this.state.flashlightOn;
    const btn = document.getElementById('btn-flashlight');
    btn.classList.toggle('active', this.state.flashlightOn);
    if (this.state.stream) {
      const track = this.state.stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        track.applyConstraints({ advanced: [{ torch: this.state.flashlightOn }] });
      }
    }
  },

  cycleZoom() {
    const levels = [1, 1.5, 2];
    const idx = levels.indexOf(this.state.zoomLevel);
    this.state.zoomLevel = levels[(idx + 1) % levels.length];
    document.getElementById('zoom-label').textContent = this.state.zoomLevel + 'x';
    const video = document.getElementById('camera-feed');
    video.style.transform = `scale(${this.state.zoomLevel})`;
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
};

document.addEventListener('DOMContentLoaded', () => app.init());
