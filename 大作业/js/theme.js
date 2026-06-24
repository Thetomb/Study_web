// 主题切换（黑白双主题）。立即执行的部分在样式应用前设置主题，避免刷新闪烁。
(function () {
    const KEY = 'zhixuetong_theme';
    let stored;
    try {
        stored = localStorage.getItem(KEY);
    } catch {
        stored = null;
    }
    const theme = stored === 'dark' || stored === 'light' ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();

const THEME_KEY = 'zhixuetong_theme';

function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        /* 忽略隐私模式下的存储异常 */
    }
    updateThemeToggleIcon(theme);
}

function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

function updateThemeToggleIcon(theme) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    const label = theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题';
    btn.setAttribute('aria-label', label);
    btn.title = label;
}

function initThemeToggle() {
    const navContent = document.querySelector('.nav-content');
    if (!navContent || document.getElementById('themeToggle')) return;

    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', toggleTheme);
    navContent.appendChild(btn);

    updateThemeToggleIcon(currentTheme());
}

document.addEventListener('DOMContentLoaded', initThemeToggle);
