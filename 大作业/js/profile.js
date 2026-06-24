// 个人信息 / 学生画像（纯前端版）：数据全部存在浏览器 localStorage，无需后端。
// 信息字段 + 上传的文件内容会合并成「一个文件」的文本，对话时由前端拼进消息发给 6 个智能体。

const PROFILE_FIELD_IDS = ['name', 'grade', 'school', 'major', 'gpa', 'strengths', 'weaknesses', 'direction', 'targetSchool', 'interests', 'personality', 'habits', 'notes'];

const PROFILE_FIELD_LABELS = {
    name: '姓名', grade: '年级', school: '学校', major: '专业',
    gpa: '绩点GPA', strengths: '优势科目', weaknesses: '薄弱科目',
    direction: '发展方向', targetSchool: '目标院校/岗位', interests: '兴趣爱好',
    personality: '性格', habits: '学习习惯', notes: '备注'
};

function profileUsername() {
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    return user ? user.username : 'guest';
}

function profileStorageKey() {
    return 'zhixuetong_profile_' + profileUsername();
}

function getStoredProfile() {
    try {
        return JSON.parse(localStorage.getItem(profileStorageKey())) || {};
    } catch {
        return {};
    }
}

function setStoredProfile(profile) {
    localStorage.setItem(profileStorageKey(), JSON.stringify(profile));
}

function escapeHtmlText(str) {
    return (str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function stripHtmlText(html) {
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 把画像（字段 + 上传文件内容）合并成「一个文件」的文本
function buildProfileFileContent(profile) {
    if (!profile) return '';
    const lines = ['===== 学生画像（智学通）====='];
    for (const [key, label] of Object.entries(PROFILE_FIELD_LABELS)) {
        const value = profile[key];
        if (value && String(value).trim()) lines.push(`${label}：${String(value).trim()}`);
    }
    if (profile.portrait) {
        if (profile.portrait.kind === 'photo') {
            lines.push(`画像图片：已上传照片「${profile.portrait.name || '照片'}」（图片内容不参与文字知识库）`);
        } else if (profile.portrait.text) {
            lines.push('', '【附加资料（来自上传文件）】', profile.portrait.text);
        }
    }
    if (profile.updatedAt) {
        lines.push('', `更新时间：${new Date(profile.updatedAt).toLocaleString('zh-CN')}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
}

// 供对话页使用：返回拼接到消息前的画像前缀（无画像时返回空串）
function getProfileChatPrefix() {
    const content = buildProfileFileContent(getStoredProfile());
    if (!content) return '';
    return `【学生画像文件｜请结合以下学生资料做个性化、有针对性的回答】\n${content}\n\n【学生问题】\n`;
}

function setProfileStatus(elId, text, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'profile-status' + (type ? ' ' + type : '');
    el.style.display = text ? 'block' : 'none';
}

function loadProfile() {
    const profile = getStoredProfile();
    PROFILE_FIELD_IDS.forEach(id => {
        const input = document.getElementById('pf_' + id);
        if (input && typeof profile[id] === 'string') input.value = profile[id];
    });
    renderPortrait(profile.portrait);
    loadProfileFile();
}

function renderPortrait(portrait) {
    const box = document.getElementById('portraitPreview');
    if (!box) return;

    if (!portrait) {
        box.innerHTML = '<p class="portrait-empty">尚未上传学生画像</p>';
        return;
    }

    if (portrait.kind === 'photo' && portrait.dataUrl) {
        box.innerHTML = `
            <img class="portrait-img" src="${portrait.dataUrl}" alt="学生画像">
            <p class="portrait-name">📷 ${escapeHtmlText(portrait.name || '照片画像')}</p>`;
    } else {
        box.innerHTML = `
            <pre class="profile-file">${escapeHtmlText((portrait.text || '').slice(0, 2000))}</pre>
            <p class="portrait-name">📄 ${escapeHtmlText(portrait.name || '文档画像')}（内容已纳入 AI 知识库）</p>`;
    }
}

function loadProfileFile() {
    const pre = document.getElementById('profileFilePreview');
    if (!pre) return;
    pre.textContent = buildProfileFileContent(getStoredProfile()) || '（暂无画像信息）';
}

function saveProfile() {
    const profile = getStoredProfile();
    PROFILE_FIELD_IDS.forEach(id => {
        const input = document.getElementById('pf_' + id);
        if (input) profile[id] = input.value.trim();
    });
    profile.updatedAt = Date.now();

    try {
        setStoredProfile(profile);
        setProfileStatus('saveStatus', '✓ 信息已保存到本地，AI 将参考这些信息进行回答', 'success');
        loadProfileFile();
    } catch {
        setProfileStatus('saveStatus', '⚠️ 本地存储空间不足，请删减内容或更换较小的画像图片', 'error');
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

async function uploadPortrait() {
    const kind = document.querySelector('input[name="portraitKind"]:checked')?.value || 'photo';
    const fileInput = document.getElementById('portraitFile');
    const file = fileInput?.files?.[0];

    if (!file) {
        setProfileStatus('portraitStatus', '请先选择文件', 'error');
        return;
    }

    setProfileStatus('portraitStatus', '处理中...', 'loading');

    try {
        const profile = getStoredProfile();
        if (kind === 'photo') {
            if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
            if (file.size > 2 * 1024 * 1024) throw new Error('图片过大，请选择 2MB 以内的图片');
            const dataUrl = await readFileAsDataUrl(file);
            profile.portrait = { kind: 'photo', name: file.name, dataUrl, text: '' };
        } else {
            const raw = await readFileAsText(file);
            const isHtml = /\.html?$/i.test(file.name) || /<[a-z][\s\S]*>/i.test(raw);
            profile.portrait = { kind: 'doc', name: file.name, text: (isHtml ? stripHtmlText(raw) : raw).slice(0, 4000) };
        }
        profile.updatedAt = Date.now();
        setStoredProfile(profile);

        setProfileStatus('portraitStatus', '✓ 画像已保存到本地', 'success');
        if (fileInput) fileInput.value = '';
        renderPortrait(profile.portrait);
        loadProfileFile();
    } catch (err) {
        const msg = /quota|exceeded/i.test(err.message || '') ? '本地存储空间不足，请更换较小的图片' : err.message;
        setProfileStatus('portraitStatus', '⚠️ ' + msg, 'error');
    }
}

function updatePortraitHint() {
    const kind = document.querySelector('input[name="portraitKind"]:checked')?.value || 'photo';
    const fileInput = document.getElementById('portraitFile');
    const hint = document.getElementById('portraitHint');
    if (fileInput) fileInput.accept = kind === 'photo' ? 'image/*' : '.html,.htm,.txt,.md,text/html,text/plain';
    if (hint) {
        hint.textContent = kind === 'photo'
            ? '照片将作为画像图片展示与存档（不会被识别为文字），建议 2MB 以内。'
            : 'HTML / 文本文件的文字内容将被提取，合并进 AI 共享画像文件。';
    }
}

function initProfilePage() {
    if (!document.getElementById('profilePage')) return;

    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
    document.getElementById('uploadPortraitBtn')?.addEventListener('click', uploadPortrait);
    document.getElementById('refreshFileBtn')?.addEventListener('click', loadProfileFile);
    document.querySelectorAll('input[name="portraitKind"]').forEach(r => {
        r.addEventListener('change', updatePortraitHint);
    });

    updatePortraitHint();
    loadProfile();
}

document.addEventListener('DOMContentLoaded', initProfilePage);
