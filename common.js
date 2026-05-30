// ============================================================
//  共通スクリプト - common.js
// ============================================================

// --------------------------------------------------
//  テーマ切替
// --------------------------------------------------
function toggleTheme() {
    const root = document.documentElement;
    const isLight = root.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';

    root.setAttribute('data-theme', newTheme);
    try {
        localStorage.setItem('attendance_theme', newTheme);
    } catch (e) { console.error('Theme save error', e); }
    updateThemeButton(newTheme);

    // テーマ変更イベントを発火（各ツールが必要に応じてリッスン）
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
}

/** テーマボタンのアイコンを更新 */
function updateThemeButton(theme) {
    const btn = document.getElementById('theme-btn');
    if (!btn) return;
    const moon = btn.querySelector('.icon-moon');
    const sun = btn.querySelector('.icon-sun');
    if (moon && sun) {
        moon.style.display = theme === 'light' ? 'none' : 'block';
        sun.style.display = theme === 'light' ? 'block' : 'none';
    } else {
        // Fallback for pages without SVG icons yet
        btn.textContent = theme === 'light' ? '\u2600' : '\u263E';
    }
}

/** 保存済みテーマを適用（各ページの初期化前に呼ぶ） */
function initTheme() {
    const savedTheme = localStorage.getItem('attendance_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButton(savedTheme);
}

// ページ読み込み時にテーマを適用
document.addEventListener('DOMContentLoaded', initTheme);

/** 簡易CSVパース関数 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    return lines.map(line => {
        const result = [];
        let startValueIndex = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                result.push(line.substring(startValueIndex, i).replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
                startValueIndex = i + 1;
            }
        }
        result.push(line.substring(startValueIndex).replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
        return result;
    });
}

/** 
 * アクション確認モーダルを表示
 * @param {Object} options { title, message, btnText, btnColor, top }
 * @returns {Promise<boolean>} 実行ならtrue
 */
let currentConfirmResolve = null;

function showActionConfirm(options = {}) {
    const { title, message, btnText, btnColor, top = true } = options;

    // モーダルがなければ生成して注入
    let modal = document.getElementById('action-confirm-modal');
    if (!modal) {
        const modalHtml = `
            <div id="action-confirm-modal" class="modal-overlay" style="z-index: 9999;">
                <div class="modal-card" style="text-align: center;">
                    <div id="action-confirm-icon" style="margin-bottom: 1rem; color: #f87171;">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h3 id="action-confirm-title" style="margin-bottom: 0.5rem; color: var(--text-primary); font-size: 1.2rem; font-weight: 700;"></h3>
                    <p id="action-confirm-message" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 2rem; line-height: 1.5;"></p>
                    <div style="display: flex; gap: 12px; justify-content: center;">
                        <button id="btn-action-cancel" class="btn-secondary" style="flex: 1; min-height: 48px; font-weight: 600;">キャンセル</button>
                        <button id="btn-action-execute" class="btn-primary" style="flex: 1; min-height: 48px; font-weight: 600;"></button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('action-confirm-modal');

        // イベントリスナー登録 (初回のみ)
        document.getElementById('btn-action-cancel').addEventListener('click', () => closeActionConfirm(false));
        document.getElementById('btn-action-execute').addEventListener('click', () => closeActionConfirm(true));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeActionConfirm(false);
        });
    }

    // 表示内容の設定
    document.getElementById('action-confirm-title').textContent = title || '確認';
    document.getElementById('action-confirm-message').textContent = message || '実行してよろしいですか？';
    const executeBtn = document.getElementById('btn-action-execute');
    executeBtn.textContent = btnText || '実行';
    executeBtn.style.background = btnColor || '';

    // 配置の設定 (Top)
    if (top) {
        modal.classList.add('modal-top');
    } else {
        modal.classList.remove('modal-top');
    }

    modal.style.display = 'flex';

    return new Promise((resolve) => {
        currentConfirmResolve = resolve;
    });
}

function closeActionConfirm(result) {
    const modal = document.getElementById('action-confirm-modal');
    if (modal) modal.style.display = 'none';
    if (currentConfirmResolve) {
        currentConfirmResolve(result);
        currentConfirmResolve = null;
    }
}

// Global scope
window.showActionConfirm = showActionConfirm;
