// ============================================================
//  勤怠詳細作成ツール
// ============================================================

// --- 定数 ---
const STANDARD_START = '09:00';
const STANDARD_END = '17:45';

let DEFAULTS = {
    'start-type':   '(出社)',
    'start-forget': false,
    'start-time':   STANDARD_START,
    'conn-1':       '～',
    'middle-type':  '外勤',
    'visit-count':  '1件',
    'middle-type-2':'',
    'return-type':  '(帰社)',
    'return-time':  '16:00',
    'conn-2':       '(継)',
    'end-content':  '付帯業務',
    'end-type':     '(退社)',
    'end-forget':   false,
    'end-time':     STANDARD_END,
};

// --- 括弧スタイル ---
const STORAGE_KEY_PAREN = 'attendance_paren_width';
let useFullWidthParens = true;

function loadParenSetting() {
    const saved = localStorage.getItem(STORAGE_KEY_PAREN);
    useFullWidthParens = saved !== 'half';
    document.querySelectorAll('input[name="paren-width"]').forEach(r => {
        r.checked = r.value === (useFullWidthParens ? 'full' : 'half');
    });
}

function convertParens(str) {
    return useFullWidthParens ? str.replace(/\(/g, '（').replace(/\)/g, '）') : str;
}

// --- デフォルト設定 ---
const STORAGE_KEY_DEFAULTS = 'attendance_defaults';

function loadDefaults() {
    try {
        const json = localStorage.getItem(STORAGE_KEY_DEFAULTS);
        if (json) DEFAULTS = { ...DEFAULTS, ...JSON.parse(json) };
    } catch (e) { console.error('Defaults load error:', e); }
}

function saveCurrentAsDefaults() {
    const newDefaults = {};
    for (const key of Object.keys(DEFAULTS)) {
        const el = document.getElementById(key);
        if (el) newDefaults[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    DEFAULTS = newDefaults;
    try {
        localStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(DEFAULTS));
    } catch (e) { console.error('Defaults save error', e); }

    const msg = document.getElementById('msg-save-default');
    if (msg) {
        msg.textContent = '保存しました';
        setTimeout(() => msg.textContent = '', 2000);
    }
}

// --- ユーティリティ ---
function formatTime(timeVal) {
    return timeVal ? timeVal.replace(':', '') : '';
}

function getMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function toTimeString(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function val(id) {
    return document.getElementById(id)?.value ?? '';
}

// --- 時刻調整 ---
function adjTime(id, mins) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value) el.value = DEFAULTS[id] || STANDARD_END;

    let cur = getMinutes(el.value);
    if (Math.abs(mins) === 15) {
        cur = mins > 0 ? (Math.floor(cur / 15) + 1) * 15 : (Math.ceil(cur / 15) - 1) * 15;
    } else {
        cur += mins;
    }
    if (cur < 0) cur += 24 * 60;
    if (cur >= 24 * 60) cur -= 24 * 60;

    el.value = toTimeString(cur);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
}

// 早出判定
function checkEarlyStart(startType) {
    return startType === '(早出)' || startType === '(早出・直行)' || startType === '(早直行)';
}

// conn-1 の選択肢を切り替える（早出時：業務内容 / 通常時：コネクタ）
function setConn1Options(isEarly) {
    const conn1 = document.getElementById('conn-1');
    const prev  = conn1.value;
    const cell  = document.getElementById('early-break-cell');

    if (isEarly) {
        conn1.innerHTML = ['MTG', '付帯業務', '外勤', '外勤同行'].map(o => `<option value="${o}">${o}</option>`).join('');
        if (['MTG', '付帯業務', '外勤', '外勤同行'].includes(prev)) conn1.value = prev;

        // 早出区切り選択（休5 or 継）を表示
        if (cell && !document.getElementById('early-break')) {
            cell.innerHTML = `<select id="early-break" style="width:100%;">
                <option value="(休5)">(休5)</option>
                <option value="(継)">(継)</option>
            </select>`;
            document.getElementById('early-break').addEventListener('input', () => generateReport());
        }
    } else {
        conn1.innerHTML = ['～', '(休5)', '(継)'].map(o => `<option value="${o}">${o}</option>`).join('');
        conn1.value = ['～', '(休5)', '(継)'].includes(prev) ? prev : '～';

        // 早出区切りを非表示
        if (cell) cell.innerHTML = '';
    }
}

// --- 始業タイプ変更時の自動制御 ---
function updateConnectors() {
    const startType = val('start-type');
    const startTime = document.getElementById('start-time');
    const isEarly   = checkEarlyStart(startType);
    const prevConn1 = val('conn-1');

    setConn1Options(isEarly);

    // 早直行は外勤がデフォルト（早出系の選択肢が未選択の場合のみ）
    const earlyOpts = ['MTG', '付帯業務', '外勤', '外勤同行'];
    if (startType === '(早直行)' && !earlyOpts.includes(prevConn1)) {
        document.getElementById('conn-1').value = '外勤';
    }

    startTime.value = isEarly ? '08:30' : STANDARD_START;
    generateReport();
}

// --- ポップアップ ---
async function openPopup() {
    const base = window.location.href.split('?')[0];
    const url  = `${base}?popup=1`;

    // Document Picture-in-Picture（常に最前面）が使えるか確認
    if ('documentPictureInPicture' in window) {
        try {
            const pipWin = await documentPictureInPicture.requestWindow({
                width: 1140,
                height: 420,
                disallowReturnToOpener: false
            });

            // 画面上部に移動を試みる（ブラウザが許可していれば有効）
            try { pipWin.moveTo(screen.availLeft ?? 0, screen.availTop ?? 0); } catch(e) {}

            pipWin.document.documentElement.style.cssText = 'background:#0f172a;';
            pipWin.document.body.style.cssText = 'margin:0;padding:0;background:#0f172a;';

            const iframe = pipWin.document.createElement('iframe');
            iframe.src = url;
            iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;background:transparent;';
            pipWin.document.body.appendChild(iframe);
            return;
        } catch (e) {
            console.warn('Document PiP failed, falling back:', e);
        }
    }

    // フォールバック：通常ポップアップ
    window.open(url, 'attendance-popup',
        'width=1140,height=490,top=0,left=0,resizable=yes,scrollbars=no');
}

// --- 休日当番モード ---
let currentMode = 'normal';

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.btn-mode-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    const normalSection  = document.getElementById('normal-section');
    const holidaySection = document.getElementById('holiday-section');
    const patternToolbar = document.getElementById('pattern-toolbar-el');
    if (mode === 'holiday') {
        if (normalSection)   normalSection.style.display   = 'none';
        if (holidaySection)  holidaySection.style.display  = 'block';
        if (patternToolbar)  patternToolbar.style.display  = 'none';
        renderHolidayLocationOptions();
        generateHolidayReport();
    } else {
        if (normalSection)   normalSection.style.display   = '';
        if (holidaySection)  holidaySection.style.display  = 'none';
        if (patternToolbar)  patternToolbar.style.display  = '';
        generateReport();
        syncPatternButtons();
    }
}

function renderHolidayLocationOptions() {
    const select = document.getElementById('h-location');
    if (!select) return;
    const currentVal = select.value;
    const favs   = masterLocationList.filter(loc =>  favoriteLocations.includes(loc)).sort();
    const others = masterLocationList.filter(loc => !favoriteLocations.includes(loc)).sort();
    let html = '<option value="">場所未定</option>';
    if (favs.length > 0) {
        favs.forEach(loc => { html += `<option value="${loc}">★ ${loc}</option>`; });
        html += `<option disabled>──────────</option>`;
    }
    others.forEach(loc => { html += `<option value="${loc}">${loc}</option>`; });
    select.innerHTML = html;
    if (masterLocationList.includes(currentVal)) select.value = currentVal;
}

function buildHolidayText() {
    const startType = val('h-start-type');
    const callTime  = formatTime(val('h-call-time'));
    const dutyCode  = val('h-duty-code');
    const count     = val('h-count');
    const location  = val('h-location');
    const endTime   = formatTime(val('h-end-time'));
    const loc = location ? location + '完' : '';
    return convertParens(`${startType}${callTime} ${dutyCode}${count}件${loc}（直帰）${endTime}`);
}

function generateHolidayReport() {
    document.getElementById('h-result-text').textContent = buildHolidayText();
    calcHolidayStats();
    updateHolidayReminders();
}

function calcHolidayStats() {
    const callMin = getMinutes(val('h-call-time'));
    const endMin  = getMinutes(val('h-end-time'));
    let diffMin   = endMin - callMin;
    if (diffMin < 0) diffMin += 24 * 60;

    const applyH = Math.floor(diffMin / 60);
    const applyM = diffMin % 60;
    const hEl = document.getElementById('h-apply-h');
    const mEl = document.getElementById('h-apply-m');
    if (hEl) hEl.textContent = String(applyH);
    if (mEl) mEl.textContent = String(applyM).padStart(2, '0');

    // 申請バッジの色
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const badge = hEl?.closest('.overtime-badge');
    if (badge) {
        badge.style.color      = diffMin > 0 ? (isLight ? '#059669' : '#34d399') : '#94a3b8';
        badge.style.background = diffMin > 0 ? (isLight ? 'rgba(5,150,105,0.1)' : 'rgba(52,211,153,0.2)') : 'var(--ot-inactive-bg)';
    }

    // 出勤回数
    const attEl = document.getElementById('h-attendance');
    if (attEl) attEl.textContent = val('h-start-type') === '(出社)' ? '1' : '0';
}

function updateHolidayReminders() {
    const area    = document.getElementById('h-reminder-area');
    if (!area) return;
    const callMin = getMinutes(val('h-call-time'));
    const endMin  = getMinutes(val('h-end-time'));
    const night22 = getMinutes('22:00');
    const night6  = getMinutes('06:00');
    const isDeepNight = endMin >= night22 || callMin >= night22 || callMin < night6;

    if (isDeepNight) {
        area.style.display = 'block';
        area.innerHTML = `<div class="reminder-priority">22時以降の対応は「休深」申請をしてください</div>`;
    } else {
        area.style.display = 'none';
        area.innerHTML = '';
    }
}

function copyHolidayResult() {
    const text = document.getElementById('h-result-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        saveOnCopy(text);
        const btn = document.getElementById('h-btn-copy');
        const orig = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        setTimeout(() => btn.innerHTML = orig, 1200);
    });
}

// --- パターン一括選択 ---
const PATTERNS = {
    'return':    { 'return-type': '(帰社)', 'conn-2': '(継)',   'end-content': '付帯業務', 'end-type': '(退社)' },
    'chokki':    { 'return-type': '',        'conn-2': '',        'end-content': '',          'end-type': '(直帰)' },
    'chokki-ot': { 'return-type': '',        'conn-2': '(休15)', 'end-content': '付帯業務', 'end-type': '(直帰)' },
};

function applyPattern(name) {
    const pattern = PATTERNS[name];
    if (!pattern) return;
    for (const [id, value] of Object.entries(pattern)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }
    syncPatternButtons(name);
    generateReport();
}

function syncPatternButtons(forceName = null) {
    let matched = forceName;
    if (!matched) {
        const current = {
            'return-type': val('return-type'),
            'conn-2':      val('conn-2'),
            'end-content': val('end-content'),
            'end-type':    val('end-type'),
        };
        for (const [name, pattern] of Object.entries(PATTERNS)) {
            if (Object.entries(pattern).every(([k, v]) => current[k] === v)) {
                matched = name;
                break;
            }
        }
    }
    document.querySelectorAll('.btn-pattern').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-pattern') === matched);
    });
}

// --- レポート生成 ---

// レポートテキストの組み立て
function buildReportText() {
    const startType  = val('start-type');
    const startTime  = formatTime(val('start-time'));
    const conn1      = val('conn-1');
    const midType    = val('middle-type');
    const midCount   = val('visit-count');
    const midType2   = val('middle-type-2');
    const retType    = val('return-type');
    const retTime    = formatTime(val('return-time'));
    const conn2      = val('conn-2');
    const endContent = val('end-content');
    const endType    = val('end-type');
    const endTime    = formatTime(val('end-time'));

    const startLate    = document.getElementById('start-forget').checked;
    const endLate      = document.getElementById('end-forget').checked;
    const startTypeStr = startLate ? `${startType}打遅 ` : startType;
    const endTypeStr   = endLate   ? `${endType}打遅 `   : endType;

    // 早出は ～[早出業務][早出区切り] 、通常は conn1 をそのまま使う
    const isEarly   = checkEarlyStart(startType);
    const earlyBreak = val('early-break') || '(休5)';
    const conn1Part  = isEarly ? `～${conn1}${earlyBreak}` : conn1;

    const middle  = midType + midCount;
    const middle2 = midType2 ? ' ' + midType2 + '完' : '';
    const retPart = retType ? retType + retTime : '';
    const afterReturn = conn2 + endContent + endTypeStr + endTime;

    return convertParens(`${startTypeStr}${startTime}${conn1Part}${middle}${middle2}${retPart}${afterReturn}`);
}

// 入力値のバリデーション（エラー時赤枠）
function validateInputs(endMin, stdEndMin) {
    const startMin    = getMinutes(val('start-time'));
    const stdStartMin = getMinutes(STANDARD_START);
    const startType   = val('start-type');
    const isEarly   = checkEarlyStart(startType);
    const isRegular = startType === '(出社)' || startType === '(車出社)' || startType === '(直行)';
    const hasStartError = (isEarly && startMin >= stdStartMin) || (isRegular && startMin < stdStartMin);

    const setError = (id, hasError) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.borderColor = hasError ? '#f87171' : '';
        el.style.boxShadow   = hasError ? '0 0 0 1px rgba(248,113,113,0.5)' : '';
    };

    setError('start-time',  hasStartError);
    setError('return-time', getMinutes(val('return-time')) > endMin);
    setError('end-time',    endMin < stdEndMin);
}

function generateReport() {
    const endMin    = getMinutes(val('end-time'));
    const stdEndMin = getMinutes(STANDARD_END);

    document.getElementById('result-text').textContent = buildReportText();

    validateInputs(endMin, stdEndMin);
    calcOvertime();
    updateReminders();
}

// --- 残業計算 ---
function calcOvertime() {
    const startMin  = getMinutes(val('start-time'));
    const endMin    = getMinutes(val('end-time'));
    const conn2     = val('conn-2');
    const stdStart  = getMinutes(STANDARD_START);
    const stdEnd    = getMinutes(STANDARD_END);
    const isEarly   = checkEarlyStart(val('start-type'));

    let otMinutes = 0;
    if (startMin < stdStart) {
        otMinutes += stdStart - startMin;
        if (isEarly) otMinutes -= 5; // 早出は5分休憩固定
    }
    if (endMin > stdEnd) {
        otMinutes += endMin - stdEnd;
        if (conn2 === '(休15)') otMinutes -= 15;
    }
    otMinutes = Math.max(0, otMinutes);

    updateBadge('ot-actual', otMinutes);
    updateBadge('ot-round',  Math.floor(otMinutes / 10) * 10);

    let breakMinutes = 0;
    if (isEarly)            breakMinutes += 5;
    if (conn2 === '(休15)') breakMinutes += 15;
    updateBadge('break', breakMinutes);
}

function updateBadge(prefix, minutes) {
    const hEl = document.getElementById(`${prefix}-h`);
    const mEl = document.getElementById(`${prefix}-m`);
    if (hEl) hEl.textContent = String(Math.floor(minutes / 60));
    if (mEl) mEl.textContent = String(minutes % 60).padStart(2, '0');

    const isLight   = document.documentElement.getAttribute('data-theme') === 'light';
    const active    = minutes > 0;
    const badge     = hEl?.closest('.overtime-badge');
    if (badge) {
        badge.style.color      = active ? (isLight ? '#059669' : '#34d399') : '#94a3b8';
        badge.style.background = active ? (isLight ? 'rgba(5,150,105,0.1)' : 'rgba(52,211,153,0.2)') : 'var(--ot-inactive-bg)';
    }
}

// --- コピー ---
function copyResult() {
    const text = document.getElementById('result-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        saveOnCopy(text);
        const btn = document.querySelector('.btn-icon');
        const original = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        setTimeout(() => btn.innerHTML = original, 1200);
    });
}

function saveOnCopy(resultText) {
    if (!resultText || resultText === '...') return;

    const date = getTodayString();

    // 同日・同テキストは保存しない
    const isDuplicate = presets.some(p => p.name === date && p.resultText === resultText);
    if (isDuplicate) return;

    const data = {};
    for (const key of Object.keys(DEFAULTS)) {
        const el = document.getElementById(key);
        if (el) data[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    // 動的生成フィールドも保存
    const eb = document.getElementById('early-break');
    if (eb) data['early-break'] = eb.value;

    presets.unshift({ name: date, data, resultText, timestamp: Date.now() });

    if (presets.length > 200) presets = presets.slice(0, 200);

    try {
        localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
    } catch (e) {
        if (e.name === 'QuotaExceededError') alert('ストレージ容量が不足しています。古い履歴を削除してください。');
    }

    renderPresetMenu();
}

function copyText(el) {
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const orig = el.textContent;
        el.textContent = '!';
        setTimeout(() => el.textContent = orig, 800);
    });
}

// --- リセット ---
async function resetAll() {
    const ok = await showActionConfirm({
        title: 'リセットの確認',
        message: 'すべての入力内容をデフォルト値に戻しますか？',
        btnText: 'リセット'
    });
    if (!ok) return;

    for (const [id, value] of Object.entries(DEFAULTS)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
    }
    generateReport();
}

// --- リマインダー ---
function updateReminders() {
    const startType = val('start-type');
    const endType   = val('end-type');
    const reminders = [];

    if (startType === '(直行)' || startType === '(早出・直行)' || startType === '(早直行)') reminders.push('当日の直行申請は済みましたか？');
    if (endType === '(直帰)') reminders.push('直帰申請をしてください');
    if (endType === '(車持)') reminders.push('社用車持帰り申請をしてください');
    if (endType === '(直帰)' || endType === '(車持)') reminders.push('明日直行する場合は、直行申請をしてください');

    const otH  = document.getElementById('ot-round-h').textContent;
    const otM  = document.getElementById('ot-round-m').textContent;
    const area = document.getElementById('reminder-area');
    area.style.display = 'block';

    let html = `<div class="reminder-priority">残業予定時間申請をしてください (申請時間 ${otH}:${otM})</div>`;
    if (reminders.length > 0) {
        html += `<ul class="reminder-list">${reminders.map(m => `<li>${m}</li>`).join('')}</ul>`;
    }
    area.innerHTML = html;
}

// --- 完了場所 ---
let masterLocationList = [];
let favoriteLocations  = [];

const STORAGE_KEY_MASTER = 'attendance_master_locations';
const STORAGE_KEY_FAV    = 'attendance_fav_locations';

function loadLocations() {
    try {
        const m = localStorage.getItem(STORAGE_KEY_MASTER);
        const f = localStorage.getItem(STORAGE_KEY_FAV);
        masterLocationList = m ? JSON.parse(m) : [];
        favoriteLocations  = f ? JSON.parse(f) : [];
    } catch (e) {
        masterLocationList = [];
        favoriteLocations  = [];
    }
}

function saveLocations() {
    try {
        localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(masterLocationList));
        localStorage.setItem(STORAGE_KEY_FAV,    JSON.stringify(favoriteLocations));
    } catch (e) { console.error('Location save error', e); }
}

function renderLocationOptions() {
    const select = document.getElementById('middle-type-2');
    if (!select) return;
    const currentVal = select.value;

    const favs   = masterLocationList.filter(loc =>  favoriteLocations.includes(loc)).sort();
    const others = masterLocationList.filter(loc => !favoriteLocations.includes(loc)).sort();

    let html = '';
    if (favs.length > 0) {
        favs.forEach(loc => { html += `<option value="${loc}">★ ${loc}</option>`; });
        html += `<option disabled>──────────</option>`;
    }
    others.forEach(loc => { html += `<option value="${loc}">${loc}</option>`; });
    html += `<option value="">-</option>`;

    select.innerHTML = html;
    select.value = (currentVal && masterLocationList.includes(currentVal)) ? currentVal : '';
    if (!select.value) select.selectedIndex = 0;
}

function addLocation() {
    const input = document.getElementById('input-add-location');
    const name  = input.value.trim();
    if (!name) return;
    if (masterLocationList.includes(name)) { alert('その場所は既に登録されています'); return; }

    masterLocationList.push(name);
    saveLocations();
    input.value = '';
    renderSettingsCheckboxes();
    renderLocationOptions();
}

async function deleteLocation(loc) {
    const ok = await showActionConfirm({
        title: '場所の削除',
        message: `「${loc}」を削除してもよろしいですか？`,
        btnText: '削除',
        btnColor: '#f87171'
    });
    if (!ok) return;

    masterLocationList = masterLocationList.filter(l => l !== loc);
    favoriteLocations  = favoriteLocations.filter(l => l !== loc);
    saveLocations();
    renderSettingsCheckboxes();
    renderLocationOptions();
}

function renderSettingsCheckboxes() {
    const container = document.getElementById('location-settings-list');
    if (!container) return;

    if (masterLocationList.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:20px;">登録されている場所がありません</p>';
        return;
    }

    container.innerHTML = [...masterLocationList].sort().map(loc => {
        const isFav = favoriteLocations.includes(loc);
        const safe  = loc.replace(/'/g, "\\'");
        return `
            <div class="setting-item">
                <label>
                    <input type="checkbox" value="${loc}" ${isFav ? 'checked' : ''} onchange="toggleFavorite('${safe}', this.checked)">
                    <span>${loc}</span>
                </label>
                <button class="btn-delete-item" onclick="deleteLocation('${safe}')" title="削除">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>`;
    }).join('');
}

function toggleFavorite(loc, isFav) {
    if (isFav) {
        if (!favoriteLocations.includes(loc)) favoriteLocations.push(loc);
    } else {
        favoriteLocations = favoriteLocations.filter(l => l !== loc);
    }
    saveLocations();
    renderLocationOptions();
}

function toggleSettingsModal(show) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('no-scroll', show);
    if (show) {
        switchSettingTab('location');
        renderSettingsCheckboxes();
    }
}

function switchSettingTab(tabName) {
    document.querySelectorAll('#settings-modal .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('#settings-modal .tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

function saveSettings() {
    saveLocations();
    renderLocationOptions();
    toggleSettingsModal(false);
}

window.deleteLocation  = deleteLocation;
window.toggleFavorite  = toggleFavorite;
window.addLocation     = addLocation;

// --- 履歴 (Presets) ---
const STORAGE_KEY_PRESETS = 'attendance_presets_v2';
let presets = [];

function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function loadPresets() {
    try {
        const json = localStorage.getItem(STORAGE_KEY_PRESETS);
        if (json) {
            presets = JSON.parse(json);
            // タイムスタンプ降順（新しい順）
            presets.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
    } catch (e) { presets = []; }
    renderPresetMenu();
    updateCurrentPresetLabel(null);
}

function savePreset() {
    saveDataToDate(getTodayString(), 'btn-save-preset');
}

function savePresetCustom() {
    const dateInput = document.getElementById('save-date');
    if (!dateInput?.value) { alert('日付を指定してください'); return; }
    saveDataToDate(dateInput.value.replace(/-/g, '/'), 'btn-save-custom');
}

function saveDataToDate(targetDate, btnId) {
    const currentData = {};
    for (const key of Object.keys(DEFAULTS)) {
        const el = document.getElementById(key);
        if (el) currentData[key] = el.type === 'checkbox' ? el.checked : el.value;
    }

    const existing = presets.findIndex(p => p.name === targetDate);
    if (existing >= 0) {
        presets[existing].data      = currentData;
        presets[existing].timestamp = Date.now();
    } else {
        presets.push({ name: targetDate, data: currentData, timestamp: Date.now() });
    }

    presets.sort((a, b) => b.name.localeCompare(a.name));
    if (presets.length > 100) presets = presets.slice(0, 100);

    try {
        localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
    } catch (e) {
        if (e.name === 'QuotaExceededError') alert('ストレージ容量が不足しています。古い履歴を削除してください。');
    }

    renderPresetMenu();
    updateCurrentPresetLabel(targetDate);

    const btn = document.getElementById(btnId);
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Saved!';
    setTimeout(() => btn.innerHTML = originalHTML, 1000);
}

async function deletePreset(index, e) {
    if (e) e.stopPropagation();
    const confirmed = await showActionConfirm({
        title: '履歴の削除',
        message: 'この日の履歴データを削除してもよろしいですか？',
        btnText: '削除',
        btnColor: '#f87171'
    });
    if (!confirmed) return;

    presets.splice(index, 1);
    try {
        localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
    } catch (e) { console.error('Preset delete error', e); }
    renderPresetMenu();
    updateCurrentPresetLabel(null);

    const historyModal = document.getElementById('history-modal');
    if (historyModal?.style.display !== 'none') renderHistoryList();
}

function applyPreset(index) {
    const preset = presets[index];
    if (!preset) return;

    for (const [key, value] of Object.entries(preset.data)) {
        const el = document.getElementById(key);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
    }

    // start-type に合わせて conn-1 の選択肢を切り替え、保存値を再適用
    const isEarly = checkEarlyStart(val('start-type'));
    setConn1Options(isEarly);
    const savedConn1 = preset.data['conn-1'];
    if (savedConn1) document.getElementById('conn-1').value = savedConn1;
    const savedEarlyBreak = preset.data['early-break'];
    if (savedEarlyBreak) {
        const eb = document.getElementById('early-break');
        if (eb) eb.value = savedEarlyBreak;
    }

    generateReport();
    syncPatternButtons();
    updateCurrentPresetLabel(preset.name);

    document.getElementById('preset-dropdown').classList.remove('active');
    document.getElementById('dropdown-menu').classList.remove('show');
    closeHistoryModal();
}

function presetItemLabel(p) {
    const text = p.resultText
        ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${p.resultText}</div>`
        : '';
    return `<div><div style="font-size:0.85rem;">${p.name}</div>${text}</div>`;
}

function renderPresetMenu() {
    const menu = document.getElementById('dropdown-menu');
    if (!menu) return;

    if (presets.length === 0) {
        menu.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:0.85rem;">履歴はありません</div>';
        return;
    }

    const displayCount = Math.min(presets.length, 10);
    let html = '';
    for (let i = 0; i < displayCount; i++) {
        html += `
            <div class="preset-item" data-index="${i}">
                ${presetItemLabel(presets[i])}
                <button class="btn-delete-preset" type="button" data-index="${i}" title="削除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>`;
    }
    if (presets.length > 10) {
        html += `<div class="preset-more" id="btn-show-history-modal"><span>すべての履歴を表示 (${presets.length}件)</span></div>`;
    }
    menu.innerHTML = html;

    document.getElementById('btn-show-history-modal')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openHistoryModal();
        document.getElementById('preset-dropdown').classList.remove('active');
        menu.classList.remove('show');
    });
}

function openHistoryModal() {
    renderHistoryList();
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('no-scroll');
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
}

function renderHistoryList() {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (presets.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">履歴はありません</div>';
        return;
    }

    container.innerHTML = presets.map((p, i) => `
        <div class="history-item">
            <div class="history-info">
                <div>${p.name}</div>
                ${p.resultText ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">${p.resultText}</div>` : ''}
            </div>
            <div class="history-actions">
                <button class="btn-apply-history" onclick="applyPreset(${i})">適用</button>
                <button class="btn-delete-history" onclick="deletePreset(${i})" title="削除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>`).join('');
}

function updateCurrentPresetLabel(name) {
    const label = document.getElementById('current-preset-name');
    if (label) label.textContent = name ?? '履歴を選択...';
}

function exportSettingsAsJson() {
    const data = {
        type: 'attendance_config',
        masterLocations: masterLocationList,
        favorites: favoriteLocations,
        presets,
        version: '1.1'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance_settings_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importSettingsAsJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    const confirmed = await showActionConfirm({
        title: '設定のインポート',
        message: '設定ファイルを読み込みますか？現在のお気に入り場所や履歴が上書きされます。',
        btnText: 'インポート'
    });
    if (!confirmed) { e.target.value = ''; return; }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.type !== 'attendance_config') { alert('有効な勤怠詳細設定ファイルではありません。'); return; }
            if (data.masterLocations) masterLocationList = data.masterLocations;
            if (data.favorites)       favoriteLocations  = data.favorites;
            saveLocations();
            renderSettingsCheckboxes();
            renderLocationOptions();
            if (data.presets) {
                presets = data.presets;
                localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
                renderPresetMenu();
            }
            alert('設定をインポートしました。');
        } catch (err) {
            alert('ファイルの読み込みに失敗しました。');
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function initPresetDropdown() {
    const trigger   = document.getElementById('dropdown-trigger');
    const menu      = document.getElementById('dropdown-menu');
    const container = document.getElementById('preset-dropdown');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
        container.classList.toggle('active');
    });

    menu.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-preset');
        const item      = e.target.closest('.preset-item');

        if (deleteBtn) {
            e.stopPropagation();
            if (deleteBtn.classList.contains('confirm')) {
                deletePreset(parseInt(deleteBtn.getAttribute('data-index'), 10), e);
            } else {
                document.querySelectorAll('.btn-delete-preset.confirm').forEach(b => b.classList.remove('confirm'));
                deleteBtn.classList.add('confirm');
                setTimeout(() => {
                    if (document.body.contains(deleteBtn)) deleteBtn.classList.remove('confirm');
                }, 3000);
            }
        } else if (item) {
            applyPreset(parseInt(item.getAttribute('data-index'), 10));
        }
    });

    document.addEventListener('click', (e) => {
        if (container && !container.contains(e.target)) {
            menu.classList.remove('show');
            container.classList.remove('active');
        }
    });
}

function applyDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
        const el = document.getElementById(key);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
    }
}

window.applyPreset         = applyPreset;
window.deletePreset        = deletePreset;
window.exportSettingsAsJson = exportSettingsAsJson;

// --- イベントリスナー初期化 ---
function initEventListeners() {
    // 全 input/select → レポート再生成
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', () => { generateReport(); calcOvertime(); });
    });

    // ポップアップボタン
    document.getElementById('btn-popup')?.addEventListener('click', openPopup);

    // モード切替
    document.querySelectorAll('.btn-mode-toggle').forEach(btn => {
        btn.addEventListener('click', () => switchMode(btn.getAttribute('data-mode')));
    });

    // 休日当番フォーム
    document.querySelectorAll('#holiday-section input, #holiday-section select').forEach(el => {
        el.addEventListener('input', generateHolidayReport);
        el.addEventListener('change', generateHolidayReport);
    });
    document.getElementById('h-btn-copy')?.addEventListener('click', copyHolidayResult);
    document.querySelectorAll('#holiday-section .btn-time-adj').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const minutes  = parseInt(btn.getAttribute('data-minutes'), 10);
            if (targetId && !isNaN(minutes)) adjTime(targetId, minutes);
        });
    });
    document.querySelectorAll('#holiday-section input[type="time"]').forEach(el => {
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            adjTime(el.id, e.deltaY < 0 ? 1 : -1);
        }, { passive: false });
    });

    // パターンボタン
    document.querySelectorAll('.btn-pattern').forEach(btn => {
        btn.addEventListener('click', () => applyPattern(btn.getAttribute('data-pattern')));
    });

    // 始業タイプ変更
    document.getElementById('start-type')?.addEventListener('change', updateConnectors);

    // 時刻調整ボタン
    document.querySelectorAll('.btn-time-adj').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const minutes  = parseInt(btn.getAttribute('data-minutes'), 10);
            if (targetId && !isNaN(minutes)) adjTime(targetId, minutes);
        });
    });

    // 時刻入力 マウスホイール
    document.querySelectorAll('input[type="time"]').forEach(el => {
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            adjTime(el.id, e.deltaY < 0 ? 1 : -1);
        }, { passive: false });
    });

    // コピー
    document.getElementById('btn-copy-result')?.addEventListener('click', copyResult);
    document.querySelectorAll('.ot-copy-target').forEach(el => {
        el.addEventListener('click', function () { copyText(this); });
    });

    // テーマ
    document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
    window.addEventListener('themechange', () => calcOvertime());

    // リセット
    document.getElementById('btn-reset-all')?.addEventListener('click', resetAll);

    // 設定モーダル
    document.getElementById('btn-settings')?.addEventListener('click', () => toggleSettingsModal(true));
    document.getElementById('btn-close-modal')?.addEventListener('click', () => toggleSettingsModal(false));
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') toggleSettingsModal(false);
    });

    // 設定タブ
    document.querySelectorAll('#settings-modal .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSettingTab(btn.getAttribute('data-tab')));
    });

    // 括弧スタイル
    document.querySelectorAll('input[name="paren-width"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            useFullWidthParens = e.target.value === 'full';
            localStorage.setItem(STORAGE_KEY_PAREN, e.target.value);
            generateReport();
        });
    });

    // デフォルト・設定保存
    document.getElementById('btn-save-default')?.addEventListener('click', saveCurrentAsDefaults);
    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);


    // 履歴モーダル
    document.getElementById('btn-close-history')?.addEventListener('click', closeHistoryModal);
    document.getElementById('btn-close-history-footer')?.addEventListener('click', closeHistoryModal);
    document.getElementById('history-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'history-modal') closeHistoryModal();
    });

    // JSON インポート/エクスポート
    document.getElementById('btn-save-json')?.addEventListener('click', exportSettingsAsJson);
    const btnImport   = document.getElementById('btn-import-config');
    const inputImport = document.getElementById('input-import-config');
    if (btnImport && inputImport) {
        btnImport.addEventListener('click', () => inputImport.click());
        inputImport.addEventListener('change', importSettingsAsJson);
    }

    // CSV インポート（場所）
    const btnCsv   = document.getElementById('btn-import-csv');
    const inputCsv = document.getElementById('input-import-csv');
    if (btnCsv && inputCsv) {
        btnCsv.addEventListener('click', () => inputCsv.click());
        inputCsv.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const rows = parseCSV(event.target.result);
                    if (rows.length < 2) { alert('CSVファイルの中身が足りません（ヘッダー + データ1行以上必要です）。'); inputCsv.value = ''; return; }
                    const newLocations = rows.slice(1).map(r => r[0]?.trim()).filter(Boolean);
                    if (!newLocations.length) { alert('有効なデータが見つかりませんでした。'); inputCsv.value = ''; return; }

                    const ok = await showActionConfirm({
                        title: 'インポートの確認',
                        message: `${newLocations.length}件の場所が見つかりました。現在のリストを上書きして登録してもよろしいですか？`,
                        btnText: 'インポート実行'
                    });
                    if (ok) {
                        masterLocationList = newLocations;
                        saveLocations();
                        renderSettingsCheckboxes();
                        renderLocationOptions();
                    }
                } catch (err) { alert('ファイルの解析に失敗しました。'); }
                inputCsv.value = '';
            };
            reader.readAsText(file);
        });
    }

    // 場所追加
    document.getElementById('btn-add-location')?.addEventListener('click', addLocation);
    document.getElementById('input-add-location')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addLocation();
    });
}

// --- 初期化 ---
window.addEventListener('DOMContentLoaded', () => {
    // ポップアップモード検出
    if (new URLSearchParams(window.location.search).has('popup')) {
        document.body.classList.add('popup-mode');
    }

    loadDefaults();
    loadParenSetting();
    loadLocations();
    renderLocationOptions();
    applyDefaults();

    loadPresets();
    initPresetDropdown();

    initEventListeners();
    generateReport();
    syncPatternButtons();
});
