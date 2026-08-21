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
        scanPhase: 'idle',
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
        onboardingPage: 1,
        onboardingComplete: localStorage.getItem('onboardingComplete') === 'true',
        demoMode: localStorage.getItem('demoMode') === 'true' || new URLSearchParams(window.location.search).get('demo') === 'true',
        mockTelemetry: [],
        demoTimer: null,
        phaseTimer: null,
        demoScans: [
            { drug: 'Combisunate 20/120', batch: 'VALID123', verdict: 'SAFE', message: 'Medicine verified as safe.' },
            { drug: 'Amoxicillin 500mg', batch: 'FAKE001', verdict: 'COUNTERFEIT', message: 'Batch number FAKE001 flagged as counterfeit by NAFDAC.' },
            { drug: 'Paracetamol 500mg', batch: 'VALID456', verdict: 'SAFE', message: 'Medicine verified as safe.' },
            { drug: 'Artemether Lumefantrine', batch: 'CNTF789', verdict: 'COUNTERFEIT', message: 'Batch number CNTF789 flagged as counterfeit by NAFDAC.' },
        ],
        demoScanIndex: 0,
    },

    navigate: (view) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
        document.getElementById(`view-${view}`).classList.add('active-view');
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        if (view !== 'scan') {
            document.getElementById('bottom-nav').classList.remove('hidden');
            const navItems = document.querySelectorAll('.nav-item');
            if (view === 'home') navItems[0].classList.add('active');
            if (view === 'dashboard') navItems[2].classList.add('active');
        } else {
            document.getElementById('bottom-nav').classList.add('hidden');
        }
        app.state.currentView = view;
        if (view === 'home') app.renderHistory();
        if (view === 'scan') app.startScanner();
        if (view === 'dashboard') app.fetchDashboardData();
        if (view !== 'scan') app.stopScanner();
    },

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
                const res = await fetch(`${API_URL}/sync`);
                const data = await res.json();
                const db = await app.db.init();
                const tx = db.transaction('alerts', 'readwrite');
                const store = tx.objectStore('alerts');
                store.clear();
                data.counterfeit_alerts.forEach(alert => store.put(alert));
                return new Promise(resolve => { tx.oncomplete = () => resolve(); });
            } catch (err) {
                console.error("Sync failed:", err);
            }
        },
        checkBatch: async (text) => {
            const clean = String(text).toUpperCase().replace(/\s+/g, '');
            for (const [batch, info] of Object.entries(DEMO_BATCHES)) {
                if (clean.includes(batch)) {
                    return {
                        verdict: (batch.startsWith('FAKE') || batch.startsWith('CNTF')) ? 'COUNTERFEIT' : 'SAFE',
                        drug: info.drug, batch: batch,
                        message: info.message || 'Medicine verified as safe.'
                    };
                }
            }
            try {
                const db = await app.db.init();
                return new Promise((resolve) => {
                    const tx = db.transaction('alerts', 'readonly');
                    const store = tx.objectStore('alerts');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        for (let alert of req.result) {
                            if (text.includes(alert.batch_number)) {
                                resolve({ verdict: 'COUNTERFEIT', drug: alert.brand_name, batch: alert.batch_number, message: alert.description });
                                return;
                            }
                        }
                        resolve(null);
                    };
                });
            } catch (e) { return null; }
        }
    },

    startScanner: async () => {
        app.resetScanUI();
        if (app.state.demoMode) { app.startDemoScanner(); return; }
        app.state.isScanning = true;
        app.state.scanPhase = 'scanning';
        document.getElementById('scan-line').classList.add('sweep');
        document.getElementById('scan-status').textContent = 'SCANNING PACKAGE...';
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
            app.state.videoStream = stream;
            app.state.videoTrack = stream.getVideoTracks()[0];
            const video = document.getElementById('camera-feed');
            video.srcObject = stream;
            video.style.display = '';
            document.getElementById('demo-overlay').classList.add('hidden');
            await app.db.sync();
            video.onplay = () => app.captureFrame();
        } catch (err) {
            console.error("Camera error:", err);
            document.getElementById('scan-error').classList.remove('hidden');
            document.getElementById('scan-error-text').textContent = err.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Unable to access camera.';
            document.getElementById('scan-line').classList.remove('sweep');
            document.getElementById('scan-status').textContent = 'CAMERA ERROR';
        }
    },

    resetScanUI: () => {
        clearTimeout(app.state.demoTimer);
        clearTimeout(app.state.phaseTimer);
        document.getElementById('scan-line').classList.remove('sweep');
        document.getElementById('batch-label').classList.add('hidden');
        document.getElementById('scan-frame').classList.remove('detected');
        const demoFrame = document.querySelector('.demo-frame');
        if (demoFrame) demoFrame.classList.remove('detected');
        const pkg = document.querySelector('.demo-package');
        if (pkg) pkg.style.display = 'none';
        document.querySelector('.scan-viewport').classList.remove('demo-bg');
        document.getElementById('ai-panel').classList.add('hidden');
        document.getElementById('ai-panel').classList.remove('visible');
        document.getElementById('verdict-safe').classList.add('hidden');
        document.getElementById('verdict-fake').classList.add('hidden');
        document.getElementById('scan-error').classList.add('hidden');
        document.getElementById('demo-overlay').classList.add('hidden');
        for (let i = 1; i <= 5; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) step.classList.remove('active');
        }
    },

    startDemoScanner: () => {
        app.state.isScanning = true;
        app.state.scanPhase = 'scanning';
        const video = document.getElementById('camera-feed');
        video.style.display = 'none';
        video.srcObject = null;
        document.getElementById('scan-error').classList.add('hidden');
        document.getElementById('scan-frame').style.display = 'none';

        const vp = document.querySelector('.scan-viewport');
        vp.classList.add('demo-bg');
        let pkg = document.querySelector('.demo-package');
        if (!pkg) {
            pkg = document.createElement('div');
            pkg.className = 'demo-package';
            pkg.innerHTML = '<div class="pkg-title">Pharmaceutical Product</div><div class="pkg-name">Combisunate 20/120</div><div class="pkg-batch">Batch: VALID123</div><div class="pkg-line w80"></div><div class="pkg-line w60"></div><div class="pkg-line w80"></div>';
            vp.appendChild(pkg);
        }
        pkg.style.display = '';

        document.getElementById('demo-overlay').classList.remove('hidden');
        document.getElementById('scan-status').textContent = 'SCANNING PACKAGE...';

        const overlay = document.getElementById('demo-overlay');
        overlay.onclick = () => {
            if (!app.state.isScanning) return;
            clearTimeout(app.state.demoTimer);
            app.runScanPhaseSequence();
        };

        app.state.demoTimer = setTimeout(() => app.runScanPhaseSequence(), 2500);
    },

    runScanPhaseSequence: () => {
        if (!app.state.isScanning) return;
        const scan = app.state.demoScans[app.state.demoScanIndex];
        const batch = scan.batch;

        app.state.scanPhase = 'detected';
        const demoSweep = document.querySelector('.demo-overlay .scan-line');
        if (demoSweep) demoSweep.style.animation = 'none';
        document.querySelector('.demo-frame').classList.add('detected');
        const pkgBatch = document.querySelector('.pkg-batch');
        if (pkgBatch) pkgBatch.textContent = `Batch: ${batch}`;
        document.getElementById('scan-status').textContent = 'BATCH DETECTED';

        app.state.phaseTimer = setTimeout(() => {
            if (!app.state.isScanning) return;
            app.state.scanPhase = 'checking';
            document.getElementById('ai-panel').classList.remove('hidden');
            setTimeout(() => document.getElementById('ai-panel').classList.add('visible'), 50);
            document.getElementById('scan-status').textContent = 'EDGE PROCESSING...';
            app.animateAISteps(() => {
                app.handleVerdict(scan);
            });
        }, 800);
    },

    animateAISteps: (callback) => {
        const steps = [1, 2, 3, 4, 5];
        let delay = 0;
        steps.forEach((num, i) => {
            setTimeout(() => {
                const step = document.getElementById(`step-${num}`);
                if (step) step.classList.add('active');
                if (i === steps.length - 1) {
                    setTimeout(callback, 500);
                }
            }, delay);
            delay += i < 3 ? 350 : 500;
        });
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
        canvas.getContext('2d').drawImage(video, 0, 0);
        app.state.lastOcrTime = now;
        try {
            const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
            const cleanText = text.replace(/\\n/g, ' ').trim();
            if (cleanText) {
                const match = await app.db.checkBatch(cleanText);
                if (match) { app.handleVerdict(match); return; }
            }
        } catch (err) { console.error("OCR Error", err); }
        if (app.state.isScanning) requestAnimationFrame(app.captureFrame);
    },

    handleVerdict: async (match) => {
        app.stopScanner();
        document.getElementById('scan-frame').style.display = '';
        document.getElementById('demo-overlay').classList.add('hidden');
        document.querySelector('.scan-viewport').classList.remove('demo-bg');
        const pkg = document.querySelector('.demo-package');
        if (pkg) pkg.style.display = 'none';
        document.getElementById('scan-status').textContent = 'ANALYSIS COMPLETE';
        if (navigator.vibrate) navigator.vibrate(match.verdict === 'COUNTERFEIT' ? [100, 50, 100, 50, 200] : [50, 100, 50]);

        const scanRecord = { id: Date.now(), timestamp: new Date().toISOString(), batch_number: match.batch, drug_name: match.drug, verdict: match.verdict };
        app.state.localHistory = [scanRecord, ...app.state.localHistory].slice(0, 10);
        localStorage.setItem('scanHistory', JSON.stringify(app.state.localHistory));
        app.sendTelemetry(match);

        if (match.verdict === 'COUNTERFEIT') {
            document.getElementById('v-batch-fake').textContent = `BATCH ${match.batch}`;
            const vf = document.getElementById('verdict-fake');
            vf.classList.remove('hidden');
            vf.classList.add('fake-verdict');
        } else {
            document.getElementById('v-batch-safe').textContent = `BATCH ${match.batch}`;
            const vs = document.getElementById('verdict-safe');
            vs.classList.remove('hidden');
            vs.classList.add('safe-verdict');
        }

        const msg = new SpeechSynthesisUtterance(match.verdict === 'COUNTERFEIT' ? "Alert! Falsified medicine detected." : "Medicine verified as safe.");
        window.speechSynthesis.speak(msg);
    },

    resetScanner: () => {
        document.getElementById('verdict-safe').classList.add('hidden');
        document.getElementById('verdict-safe').classList.remove('safe-verdict');
        document.getElementById('verdict-fake').classList.add('hidden');
        document.getElementById('verdict-fake').classList.remove('fake-verdict');
        app.startScanner();
    },

    stopScanner: () => {
        app.state.isScanning = false;
        app.state.scanPhase = 'idle';
        clearTimeout(app.state.demoTimer);
        clearTimeout(app.state.phaseTimer);
        document.getElementById('scan-line').classList.remove('sweep');
        if (app.state.videoTrack) { app.state.videoTrack.stop(); app.state.videoTrack = null; }
        if (app.state.videoStream) { app.state.videoStream.getTracks().forEach(t => t.stop()); app.state.videoStream = null; }
        const video = document.getElementById('camera-feed');
        video.srcObject = null;
        app.state.flashlightOn = false;
    },

    toggleFlashlight: async () => {
        if (!app.state.videoTrack) return;
        try {
            app.state.flashlightOn = !app.state.flashlightOn;
            await app.state.videoTrack.applyConstraints({ advanced: [{ torch: app.state.flashlightOn }] });
            document.getElementById('btn-flashlight').classList.toggle('active', app.state.flashlightOn);
        } catch (err) { app.showToast("Flashlight not available"); }
    },

    cycleZoom: async () => {
        if (!app.state.videoTrack) return;
        const idx = app.state.zoomLevels.indexOf(app.state.zoomLevel);
        app.state.zoomLevel = app.state.zoomLevels[(idx + 1) % app.state.zoomLevels.length];
        try { await app.state.videoTrack.applyConstraints({ advanced: [{ zoom: app.state.zoomLevel }] }); } catch (e) {}
        document.getElementById('zoom-label').textContent = `${app.state.zoomLevel}x`;
    },

    openManualEntry: () => {
        document.getElementById('manual-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('manual-batch').focus(), 300);
    },
    closeManualEntry: () => {
        document.getElementById('manual-modal').classList.add('hidden');
        document.getElementById('manual-batch').value = '';
    },
    submitManualEntry: async () => {
        const text = document.getElementById('manual-batch').value.trim().toUpperCase();
        if (!text) return;
        app.closeManualEntry();
        document.getElementById('scan-status').textContent = 'VERIFYING...';
        const match = await app.db.checkBatch(text);
        if (match) { app.handleVerdict(match); } else {
            app.showToast("Batch not found in database");
            app.resetScanner();
        }
    },

    showToast: (message) => {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3000);
    },

    initOnboarding: () => {
        if (app.state.onboardingComplete) return;
        document.getElementById('onboarding').classList.remove('hidden');
        app.state.onboardingPage = 1;
        app.updateOnboardingUI();
    },
    completeOnboarding: () => {
        app.state.onboardingComplete = true;
        localStorage.setItem('onboardingComplete', 'true');
        document.getElementById('onboarding').classList.add('hidden');
    },
    nextOnboardingPage: () => {
        if (app.state.onboardingPage < 4) { app.state.onboardingPage++; app.updateOnboardingUI(); }
        else app.completeOnboarding();
    },
    prevOnboardingPage: () => {
        if (app.state.onboardingPage > 1) { app.state.onboardingPage--; app.updateOnboardingUI(); }
    },
    updateOnboardingUI: () => {
        document.querySelectorAll('.onboarding-page').forEach(p => {
            p.classList.toggle('active', parseInt(p.dataset.page) === app.state.onboardingPage);
        });
        const prev = document.getElementById('onboarding-prev');
        const next = document.getElementById('onboarding-next');
        prev.disabled = app.state.onboardingPage === 1;
        prev.style.opacity = app.state.onboardingPage === 1 ? '0.5' : '1';
        next.textContent = app.state.onboardingPage === 4 ? 'Get Started' : 'Next';
    },
    requestPermissions: async () => {
        try { await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); app.showToast("Camera access granted"); }
        catch (e) { app.showToast("Camera permission needed"); }
        app.completeOnboarding();
    },

    toggleDemo: () => {
        app.state.demoMode = !app.state.demoMode;
        localStorage.setItem('demoMode', String(app.state.demoMode));
        app.applyDemoUI();
        if (app.state.currentView === 'scan') { app.stopScanner(); app.startScanner(); }
    },
    enableDemoFromError: () => {
        app.state.demoMode = true;
        localStorage.setItem('demoMode', 'true');
        app.applyDemoUI();
        app.startScanner();
    },
    applyDemoUI: () => {
        const badge = document.getElementById('mode-badge');
        const badgeText = document.getElementById('mode-badge-text');
        const label = document.getElementById('demo-label');
        if (app.state.demoMode) {
            badge?.classList.remove('live'); badge?.classList.add('demo');
            if (badgeText) badgeText.textContent = 'Demo Mode';
            if (label) label.textContent = 'Exit Demo Mode';
        } else {
            badge?.classList.remove('demo'); badge?.classList.add('live');
            if (badgeText) badgeText.textContent = 'Live Sync';
            if (label) label.textContent = 'Try Live Demo';
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
            drug_name: s[0], batch_number: s[1], verdict: s[2],
            latitude: +(s[3] + (Math.random() - 0.5) * 0.05).toFixed(4),
            longitude: +(s[4] + (Math.random() - 0.5) * 0.05).toFixed(4),
            scan_timestamp: new Date(now - (i + 1) * 47 * 60000).toISOString()
        }));
        return app.state.mockTelemetry;
    },

    sendTelemetry: async (match) => {
        const payload = { latitude: 6.5244, longitude: 3.3792, drug_name: match.drug, batch_number: match.batch, verdict: match.verdict };
        if (app.state.demoMode) { app.state.mockTelemetry.unshift({ ...payload, scan_timestamp: new Date().toISOString() }); return; }
        try {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(async (pos) => {
                    payload.latitude = pos.coords.latitude; payload.longitude = pos.coords.longitude;
                    await fetch(`${API_URL}/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                }, async () => {
                    await fetch(`${API_URL}/telemetry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                });
            }
        } catch (e) { console.error("Telemetry failed"); }
    },

    fetchDashboardData: async () => {
        let data = null;
        if (app.state.demoMode) {
            data = app.getMockTelemetry();
        } else {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${API_URL}/telemetry/heatmap`, { signal: controller.signal });
                clearTimeout(timeout);
                if (!res.ok) throw new Error();
                data = await res.json();
                document.getElementById('dash-offline').classList.add('hidden');
            } catch (e) {
                data = app.getMockTelemetry();
                document.getElementById('dash-offline').classList.remove('hidden');
            }
        }
        app.renderDashboard(data);
    },

    renderDashboard: (data) => {
        const total = data.length;
        const fake = data.filter(d => d.verdict === 'COUNTERFEIT').length;
        const safe = total - fake;
        const rate = total > 0 ? ((fake / total) * 100).toFixed(1) : '0.0';
        const locations = new Set(data.map(d => `${d.latitude.toFixed(1)}_${d.longitude.toFixed(1)}`)).size;

        document.getElementById('m-total').textContent = total.toLocaleString();
        document.getElementById('m-fake').textContent = fake.toLocaleString();
        document.getElementById('m-rate').textContent = rate + '%';
        document.getElementById('m-loc').textContent = locations;

        const mapArea = document.getElementById('map-area');
        mapArea.innerHTML = '<div class="map-grid"></div>';
        data.forEach(d => {
            const latPct = Math.min(90, Math.max(10, ((d.latitude - 4) / 6) * 80 + 10));
            const lngPct = Math.min(90, Math.max(10, ((d.longitude - 2) / 6) * 80 + 10));
            const dot = document.createElement('div');
            dot.className = `map-dot ${d.verdict === 'COUNTERFEIT' ? 'fake' : 'safe'}`;
            dot.style.left = lngPct + '%';
            dot.style.top = (100 - latPct) + '%';
            dot.title = `${d.drug_name} — ${d.batch_number}`;
            mapArea.appendChild(dot);
        });

        const threats = document.getElementById('threats-list');
        const threatData = data.filter(d => d.verdict === 'COUNTERFEIT').slice(0, 5);
        if (threatData.length === 0) {
            threats.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-subtle);font-size:0.85rem;">No threats detected</div>';
        } else {
            threats.innerHTML = threatData.map(t => `
                <div class="threat-item">
                    <div>
                        <div class="threat-batch">${t.batch_number}</div>
                        <div class="threat-time">${new Date(t.scan_timestamp).toLocaleTimeString()}</div>
                    </div>
                    <span class="threat-badge fake">COUNTERFEIT</span>
                </div>
            `).join('');
        }
    },

    renderHistory: () => {
        const container = document.getElementById('history-container');
        if (app.state.localHistory.length === 0) {
            container.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><p>No scan history yet</p><p style="font-size:0.8rem;margin-top:0.3rem;">Your verification scans will appear here</p></div>`;
            return;
        }
        container.innerHTML = app.state.localHistory.map(scan => `
            <div class="history-item ${scan.verdict === 'COUNTERFEIT' ? 'fake' : 'safe'}">
                <div>
                    <h4>${scan.drug_name}</h4>
                    <span class="batch">${scan.batch_number}</span>
                    <p class="time">${new Date(scan.timestamp).toLocaleString()}</p>
                </div>
                <div style="flex-shrink:0;margin-left:1rem;">
                    ${scan.verdict === 'COUNTERFEIT'
                        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="17"/></svg>'
                        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>'
                    }
                </div>
            </div>
        `).join('');
    }
};

window.onload = () => {
    app.applyDemoUI();
    app.initOnboarding();
    app.navigate('home');
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
};
