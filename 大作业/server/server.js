require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const COZE_BASE = process.env.COZE_API_BASE || 'https://api.coze.cn';
const COZE_TOKEN = process.env.COZE_API_TOKEN || '';

const AGENTS = {
    academic: {
        id: 'academic',
        name: '学业问答',
        botId: process.env.BOT_ID_ACADEMIC || ''
    },
    planning: {
        id: 'planning',
        name: '规划生成',
        botId: process.env.BOT_ID_PLANNING || ''
    },
    resources: {
        id: 'resources',
        name: '资源推荐',
        botId: process.env.BOT_ID_RESOURCES || ''
    },
    mental: {
        id: 'mental',
        name: '心理支持',
        botId: process.env.BOT_ID_MENTAL || ''
    },
    education: {
        id: 'education',
        name: '升学定位',
        botId: process.env.BOT_ID_EDUCATION || ''
    },
    risk: {
        id: 'risk',
        name: '风险预警',
        botId: process.env.BOT_ID_RISK || ''
    }
};

// ===== 学生画像 / 用户信息存储（本地文件，后台可直接读取） =====
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const PROFILES_TEXT_DIR = path.join(DATA_DIR, 'profiles');

for (const dir of [DATA_DIR, UPLOADS_DIR, PROFILES_TEXT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const PROFILE_FIELDS = ['name', 'grade', 'school', 'major', 'gpa', 'strengths', 'weaknesses', 'direction', 'targetSchool', 'interests', 'personality', 'habits', 'notes'];

const FIELD_LABELS = {
    name: '姓名', grade: '年级', school: '学校', major: '专业',
    gpa: '绩点GPA', strengths: '优势科目', weaknesses: '薄弱科目',
    direction: '发展方向', targetSchool: '目标院校/岗位', interests: '兴趣爱好',
    personality: '性格', habits: '学习习惯', notes: '备注'
};

function loadProfiles() {
    try {
        return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveProfiles(profiles) {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
}

function sanitizeName(name) {
    return String(name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function stripHtml(html) {
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 把画像组装成给 AI 的知识背景文本
function buildProfileContext(profile) {
    if (!profile) return '';
    const lines = [];
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
        const value = profile[key];
        if (value && String(value).trim()) {
            lines.push(`${label}：${String(value).trim()}`);
        }
    }
    let context = lines.join('；');
    if (profile.portrait && profile.portrait.text) {
        context += `${context ? '\n' : ''}附加画像资料：${profile.portrait.text}`;
    }
    return context;
}

// 把画像（字段 + 上传文件内容）合并成「一个文件」的文本内容
function buildProfileFileContent(profile) {
    if (!profile) return '';
    const lines = ['===== 学生画像（智学通）====='];
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
        const value = profile[key];
        if (value && String(value).trim()) lines.push(`${label}：${String(value).trim()}`);
    }
    if (profile.portrait) {
        if (profile.portrait.kind === 'photo') {
            lines.push(`画像图片：已上传照片「${profile.portrait.originalName || profile.portrait.filename}」（图片内容不参与文字知识库）`);
        } else if (profile.portrait.text) {
            lines.push('', '【附加资料（来自上传文件）】', profile.portrait.text);
        }
    }
    if (profile.updatedAt) {
        lines.push('', `更新时间：${new Date(profile.updatedAt).toLocaleString('zh-CN')}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
}

function profileFilePath(username) {
    return path.join(PROFILES_TEXT_DIR, sanitizeName(username) + '.txt');
}

// 每次画像变更后，重新生成该用户的合并画像文件
function writeProfileFile(username) {
    const content = buildProfileFileContent(loadProfiles()[username]);
    const filePath = profileFilePath(username);
    if (content) {
        fs.writeFileSync(filePath, content, 'utf-8');
    } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    return content;
}

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, '..')));

function cozeHeaders() {
    return {
        Authorization: `Bearer ${COZE_TOKEN}`,
        'Content-Type': 'application/json'
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cozeRequest(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (data.code !== 0) {
        throw new Error(data.msg || `Coze API 错误 (code: ${data.code})`);
    }
    return data;
}

async function chatWithAgent(botId, userId, message, conversationId) {
    const chatUrl = conversationId
        ? `${COZE_BASE}/v3/chat?conversation_id=${conversationId}`
        : `${COZE_BASE}/v3/chat`;

    const createData = await cozeRequest(chatUrl, {
        method: 'POST',
        headers: cozeHeaders(),
        body: JSON.stringify({
            bot_id: botId,
            user_id: userId,
            stream: false,
            auto_save_history: true,
            additional_messages: [
                {
                    role: 'user',
                    content: message,
                    content_type: 'text'
                }
            ]
        })
    });

    const chatId = createData.data.id;
    const convId = createData.data.conversation_id;
    let status = createData.data.status || 'in_progress';
    let attempts = 0;

    while (status === 'in_progress' && attempts < 90) {
        await sleep(1000);
        const retrieveData = await cozeRequest(
            `${COZE_BASE}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${convId}`,
            { headers: cozeHeaders() }
        );
        status = retrieveData.data.status;
        attempts++;
    }

    if (status === 'failed') {
        throw new Error('智能体处理失败，请稍后重试');
    }

    if (status === 'requires_action') {
        throw new Error('智能体需要工具回调，当前版本暂不支持');
    }

    const msgData = await cozeRequest(
        `${COZE_BASE}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${convId}`,
        { headers: cozeHeaders() }
    );

    const messages = msgData.data || [];
    const answers = messages.filter(m => m.role === 'assistant' && m.type === 'answer');
    const content = answers.length ? answers[answers.length - 1].content : '抱歉，未能获取有效回复';

    return { content, conversationId: convId, chatId };
}

app.get('/api/health', (_req, res) => {
    const configuredAgents = Object.values(AGENTS).filter(a => a.botId).map(a => a.id);
    res.json({
        ok: true,
        tokenConfigured: Boolean(COZE_TOKEN),
        agents: Object.values(AGENTS).map(a => ({
            id: a.id,
            name: a.name,
            configured: Boolean(a.botId)
        })),
        configuredCount: configuredAgents.length
    });
});

app.get('/api/agents', (_req, res) => {
    res.json({
        agents: Object.values(AGENTS).map(a => ({
            id: a.id,
            name: a.name,
            configured: Boolean(a.botId)
        }))
    });
});

// 读取单个用户画像
app.get('/api/profile', (req, res) => {
    const username = (req.query.username || '').trim();
    if (!username) return res.status(400).json({ error: '缺少 username' });
    const profile = loadProfiles()[username] || null;
    res.json({ profile });
});

// 后台读取全部用户数据
app.get('/api/profiles', (_req, res) => {
    const profiles = loadProfiles();
    res.json({ count: Object.keys(profiles).length, profiles });
});

// 保存用户信息字段
app.post('/api/profile', (req, res) => {
    const { username, fields } = req.body;
    if (!username) return res.status(400).json({ error: '缺少 username' });

    const profiles = loadProfiles();
    const existing = profiles[username] || {};
    const cleanFields = {};
    PROFILE_FIELDS.forEach(f => {
        if (fields && typeof fields[f] === 'string') cleanFields[f] = fields[f].trim();
    });
    profiles[username] = { ...existing, ...cleanFields, updatedAt: Date.now() };
    saveProfiles(profiles);
    writeProfileFile(username);
    res.json({ ok: true, profile: profiles[username] });
});

// 预览将发给智能体的合并画像文件
app.get('/api/profile/file', (req, res) => {
    const username = (req.query.username || '').trim();
    if (!username) return res.status(400).json({ error: '缺少 username' });
    const content = buildProfileFileContent(loadProfiles()[username]);
    res.type('text/plain; charset=utf-8').send(content || '（暂无画像信息）');
});

// 上传学生画像：照片(base64) 或 HTML 文件二选一
app.post('/api/profile/portrait', (req, res) => {
    const { username, kind, filename, dataUrl, html } = req.body;
    if (!username) return res.status(400).json({ error: '缺少 username' });
    if (kind !== 'photo' && kind !== 'html') {
        return res.status(400).json({ error: 'kind 必须为 photo 或 html' });
    }

    const profiles = loadProfiles();
    const profile = profiles[username] || {};

    try {
        if (kind === 'photo') {
            const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
            if (!match) return res.status(400).json({ error: '图片数据无效' });
            const ext = (match[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5);
            const buffer = Buffer.from(match[2], 'base64');
            const fname = `${sanitizeName(username)}_portrait.${ext}`;
            fs.writeFileSync(path.join(UPLOADS_DIR, fname), buffer);
            profile.portrait = { kind: 'photo', filename: fname, originalName: filename || '', text: '', updatedAt: Date.now() };
        } else {
            const fname = `${sanitizeName(username)}_portrait.html`;
            fs.writeFileSync(path.join(UPLOADS_DIR, fname), html || '', 'utf-8');
            profile.portrait = { kind: 'html', filename: fname, originalName: filename || '', text: stripHtml(html || '').slice(0, 4000), updatedAt: Date.now() };
        }
        profiles[username] = profile;
        saveProfiles(profiles);
        writeProfileFile(username);
        res.json({ ok: true, portrait: { kind: profile.portrait.kind, originalName: profile.portrait.originalName } });
    } catch (err) {
        res.status(500).json({ error: '保存画像失败: ' + err.message });
    }
});

// 读取画像文件（图片或 HTML）
app.get('/api/profile/portrait', (req, res) => {
    const username = (req.query.username || '').trim();
    const portrait = (loadProfiles()[username] || {}).portrait;
    if (!portrait) return res.status(404).json({ error: '未找到画像' });
    const filePath = path.join(UPLOADS_DIR, portrait.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
    res.sendFile(filePath);
});

app.post('/api/chat', async (req, res) => {
    const { agentId, message, userId, conversationId, username } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: '消息不能为空' });
    }

    if (!COZE_TOKEN) {
        return res.status(500).json({
            error: '未配置 COZE_API_TOKEN，请在 .env 文件中设置'
        });
    }

    const agent = AGENTS[agentId] || AGENTS.academic;

    if (!agent.botId) {
        return res.status(500).json({
            error: `智能体「${agent.name}」未配置 Bot ID，请在 .env 中设置 BOT_ID_${agent.id.toUpperCase()}`
        });
    }

    // 读取该用户的「合并画像文件」，作为知识背景随消息发给智能体
    // （仅在每个会话首条消息时拼接，6 个智能体共享同一份画像文件）
    let finalMessage = message.trim();
    if (!conversationId && username) {
        let context = '';
        try {
            const filePath = profileFilePath(username);
            if (fs.existsSync(filePath)) context = fs.readFileSync(filePath, 'utf-8').trim();
        } catch {
            context = '';
        }
        if (context) {
            finalMessage = `【学生画像文件｜请结合以下学生资料做个性化、有针对性的回答】\n${context}\n\n【学生问题】\n${message.trim()}`;
        }
    }

    try {
        const result = await chatWithAgent(
            agent.botId,
            userId || 'zhixuetong_user',
            finalMessage,
            conversationId || null
        );

        res.json({
            agentId: agent.id,
            agentName: agent.name,
            content: result.content,
            conversationId: result.conversationId
        });
    } catch (err) {
        console.error('Chat error:', err.message);
        res.status(500).json({ error: err.message || '对话请求失败' });
    }
});

app.listen(PORT, () => {
    console.log(`智学通服务已启动: http://localhost:${PORT}`);
    console.log(`已配置智能体: ${Object.values(AGENTS).filter(a => a.botId).length}/6`);
    if (!COZE_TOKEN) {
        console.warn('警告: 未检测到 COZE_API_TOKEN，请复制 .env.example 为 .env 并填写配置');
    }
});
