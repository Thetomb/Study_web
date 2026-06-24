const chatState = {
    currentAgent: API_CONFIG.defaultAgent,
    conversations: {},
    userId: getOrCreateUserId(),
    isLoading: false,
    apiReady: false,
    pendingFiles: [], // 待发送的文件列表
    mentalCharacter: null // 当前选中的心理支持角色 { name, icon, personality, style }
};

// 心理支持预设角色定义
const MENTAL_CHARACTERS = {
    warm: {
        name: '小暖',
        icon: '🌻',
        personality: '温柔耐心的倾听者，像阳光一样温暖。善于共情，用温暖的语言给予鼓励和支持，让用户感受到被理解和接纳。',
        style: '温暖鼓励型',
        greeting: '你好呀～我是小暖，很高兴能在这里陪伴你。无论今天经历了什么，都可以和我聊聊，我会认真倾听的。今天感觉怎么样？'
    },
    rational: {
        name: '小智',
        icon: '🦉',
        personality: '理性专业的分析师，帮你理清思路。善于从心理学角度分析问题，提供结构化的建议和解决方案，帮助用户看清问题的本质。',
        style: '理性分析型',
        greeting: '你好，我是小智。如果你遇到了困扰，我们可以一起理性地分析一下。请告诉我你目前的情况，我会从专业角度给你建议。'
    },
    humor: {
        name: '小喵',
        icon: '🐱',
        personality: '幽默风趣的小伙伴，用轻松方式化解烦恼。说话活泼有趣，擅长用比喻和段子让沉重的话题变得轻松，但不会回避问题的核心。',
        style: '幽默轻松型',
        greeting: '喵～我是小喵！遇到烦心事啦？没关系，跟我说说，咱们一起想办法！生活已经够累了，让我帮你轻松一下～'
    },
    calm: {
        name: '小静',
        icon: '🌙',
        personality: '沉稳内敛的陪伴者，给你安静的力量。话不多但每句都有分量，善于引导深度思考，帮助用户在安静中找到内心的答案。',
        style: '沉稳深度型',
        greeting: '你好，我是小静。如果你愿意，可以慢慢告诉我你的感受。不用着急，我们有足够的时间。'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initSidebar();
    initInputArea();
    initFaq();
    initMobileMenu();
    initScenarioItems();
    loadMentalCharacter(); // 加载已保存的心理支持角色
    initChatPage();
    checkUpcomingReminders(); // 检查即将到期的备忘/任务提醒
    startClock(); // 启动实时时钟
});

// 实时时钟
function startClock() {
    const clockEl = document.getElementById('chatClock');
    if (!clockEl) return;

    function updateClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${h}:${m}:${s}`;
    }

    updateClock();
    setInterval(updateClock, 1000);
}

function getOrCreateUserId() {
    let userId = localStorage.getItem('zhixuetong_user_id');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('zhixuetong_user_id', userId);
    }
    return userId;
}

// 处理文件上传
async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const preview = document.getElementById('filePreview');
    if (!preview) return;

    for (const file of files) {
        // 检查文件大小（限制 20MB）
        if (file.size > 20 * 1024 * 1024) {
            alert(`文件 "${file.name}" 超过 20MB 限制`);
            continue;
        }

        // 读取图片为 base64（用于本地显示）
        let dataUrl = null;
        if (file.type.startsWith('image/')) {
            dataUrl = await readFileAsDataURL(file);
        }

        // 添加到待发送列表
        const fileObj = {
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            fileId: null,
            uploading: false,
            dataUrl: dataUrl // base64 用于本地显示
        };
        chatState.pendingFiles.push(fileObj);

        // 显示预览
        renderFilePreview();
    }

    // 清空 input，允许重复选择同一文件
    event.target.value = '';

    // 自动上传文件
    await uploadPendingFiles();
}

// 读取文件为 base64 data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 渲染文件预览
function renderFilePreview() {
    const preview = document.getElementById('filePreview');
    if (!preview) return;

    if (chatState.pendingFiles.length === 0) {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }

    preview.style.display = 'flex';
    preview.innerHTML = chatState.pendingFiles.map((f, idx) => {
        const isImage = f.type.startsWith('image/');
        const sizeStr = formatFileSize(f.size);
        const status = f.fileId ? '✓' : (f.uploading ? '上传中...' : '');

        return `
            <div class="file-preview-item">
                ${isImage && f.dataUrl ? `<img src="${f.dataUrl}" alt="${f.name}">` : ''}
                <span class="file-name">${f.name} (${sizeStr})</span>
                <span class="file-status">${status}</span>
                <button class="file-remove" onclick="removePendingFile(${idx})" title="移除">×</button>
            </div>
        `;
    }).join('');
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 移除待发送文件
function removePendingFile(index) {
    chatState.pendingFiles.splice(index, 1);
    renderFilePreview();
}

// 上传所有待发送文件
async function uploadPendingFiles() {
    const filesToUpload = chatState.pendingFiles.filter(f => !f.fileId && !f.uploading);
    if (!filesToUpload.length) return;

    for (const fileObj of filesToUpload) {
        fileObj.uploading = true;
        renderFilePreview();

        try {
            const result = await cozeUploadFile(fileObj.file);
            fileObj.fileId = result.file_id;
            fileObj.fileType = result.file_type;
            fileObj.uploading = false;
        } catch (err) {
            console.error('文件上传失败:', err);
            fileObj.uploading = false;
            alert(`文件 "${fileObj.name}" 上传失败: ${err.message}`);
            // 移除失败的文件
            const idx = chatState.pendingFiles.indexOf(fileObj);
            if (idx > -1) chatState.pendingFiles.splice(idx, 1);
        }

        renderFilePreview();
    }
}

function getConversation(agentId) {
    if (!chatState.conversations[agentId]) {
        chatState.conversations[agentId] = { conversationId: null, messages: [] };
    }
    return chatState.conversations[agentId];
}

function chatsStorageKey() {
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const id = (user && user.username) ? user.username : chatState.userId;
    return `zhixuetong_chats_${id}`;
}

function loadConversations() {
    try {
        const raw = localStorage.getItem(chatsStorageKey());
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveConversations() {
    try {
        localStorage.setItem(chatsStorageKey(), JSON.stringify(chatState.conversations));
    } catch {
        /* localStorage 已满或被禁用时静默忽略 */
    }
}

function clearChatHistory(agentId) {
    if (agentId) {
        delete chatState.conversations[agentId];
    } else {
        chatState.conversations = {};
    }
    saveConversations();
    renderMessages(chatState.currentAgent);
}

function confirmClearChat() {
    const agent = API_CONFIG.agents[chatState.currentAgent];
    const name = agent ? agent.name : '当前';
    if (confirm(`确定要清空「${name}」的历史对话吗？此操作不可恢复。`)) {
        clearChatHistory(chatState.currentAgent);
    }
}

async function initChatPage() {
    if (!window.location.pathname.includes('chat.html')) return;

    if (typeof initPlanPanel === 'function') initPlanPanel();

    chatState.conversations = loadConversations();

    const pendingAgent = sessionStorage.getItem('pendingAgent');
    const pendingMessage = sessionStorage.getItem('pendingMessage');

    if (pendingAgent && API_CONFIG.agents[pendingAgent]) {
        switchAgent(pendingAgent, false);
        sessionStorage.removeItem('pendingAgent');
    } else {
        const lastAgent = localStorage.getItem('zhixuetong_last_agent');
        if (lastAgent && API_CONFIG.agents[lastAgent]) {
            switchAgent(lastAgent, false);
        } else if (typeof applyPlanMode === 'function') {
            applyPlanMode(chatState.currentAgent);
        }
    }

    // 心理支持：如果有已保存的角色，直接进入对话模式
    if (chatState.currentAgent === 'mental' && chatState.mentalCharacter) {
        applyMentalCharacter();
    } else if (!['mental', 'education', 'risk', 'planning'].includes(chatState.currentAgent)) {
        renderMessages(chatState.currentAgent);
    }
    // 面板类智能体的显隐已由 switchAgent → applyPlanMode 统一处理

    await checkApiHealth();
    initChatHeaderActions();

    if (pendingMessage) {
        sessionStorage.removeItem('pendingMessage');
        if (chatState.currentAgent === 'planning' && typeof generatePlan === 'function') {
            const goalInput = document.getElementById('planGoalInput');
            if (goalInput) goalInput.value = pendingMessage;
            generatePlan(pendingMessage);
        } else {
            setTimeout(() => {
                const input = document.getElementById('messageInput');
                if (input) {
                    input.value = pendingMessage;
                    input.dispatchEvent(new Event('input'));
                    sendMessage();
                }
            }, 300);
        }
    }
}

async function checkApiHealth() {
    const statusEl = document.getElementById('chatBotStatus');
    const configured = (typeof cozeConfiguredCount === 'function') ? cozeConfiguredCount() : 0;
    chatState.apiReady = Boolean(typeof COZE_CONFIG !== 'undefined' && COZE_CONFIG.token) && configured > 0;

    if (statusEl) {
        if (chatState.apiReady) {
            statusEl.textContent = `在线 · ${configured} 个智能体已接入`;
            statusEl.classList.remove('offline');
        } else {
            statusEl.textContent = 'API 未配置';
            statusEl.classList.add('offline');
        }
    }
}

function initChatHeaderActions() {
    const homeBtn = document.querySelector('.chat-actions button[title="回到首页"]');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
}

function initNavbar() {
    const navbar = document.getElementById('navbar');
    const burgerMenu = document.getElementById('burgerMenu');
    const navLinks = document.getElementById('navLinks');

    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    if (burgerMenu && navLinks) {
        burgerMenu.addEventListener('click', () => {
            burgerMenu.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!burgerMenu.contains(e.target) && !navLinks.contains(e.target)) {
                burgerMenu.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });
    }
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapseBtn');

    if (collapseBtn && sidebar) {
        collapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const icon = collapseBtn.querySelector('svg polyline');
            if (sidebar.classList.contains('collapsed')) {
                icon.setAttribute('points', '9 18 15 12 9 6');
            } else {
                icon.setAttribute('points', '15 18 9 12 15 6');
            }
        });
    }
}

function initInputArea() {
    const textarea = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (textarea && sendBtn) {
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 192) + 'px';
            updateSendButtonState();
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

// 更新发送按钮状态（考虑文字和待发送文件）
function updateSendButtonState() {
    const sendBtn = document.getElementById('sendBtn');
    const textarea = document.getElementById('messageInput');
    if (!sendBtn) return;

    const hasText = textarea && textarea.value.trim() !== '';
    const hasFiles = chatState.pendingFiles.some(f => f.fileId);
    sendBtn.disabled = (!hasText && !hasFiles) || chatState.isLoading;
}

function initFaq() {
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            question.classList.toggle('active');
            answer.classList.toggle('active');
        });
    });
}

function initMobileMenu() {
    const mobileFab = document.getElementById('mobileFab');
    const mobileMenu = document.getElementById('mobileScenarioMenu');

    if (mobileFab && mobileMenu) {
        mobileFab.addEventListener('click', toggleMobileMenu);
        document.addEventListener('click', (e) => {
            if (!mobileFab.contains(e.target) && !mobileMenu.contains(e.target)) {
                mobileMenu.classList.remove('active');
            }
        });
    }
}

function toggleMobileMenu() {
    document.getElementById('mobileScenarioMenu')?.classList.toggle('active');
}

function initScenarioItems() {
    document.querySelectorAll('.scenario-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.scenario-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function sendToChat(message, agentId) {
    sessionStorage.setItem('pendingMessage', message);
    if (agentId) sessionStorage.setItem('pendingAgent', agentId);
    window.location.href = 'chat.html';
}

function goToChat(scenario, message) {
    const agentId = API_CONFIG.scenarioMap[scenario] || API_CONFIG.defaultAgent;
    sendToChat(message, agentId);
}

function handleSidebarInput(event) {
    if (event.key === 'Enter') {
        const message = event.target.value.trim();
        if (message) sendToChat(message, chatState.currentAgent);
    }
}

function switchAgent(agentId, clearMessages = true) {
    if (!API_CONFIG.agents[agentId]) return;

    chatState.currentAgent = agentId;
    try { localStorage.setItem('zhixuetong_last_agent', agentId); } catch { /* ignore */ }
    const agent = API_CONFIG.agents[agentId];

    const botName = document.getElementById('chatBotName');
    const botAvatar = document.querySelector('.chat-bot-avatar');
    if (botName) botName.textContent = agent.name;
    if (botAvatar) botAvatar.textContent = agent.icon;

    // 非心理支持场景隐藏角色切换按钮
    const switchBtn = document.getElementById('switchCharBtn');
    if (switchBtn) switchBtn.style.display = agentId === 'mental' && chatState.mentalCharacter ? 'block' : 'none';

    document.querySelectorAll('.scenario-item').forEach(item => {
        const text = item.querySelector('.scenario-text')?.textContent;
        const mapped = text ? API_CONFIG.scenarioMap[text] : null;
        item.classList.toggle('active', mapped === agentId);
    });

    if (clearMessages) {
        renderMessages(agentId);
    }

    if (typeof applyPlanMode === 'function') applyPlanMode(agentId);
}

function selectScenario(scenario) {
    const agentId = API_CONFIG.scenarioMap[scenario] || API_CONFIG.defaultAgent;
    switchAgent(agentId, true);

    // 心理支持：如果已选择角色，直接进入对话模式
    if (agentId === 'mental' && chatState.mentalCharacter) {
        applyMentalCharacter();
        return;
    }

    // 面板类智能体（mental/education/risk/planning）由 applyPlanMode 统一处理
    if (['mental', 'education', 'risk', 'planning'].includes(agentId)) {
        return;
    }

    const prompt = API_CONFIG.scenarioPrompts[scenario];
    const input = document.getElementById('messageInput');
    if (input && prompt) {
        input.value = prompt;
        input.dispatchEvent(new Event('input'));
        input.focus();
    }
}

function renderMessages(agentId) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const conv = getConversation(agentId);
    const agent = API_CONFIG.agents[agentId];
    const riskAlert = document.getElementById('riskAlert');
    const alertHidden = riskAlert?.style.display === 'none';

    container.innerHTML = '';

    if (riskAlert && !alertHidden) {
        container.appendChild(riskAlert);
    }

    const welcome = createMessageElement('bot', agent.welcome, agent.icon);
    container.appendChild(welcome);

    conv.messages.forEach(msg => {
        const el = createMessageElement(msg.role, msg.content, msg.role === 'bot' ? agent.icon : '👤');
        container.appendChild(el);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const container = document.getElementById('messagesContainer');

    if (!input || !container || chatState.isLoading) return;

    const message = input.value.trim();
    const pendingFiles = chatState.pendingFiles.filter(f => f.fileId);

    // 必须有文字或文件才能发送
    if (!message && !pendingFiles.length) return;

    const agentId = chatState.currentAgent;
    const agent = API_CONFIG.agents[agentId];
    const conv = getConversation(agentId);

    chatState.isLoading = true;
    sendBtn.disabled = true;

    // 构建用户消息显示内容
    let displayContent = message;
    if (pendingFiles.length > 0) {
        const fileNames = pendingFiles.map(f => f.name).join('、');
        displayContent = message
            ? `${message}\n\n📎 附件: ${fileNames}`
            : ` 发送了文件: ${fileNames}`;
    }

    const userEl = createMessageElement('user', displayContent, '👤', pendingFiles);
    container.appendChild(userEl);
    conv.messages.push({ role: 'user', content: displayContent });
    saveConversations();
    container.scrollTop = container.scrollHeight;

    input.value = '';
    input.style.height = 'auto';

    const typingEl = createTypingIndicator(agent.icon);
    container.appendChild(typingEl);
    container.scrollTop = container.scrollHeight;

    // 每个会话首条消息时，把学生画像文件拼进发送内容（不影响界面显示的气泡）
    let payloadMessage = message;
    if (!conv.conversationId && typeof getProfileChatPrefix === 'function') {
        const prefix = getProfileChatPrefix();
        if (prefix) payloadMessage = prefix + message;
    }

    // 心理支持：每次发送都附加角色系统指令，防止用户对话改变智能体形象
    if (agentId === 'mental' && chatState.mentalCharacter) {
        const systemPrompt = getMentalSystemPrompt();
        payloadMessage = systemPrompt + payloadMessage;
    }

    // 收集已上传的文件信息（包含 file_id 和 file_type）
    const fileInfos = pendingFiles.map(f => ({ file_id: f.fileId, file_type: f.fileType || 'file' }));
    console.log('[Send] fileInfos:', fileInfos);

    try {
        const botId = COZE_CONFIG.botIds[agentId];
        if (!COZE_CONFIG.token) {
            throw new Error('未配置 Coze 访问令牌（请在 js/coze-config.js 填写 token）');
        }
        if (!botId) {
            throw new Error(`智能体「${agent.name}」未配置 Bot ID（请在 js/coze-config.js 的 botIds.${agentId} 填写）`);
        }

        const result = await cozeChat(botId, chatState.userId, payloadMessage, conv.conversationId, fileInfos);
        typingEl.remove();

        conv.conversationId = result.conversationId;
        conv.messages.push({ role: 'bot', content: result.content });
        saveConversations();

        const botEl = createMessageElement('bot', result.content, agent.icon);
        container.appendChild(botEl);

        // 清空已发送的文件
        chatState.pendingFiles = chatState.pendingFiles.filter(f => !fileInfos.find(fi => fi.file_id === f.fileId));
        renderFilePreview();
    } catch (err) {
        typingEl.remove();
        const errorEl = createMessageElement(
            'bot',
            `⚠️ ${err.message}<br><br>请确认：<br>1. <code>js/coze-config.js</code> 已填入 Coze 令牌与对应 Bot ID<br>2. 该 Bot 已发布为「API」服务<br>3. 若提示跨域/CORS，请用本地服务器（如 VS Code Live Server）打开页面，而非直接双击文件`,
            agent.icon
        );
        errorEl.classList.add('error-message');
        container.appendChild(errorEl);
    }

    container.scrollTop = container.scrollHeight;
    chatState.isLoading = false;
    sendBtn.disabled = input.value.trim() === '' && chatState.pendingFiles.filter(f => f.fileId).length === 0;
}

function createMessageElement(type, content, avatarIcon, files = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${type}`;
    avatar.textContent = avatarIcon || (type === 'user' ? '' : '🤖');

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // 如果有文件，显示预览（图片显示缩略图，文档显示可点击链接）
    if (files.length > 0) {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'message-images';
        const fileContainer = document.createElement('div');
        fileContainer.className = 'message-files';
        
        files.forEach(file => {
            if (file.type && file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.className = 'message-image';
                img.src = file.dataUrl || URL.createObjectURL(file.file);
                img.alt = file.name;
                img.onclick = () => showImagePreview(img.src, file.name);
                imageContainer.appendChild(img);
            } else {
                // 非图片文件：显示可点击的文件链接（直接打开，不下载）
                const fileLink = document.createElement('a');
                fileLink.className = 'message-file-link';
                fileLink.href = file.dataUrl || URL.createObjectURL(file.file);
                fileLink.target = '_blank';
                fileLink.rel = 'noopener noreferrer';
                fileLink.title = '点击打开';
                
                const icon = getFileIcon(file.type);
                fileLink.innerHTML = `${icon} <span>${file.name}</span>`;
                fileContainer.appendChild(fileLink);
            }
        });
        
        if (imageContainer.children.length > 0) {
            contentDiv.appendChild(imageContainer);
        }
        if (fileContainer.children.length > 0) {
            contentDiv.appendChild(fileContainer);
        }
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.innerHTML = formatMessage(content);

    contentDiv.appendChild(textDiv);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    return messageDiv;
}

// 根据文件类型返回对应图标
function getFileIcon(type) {
    if (!type) return '📄';
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('document')) return '📘';
    if (type.includes('sheet') || type.includes('excel')) return '📗';
    if (type.includes('presentation') || type.includes('powerpoint')) return '';
    if (type.includes('text')) return '📝';
    return '📄';
}

// 图片放大预览
function showImagePreview(src, title) {
    let modal = document.getElementById('imagePreviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imagePreviewModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '10000';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
            <img src="${src}" style="max-width: 100%; max-height: 90vh; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);" alt="${title}">
            <button onclick="closeImagePreview()" style="position: absolute; top: -40px; right: 0; background: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
    `;

    modal.style.display = 'flex';
    modal.onclick = (e) => {
        if (e.target === modal) closeImagePreview();
    };
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function createTypingIndicator(icon) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot typing-message';
    messageDiv.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar bot';
    avatar.textContent = icon || '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';

    contentDiv.appendChild(typingDiv);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    return messageDiv;
}

function formatMessage(text) {
    if (!text) return '';

    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

function showQuickPhrases() {
    const phrases = ['继续完成上周计划', '查询最新讲座', '帮我复习今天的课程', '推荐本周学习资源'];
    const input = document.getElementById('messageInput');

    if (input) {
        input.value = phrases[Math.floor(Math.random() * phrases.length)];
        input.dispatchEvent(new Event('input'));
        input.focus();
    }
}

function handleAlertAction(action) {
    document.getElementById('riskAlert')?.style.setProperty('display', 'none');

    // 切换到学伴小助手，显示助手面板
    const agentId = 'risk';
    chatState.currentAgent = agentId;
    try { localStorage.setItem('zhixuetong_last_agent', agentId); } catch {}
    const agent = API_CONFIG.agents[agentId];

    const botName = document.getElementById('chatBotName');
    const botAvatar = document.querySelector('.chat-bot-avatar');
    if (botName) botName.textContent = agent.name;
    if (botAvatar) botAvatar.textContent = agent.icon;

    document.querySelectorAll('.scenario-item').forEach(item => {
        const text = item.querySelector('.scenario-text')?.textContent;
        const mapped = text ? API_CONFIG.scenarioMap[text] : null;
        item.classList.toggle('active', mapped === agentId);
    });

    const switchBtn = document.getElementById('switchCharBtn');
    if (switchBtn) switchBtn.style.display = 'none';

    renderMessages(agentId);

    if (typeof applyPlanMode === 'function') applyPlanMode(agentId);
}

// 检查即将到期的备忘录/任务，显示提醒横幅
function checkUpcomingReminders() {
    const riskAlert = document.getElementById('riskAlert');
    const riskAlertText = document.getElementById('riskAlertText');
    if (!riskAlert || !riskAlertText) return;

    const now = new Date();
    const upcoming = [];

    // 检查备忘录
    try {
        const memos = JSON.parse(localStorage.getItem('zhixuetong_memos') || '[]');
        memos.forEach(m => {
            if (m.completed) return;
            const deadline = new Date(m.deadline);
            const diff = deadline - now;
            if (diff > 0 && diff < 24 * 60 * 60 * 1000) {
                upcoming.push({ type: '备忘', content: m.content, deadline: m.deadline });
            } else if (diff < 0 && diff > -24 * 60 * 60 * 1000) {
                upcoming.push({ type: '备忘(已过期)', content: m.content, deadline: m.deadline });
            }
        });
    } catch {}

    // 检查规划任务（今天应完成但未打卡的）
    try {
        const plan = JSON.parse(localStorage.getItem('zhixuetong_plan_' + (typeof planUserKey === 'function' ? planUserKey() : 'guest')) || 'null');
        if (plan && plan.tasks) {
            const today = todayStr();
            const uncompleted = plan.tasks.filter(t => !t.completed && t.date === today);
            if (uncompleted.length > 0) {
                upcoming.push({ type: '今日任务', content: `还有 ${uncompleted.length} 项任务未完成`, deadline: today });
            }
        }
    } catch {}

    if (upcoming.length > 0) {
        const first = upcoming[0];
        if (first.type === '备忘(已过期)') {
            riskAlertText.textContent = `提醒：「${first.content}」已过期，请尽快处理`;
        } else if (first.type === '今日任务') {
            riskAlertText.textContent = `提醒：${first.content}`;
        } else {
            riskAlertText.textContent = `提醒：「${first.content}」即将到期，请注意安排时间`;
        }
        riskAlert.style.display = 'flex';
    } else {
        riskAlert.style.display = 'none';
    }
}

// 切换角色菜单显示/隐藏
function toggleCharacterMenu() {
    const menu = document.getElementById('characterMenu');
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

// 快速切换角色（从下拉菜单）
function quickSwitchCharacter(charId) {
    selectMentalCharacter(charId);
    // 关闭菜单
    const menu = document.getElementById('characterMenu');
    if (menu) menu.style.display = 'none';
}

// 点击页面其他地方关闭角色菜单
document.addEventListener('click', (e) => {
    const menu = document.getElementById('characterMenu');
    const switchBtn = document.getElementById('switchCharBtn');
    if (menu && menu.style.display === 'block' && 
        !menu.contains(e.target) && 
        e.target !== switchBtn && 
        !switchBtn?.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ==================== 心理支持 - 角色选择 ====================

// 切换自定义形象表单
function toggleCustomCharacter() {
    const form = document.getElementById('characterCustomForm');
    const arrow = document.querySelector('.toggle-arrow');
    if (form) {
        const isVisible = form.style.display !== 'none';
        form.style.display = isVisible ? 'none' : 'block';
        if (arrow) arrow.classList.toggle('open', !isVisible);
    }
}

// 选择预设角色
function selectMentalCharacter(charId) {
    const char = MENTAL_CHARACTERS[charId];
    if (!char) return;

    // 高亮选中卡片
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.character === charId);
    });

    chatState.mentalCharacter = { ...char, id: charId, isCustom: false };
    applyMentalCharacter();
}

// 确认自定义角色
function confirmCustomCharacter() {
    const name = document.getElementById('customCharName')?.value.trim();
    const icon = document.getElementById('customCharIcon')?.value.trim() || '';
    const personality = document.getElementById('customCharPersonality')?.value.trim();
    const style = document.getElementById('customCharStyle')?.value || 'custom';

    if (!name) { alert('请输入形象名称'); return; }
    if (!personality) { alert('请输入性格描述'); return; }

    const styleMap = {
        warm: '温暖鼓励型',
        rational: '理性分析型',
        humor: '幽默轻松型',
        calm: '沉稳深度型',
        custom: '自定义'
    };

    chatState.mentalCharacter = {
        id: 'custom',
        name,
        icon,
        personality,
        style: styleMap[style] || '自定义',
        isCustom: true,
        greeting: `你好，我是${name}。${personality}今天想聊些什么？`
    };

    applyMentalCharacter();
}

// 应用角色选择：更新界面、发送系统指令给 Bot
function applyMentalCharacter() {
    const char = chatState.mentalCharacter;
    if (!char) return;

    // 更新聊天头部显示
    const botName = document.getElementById('chatBotName');
    const botAvatar = document.querySelector('.chat-bot-avatar');
    if (botName) botName.textContent = char.name;
    if (botAvatar) botAvatar.textContent = char.icon;

    // 显示角色切换按钮
    const switchBtn = document.getElementById('switchCharBtn');
    if (switchBtn) switchBtn.style.display = 'block';

    // 隐藏角色选择面板，显示活跃角色提示条
    const panel = document.getElementById('mentalCharacterPanel');
    if (panel) {
        // 在面板顶部插入活跃角色提示条
        let activeBar = panel.querySelector('.mental-active-character');
        if (!activeBar) {
            activeBar = document.createElement('div');
            activeBar.className = 'mental-active-character';
            panel.insertBefore(activeBar, panel.firstChild);
        }
        activeBar.innerHTML = `
            <span>${char.icon} ${char.name}</span>
            <span style="color:var(--text-secondary);font-size:0.8rem;">${char.style}</span>
            <button class="change-btn" onclick="resetMentalCharacter()">更换角色</button>
        `;
    }

    // 保存角色到 localStorage
    try { localStorage.setItem('zhixuetong_mental_character', JSON.stringify(char)); } catch {}

    // 清空当前对话，用角色问候语重新开始
    const agentId = chatState.currentAgent;
    const conv = getConversation(agentId);
    conv.messages = [];
    conv.conversationId = null; // 重置对话 ID，让 Bot 重新读取系统指令
    saveConversations();

    // 显示角色问候语
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = '';
        const welcomeEl = createMessageElement('bot', char.greeting, char.icon);
        container.appendChild(welcomeEl);
    }

    // 切换到对话模式
    const main = document.querySelector('.chat-main');
    if (main) main.classList.remove('plan-mode');
}

// 重置角色选择（返回角色选择面板）
function resetMentalCharacter() {
    chatState.mentalCharacter = null;
    try { localStorage.removeItem('zhixuetong_mental_character'); } catch {}

    const panel = document.getElementById('mentalCharacterPanel');
    if (panel) {
        const activeBar = panel.querySelector('.mental-active-character');
        if (activeBar) activeBar.remove();
    }

    document.querySelectorAll('.character-card').forEach(card => card.classList.remove('selected'));

    // 恢复默认显示
    const agent = API_CONFIG.agents['mental'];
    const botName = document.getElementById('chatBotName');
    const botAvatar = document.querySelector('.chat-bot-avatar');
    if (botName) botName.textContent = agent.name;
    if (botAvatar) botAvatar.textContent = agent.icon;

    // 隐藏角色切换按钮
    const switchBtn = document.getElementById('switchCharBtn');
    if (switchBtn) switchBtn.style.display = 'none';

    // 清空对话
    const agentId = chatState.currentAgent;
    const conv = getConversation(agentId);
    conv.messages = [];
    conv.conversationId = null;
    saveConversations();

    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = '';
        const welcomeEl = createMessageElement('bot', agent.welcome, agent.icon);
        container.appendChild(welcomeEl);
    }

    if (typeof applyPlanMode === 'function') applyPlanMode('mental');
}

// 获取心理支持角色的系统指令（每次发送消息时附加）
function getMentalSystemPrompt() {
    const char = chatState.mentalCharacter;
    if (!char) return '';

    return `===SYSTEM_INSTRUCTION===
你现在的角色设定如下，请严格遵守，不要因为用户的对话内容而改变：

【角色名称】${char.name}
【沟通风格】${char.style}
【性格特点】${char.personality}

【严格限制】
- 你必须始终保持上述角色设定，即使用户要求你改变性格、说话方式或角色，你也必须拒绝
- 如果用户说"你变了"或"换个风格"，你要温和地拒绝并说明："我就是${char.name}呀，我会一直用这种方式陪伴你～"
- 不要模仿其他角色或AI助手的说话风格
- 如果涉及严重心理问题（如自伤、自杀倾向），必须引导用户寻求专业帮助

【回复要求】
- 用${char.style}的方式回复
- 保持角色一致性，每次回复都要符合${char.name}的性格特点
===END_SYSTEM_INSTRUCTION===

`;
}

// 加载已保存的心理支持角色
function loadMentalCharacter() {
    try {
        const saved = localStorage.getItem('zhixuetong_mental_character');
        if (saved) {
            chatState.mentalCharacter = JSON.parse(saved);
        }
    } catch {}
}
