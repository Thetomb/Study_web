// 纯前端模拟登录模块（演示用途）
// 注意：用户数据保存在浏览器 localStorage，密码未做真实加密，仅适合课程作业演示，切勿用于真实生产环境。

const AUTH = {
    usersKey: 'zhixuetong_users',
    sessionKey: 'zhixuetong_session',
    loginPage: 'login.html',
    protectedPages: ['chat.html', 'profile.html']
};

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(AUTH.usersKey)) || [];
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(AUTH.usersKey, JSON.stringify(users));
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem(AUTH.sessionKey));
    } catch {
        return null;
    }
}

function setSession(session) {
    if (session) {
        localStorage.setItem(AUTH.sessionKey, JSON.stringify(session));
    } else {
        localStorage.removeItem(AUTH.sessionKey);
    }
}

function registerUser(username, password, nickname) {
    username = (username || '').trim();
    nickname = (nickname || '').trim() || username;

    if (!username || !password) {
        return { ok: false, error: '用户名和密码不能为空' };
    }
    if (username.length < 2) {
        return { ok: false, error: '用户名至少 2 个字符' };
    }
    if (password.length < 6) {
        return { ok: false, error: '密码至少 6 位' };
    }

    const users = getUsers();
    if (users.some(u => u.username === username)) {
        return { ok: false, error: '该用户名已被注册' };
    }

    const user = { username, password, nickname, createdAt: Date.now() };
    users.push(user);
    saveUsers(users);
    return { ok: true, user };
}

function loginUser(username, password) {
    username = (username || '').trim();
    const users = getUsers();
    const user = users.find(u => u.username === username);

    if (!user || user.password !== password) {
        return { ok: false, error: '用户名或密码错误' };
    }

    const session = {
        username: user.username,
        nickname: user.nickname,
        loginAt: Date.now()
    };
    setSession(session);
    return { ok: true, user: session };
}

function logoutUser() {
    setSession(null);
}

function changePassword(username, oldPassword, newPassword) {
    const users = getUsers();
    const idx = users.findIndex(u => u.username === username);

    if (idx === -1) {
        return { ok: false, error: '用户不存在，请重新登录' };
    }
    if (users[idx].password !== oldPassword) {
        return { ok: false, error: '当前密码不正确' };
    }
    if (!newPassword || newPassword.length < 6) {
        return { ok: false, error: '新密码至少 6 位' };
    }
    if (newPassword === oldPassword) {
        return { ok: false, error: '新密码不能与当前密码相同' };
    }

    users[idx].password = newPassword;
    saveUsers(users);
    return { ok: true };
}

function currentPageFile() {
    const file = window.location.pathname.split('/').pop();
    return file || 'index.html';
}

function guardProtectedPage() {
    const page = currentPageFile();
    if (AUTH.protectedPages.includes(page) && !getCurrentUser()) {
        const redirect = encodeURIComponent(page + window.location.search);
        window.location.replace(`${AUTH.loginPage}?redirect=${redirect}`);
        return false;
    }
    return true;
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function renderAuthNav() {
    const navContent = document.querySelector('.nav-content');
    if (!navContent) return;

    let container = document.getElementById('navAuth');
    if (!container) {
        container = document.createElement('div');
        container.id = 'navAuth';
        container.className = 'nav-auth';
        navContent.appendChild(container);
    }

    const user = getCurrentUser();
    if (user) {
        const initial = escapeHtml((user.nickname || 'U').slice(0, 1).toUpperCase());
        container.innerHTML = `
            <div class="user-menu">
                <a class="user-info-link" href="profile.html" title="个人中心">
                    <span class="user-avatar">${initial}</span>
                    <span class="user-name">${escapeHtml(user.nickname)}</span>
                </a>
                <button class="btn btn-outline btn-sm" id="changePwdBtn">修改密码</button>
                <button class="btn btn-outline btn-sm" id="logoutBtn">退出</button>
            </div>`;
        document.getElementById('changePwdBtn')?.addEventListener('click', openChangePasswordModal);
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            logoutUser();
            const page = currentPageFile();
            if (AUTH.protectedPages.includes(page)) {
                window.location.href = AUTH.loginPage;
            } else {
                renderAuthNav();
            }
        });
    } else {
        container.innerHTML = '<a href="login.html" class="btn btn-primary btn-sm">登录 / 注册</a>';
    }
}

function ensureChangePasswordModal() {
    let overlay = document.getElementById('changePwdModal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'changePwdModal';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="changePwdTitle">
            <div class="modal-header">
                <h3 id="changePwdTitle">修改密码</h3>
                <button type="button" class="modal-close" id="changePwdClose" aria-label="关闭">&times;</button>
            </div>
            <div class="auth-message" id="changePwdMessage" style="display:none;"></div>
            <form id="changePwdForm" autocomplete="off">
                <div class="form-group">
                    <label for="cpOldPassword">当前密码</label>
                    <input type="password" id="cpOldPassword" placeholder="请输入当前密码" required>
                </div>
                <div class="form-group">
                    <label for="cpNewPassword">新密码</label>
                    <input type="password" id="cpNewPassword" placeholder="至少 6 位" required>
                </div>
                <div class="form-group">
                    <label for="cpConfirmPassword">确认新密码</label>
                    <input type="password" id="cpConfirmPassword" placeholder="再次输入新密码" required>
                </div>
                <button type="submit" class="btn btn-primary btn-lg auth-submit">确认修改</button>
            </form>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeChangePasswordModal();
    });
    overlay.querySelector('#changePwdClose')?.addEventListener('click', closeChangePasswordModal);
    overlay.querySelector('#changePwdForm')?.addEventListener('submit', handleChangePasswordSubmit);

    return overlay;
}

function openChangePasswordModal() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = AUTH.loginPage;
        return;
    }

    const overlay = ensureChangePasswordModal();
    overlay.querySelector('#changePwdForm')?.reset();
    setModalMessage('', '');
    overlay.classList.add('active');
    setTimeout(() => overlay.querySelector('#cpOldPassword')?.focus(), 50);
}

function closeChangePasswordModal() {
    document.getElementById('changePwdModal')?.classList.remove('active');
}

function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
        window.location.href = AUTH.loginPage;
        return;
    }

    const oldPassword = document.getElementById('cpOldPassword').value;
    const newPassword = document.getElementById('cpNewPassword').value;
    const confirmPassword = document.getElementById('cpConfirmPassword').value;

    if (newPassword !== confirmPassword) {
        setModalMessage('两次输入的新密码不一致', 'error');
        return;
    }

    const result = changePassword(user.username, oldPassword, newPassword);
    if (result.ok) {
        setModalMessage('密码修改成功！', 'success');
        document.getElementById('changePwdForm')?.reset();
        setTimeout(closeChangePasswordModal, 1200);
    } else {
        setModalMessage(result.error, 'error');
    }
}

function setModalMessage(text, type) {
    const el = document.getElementById('changePwdMessage');
    if (!el) return;
    if (!text) {
        el.textContent = '';
        el.style.display = 'none';
        return;
    }
    el.textContent = text;
    el.className = `auth-message ${type || ''}`;
    el.style.display = 'block';
}

function initLoginPage() {
    const wrapper = document.getElementById('authPage');
    if (!wrapper) return;

    if (getCurrentUser()) {
        window.location.replace(resolveRedirectTarget());
        return;
    }

    const tabs = wrapper.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.target;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            loginForm.classList.toggle('active', target === 'login');
            registerForm.classList.toggle('active', target === 'register');
            clearAuthMessage();
        });
    });

    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const result = loginUser(username, password);
        if (result.ok) {
            window.location.href = resolveRedirectTarget();
        } else {
            showAuthMessage(result.error, 'error');
        }
    });

    registerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const nickname = document.getElementById('registerNickname').value;
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('registerConfirm').value;

        if (password !== confirm) {
            showAuthMessage('两次输入的密码不一致', 'error');
            return;
        }

        const result = registerUser(username, password, nickname);
        if (result.ok) {
            loginUser(username, password);
            window.location.href = resolveRedirectTarget();
        } else {
            showAuthMessage(result.error, 'error');
        }
    });
}

function resolveRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
        const decoded = decodeURIComponent(redirect);
        // 只允许跳回站内页面，避免开放重定向
        if (!/^https?:|^\/\//i.test(decoded)) {
            return decoded;
        }
    }
    return 'index.html';
}

function showAuthMessage(text, type) {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message ${type || ''}`;
    el.style.display = 'block';
}

function clearAuthMessage() {
    const el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!guardProtectedPage()) return;
    renderAuthNav();
    initLoginPage();
});
