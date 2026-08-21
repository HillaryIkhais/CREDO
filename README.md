<div align="center">
  <h1>Credo</h1>
  <p><b>Edge AI Medical Authenticity Platform</b></p>
  <p><i>Winner of the Build Beyond Hackathon</i></p>
</div>

---

## 🌍 The Problem
Substandard and falsified medicines represent a catastrophic public health emergency. According to a WHO-commissioned study by the University of Edinburgh and the London School of Hygiene and Tropical Medicine, falsified antimalarials alone cause an estimated **116,000 deaths annually** in Sub-Saharan Africa. 

While verification infrastructure like the NAFDAC Mobile Authentication Service (MAS) exists, empirical evidence shows it has less than a **20% utilization rate** due to severe socio-technical friction (requiring users to physically scratch panels and type SMS codes). 

## 🛡 The Solution: Credo
Credo engineers this friction out of existence. It replaces manual verification with a **"Zero-Click" Edge AI computer vision approach**, designed specifically for vulnerable populations in high-stress, informal open drug markets.

When a user points their smartphone camera at a pharmaceutical box:
1. **True Edge OCR**: A WebAssembly-powered Tesseract engine runs entirely in the browser to extract alphanumeric text from the physical packaging in real-time. No images are sent to the cloud, preserving privacy and eliminating latency.
2. **Offline-First Verification**: The app cross-references the extracted batch numbers against an `IndexedDB` local database containing known counterfeit alerts.
3. **Multimodal Verdict**: It returns an instant verdict utilizing color psychology and triggers a localized Text-to-Speech audio alert.
4. **Geospatial Intelligence**: Background telemetry silently logs the scan location and verdict to a Python FastAPI backend, populating an Intelligence Dashboard for regulatory agencies to track illicit supply chains.

## 🚀 The Ultimate Efficiency Stack (Vanilla JS)
I deliberately threw out bloated frameworks like React and Vue to achieve maximum performance and zero bundle bloat for users in low-bandwidth areas.

- **Frontend**: Pure Vanilla JavaScript, Semantic HTML5, and Native CSS (Zero Virtual DOM).
- **Edge AI**: `tesseract.js` (WebAssembly OCR port loaded via CDN).
- **Offline Storage**: Native browser `IndexedDB` API.
- **Backend API**: Python, FastAPI, SQLAlchemy, SQLite, Pydantic.

## 💻 Local Development

**1. Start the Backend (Python/FastAPI)**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**2. Start the Frontend**
Because the frontend is pure Vanilla JS, HTML, and CSS, you can serve it with any basic static server.
```bash
cd frontend
python3 -m http.server 5179
```
Open `http://localhost:5179` in your browser.

## 📱 Demo
To trigger the counterfeit flow, point the camera at a piece of paper with the text **`PA2128L`** written clearly. To trigger the safe flow, use **`VALID123`**.

---
*Built for the Build Beyond Hackathon*
