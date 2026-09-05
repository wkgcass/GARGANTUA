/**
 * GARGANTUA — HUD / DOM bindings
 * Sliders for all params, buttons, FPS meter, view labels, help overlay.
 */
import { PARAM_DEFS, PARAM_GROUPS, makeDefaults, formatVal } from './params.js';
const DEBUG_VIEWS = {
    0: 'COMPOSITE', 1: 'PRIMARY IMAGE', 2: 'SECONDARY IMAGE', 3: 'TERTIARY IMAGE',
    4: 'SKY ONLY', 5: 'DISK ONLY', 6: 'PRIMARY BRIGHTNESS', 7: 'SECONDARY BRIGHTNESS',
    8: 'STEP BUDGET', 9: 'NO-POST (RAW HDR)',
};
export class HUD {
    constructor(root) {
        this.root = root;
        this.onParam = () => { };
        this.onQuality = () => { };
        this.onPreset = () => { };
        this.onCinematic = () => { };
        this.onSnap = () => { };
        this.hideTimer = 0;
        this.sliderEls = new Map();
        this.valEls = new Map();
        this.qualityLabel = 'HIGH';
        this.exposeResetCamera = () => { document.dispatchEvent(new Event('gargantua-reset-cam')); };
        this.fpsEl = qs('fps');
        this.resEl = qs('res');
        this.qualityEl = qs('quality-badge');
        this.viewLabel = qs('view-label');
        this.letterbox = qs('letterbox');
        this.paramsPanel = qs('params-panel');
        this.paramsList = qs('params-list');
        this.paramCount = qs('param-count');
        this.buildParams();
        this.bind();
    }
    bind() {
        const q = (id) => document.getElementById(id);
        q('btn-params').addEventListener('click', () => this.paramsPanel.classList.toggle('hidden'));
        q('btn-close-pp').addEventListener('click', () => this.paramsPanel.classList.add('hidden'));
        q('btn-reset').addEventListener('click', () => {
            const d = makeDefaults();
            for (const p of PARAM_DEFS)
                this.setSlider(p.id, d[p.id]);
            d.fov = 58; // camera fov kept identical
            this.setSlider('fov', 58);
        });
        q('btn-help').addEventListener('click', () => q('help-overlay').classList.remove('hidden'));
        q('btn-help-close').addEventListener('click', () => q('help-overlay').classList.add('hidden'));
        q('help-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'help-overlay')
                q('help-overlay').classList.add('hidden');
        });
        q('btn-snap').addEventListener('click', () => this.onSnap());
        q('btn-cine').addEventListener('click', () => {
            const on = this.letterbox.classList.contains('hidden');
            this.setCinematic(on);
        });
        q('btn-audio').addEventListener('click', () => {
            const ev = new CustomEvent('gargantua-toggle-audio', { bubbles: true });
            document.dispatchEvent(ev);
        });
        q('btn-q').addEventListener('click', () => {
            const order = ['standard', 'high', 'cinematic'];
            const cur = this.qualityLabel.toLowerCase();
            const next = order[(order.indexOf(cur) + 1) % order.length];
            this.onQuality(next);
        });
        for (let i = 1; i <= 4; i++) {
            q(`btn-preset${i}`).addEventListener('click', () => this.onPreset(i - 1));
        }
        /* keyboard */
        document.addEventListener('keydown', (e) => {
            if (e.target instanceof HTMLInputElement)
                return;
            const k = e.key;
            if (k >= '0' && k <= '9') {
                this.setDebugView(parseInt(k, 10));
            }
            else if (k >= '1' && k <= '4' && e.ctrlKey) {
                this.onPreset(parseInt(k, 10) - 1);
            }
            else if (k === 'c' || k === 'C')
                this.setCinematic(!this.isCinematic());
            else if (k === 'p' || k === 'P')
                this.paramsPanel.classList.toggle('hidden');
            else if (k === '?' || k === '/')
                q('help-overlay').classList.toggle('hidden');
            else if (k === ' ') {
                e.preventDefault();
            }
            else if (k === 'm' || k === 'M')
                document.dispatchEvent(new CustomEvent('gargantua-toggle-audio'));
            else if (k === 's' || k === 'S')
                this.onSnap();
            else if (k === 'r' || k === 'R') {
                this.exposeResetCamera();
            }
        });
        /* pointer events on canvas toggle cinematic off */
        document.getElementById('gl').addEventListener('pointerdown', () => {
            if (this.isCinematic())
                this.setCinematic(false);
        });
        document.addEventListener('gargantua-set-quality', ((ev) => this.onQuality(ev.detail)));
    }
    onResetCamera(cb) { document.addEventListener('gargantua-reset-cam', cb); }
    isCinematic() { return !this.letterbox.classList.contains('hidden'); }
    setCinematic(on) {
        this.letterbox.classList.toggle('hidden', !on);
        document.getElementById('btn-cine').classList.toggle('active', on);
        this.onCinematic(on);
    }
    setDebugView(v) {
        this.viewLabel.textContent = DEBUG_VIEWS[v] ?? `VIEW ${v}`;
        this.viewLabel.classList.remove('hidden');
        clearTimeout(this.hideTimer);
        this.hideTimer = window.setTimeout(() => this.viewLabel.classList.add('hidden'), 1800);
    }
    setFps(fps) { this.fpsEl.textContent = `${Math.round(fps)} FPS`; }
    setResolution(w, h) { this.resEl.textContent = `${w}×${h}`; }
    setQualityLabel(label) {
        this.qualityLabel = label;
        this.qualityEl.textContent = label;
        document.getElementById('btn-q').textContent = `QUALITY: ${label}`;
    }
    /* ---------------- params panel ---------------- */
    buildParams() {
        let html = '';
        let count = 0;
        for (const g of PARAM_GROUPS) {
            const defs = PARAM_DEFS.filter((p) => p.group === g);
            if (!defs.length)
                continue;
            html += `<div class="param-group"><div class="param-group-title">${groupLabel(g)}</div>`;
            for (const p of defs) {
                count++;
                html += `
        <div class="param-row" data-id="${p.id}">
          <label><span>${p.label}</span><b data-val="${p.id}"></b></label>
          <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-id="${p.id}"
                 ${p.log ? `data-log="1"` : ''} />
        </div>`;
            }
            html += '</div>';
        }
        this.paramsList.innerHTML = html;
        this.paramCount.textContent = `${count} PARAMS`;
    }
    bindParams(state, onChange, onReset) {
        for (const p of PARAM_DEFS) {
            const input = this.paramsList.querySelector(`input[data-id="${p.id}"]`);
            if (!input)
                continue;
            this.sliderEls.set(p.id, input);
            this.valEls.set(p.id, this.paramsList.querySelector(`[data-val="${p.id}"]`));
            /* log slider uses exponent mapping */
            const min = p.log ? Math.log10(p.min) : p.min;
            const max = p.log ? Math.log10(p.max) : p.max;
            const toLinear = (v) => p.log ? Math.pow(10, v) : v;
            const toSlider = (v) => p.log ? Math.log10(v) : v;
            const init = state[p.id] ?? p.def;
            input.min = String(min);
            input.max = String(max);
            input.value = String(toSlider(init));
            this.paintSlider(p, input);
            input.addEventListener('input', () => {
                const v = toLinear(parseFloat(input.value));
                onChange(p.id, v);
                this.paintSlider(p, input);
            });
            input.addEventListener('change', () => onReset());
        }
        this.emit(state);
    }
    paintSlider(p, input) {
        const pct = ((parseFloat(input.value) - parseFloat(input.min)) /
            (parseFloat(input.max) - parseFloat(input.min))) * 100;
        input.style.setProperty('--fill', `${pct}%`);
        const v = this.valEls.get(p.id);
        if (v)
            v.textContent = formatVal(p, this.sliderToVal(p));
    }
    sliderToVal(p) {
        const input = this.sliderEls.get(p.id);
        const v = parseFloat(input.value);
        return p.log ? Math.pow(10, v) : v;
    }
    setSlider(id, v) {
        const p = PARAM_DEFS.find((d) => d.id === id);
        const input = this.sliderEls.get(id);
        if (!input)
            return;
        const toSlider = p.log ? Math.log10(v) : v;
        input.value = String(toSlider);
        if (this.valEls.has(id))
            this.valEls.get(id).textContent = formatVal(p, v);
        this.paintSlider(p, input);
    }
    /* rebuild all slider values from a state dict */
    emit(state) {
        for (const p of PARAM_DEFS) {
            if (state[p.id] !== undefined)
                this.setSlider(p.id, state[p.id]);
        }
    }
    setParamHandlers(cb) {
        this.onParam = cb.onParam;
        this.onQuality = cb.onQuality;
        this.onPreset = cb.onPreset;
        this.onCinematic = cb.onCinematic;
        this.onSnap = cb.onSnap;
    }
}
function qs(id) { return document.getElementById(id); }
function groupLabel(g) {
    return g === 'PHYSICS' ? 'PHYSICS & DISK' :
        g === 'DISK' ? 'DISK SHAPE' :
            g === 'RELATIVITY' ? 'RELATIVISTIC EFFECTS' :
                g === 'TURBULENCE' ? 'TURBULENCE' :
                    g === 'SKY' ? 'SKY' :
                        g === 'POST' ? 'POST-PROCESSING' :
                            g === 'CAMERA' ? 'CAMERA' : 'MISC';
}
