const API_URL = 'https://credo-g5k2.onrender.com/api/v1';

const DEMO_BATCHES = {
    'VALID123': { drug: 'Combisunate 20/120' },
    'VALID456': { drug: 'Paracetamol 500mg' },
    'VALID802': { drug: 'Amatem Softgel' },
    'FAKE001': { drug: 'Amoxicillin 500mg', message: 'NAFDAC alert: batch recalled — confirmed falsified.' },
    'CNTF789': { drug: 'Artemether/Lumefantrine', message: 'Counterfeit batch circulating in Lagos markets.' }
};

const app = {
    state: {
        currentView: 'home',
        isScanning: false,
        ocrEngineReady: false,
        localHistory: JSON.parse(localStorage.getItem('scanHistory') || '[]'),
        telemetry: [],
        videoStream: null,
        videoTrack: null,
        flashlightOn: false,
        zoomLevel: 1,
        zoomLevels: [1, 2, 3],
        lastOcrTime: 0,
        ocrThrottleMs: 1500,
        manualEntryResolve: null,
        onboardingPage: 1,
        onboardingComplete: localStorage.getItem('onboardingComplete') === 'true',
        demoMode: localStorage.getItem('demoMode') === 'true' || new URLSearchParams(window.location.search).get('demo') === 'true',
        mockTelemetry: [],
        demoTimer: null,
        demoScans: [
            { drug: 'Combisunate 20/120', batch: 'VALID123', verdict: 'SAFE', message: 'Medicine verified as safe.' },
            { drug: 'Amoxicillin 500mg', batch: 'FAKE001', verdict: 'COUNTERFEIT', message: 'Batch number FAKE001 flagged as counterfeit by NAFDAC.' },
            { drug: 'Paracetamol 500mg', batch: 'VALID456', verdict: 'SAFE', message: 'Medicine verified as safe.' },
            { drug: 'Artemether Lumefantrine', batch: 'CNTF789', verdict: 'COUNTERFEIT', message: 'Batch number CNTF789 flagged as counterfeit by NAFDAC.' },
        ],
        demoScanIndex: 0,
    },
    
    // Core Navigation Engine
    navigate: (view) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
        document.getElementById(`view-${view}`).classList.add('active-view');
        
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        if (view !== 'scan') {
            document.getElementById('bottom-nav').classList.remove('hidden');
            const navItems = document.querySelectorAll('.nav-item');
            if(view === 'home') navItems[0].classList.add('active');
            if(view === 'dashboard') navItems[2].classList.add('active');
        } else {
            document.getElementById('bottom-nav').classList.add('hidden');
        }
        
        app.state.currentView = view;
        
        // Trigger view-specific logic
        if (view === 'home') app.renderHistory();
        if (view === 'scan') app.startScanner();
        if (view === 'dashboard') app.fetchDashboardData();
        
        // Cleanup
        if (view !== 'scan') app.stopScanner();
    },

    // Offline IndexedDB Engine
    db: {
        init: () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('ScanDB_Vanilla', 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('alerts')) db.createObjectStore('alerts', { keyPath: 'batch_number' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },
        sync: async () => {
            if (app.state.demoMode) return;
            try {
                document.getElementById('sync-badge').classList.add('visible');
                const res = await fetch(`${API_URL}/sync`);
                const data = await res.json();
                
                const db = await app.db.init();
                const tx = db.transaction('alerts', 'readwrite');
                const store = tx.objectStore('alerts');
                store.clear();
                
                data.counterfeit_alerts.forEach(alert => store.put(alert));
                
                return new Promise(resolve => {
                    tx.oncomplete = () => {
                        document.getElementById('sync-badge').classList.remove('visible');
                        resolve();
                    };
                });
            } catch (err) {
                console.error("Sync failed:", err);
                document.getElementById('sync-badge').classList.remove('visible');
            }
        },
        checkBatch: async (text) => {
            const clean = String(text).toUpperCase().replace(/\s+/g, '');
            for (const [batch, info] of Object.entries(DEMO_BATCHES)) {
                if (clean.includes(batch)) {
                    return {
                        verdict: (batch.startsWith('FAKE') || batch.startsWith('CNTF')) ? 'COUNTERFEIT' : 'SAFE',
                        drug: info.drug,
                        batch: batch,
                        message: info.message || 'Medicine verified as safe.'
                    };
                }
            }
            const db = await app.db.init();
            return new Promise((resolve) => {
                const tx = db.transaction('alerts', 'readonly');
                const store = tx.objectStore('alerts');
                const req = store.getAll();
                req.onsuccess = () => {
                    const alerts = req.result;
                    for (let alert of alerts) {
                        if (text.includes(alert.batch_number)) {
                            resolve({
                                verdict: 'COUNTERFEIT',
                                drug: alert.brand_name,
                                batch: alert.batch_number,
                                message: alert.description
                            });
                            return;
                        }
                    }
                    if (text.includes("VALID123")) {
                        resolve({
                            verdict: 'SAFE',
                            drug: 'Combisunate 20/120',
                            batch: 'VALID123',
                            message: 'Medicine verified as safe.'
                        });
                        return;
                    }
                    resolve(null);
                };
            });
        }
    },

    // Camera & WebAssembly OCR Engine
    startScanner: async () => {
        // Demo mode - simulate scanning without camera
        if (app.state.demoMode) {
            app.startDemoScanner();
            return;
        }
        
        app.state.isScanning = true;
        app.state.flashlightOn = false;
        app.state.zoomLevel = 1;
        document.getElementById('scan-line').classList.add('animating');
        document.getElementById('scan-status').innerText = 'ANALYZING BATCH NUMBER';
        document.getElementById('verdict-modal').classList.remove('visible');
        document.getElementById('manual-modal').classList.remove('visible');
        document.getElementById('scan-error').classList.add('hidden');
        app.updateFlashlightUI();
        app.updateZoomUI();
        
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            app.state.videoStream = stream;
            app.state.videoTrack = stream.getVideoTracks()[0];
            
            const video = document.getElementById('camera-feed');
            video.srcObject = stream;
            
            // Sync database in background
            await app.db.sync();
            
            // Wait for video to play then start capture loop
            video.onplay = () => {
                app.captureFrame();
            };
        } catch (err) {
            console.error("Camera error:", err);
            document.getElementById('scan-error').classList.remove('hidden');
            document.getElementById('scan-error-text').innerText = err.name === 'NotAllowedError' 
                ? 'Camera permission denied. Please enable in settings.' 
                : 'Unable to access camera. Try again.';
            document.getElementById('scan-line').classList.remove('animating');
            document.getElementById('scan-status').innerText = 'CAMERA ERROR';
        }
    },

    startDemoScanner: () => {
        app.state.isScanning = true;
        document.getElementById('scan-line').classList.add('animating');
        document.getElementById('scan-status').innerText = 'SCANNING BATCH NUMBER';
        document.getElementById('verdict-modal').classList.remove('visible');
        document.getElementById('manual-modal').classList.remove('visible');
        document.getElementById('scan-error').classList.add('hidden');

        const video = document.getElementById('camera-feed');
        video.style.display = 'none';

        let demoOverlay = document.getElementById('demo-overlay');
        if (!demoOverlay) {
            demoOverlay = document.createElement('div');
            demoOverlay.id = 'demo-overlay';
            demoOverlay.className = 'demo-overlay';
            demoOverlay.innerHTML = `
                <div class="demo-frame">
                    <div class="demo-corner top-left"></div>
                    <div class="demo-corner top-right"></div>
                    <div class="demo-corner bottom-left"></div>
                    <div class="demo-corner bottom-right"></div>
                    <div class="demo-scan-line"></div>
                </div>
                <p class="demo-pill">DEMO MODE</p>
                <p class="demo-text">Simulated package scan against NAFDAC sample data.<br>Tap to scan instantly.</p>
            `;
            demoOverlay.addEventListener('click', () => {
                if (!app.state.isScanning) return;
                clearTimeout(app.state.demoTimer);
                app.simulateDemoScan();
            });
            document.querySelector('#view-scan .scanner-overlay').prepend(demoOverlay);
        }
        demoOverlay.style.display = 'flex';

        clearTimeout(app.state.demoTimer);
        app.state.demoTimer = setTimeout(() => app.simulateDemoScan(), 2800);
    },

    simulateDemoScan: () => {
        if (!app.state.isScanning) return;
        const scan = app.state.demoScans[app.state.demoScanIndex];
        app.state.demoScanIndex = (app.state.demoScanIndex + 1) % app.state.demoScans.length;
        document.getElementById('scan-status').innerText = 'ANALYSIS COMPLETE';
        document.getElementById('scan-line').classList.remove('animating');
        setTimeout(() => app.handleVerdict(scan), 650);
    },
    
    stopScanner: () => {
        app.state.isScanning = false;
        clearTimeout(app.state.demoTimer);
        document.getElementById('scan-line').classList.remove('animating');
        
        // Demo mode cleanup
        const demoOverlay = document.getElementById('demo-overlay');
        if (demoOverlay) demoOverlay.style.display = 'none';
        const video = document.getElementById('camera-feed');
        video.style.display = '';
        
        if (app.state.videoTrack) {
            app.state.videoTrack.stop();
            app.state.videoTrack = null;
        }
        if (app.state.videoStream) {
            app.state.videoStream.getTracks().forEach(track => track.stop());
            app.state.videoStream = null;
        }
        video.srcObject = null;
        app.state.flashlightOn = false;
        app.updateFlashlightUI();
    },

    captureFrame: async () => {
        if (!app.state.isScanning) return;
        
        const now = Date.now();
        if (now - app.state.lastOcrTime < app.state.ocrThrottleMs) {
            if (app.state.isScanning) requestAnimationFrame(app.captureFrame);
            return;
        }
        
        const video = document.getElementById('camera-feed');
        if (video.readyState < 2) {
            if (app.state.isScanning) requestAnimationFrame(app.captureFrame);
            return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        app.state.lastOcrTime = now;
        
        try {
            const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
            const cleanText = text.replace(/\\n/g, ' ').trim();
            
            if (cleanText) {
                const debugEl = document.getElementById('ocr-debug');
                debugEl.classList.add('visible');
                debugEl.innerText = cleanText.substring(0, 40);
                
                const match = await app.db.checkBatch(cleanText);
                if (match) {
                    app.handleVerdict(match);
                    return;
                }
            }
        } catch (err) {
            console.error("OCR Error", err);
        }
        
        if (app.state.isScanning) {
            requestAnimationFrame(app.captureFrame);
        }
    },

handleVerdict: async (match) => {
        app.stopScanner();
        document.getElementById('scan-status').innerText = 'ANALYSIS COMPLETE';
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(match.verdict === 'COUNTERFEIT' ? [100, 50, 100, 50, 200] : [50, 100, 50]);
        }
        
        // Save to History
        const scanRecord = { id: Date.now(), timestamp: new Date().toISOString(), ...match };
        app.state.localHistory = [scanRecord, ...app.state.localHistory].slice(0, 10);
        localStorage.setItem('scanHistory', JSON.stringify(app.state.localHistory));
        
        // Send Telemetry
        app.sendTelemetry(match);
        
        // UI Updates
        const modal = document.getElementById('verdict-modal');
        const iconWrap = document.getElementById('verdict-icon');
        const title = document.getElementById('verdict-title');
        
        if (match.verdict === 'COUNTERFEIT') {
            iconWrap.className = 'verdict-icon-wrap fake';
            iconWrap.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="17"/></svg>`;
            title.innerText = 'Falsified Product';
            title.style.color = 'var(--accent-danger)';
        } else {
            iconWrap.className = 'verdict-icon-wrap safe';
            iconWrap.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`;
            title.innerText = 'Verified Genuine';
            title.style.color = 'var(--accent-secondary)';
        }
        
        document.getElementById('verdict-drug').innerText = match.drug;
        document.getElementById('verdict-batch-text').innerText = match.batch;
        document.getElementById('verdict-message').innerText = match.message;
        
        modal.classList.add('visible');
        
        // TTS
        const msg = new SpeechSynthesisUtterance(match.verdict === 'COUNTERFEIT' ? "Alert! Falsified medicine detected." : "Medicine verified as safe.");
        window.speechSynthesis.speak(msg);
    },

    toggleFlashlight: async () => {
        if (!app.state.videoTrack) return;
        try {
            app.state.flashlightOn = !app.state.flashlightOn;
            await app.state.videoTrack.applyConstraints({ advanced: [{ torch: app.state.flashlightOn }] });
            app.updateFlashlightUI();
        } catch (err) {
            console.error("Flashlight error:", err);
            app.state.flashlightOn = false;
            app.updateFlashlightUI();
            app.showToast("Flashlight not available");
        }
    },

    updateFlashlightUI: () => {
        const btn = document.getElementById('btn-flashlight');
        if (btn) {
            btn.setAttribute('aria-pressed', app.state.flashlightOn);
        }
    },

    cycleZoom: async () => {
        if (!app.state.videoTrack) return;
        const currentIdx = app.state.zoomLevels.indexOf(app.state.zoomLevel);
        const nextIdx = (currentIdx + 1) % app.state.zoomLevels.length;
        app.state.zoomLevel = app.state.zoomLevels[nextIdx];
        
        try {
            await app.state.videoTrack.applyConstraints({ advanced: [{ zoom: app.state.zoomLevel }] });
            app.updateZoomUI();
        } catch (err) {
            console.error("Zoom error:", err);
        }
    },

    updateZoomUI: () => {
        const label = document.getElementById('zoom-label');
        if (label) label.innerText = `${app.state.zoomLevel}x`;
    },

    openManualEntry: () => {
        document.getElementById('manual-modal').classList.add('visible');
        const input = document.getElementById('manual-batch');
        setTimeout(() => input.focus(), 300);
    },

    closeManualEntry: () => {
        document.getElementById('manual-modal').classList.remove('visible');
        document.getElementById('manual-batch').value = '';
    },

    submitManualEntry: async () => {
        const input = document.getElementById('manual-batch');
        const text = input.value.trim().toUpperCase();
        if (!text) return;
        
        app.closeManualEntry();
        document.getElementById('scan-status').innerText = 'VERIFYING...';
        
        const match = await app.db.checkBatch(text);
        if (match) {
            app.handleVerdict(match);
        } else {
            app.showToast("Batch not found in database");
            app.resetScanner();
        }
    },

    showToast: (message) => {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Onboarding
    initOnboarding: () => {
        if (app.state.onboardingComplete) return;
        const onboarding = document.getElementById('onboarding');
        onboarding.classList.remove('hidden');
        app.state.onboardingPage = 1;
        app.updateOnboardingUI();
    },

    completeOnboarding: () => {
        app.state.onboardingComplete = true;
        localStorage.setItem('onboardingComplete', 'true');
        document.getElementById('onboarding').classList.add('hidden');
    },

    nextOnboardingPage: () => {
        if (app.state.onboardingPage < 4) {
            app.state.onboardingPage++;
            app.updateOnboardingUI();
        } else {
            app.completeOnboarding();
        }
    },

    prevOnboardingPage: () => {
        if (app.state.onboardingPage > 1) {
            app.state.onboardingPage--;
            app.updateOnboardingUI();
        }
    },

    updateOnboardingUI: () => {
        document.querySelectorAll('.onboarding-page').forEach(page => {
            const pageNum = parseInt(page.dataset.page);
            page.classList.toggle('active', pageNum === app.state.onboardingPage);
        });
        
        const prevBtn = document.getElementById('onboarding-prev');
        const nextBtn = document.getElementById('onboarding-next');
        
        prevBtn.disabled = app.state.onboardingPage === 1;
        prevBtn.style.opacity = app.state.onboardingPage === 1 ? '0.5' : '1';
        
        if (app.state.onboardingPage === 4) {
            nextBtn.innerText = 'Get Started';
        } else {
            nextBtn.innerText = 'Next';
        }
    },

    requestPermissions: async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            app.showToast("Camera access granted");
        } catch (err) {
            app.showToast("Camera permission needed for scanning");
        }
        app.completeOnboarding();
    },

    toggleDemo: () => {
        app.state.demoMode = !app.state.demoMode;
        localStorage.setItem('demoMode', String(app.state.demoMode));
        app.applyDemoUI();
        if (app.state.currentView === 'scan') {
            app.stopScanner();
            app.startScanner();
        }
    },

    enableDemoFromError: () => {
        if (!app.state.demoMode) {
            app.state.demoMode = true;
            localStorage.setItem('demoMode', 'true');
        }
        app.applyDemoUI();
        app.startScanner();
    },

    applyDemoUI: () => {
        const badge = document.getElementById('mode-badge');
        const badgeText = document.getElementById('mode-badge-text');
        const label = document.getElementById('demo-label');
        if (app.state.demoMode) {
            badge?.classList.remove('live');
            badge?.classList.add('demo');
            if (badgeText) badgeText.innerText = 'Demo Mode';
            if (label) label.innerText = 'Exit Demo Mode';
        } else {
            badge?.classList.remove('demo');
            badge?.classList.add('live');
            if (badgeText) badgeText.innerText = 'Live Sync';
            if (label) label.innerText = 'Try Live Demo';
        }
    },

    getMockTelemetry: () => {
        if (app.state.mockTelemetry.length > 0) return app.state.mockTelemetry;
        const seeds = [
            ['Combisunate 20/120', 'VALID123', 'SAFE', 6.45, 3.39],
            ['Amoxicillin 500mg', 'FAKE001', 'COUNTERFEIT', 6.60, 3.35],
            ['Paracetamol 500mg', 'VALID456', 'SAFE', 9.06, 7.49],
            ['Artemether/Lumefantrine', 'CNTF789', 'COUNTERFEIT', 6.52, 3.38],
            ['Amatem Softgel', 'VALID802', 'SAFE', 6.46, 3.55],
            ['Amoxicillin 500mg', 'FAKE001', 'COUNTERFEIT', 6.58, 3.29]
        ];
        const now = Date.now();
        app.state.mockTelemetry = seeds.map((s, i) => ({
            drug_name: s[0],
            batch_number: s[1],
            verdict: s[2],
            latitude: +(s[3] + (Math.random() - 0.5) * 0.05).toFixed(4),
            longitude: +(s[4] + (Math.random() - 0.5) * 0.05).toFixed(4),
            scan_timestamp: new Date(now - (i + 1) * 47 * 60000).toISOString()
        }));
        return app.state.mockTelemetry;
    },

    resetScanner: () => {
        document.getElementById('verdict-modal').classList.remove('visible');
        document.getElementById('ocr-debug').classList.remove('visible');
        app.startScanner();
    },

    // Telemetry Engine
    sendTelemetry: async (match) => {
        const payload = {
            latitude: 6.5244, // Default Lagos
            longitude: 3.3792,
            drug_name: match.drug,
            batch_number: match.batch,
            verdict: match.verdict
        };

        if (app.state.demoMode) {
            app.state.mockTelemetry.unshift({ ...payload, scan_timestamp: new Date().toISOString() });
            return;
        }
        
        try {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    payload.latitude = pos.coords.latitude;
                    payload.longitude = pos.coords.longitude;
                    await fetch(`${API_URL}/telemetry`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }, async () => {
                    await fetch(`${API_URL}/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                });
            }
        } catch (e) { console.error("Telemetry failed"); }
    },

    fetchDashboardData: async () => {
        const tbody = document.getElementById('telemetry-table-body');
        const offlineNote = document.getElementById('dash-offline');

        let data = null;
        if (app.state.demoMode) {
            data = app.getMockTelemetry();
        } else {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${API_URL}/telemetry/heatmap`, { signal: controller.signal });
                clearTimeout(timeout);
                if (!res.ok) throw new Error('Failed to fetch');
                data = await res.json();
                if (offlineNote) offlineNote.classList.add('hidden');
            } catch (e) {
                data = app.getMockTelemetry();
                if (offlineNote) offlineNote.classList.remove('hidden');
            }
        }

        try {
            app.state.telemetry = data;

            const total = data.length;
            const fake = data.filter(d => d.verdict === 'COUNTERFEIT').length;
            const rate = total > 0 ? ((fake / total) * 100).toFixed(1) : 0;

            document.getElementById('metrics-grid').innerHTML = `
                <div class="card metric-card">
                    <div class="metric-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        <span>Total Scans</span>
                    </div>
                    <div id="metric-total" class="metric-value">${total}</div>
                </div>
                <div class="card metric-card border-danger">
                    <div class="metric-title" style="color: var(--accent-danger);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <span>Falsified Detections</span>
                    </div>
                    <div id="metric-fake" class="metric-value" style="color: var(--accent-danger);">${fake}</div>
                </div>
                <div class="card metric-card">
                    <div class="metric-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>Illicit Rate</span>
                    </div>
                    <div id="metric-rate" class="metric-value">${rate}%</div>
                </div>
            `;
            
            if (total === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:1rem; opacity:0.5;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <p>No telemetry data yet</p>
                    <p style="font-size:0.85rem; margin-top:0.5rem;">Scans from the field will appear here</p>
                </td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.slice().reverse().map(t => `
                <tr>
                    <td style="color: var(--text-muted);">${new Date(t.scan_timestamp).toLocaleString()}</td>
                    <td style="font-weight: 600;">${t.drug_name}</td>
                    <td style="font-family: monospace;">${t.batch_number}</td>
                    <td style="font-family: monospace; color: var(--text-muted);">${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}</td>
                    <td><span class="badge ${t.verdict === 'COUNTERFEIT' ? 'badge-fake' : 'badge-safe'}">${t.verdict}</span></td>
                </tr>
            `).join('');
        } catch (e) {
            console.error(e);
        }
    },

    // UI Rendering
    renderHistory: () => {
        const container = document.getElementById('history-container');
        const errorEl = document.getElementById('home-error');
        const errorText = document.getElementById('home-error-text');
        
        if (app.state.localHistory.length === 0) {
            container.innerHTML = `<div class="card empty-state" style="text-align:center; padding:2rem; color:var(--text-muted);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:1rem; opacity:0.5;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <p>No scan history yet</p>
                <p style="font-size:0.85rem; margin-top:0.5rem;">Your verification scans will appear here</p>
            </div>`;
            errorEl.classList.add('hidden');
            return;
        }
        
        container.innerHTML = app.state.localHistory.map(scan => `
            <div class="card history-item ${scan.verdict === 'COUNTERFEIT' ? 'fake' : 'safe'}">
                <div>
                    <h4>${scan.drug_name}</h4>
                    <p class="batch">Batch: <span style="font-family: monospace;">${scan.batch_number}</span></p>
                    <p class="time">${new Date(scan.timestamp).toLocaleString()}</p>
                </div>
                <div>
                    ${scan.verdict === 'COUNTERFEIT' 
                        ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
                        : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
                    }
                </div>
            </div>
        `).join('');
        errorEl.classList.add('hidden');
    }
};

// Initialize
window.onload = () => {
    app.applyDemoUI();
    app.initOnboarding();
    app.navigate('home');
    
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    }
};
