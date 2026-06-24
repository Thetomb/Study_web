// 规划生成模块：把 AI 生成的计划解析成可勾选的任务清单 + 每日打卡表，数据保存在 localStorage。
// 与 script.js（chatState）、auth.js（getCurrentUser）、api-config.js（API_CONFIG）配合使用。
// AI 仅负责生成计划，打卡完全由网页端实现。

let planPanelWired = false;

// 任务清单当前展示的日期
let currentTaskDate = todayStr();

function planUserKey() {
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    return user && user.username ? user.username : 'guest';
}

function planStorageKey() {
    return 'zhixuetong_plan_' + planUserKey();
}

function planDraftKey() {
    return 'zhixuetong_plan_draft_' + planUserKey();
}

function loadPlan() {
    try {
        return JSON.parse(localStorage.getItem(planStorageKey()));
    } catch {
        return null;
    }
}

function savePlan(plan) {
    if (plan) {
        localStorage.setItem(planStorageKey(), JSON.stringify(plan));
    } else {
        localStorage.removeItem(planStorageKey());
    }
}

// 大纲草稿：用户确认前的中间状态，单独保存，刷新不丢
function loadDraft() {
    try {
        return JSON.parse(localStorage.getItem(planDraftKey()));
    } catch {
        return null;
    }
}

function saveDraft(draft) {
    if (draft) {
        localStorage.setItem(planDraftKey(), JSON.stringify(draft));
    } else {
        localStorage.removeItem(planDraftKey());
    }
}

function makeId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ymd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayStr() {
    return ymd(new Date());
}

// 格式化当前日期为中文显示
function formatCurrentDate() {
    const now = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekday = weekdays[now.getDay()];
    return `${year}年${month}月${day}日 ${weekday}`;
}

// 更新当前日期显示
function updateCurrentDate() {
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        dateEl.textContent = formatCurrentDate();
    }
}

// 把 AI 返回的计划文本解析为任务列表
function parseTasksFromText(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const tasks = [];
    const seen = new Set();
    const bulletRe = /^\s*(?:[-*•·]|\d+[.、)\]]|（\d+）|第\s*\d+\s*[天周阶段]|Day\s*\d+|Week\s*\d+)\s*[:：.、)]?\s*/i;

    lines.forEach(raw => {
        let line = raw.trim().replace(/^#{1,6}\s*/, '');
        if (!line) return;
        if (bulletRe.test(line)) {
            let content = line.replace(bulletRe, '').trim();
            content = content.replace(/\*\*(.+?)\*\*/g, '$1').replace(/[*_`]/g, '').trim();
            if (content.length >= 2 && !seen.has(content)) {
                seen.add(content);
                tasks.push(content);
            }
        }
    });

    // 没解析到条目时的兜底：取长度适中的非空行
    if (!tasks.length) {
        lines.forEach(raw => {
            const line = raw.trim().replace(/[*_`#]/g, '').trim();
            if (line.length >= 4 && line.length <= 60 && !seen.has(line)) {
                seen.add(line);
                tasks.push(line);
            }
        });
    }

    return tasks.slice(0, 40);
}

// 任务分类定义
const TASK_CATEGORIES = [
    { key: 'daily', label: '每日任务', icon: '📅' },
    { key: 'weekly', label: '每周任务', icon: '🗓️' },
    { key: 'monthly', label: '每月任务', icon: '📆' },
    { key: 'stage', label: '阶段任务', icon: '🎯' },
    { key: 'other', label: '其他任务', icon: '📌' }
];

function categoryMeta(key) {
    return TASK_CATEGORIES.find(c => c.key === key) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
}

// 从一段文字里识别任务分类关键字
function detectCategory(str) {
    if (/(每日|日常|每天|daily)/i.test(str)) return 'daily';
    if (/(每周|每星期|周任务|weekly)/i.test(str)) return 'weekly';
    if (/(每月|月任务|monthly)/i.test(str)) return 'monthly';
    if (/(阶段|phase|stage|长期)/i.test(str)) return 'stage';
    return null;
}

// 解析带分类的任务列表：识别【每日任务】等分组标题，把其下条目归类
function parseCategorizedTasks(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const tasks = [];
    const seen = new Set();
    let current = 'other';
    // 支持 - 开头 和 每日：/每周3次： 等无前缀格式
    const bulletRe = /^\s*(?:[-*•·]|\d+[.、)\]]|（\d+）)\s*(?:任务\d+[：:])?\s*(.+)/;
    const inlineRe = /^\s*(?:[-*]\s*)?(?:任务\d+[：:])?\s*(.+)/;
    const skipRe = /^\s*(?:注意事项|注意|说明|提示|如果|需要|格式)/i;

    lines.forEach(raw => {
        const line = raw.trim();
        if (!line) return;

        // 检查是否是分类标题行
        const catTitleMatch = line.match(/^[【\[]?\s*(每日|日常|每天|每周|每星期|每月|月任务|阶段|长期)\s*(任务)?\s*[】\]]?\s*[：:]?\s*$/i);
        if (catTitleMatch) {
            current = detectCategory(catTitleMatch[1]);
            return;
        }

        // 尝试匹配条目
        let m = line.match(bulletRe);
        let isBullet = !!m;

        if (!isBullet) {
            // 尝试无前缀格式（如"每日：背单词"）
            m = line.match(inlineRe);
            if (m) {
                const content = m[1].trim();
                // 检查内容是否以分类关键字开头
                const inline = detectCategory(content.slice(0, 8));
                if (inline) {
                    current = inline;
                    const cleaned = content.replace(/^[（(]?\s*(每日|日常|每天|daily|每周|每星期|周任务|weekly|每月|月任务|monthly|阶段|长期|phase|stage)\s*(任务)?\s*[）)]?\s*[:：、.\-]?\s*/i, '').trim();
                    if (cleaned.length >= 2 && !seen.has(cleaned) && !skipRe.test(cleaned)) {
                        seen.add(cleaned);
                        tasks.push({ text: cleaned, category: current });
                    }
                    return;
                }
            }
        }

        if (!m) return;
        if (skipRe.test(line)) return;

        let content = m[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/[*_`]/g, '').trim();

        // 条目自身带分类前缀（如「每日：背单词」）时优先采用，并去掉前缀
        let cat = current;
        const inline = detectCategory(content.slice(0, 8));
        if (inline) {
            cat = inline;
            content = content.replace(/^[（(]?\s*(每日|日常|每天|daily|每周|每星期|周任务|weekly|每月|月任务|monthly|阶段|长期|phase|stage)\s*(任务)?\s*[）)]?\s*[:：、.\-]?\s*/i, '').trim();
        }

        if (/^(暂无|无|none|n\/a|待补充)$/i.test(content)) return;

        if (content.length >= 2 && !seen.has(content)) {
            seen.add(content);
            tasks.push({ text: content, category: cat });
        }
    });

    return tasks.slice(0, 60);
}

// 第一步：只生成"计划大纲"（整体框架，不展开成每日任务）
function buildOutlinePrompt(goal) {
    return `我的目标是：${goal}

请先为这个目标制定一份「计划大纲」，只给出整体框架与阶段划分，暂时不要展开成具体的每日任务。请严格按以下格式返回：

计划标题：[简洁名称，不超过20字]
总周期：[如"3个月"、"一学期"]
建议投入：[如"每周5天，每天3小时"]

阶段划分：
- 阶段一：[阶段名称] —— [该阶段的目标与主要内容，一句话概括]
- 阶段二：[阶段名称] —— [...]
- 阶段三：[阶段名称] —— [...]

要求：
- 阶段数量控制在 3~5 个
- 简明扼要，便于我快速判断方向是否合适
- 严格按照上述格式返回，不要输出每日任务清单`;
}

// 第二步：在用户确认大纲后，依据大纲展开成可执行任务清单
function buildPlanPrompt(goal, outline) {
    const outlineBlock = outline
        ? `\n以下是已经和我确认过的计划大纲，请严格按照这个大纲的阶段和方向来拆解任务：\n"""\n${outline}\n"""\n`
        : '';
    return `我的目标是：${goal}
${outlineBlock}
请据此制定一份可执行的学习/备考计划，并把任务按时间粒度分类。请严格按照以下固定格式返回：

计划标题：[简洁的计划名称，不超过20字]
总周期：[如"3个月"、"一学期"等]
任务数量：[任务总数]

任务列表：
【每日任务】
- 需要每天坚持做的事（如每天背50个单词）
【每周任务】
- 以周为单位推进的事（如每周完成一套真题）
【每月任务】
- 以月为单位的阶段性目标（如每月做一次全面复盘）
【阶段任务】
- 跨越较长周期的里程碑（如第一阶段打牢基础）

注意事项：
- 必须保留上面的【每日任务】【每周任务】【每月任务】【阶段任务】四个分类标题
- 某个分类没有内容时，该分类下写"- 暂无"即可，不要删除标题
- 每个分类下用"- "开头列出具体任务，任务尽量具体、可量化
- 任务总数控制在 8~20 条之间
- 严格按照上述格式返回，不要添加其他内容`;
}

// 解析 AI 返回的计划内容为结构化数据
function parsePlanResponse(text) {
    if (!text) return null;
    
    const result = {
        title: '',
        duration: '',
        taskCount: 0,
        tasks: []
    };

    // 提取计划标题
    const titleMatch = text.match(/计划标题[：:]\s*([^\n]+)/);
    if (titleMatch) {
        result.title = titleMatch[1].trim();
    }

    // 提取总周期
    const durationMatch = text.match(/总周期[：:]\s*([^\n]+)/);
    if (durationMatch) {
        result.duration = durationMatch[1].trim();
    }

    // 提取任务数量
    const countMatch = text.match(/任务数量[：:]\s*(\d+)/);
    if (countMatch) {
        result.taskCount = parseInt(countMatch[1], 10);
    }

    // 提取任务列表（支持分类格式：每日任务：/ 每周任务：/ 每月任务：）
    // 先尝试按分类解析
    const dailyMatch = text.match(/每日任务[：:]([\s\S]*?)(?=每周任务|每月任务|阶段任务|注意事项|$)/);
    const weeklyMatch = text.match(/每周任务[：:]([\s\S]*?)(?=每月任务|阶段任务|注意事项|$)/);
    const monthlyMatch = text.match(/每月任务[：:]([\s\S]*?)(?=阶段任务|注意事项|$)/);
    const stageMatch = text.match(/阶段任务[：:]([\s\S]*?)(?=注意事项|$)/);

    const categorySections = [
        { key: 'daily', match: dailyMatch },
        { key: 'weekly', match: weeklyMatch },
        { key: 'monthly', match: monthlyMatch },
        { key: 'stage', match: stageMatch }
    ];

    const taskRe = /^\s*(?:[-*]\s*)?(?:任务\d+[：:])?\s*(.+)/;
    const skipRe = /^\s*(?:注意事项|注意|说明|提示)[：:]/i;

    let hasCategorized = false;
    categorySections.forEach(({ key, match }) => {
        if (!match) return;
        hasCategorized = true;
        const lines = match[1].split('\n');
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (skipRe.test(trimmed)) return;
            const m = trimmed.match(taskRe);
            if (m) {
                const taskText = m[1].trim();
                if (taskText && taskText.length >= 2 && !/^[：:、，,。\s]+$/.test(taskText)) {
                    result.tasks.push({ text: taskText, category: key });
                }
            }
        });
    });

    // 如果没有分类格式，尝试无分类的"任务列表："格式
    if (!hasCategorized) {
        const taskListMatch = text.match(/任务列表[：:]([\s\S]*?)(?=注意事项|$)/);
        if (taskListMatch) {
            const taskLines = taskListMatch[1].split('\n');
            taskLines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                if (skipRe.test(trimmed)) return;
                const m = trimmed.match(taskRe);
                if (m) {
                    const taskText = m[1].trim();
                    if (taskText && taskText.length >= 2 && !/^[：:、，,。\s]+$/.test(taskText)) {
                        // 从任务文本中推断分类
                        const cat = detectCategory(taskText);
                        result.tasks.push({ text: taskText, category: cat });
                    }
                }
            });
        }
    }

    // 兜底：如果没解析到任务，尝试用原来的逻辑
    if (result.tasks.length === 0) {
        const rawTasks = parseTasksFromText(text);
        result.tasks = rawTasks.map(t => ({ text: t, category: detectCategory(t) }));
    }

    return result;
}

function planBotId() {
    if (!COZE_CONFIG.token) throw new Error('未配置 Coze 访问令牌');
    const botId = COZE_CONFIG.botIds.planning;
    if (!botId) throw new Error('规划生成未配置 Bot ID（请在 js/coze-config.js 填写 botIds.planning）');
    return botId;
}

function planUserId() {
    return (window.chatState && chatState.userId) ? chatState.userId : 'zhixuetong_user';
}

// 第一步：生成计划大纲（用户确认前）
async function generateOutline(goal) {
    goal = (goal || '').trim();
    const btn = document.getElementById('planGenerateBtn');

    if (!goal) {
        setPlanStatus('请先描述你的目标', 'error');
        return;
    }

    setPlanStatus('AI 正在生成计划大纲，请稍候（约 10~30 秒）...', 'loading');
    if (btn) btn.disabled = true;

    try {
        const prefix = (typeof getProfileChatPrefix === 'function') ? getProfileChatPrefix() : '';
        const result = await cozeChat(planBotId(), planUserId(), prefix + buildOutlinePrompt(goal));

        const meta = parsePlanResponse(result.content);
        const draft = {
            goal,
            outlineText: result.content,
            title: (meta && meta.title) ? meta.title : (goal.length > 24 ? goal.slice(0, 24) + '…' : goal),
            duration: (meta && meta.duration) ? meta.duration : '',
            createdAt: Date.now()
        };

        saveDraft(draft);
        setPlanStatus('', '');
        renderPlanPanel();
    } catch (err) {
        setPlanStatus(`⚠️ ${err.message}（若提示跨域请用本地服务器打开页面）`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// 第二步：用户确认大纲后，展开成打卡计划（任务清单）
async function confirmOutline() {
    const draft = loadDraft();
    if (!draft) return;

    const btn = document.getElementById('outlineConfirmBtn');
    setOutlineStatus('正在根据大纲生成打卡计划，请稍候...', 'loading');
    if (btn) btn.disabled = true;

    try {
        const prefix = (typeof getProfileChatPrefix === 'function') ? getProfileChatPrefix() : '';
        const result = await cozeChat(planBotId(), planUserId(), prefix + buildPlanPrompt(draft.goal, draft.outlineText));

        const parsed = parsePlanResponse(result.content);
        let catTasks = parseCategorizedTasks(result.content);
        if (!catTasks.length) {
            const fallback = (parsed && parsed.tasks.length) ? parsed.tasks : parseTasksFromText(result.content);
            catTasks = fallback.map(t => ({ text: t, category: 'other' }));
        }
        const title = (parsed && parsed.title) ? parsed.title : (draft.title || draft.goal);
        const duration = (parsed && parsed.duration) ? parsed.duration : (draft.duration || '');

        const plan = {
            goal: draft.goal,
            title,
            duration,
            outline: draft.outlineText,
            createdAt: Date.now(),
            rawText: result.content,
            tasks: catTasks.map(t => ({ id: makeId(), text: t.text, done: false, category: t.category || 'other' })),
            checkins: []
        };

        savePlan(plan);
        saveDraft(null);
        setOutlineStatus('', '');
        renderPlanPanel();
    } catch (err) {
        setOutlineStatus(`⚠️ ${err.message}（若提示跨域请用本地服务器打开页面）`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// 重新生成大纲（沿用同一目标）
function regenerateOutline() {
    const draft = loadDraft();
    if (draft) generateOutline(draft.goal);
}

// 返回修改目标
function editPlanGoal() {
    const draft = loadDraft();
    saveDraft(null);
    renderPlanPanel();
    const input = document.getElementById('planGoalInput');
    if (input && draft) {
        input.value = draft.goal;
        input.focus();
    }
}

// 兼容旧入口（如从首页带 pendingMessage 进来）：直接走大纲生成
function generatePlan(goal) {
    return generateOutline(goal);
}

function setPlanStatus(text, type) {
    const el = document.getElementById('planStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'plan-status' + (type ? ' ' + type : '');
    el.style.display = text ? 'block' : 'none';
}

function setOutlineStatus(text, type) {
    const el = document.getElementById('outlineStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'plan-status' + (type ? ' ' + type : '');
    el.style.display = text ? 'block' : 'none';
}

// 把大纲文本渲染成可读 HTML
function renderOutline(draft) {
    const titleEl = document.getElementById('outlineTitle');
    const metaEl = document.getElementById('outlineMeta');
    const bodyEl = document.getElementById('outlineBody');
    if (titleEl) titleEl.textContent = draft.title || '计划大纲';
    if (metaEl) {
        metaEl.textContent = draft.duration
            ? `第二步：确认大纲方向 · 总周期 ${draft.duration}`
            : '第二步：确认大纲方向是否符合预期';
    }
    if (bodyEl) {
        const html = (typeof formatMessage === 'function')
            ? formatMessage(draft.outlineText)
            : planEscape(draft.outlineText).replace(/\n/g, '<br>');
        bodyEl.innerHTML = html;
    }
}

function computeStreak(checkinDates) {
    if (!checkinDates || !checkinDates.length) return 0;
    const set = new Set(checkinDates);
    const cursor = new Date();
    if (!set.has(ymd(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
        if (!set.has(ymd(cursor))) return 0;
    }
    let streak = 0;
    while (set.has(ymd(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

// ========== 打卡（纯网页端实现，不调用 API） ==========

// 打卡弹窗：从任务清单中选择已完成项，支持自定义补充
function showCheckinModal(dateStr) {
    const plan = loadPlan();
    if (!plan) {
        alert('请先生成计划');
        return;
    }

    const date = dateStr || todayStr();
    const isToday = date === todayStr();

    // 获取该日期已有的打卡记录
    const existingCheckins = (plan.checkins || []).filter(c => c.date === date);

    let modal = document.getElementById('checkinModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'checkinModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    // 构建任务选择列表
    const taskCheckboxes = plan.tasks.map(t => `
        <label class="checkin-task-item">
            <input type="checkbox" data-task-id="${t.id}" ${t.done ? 'checked' : ''}>
            <span class="checkin-task-text">${planEscape(t.text)}</span>
        </label>
    `).join('');

    modal.innerHTML = `
        <div class="checkin-modal-content">
            <div class="checkin-modal-header">
                <h3>📝 ${isToday ? '今日打卡' : '补卡 - ' + date}</h3>
                <button class="modal-close" onclick="closeCheckinModal()">&times;</button>
            </div>
            <div class="checkin-modal-body">
                <div class="checkin-date-display">
                    <span class="date-icon">📅</span>
                    <span>${date === todayStr() ? formatCurrentDate() : date}</span>
                </div>

                ${existingCheckins.length > 0 ? `
                    <div class="checkin-history">
                        <h4>📋 当日已有 ${existingCheckins.length} 条打卡记录</h4>
                        ${existingCheckins.map((c, i) => `
                            <div class="checkin-history-item">
                                <span class="checkin-history-time">${new Date(c.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                                <span class="checkin-history-tasks">${(c.completedTasks || []).join('、') || '无'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="checkin-form">
                    <label>选择已完成的任务（可多选）：</label>
                    <div class="checkin-task-list">
                        ${taskCheckboxes || '<p class="task-empty">暂无任务，请先生成计划或手动添加任务</p>'}
                    </div>

                    <label style="margin-top:1rem;">补充说明（可选）：</label>
                    <textarea id="checkinNote" rows="2" placeholder="今天的学习心得、遇到的问题等..."></textarea>

                    <div class="checkin-actions">
                        <button class="btn btn-outline" onclick="closeCheckinModal()">取消</button>
                        <button class="btn btn-primary" id="checkinSubmitBtn" onclick="submitCheckin('${date}')">提交打卡</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeCheckinModal() {
    const modal = document.getElementById('checkinModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 提交打卡（纯网页端，不调用 API）
function submitCheckin(dateStr) {
    const plan = loadPlan();
    if (!plan) return;

    // 收集选中的任务
    const checkedTasks = [];
    const checkedTaskIds = [];
    document.querySelectorAll('#checkinModal .checkin-task-item input[type="checkbox"]:checked').forEach(cb => {
        const taskId = cb.getAttribute('data-task-id');
        const task = plan.tasks.find(t => t.id === taskId);
        if (task) {
            checkedTasks.push(task.text);
            checkedTaskIds.push(taskId);
        }
    });

    if (checkedTasks.length === 0) {
        alert('请至少选择一项已完成的任务');
        return;
    }

    // 获取补充说明
    const noteEl = document.getElementById('checkinNote');
    const note = noteEl ? noteEl.value.trim() : '';

    // 同步更新任务完成状态
    checkedTaskIds.forEach(id => {
        const task = plan.tasks.find(t => t.id === id);
        if (task) task.done = true;
    });

    // 保存打卡记录（支持同一天多次打卡）
    plan.checkins = plan.checkins || [];
    plan.checkins.push({
        date: dateStr,
        timestamp: Date.now(),
        completedTasks: checkedTasks,
        completedTaskIds: checkedTaskIds,
        note: note
    });

    savePlan(plan);
    closeCheckinModal();
    renderPlanPanel();
}

// 打卡入口
function checkInToday() {
    showCheckinModal(todayStr());
}

// 查看某天的打卡详情
function showDayCheckins(dateStr) {
    const plan = loadPlan();
    if (!plan || !plan.checkins) return;

    const dayCheckins = plan.checkins.filter(c => c.date === dateStr);
    if (dayCheckins.length === 0) return;

    const detail = dayCheckins.map((c, i) => {
        const time = new Date(c.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const tasks = (c.completedTasks || []).join('、');
        const note = c.note ? `\n   备注：${c.note}` : '';
        return `第 ${i + 1} 次打卡 [${time}]\n   完成任务：${tasks}${note}`;
    }).join('\n\n');

    alert(`${dateStr} 打卡记录（共 ${dayCheckins.length} 次）\n\n${detail}`);
}

function removeTask(id) {
    const plan = loadPlan();
    if (!plan) return;
    plan.tasks = plan.tasks.filter(t => t.id !== id);
    savePlan(plan);
    renderPlanPanel();
}

function addTask(text, category) {
    text = (text || '').trim();
    if (!text) return;
    const plan = loadPlan();
    if (!plan) return;
    plan.tasks.push({ id: makeId(), text, done: false, category: category || 'other' });
    savePlan(plan);
    renderPlanPanel();
}

function resetPlan() {
    if (window.confirm('确定要清除当前计划并重新生成吗？打卡记录也会一并清除。')) {
        savePlan(null);
        saveDraft(null);
        renderPlanPanel();
    }
}

function taskItemHtml(t) {
    const cat = categoryMeta(t.category || 'other');
    const plan = loadPlan();
    const checkins = plan ? (plan.checkins || []) : [];
    const isChecked = isTaskCheckedOnDate(t, currentTaskDate, checkins);
    return `
        <li class="task-item ${isChecked ? 'done' : ''}">
            <label class="task-check">
                <input type="checkbox" data-select-id="${t.id}" class="task-select-cb" ${isChecked ? 'checked disabled' : ''}>
                <span class="task-text">${planEscape(t.text)}</span>
            </label>
            <span class="task-cat-badge" title="${cat.label}">${cat.icon}</span>
            <button type="button" class="task-remove" data-remove="${t.id}" title="删除" aria-label="删除任务">&times;</button>
        </li>`;
}

function planEscape(str) {
    return (str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// 判断任务是否适用于给定日期
function isTaskApplicable(task, dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const cat = task.category || 'other';
    // daily: 每天都适用
    if (cat === 'daily') return true;
    // weekly: 只在周一到周五适用（简化：所有工作日）
    if (cat === 'weekly') {
        const day = date.getDay();
        return day >= 1 && day <= 5; // 周一到周五
    }
    // monthly: 每月1号和15号适用（简化）
    if (cat === 'monthly') {
        const day = date.getDate();
        return day === 1 || day === 15;
    }
    // stage/other: 总是显示
    return true;
}

// 获取某日期的打卡记录
function getCheckinsForDate(checkins, dateStr) {
    return (checkins || []).filter(c => c.date === dateStr);
}

// 检查某任务在某日期是否已打卡
function isTaskCheckedOnDate(task, dateStr, checkins) {
    const dayCheckins = getCheckinsForDate(checkins, dateStr);
    return dayCheckins.some(c => (c.completedTaskIds || []).includes(task.id));
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

// 当前日历展示的年月（每月 1 号）。null 表示尚未初始化，默认本月。
let calendarView = null;

function getCalendarView() {
    if (!calendarView) {
        const now = new Date();
        calendarView = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return calendarView;
}

function renderWeekdayHeader() {
    const wrap = document.getElementById('checkinWeekdays');
    if (!wrap) return;
    wrap.innerHTML = WEEKDAY_LABELS
        .map((w, i) => `<span class="weekday-label${i === 0 || i === 6 ? ' weekend' : ''}">${w}</span>`)
        .join('');
}

// 填充年份 / 月份下拉框
function populateCalendarSelects(checkins) {
    const yearSel = document.getElementById('calYearSelect');
    const monthSel = document.getElementById('calMonthSelect');
    if (!yearSel || !monthSel) return;

    const view = getCalendarView();
    const nowYear = new Date().getFullYear();

    // 年份范围：覆盖最早打卡年份到明年
    let minYear = nowYear - 3;
    (checkins || []).forEach(c => {
        const y = parseInt((c.date || '').slice(0, 4), 10);
        if (!isNaN(y) && y < minYear) minYear = y;
    });
    const maxYear = nowYear + 1;

    yearSel.innerHTML = '';
    for (let y = maxYear; y >= minYear; y--) {
        yearSel.innerHTML += `<option value="${y}" ${y === view.getFullYear() ? 'selected' : ''}>${y}年</option>`;
    }

    monthSel.innerHTML = '';
    for (let m = 0; m < 12; m++) {
        monthSel.innerHTML += `<option value="${m}" ${m === view.getMonth() ? 'selected' : ''}>${m + 1}月</option>`;
    }
}

// 完整月历视图：可按年份 / 月份查看任意月份的打卡情况
function renderCalendar(checkins) {
    renderWeekdayHeader();
    populateCalendarSelects(checkins);

    const wrap = document.getElementById('checkinCalendar');
    if (!wrap) return;

    const checkinCounts = {};
    (checkins || []).forEach(c => {
        checkinCounts[c.date] = (checkinCounts[c.date] || 0) + 1;
    });

    const view = getCalendarView();
    const year = view.getFullYear();
    const month = view.getMonth();
    const today = todayStr();
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    // 前置空格，使 1 号对齐到正确的星期列
    for (let i = 0; i < firstDay.getDay(); i++) {
        cells.push('<span class="cal-pad"></span>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const key = ymd(d);
        const count = checkinCounts[key] || 0;
        const classes = ['calendar-day'];
        if (count > 0) classes.push('checked');
        if (key === today) classes.push('today');
        if (d.getDay() === 0 || d.getDay() === 6) classes.push('weekend');

        const isFuture = d > todayDate;
        if (isFuture) classes.push('future');

        const weekday = WEEKDAY_LABELS[d.getDay()];
        const title = isFuture
            ? `${key} 周${weekday}（未来日期）`
            : (count > 0 ? `${key} 周${weekday} · ${count} 次打卡` : `${key} 周${weekday}`);

        cells.push(
            `<button type="button" class="${classes.join(' ')}" data-date="${key}" ${isFuture ? 'disabled' : ''} title="${title}">` +
            `<span class="cal-date">${day}</span>` +
            (count > 0 ? `<span class="cal-badge">${count}</span>` : '') +
            `</button>`
        );
    }
    wrap.innerHTML = cells.join('');
}

// 切换到指定年月并重绘
function setCalendarMonth(year, month) {
    calendarView = new Date(year, month, 1);
    const plan = loadPlan();
    renderCalendar(plan ? (plan.checkins || []) : []);
}

function shiftCalendarMonth(delta) {
    const view = getCalendarView();
    setCalendarMonth(view.getFullYear(), view.getMonth() + delta);
}

function calendarToToday() {
    const now = new Date();
    setCalendarMonth(now.getFullYear(), now.getMonth());
}

// 打卡历史列表：按时间倒序展示过去执行情况
function renderCheckinHistory(checkins) {
    const el = document.getElementById('checkinHistoryList');
    const countEl = document.getElementById('historyCount');
    if (!el) return;

    const list = (checkins || []).slice().sort((a, b) => b.timestamp - a.timestamp);
    if (countEl) countEl.textContent = list.length ? `共 ${list.length} 次` : '';

    if (!list.length) {
        el.innerHTML = '<p class="task-empty">还没有打卡记录。完成任务后点击「今日打卡」即可记录执行情况。</p>';
        return;
    }

    el.innerHTML = list.map(c => {
        const d = new Date(c.date + 'T00:00:00');
        const weekday = WEEKDAY_LABELS[isNaN(d.getDay()) ? 0 : d.getDay()];
        const time = new Date(c.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        const tags = (c.completedTasks || []).map(t => `<span class="history-tag">${planEscape(t)}</span>`).join('');
        const note = c.note ? `<div class="history-note">📝 ${planEscape(c.note)}</div>` : '';
        return `
            <div class="history-row">
                <div class="history-date">
                    <span class="history-day">${c.date}</span>
                    <span class="history-wd">周${weekday} · ${time}</span>
                </div>
                <div class="history-tasks">${tags || '<span class="task-empty">未记录任务</span>'}</div>
                ${note}
            </div>`;
    }).join('');
}

function renderPlanPanel() {
    const generateView = document.getElementById('planGenerate');
    const outlineView = document.getElementById('planOutline');
    const resultView = document.getElementById('planResult');
    if (!generateView || !resultView) return;

    const plan = loadPlan();
    const draft = loadDraft();

    // 三态切换：输入目标 → 计划大纲 → 打卡计划
    if (!plan && !draft) {
        generateView.style.display = 'block';
        if (outlineView) outlineView.style.display = 'none';
        resultView.style.display = 'none';
        return;
    }

    if (!plan && draft) {
        generateView.style.display = 'none';
        if (outlineView) outlineView.style.display = 'block';
        resultView.style.display = 'none';
        renderOutline(draft);
        return;
    }

    generateView.style.display = 'none';
    if (outlineView) outlineView.style.display = 'none';
    resultView.style.display = 'block';

    document.getElementById('planTitle').textContent = plan.title || plan.goal || '我的计划';
    const created = new Date(plan.createdAt);
    document.getElementById('planMeta').textContent =
        `生成于 ${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')} · 共 ${plan.tasks.length} 项任务`;

    // 更新日期显示
    updateCurrentDate();

    // 打卡概览
    const checkins = plan.checkins || [];
    const checkinDates = checkins.map(c => c.date);
    const uniqueDates = [...new Set(checkinDates)];

    document.getElementById('streakCount').textContent = computeStreak(uniqueDates);
    document.getElementById('checkinTotal').textContent = checkins.length;
    const checkInBtn = document.getElementById('checkInBtn');
    const doneToday = checkinDates.includes(todayStr());
    checkInBtn.textContent = doneToday ? '再次打卡' : '今日打卡';
    checkInBtn.disabled = false;
    renderCalendar(checkins);
    renderCheckinHistory(checkins);

    // 更新日期选择器
    const dateInput = document.getElementById('taskDateInput');
    if (dateInput) {
        dateInput.value = currentTaskDate;
    }

    // 任务清单（按分类分组，按日期过滤）
    const list = document.getElementById('taskList');
    const applicableTasks = plan.tasks.filter(t => isTaskApplicable(t, currentTaskDate));

    if (!plan.tasks.length) {
        list.innerHTML = '<li class="task-empty">未能从计划中识别出任务，可在下方手动添加。</li>';
    } else if (!applicableTasks.length) {
        const date = new Date(currentTaskDate + 'T00:00:00');
        const weekday = WEEKDAY_LABELS[date.getDay()];
        list.innerHTML = `<li class="task-empty">今天（周${weekday}）没有适用的任务。</li>`;
    } else {
        let html = '';
        TASK_CATEGORIES.forEach(cat => {
            const items = applicableTasks.filter(t => (t.category || 'other') === cat.key);
            if (!items.length) return;
            const doneInCat = items.filter(t => isTaskCheckedOnDate(t, currentTaskDate, checkins)).length;
            html += `<li class="task-group-title">
                <span>${cat.icon} ${cat.label}</span>
                <span class="task-group-count">${doneInCat}/${items.length}</span>
            </li>`;
            html += items.map(taskItemHtml).join('');
        });
        list.innerHTML = html;
    }

    // 进度条：基于当天适用任务的打卡情况
    const doneToday_count = applicableTasks.filter(t => isTaskCheckedOnDate(t, currentTaskDate, checkins)).length;
    const total = applicableTasks.length;
    const pct = total ? Math.round((doneToday_count / total) * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${doneToday_count}/${total} · ${pct}%`;

    // 更新打卡按钮状态
    const checkinBtn = document.getElementById('taskCheckinBtn');
    const hint = document.getElementById('checkinHint');
    if (checkinBtn && hint) {
        const anyChecked = document.querySelectorAll('.task-select-cb:checked').length > 0;
        checkinBtn.disabled = !anyChecked;
        const dayCheckins = getCheckinsForDate(checkins, currentTaskDate);
        if (dayCheckins.length > 0) {
            hint.textContent = `今日已打卡 ${dayCheckins.length} 次，可继续勾选任务后打卡`;
        } else {
            hint.textContent = '勾选已完成的任务，然后点击打卡';
        }
    }
}

function initPlanPanel() {
    const panel = document.getElementById('planPanel');
    if (!panel || planPanelWired) {
        renderPlanPanel();
        return;
    }
    planPanelWired = true;

    document.getElementById('planGenerateBtn')?.addEventListener('click', () => {
        generateOutline(document.getElementById('planGoalInput').value);
    });

    // 大纲阶段按钮
    document.getElementById('outlineConfirmBtn')?.addEventListener('click', confirmOutline);
    document.getElementById('outlineRegenBtn')?.addEventListener('click', regenerateOutline);
    document.getElementById('outlineBackBtn')?.addEventListener('click', editPlanGoal);

    document.getElementById('planResetBtn')?.addEventListener('click', resetPlan);
    document.getElementById('checkInBtn')?.addEventListener('click', checkInToday);

    document.getElementById('addTaskBtn')?.addEventListener('click', () => {
        const input = document.getElementById('newTaskInput');
        const catSel = document.getElementById('newTaskCategory');
        addTask(input.value, catSel ? catSel.value : 'other');
        input.value = '';
    });
    document.getElementById('newTaskInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const catSel = document.getElementById('newTaskCategory');
            addTask(e.target.value, catSel ? catSel.value : 'other');
            e.target.value = '';
        }
    });

    // 任务删除（事件委托）
    document.getElementById('taskList')?.addEventListener('click', (e) => {
        const removeId = e.target.getAttribute('data-remove');
        if (removeId) removeTask(removeId);
    });

    // 任务勾选：仅更新打卡按钮状态，不直接标记完成
    document.getElementById('taskList')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('task-select-cb')) {
            const checkinBtn = document.getElementById('taskCheckinBtn');
            if (checkinBtn) {
                const anyChecked = document.querySelectorAll('.task-select-cb:checked').length > 0;
                checkinBtn.disabled = !anyChecked;
            }
        }
    });

    // 任务清单日期导航
    document.getElementById('taskDatePrev')?.addEventListener('click', () => {
        const d = new Date(currentTaskDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        currentTaskDate = ymd(d);
        renderPlanPanel();
    });
    document.getElementById('taskDateNext')?.addEventListener('click', () => {
        const d = new Date(currentTaskDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        currentTaskDate = ymd(d);
        renderPlanPanel();
    });
    document.getElementById('taskDateToday')?.addEventListener('click', () => {
        currentTaskDate = todayStr();
        renderPlanPanel();
    });
    document.getElementById('taskDateInput')?.addEventListener('change', (e) => {
        if (e.target.value) {
            currentTaskDate = e.target.value;
            renderPlanPanel();
        }
    });

    // 打卡按钮：勾选任务后点击打卡
    document.getElementById('taskCheckinBtn')?.addEventListener('click', () => {
        const plan = loadPlan();
        if (!plan) return;

        const checkedIds = [];
        const checkedTasks = [];
        document.querySelectorAll('.task-select-cb:checked').forEach(cb => {
            const taskId = cb.getAttribute('data-select-id');
            const task = plan.tasks.find(t => t.id === taskId);
            if (task) {
                checkedIds.push(taskId);
                checkedTasks.push(task.text);
            }
        });

        if (checkedIds.length === 0) return;

        // 保存打卡记录
        plan.checkins = plan.checkins || [];
        plan.checkins.push({
            date: currentTaskDate,
            timestamp: Date.now(),
            completedTasks: checkedTasks,
            completedTaskIds: checkedIds,
            note: ''
        });

        savePlan(plan);
        renderPlanPanel();
    });

    // 打卡日历点击：打开当天打卡弹窗（查看已有记录 + 可补卡）
    document.getElementById('checkinCalendar')?.addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-day');
        if (cell && !cell.disabled) {
            const date = cell.getAttribute('data-date');
            showCheckinModal(date);
        }
    });

    // 日历年月导航
    document.getElementById('calPrevBtn')?.addEventListener('click', () => shiftCalendarMonth(-1));
    document.getElementById('calNextBtn')?.addEventListener('click', () => shiftCalendarMonth(1));
    document.getElementById('calTodayBtn')?.addEventListener('click', calendarToToday);
    document.getElementById('calYearSelect')?.addEventListener('change', (e) => {
        setCalendarMonth(parseInt(e.target.value, 10), getCalendarView().getMonth());
    });
    document.getElementById('calMonthSelect')?.addEventListener('change', (e) => {
        setCalendarMonth(getCalendarView().getFullYear(), parseInt(e.target.value, 10));
    });

    renderPlanPanel();

    // 每分钟更新日期显示
    setInterval(updateCurrentDate, 60000);
}

// 由 script.js 在切换智能体时调用：管理所有面板的显隐
// 需要面板模式（隐藏聊天区）的智能体：planning / mental / education / risk
function applyPlanMode(agentId) {
    const main = document.querySelector('.chat-main');
    if (!main) return;

    const panelAgents = ['planning', 'mental', 'education', 'risk'];
    const needsPanel = panelAgents.includes(agentId);
    main.classList.toggle('plan-mode', needsPanel);

    // 心理支持角色选择面板
    const mentalPanel = document.getElementById('mentalCharacterPanel');
    if (mentalPanel) {
        mentalPanel.style.display = agentId === 'mental' ? 'block' : 'none';
    }

    // 规划生成：三个子视图由 renderPlanPanel 统一控制
    const isPlanning = agentId === 'planning';
    if (isPlanning) {
        renderPlanPanel();
    } else {
        // 非规划时确保规划子视图全部隐藏
        const planGenerate = document.getElementById('planGenerate');
        const planOutline = document.getElementById('planOutline');
        const planResult = document.getElementById('planResult');
        if (planGenerate) planGenerate.style.display = 'none';
        if (planOutline) planOutline.style.display = 'none';
        if (planResult) planResult.style.display = 'none';
    }

    // 升学定位面板
    const eduPanel = document.getElementById('educationPanel');
    if (eduPanel) {
        eduPanel.style.display = agentId === 'education' ? 'block' : 'none';
        if (agentId === 'education') restoreEducationPanel();
    }

    // 学伴小助手面板
    const assistantPanel = document.getElementById('assistantPanel');
    if (assistantPanel) {
        assistantPanel.style.display = agentId === 'risk' ? 'block' : 'none';
        if (agentId === 'risk' && typeof initMemos === 'function') {
            initMemos();
        }
    }
}

// ==================== 升学定位 - 四大板块 ====================

function educationStorageKey() {
    return 'zhixuetong_education_' + planUserKey();
}

function loadEducationResult() {
    try {
        return JSON.parse(localStorage.getItem(educationStorageKey()));
    } catch {
        return null;
    }
}

function saveEducationResult(data) {
    if (data) {
        localStorage.setItem(educationStorageKey(), JSON.stringify(data));
    } else {
        localStorage.removeItem(educationStorageKey());
    }
}

// 规范化 Agent 返回文本，兼容 markdown 包裹、半角冒号等
function normalizeEducationContent(content) {
    if (!content) return '';
    let text = String(content);
    text = text.replace(/```[\w-]*\n?/g, '');
    text = text.replace(/===\s*EDUCATION_START\s*===/gi, '===EDUCATION_START===');
    text = text.replace(/===\s*EDUCATION_END\s*===/gi, '===EDUCATION_END===');
    return text.trim();
}

function parseEducationLine(line) {
    const cleaned = line.replace(/^[-*•·]\s*/, '').replace(/\*\*/g, '').trim();
    const m = cleaned.match(/^(.+?)[：:]\s*(.+)$/);
    if (!m) return null;
    return { key: m[1].trim(), val: m[2].trim() };
}

// 解析单个路径板块文本（支持「优势：」换行 + 列表、标题内嵌分数等）
function parseEducationSection(text) {
    const section = {};
    if (!text) return section;

    // 标题或段落中的「65分」「（65分）」
    const inlineScore = text.match(/[（(]\s*(\d{1,3})\s*分\s*[）)]|(\d{1,3})\s*分/);
    if (inlineScore) {
        section.score = parseInt(inlineScore[1] || inlineScore[2], 10);
    }

    let currentKey = null;
    const lines = text.trim().split('\n');

    lines.forEach(raw => {
        const line = raw.replace(/\*\*/g, '').trim();
        if (!line) return;

        const parsed = parseEducationLine(raw);
        if (parsed) {
            const { key, val } = parsed;
            if (/可行性|评分|适配度|匹配度/.test(key)) {
                const num = parseInt(val.replace(/[^\d]/g, ''), 10);
                if (!isNaN(num)) section.score = num;
                currentKey = null;
            } else if (/^关键行动|^行动建议|^建议行动/.test(key)) {
                section.actions = val
                    ? val.split(/[|｜;；]/).map(s => s.trim()).filter(Boolean)
                    : (section.actions || []);
                currentKey = 'actions';
            } else if (/^优势/.test(key)) {
                if (val) section['优势'] = section['优势'] ? section['优势'] + '；' + val : val;
                currentKey = '优势';
            } else if (/^劣势/.test(key)) {
                if (val) section['劣势'] = section['劣势'] ? section['劣势'] + '；' + val : val;
                currentKey = '劣势';
            } else if (/^推荐/.test(key)) {
                section[key] = val;
                currentKey = null;
            } else {
                section[key] = val;
                currentKey = null;
            }
            return;
        }

        // 单独一行的标签（如「优势：」后面跟列表）
        const labelOnly = line.match(/^(优势|劣势|关键行动|行动建议|建议行动|推荐[\u4e00-\u9fa5/]+)[：:]?\s*$/);
        if (labelOnly) {
            const label = labelOnly[1];
            if (/^关键行动|^行动建议|^建议行动/.test(label)) currentKey = 'actions';
            else if (label.startsWith('推荐')) currentKey = 'rec';
            else currentKey = label;
            if (!section.actions && currentKey === 'actions') section.actions = [];
            return;
        }

        // 列表项：接在当前标签下
        const bullet = line.match(/^[-*•·]\s+(.+)$/);
        if (bullet) {
            const item = bullet[1].trim();
            if (currentKey === '优势') {
                section['优势'] = section['优势'] ? section['优势'] + '；' + item : item;
            } else if (currentKey === '劣势') {
                section['劣势'] = section['劣势'] ? section['劣势'] + '；' + item : item;
            } else if (currentKey === 'actions') {
                section.actions = section.actions || [];
                section.actions.push(item);
            } else if (currentKey === 'rec') {
                const recKey = Object.keys(section).find(k => k.startsWith('推荐')) || '推荐';
                section[recKey] = section[recKey] ? section[recKey] + '；' + item : item;
            }
            return;
        }

        // 无标签的段落行：若刚读过「优势/劣势」标签，当作续行
        if (currentKey === '优势' || currentKey === '劣势') {
            section[currentKey] = section[currentKey] ? section[currentKey] + '；' + line : line;
        }
    });

    if (section.score == null) {
        const scoreM = text.match(/(?:可行性|评分|适配度|匹配度)[：:\s]*(?:较高|中等|较低)?\s*[（(]?(\d{1,3})/);
        if (scoreM) section.score = parseInt(scoreM[1], 10);
    }

    return section;
}

function getEducationRecommend(d, pathIndex) {
    const recFields = ['推荐院校层次', '推荐岗位方向', '推荐国家/地区', '推荐岗位类型'];
    if (d[recFields[pathIndex]]) return d[recFields[pathIndex]];
    const recKey = Object.keys(d).find(k => k.startsWith('推荐'));
    return recKey ? d[recKey] : null;
}

function buildEducationProfileFromForm(form) {
    if (!form) return {};
    const profile = {};
    if (form.major) profile['专业'] = form.major;
    if (form.gpa) profile['GPA'] = form.gpa;
    if (form.grade) profile['年级'] = form.grade;
    if (form.english) profile['英语水平'] = form.english;
    if (form.strengths) profile['优势'] = form.strengths;
    if (form.weaknesses) profile['劣势'] = form.weaknesses;
    return profile;
}

function mergeEducationProfile(parsedProfile, formProfile) {
    const merged = { ...formProfile, ...(parsedProfile || {}) };
    return Object.keys(merged).length ? merged : formProfile;
}

function isEducationDataValid(data) {
    if (!data) return false;
    const paths = ['kaoyan', 'job', 'abroad', 'civil'];
    return paths.some(p => {
        const d = data[p] || {};
        return d.score != null || d['优势'] || d['劣势'] || (d.actions && d.actions.length > 0);
    });
}

function parseEducationStructuredBlock(normalized) {
    const match = normalized.match(/===EDUCATION_START===([\s\S]*?)===EDUCATION_END===/);
    if (!match) return null;

    const block = match[1].trim();
    const result = { profile: {}, kaoyan: {}, job: {}, abroad: {}, civil: {} };

    const profileMatch = block.match(/用户画像[：:]\s*([\s\S]*?)(?=\n\s*考研评估[：:])/i)
        || block.match(/用户画像[：:]\s*([\s\S]*?)(?=\n\s*#{1,4}\s*考研)/i);
    if (profileMatch) {
        profileMatch[1].trim().split('\n').forEach(line => {
            const parsed = parseEducationLine(line);
            if (parsed) result.profile[parsed.key] = parsed.val;
        });
    }

    const paths = ['考研', '就业', '出国', '考公'];
    const keys = ['kaoyan', 'job', 'abroad', 'civil'];

    paths.forEach((path, i) => {
        const nextPath = paths[i + 1];
        const regex = nextPath
            ? new RegExp(`${path}评估[：:]\\s*([\\s\\S]*?)(?=\\n\\s*${nextPath}评估[：:])`)
            : new RegExp(`${path}评估[：:]\\s*([\\s\\S]*)`);
        const m = block.match(regex);
        if (m) result[keys[i]] = parseEducationSection(m[1]);
    });

    return isEducationDataValid(result) ? result : null;
}

// 备用解析：Agent 返回 Markdown 报告（无 EDUCATION 标记）时尝试提取四路径数据
function parseEducationMarkdownFallback(normalized) {
    const result = { profile: {}, kaoyan: {}, job: {}, abroad: {}, civil: {} };
    const pathDefs = [
        { key: 'kaoyan', label: '考研' },
        { key: 'job', label: '就业' },
        { key: 'abroad', label: '出国' },
        { key: 'civil', label: '考公' }
    ];

    const profileMatch = normalized.match(/用户画像[：:]\s*([\s\S]*?)(?=\n\s*(?:#{1,4}\s*)?(?:【)?考研)/i);
    if (profileMatch) {
        profileMatch[1].trim().split('\n').forEach(line => {
            const parsed = parseEducationLine(line);
            if (parsed) result.profile[parsed.key] = parsed.val;
        });
    }

    pathDefs.forEach((def, i) => {
        const next = pathDefs[i + 1];
        const nextPat = next
            ? `(?=(?:#{1,4}\\s*)?(?:【|\\*\\*)?${next.label}(?:路径|评估|方向)?)`
            : '$';
        const re = new RegExp(
            `(?:#{1,4}\\s*)?(?:【|\\*\\*)?${def.label}(?:路径|评估|方向)?(?:】|\\*\\*)?(?:[（(]\\s*\\d{1,3}\\s*分\\s*[）)])?[：:\\s]*([\\s\\S]*?)${nextPat}`,
            'i'
        );
        const m = normalized.match(re);
        if (m) {
            result[def.key] = parseEducationSection(m[1]);
            // 分数可能在标题行而不在 capture 内，从完整匹配再取一次
            if (result[def.key].score == null) {
                const fullRe = new RegExp(
                    `(?:#{1,4}\\s*)?(?:【|\\*\\*)?${def.label}(?:路径|评估|方向)?(?:】|\\*\\*)?(?:[（(]\\s*(\\d{1,3})\\s*分\\s*[）)])`,
                    'i'
                );
                const fm = normalized.match(fullRe);
                if (fm) result[def.key].score = parseInt(fm[1], 10);
            }
        }
    });

    return isEducationDataValid(result) ? result : null;
}

// 解析 Agent 返回：优先固定格式，其次 Markdown 报告
function parseEducationResponse(content) {
    const normalized = normalizeEducationContent(content);
    return parseEducationStructuredBlock(normalized)
        || parseEducationMarkdownFallback(normalized)
        || null;
}

// 渲染评估结果到四大板块
function renderEducationResult(data, shouldSave = true) {
    if (!data) return;

    const grid = document.getElementById('eduCardsGrid');
    if (grid && eduCardsGridOriginal) grid.innerHTML = eduCardsGridOriginal;

    // 用户画像（Agent 未返回时用表单数据兜底）
    const profileCard = document.getElementById('eduProfileCard');
    if (profileCard) {
        const profile = data.profile || {};
        const tags = Object.entries(profile).map(([k, v]) =>
            `<span class="profile-tag"><strong>${planEscape(k)}：</strong>${planEscape(v)}</span>`
        ).join('');
        profileCard.innerHTML = tags || '<span class="task-empty">暂无画像信息</span>';
    }

    // 四大板块
    const paths = ['kaoyan', 'job', 'abroad', 'civil'];

    paths.forEach((path, i) => {
        const d = data[path] || {};

        const scoreEl = document.getElementById(`${path}Score`);
        if (scoreEl) scoreEl.textContent = d.score != null && d.score > 0 ? `${d.score}分` : '--';

        const barEl = document.getElementById(`${path}Bar`);
        if (barEl) {
            barEl.style.width = '0%';
            setTimeout(() => { barEl.style.width = `${Math.min(100, d.score || 0)}%`; }, 100);
        }

        const advEl = document.getElementById(`${path}Adv`);
        if (advEl) advEl.textContent = d['优势'] || '--';

        const disEl = document.getElementById(`${path}Dis`);
        if (disEl) disEl.textContent = d['劣势'] || '--';

        const recEl = document.getElementById(`${path}Rec`);
        if (recEl) recEl.textContent = getEducationRecommend(d, i) || '--';

        const actionsEl = document.getElementById(`${path}Actions`);
        if (actionsEl) {
            actionsEl.innerHTML = '';
            (d.actions || []).forEach(action => {
                const li = document.createElement('li');
                li.textContent = action;
                actionsEl.appendChild(li);
            });
            if (!d.actions || d.actions.length === 0) {
                actionsEl.innerHTML = '<li>暂无</li>';
            }
        }
    });

    document.getElementById('eduForm').style.display = 'none';
    document.getElementById('eduResult').style.display = 'block';

    if (shouldSave) saveEducationResult(data);
}

function restoreEducationPanel() {
    const saved = loadEducationResult();
    if (saved && isEducationDataValid(saved)) {
        renderEducationResult(saved, false);
    } else {
        resetEducation(false);
    }
}

let eduCardsGridOriginal = null;

function showEducationParseError(rawContent) {
    const preview = (rawContent || '').substring(0, 800);
    renderEducationRawFallback(rawContent);
    alert(
        '未能自动解析为四大板块，已在下方展示 Agent 原始回复。\n\n' +
        '建议检查：\n' +
        '1. js/coze-config.js 中 botIds.education 是否为「升学定位」Bot（当前可能与 planning 相同）\n' +
        '2. Bot 提示词是否要求返回 ===EDUCATION_START=== 格式\n\n' +
        '原始回复开头：\n' + preview.substring(0, 200)
    );
}

function renderEducationRawFallback(content) {
    const form = document.getElementById('eduForm');
    const result = document.getElementById('eduResult');
    const profileCard = document.getElementById('eduProfileCard');
    const grid = document.getElementById('eduCardsGrid');
    if (!form || !result) return;

    form.style.display = 'none';
    result.style.display = 'block';
    if (profileCard) {
        profileCard.innerHTML = '<p class="task-empty">⚠️ 返回格式未匹配，以下为 Agent 原始分析内容</p>';
    }
    if (grid) {
        if (!eduCardsGridOriginal) eduCardsGridOriginal = grid.innerHTML;
        const html = (typeof formatMessage === 'function')
            ? formatMessage(content)
            : planEscape(content).replace(/\n/g, '<br>');
        grid.innerHTML = `<div class="plan-card outline-body edu-raw-fallback">${html}</div>`;
    }
}

// 开始评估
async function analyzeEducation() {
    const major = document.getElementById('eduMajor')?.value.trim();
    const grade = document.getElementById('eduGrade')?.value;
    const gpa = document.getElementById('eduGpa')?.value.trim();
    const english = document.getElementById('eduEnglish')?.value;
    const strengths = document.getElementById('eduStrengths')?.value.trim();
    const weaknesses = document.getElementById('eduWeaknesses')?.value.trim();

    if (!major) { alert('请输入专业'); return; }
    if (!gpa) { alert('请输入GPA/均分'); return; }

    const btn = document.getElementById('eduAnalyzeBtn');
    btn.disabled = true;
    btn.textContent = '评估中...';

    const prefix = (typeof getProfileChatPrefix === 'function') ? getProfileChatPrefix() : '';
    const message = `${prefix}请帮我做升学定位评估，分析考研/就业/出国/考公四条路径。

专业：${major}
年级：${grade}
GPA/均分：${gpa}
英语水平：${english}
个人优势：${strengths || '暂无'}
个人劣势：${weaknesses || '暂无'}

【重要】请必须使用 ===EDUCATION_START=== 与 ===EDUCATION_END=== 包裹的固定格式返回。
不要使用「学业规划报告」或其他 Markdown 报告格式。
必须包含：用户画像、考研评估、就业评估、出国评估、考公评估四个板块，每板块含可行性评分(0-100整数)、优势、劣势、关键行动。`;

    const formProfile = buildEducationProfileFromForm({
        major, grade, gpa, english, strengths, weaknesses
    });

    try {
        const botId = COZE_CONFIG.botIds['education'];
        if (!COZE_CONFIG.token) throw new Error('未配置 Coze 令牌');
        if (!botId) throw new Error('未配置升学定位 Bot ID（请在 js/coze-config.js 填写 botIds.education）');

        const result = await cozeChat(botId, chatState.userId, message, null, []);

        const data = parseEducationResponse(result.content);
        if (data) {
            data.profile = mergeEducationProfile(data.profile, formProfile);
            renderEducationResult(data);
        } else {
            showEducationParseError(result.content);
        }
    } catch (err) {
        alert('评估失败：' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '开始评估';
}

// 重新评估
function resetEducation(clearStorage = true) {
    document.getElementById('eduForm').style.display = 'block';
    document.getElementById('eduResult').style.display = 'none';

    if (clearStorage) saveEducationResult(null);

    ['kaoyan', 'job', 'abroad', 'civil'].forEach(path => {
        const bar = document.getElementById(`${path}Bar`);
        if (bar) bar.style.width = '0%';
        const score = document.getElementById(`${path}Score`);
        if (score) score.textContent = '--';
        const adv = document.getElementById(`${path}Adv`);
        if (adv) adv.textContent = '--';
        const dis = document.getElementById(`${path}Dis`);
        if (dis) dis.textContent = '--';
        const rec = document.getElementById(`${path}Rec`);
        if (rec) rec.textContent = '--';
        const actions = document.getElementById(`${path}Actions`);
        if (actions) actions.innerHTML = '';
    });

    const profileCard = document.getElementById('eduProfileCard');
    if (profileCard) profileCard.innerHTML = '';

    const grid = document.getElementById('eduCardsGrid');
    if (grid && eduCardsGridOriginal) grid.innerHTML = eduCardsGridOriginal;
}

// ==================== 学伴小助手 ====================

// Tab 切换
function switchAssistantTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 更新内容显示
    document.getElementById('tabGraduation').style.display = tabName === 'graduation' ? 'block' : 'none';
    document.getElementById('tabMemo').style.display = tabName === 'memo' ? 'block' : 'none';
}

// 毕业要求（来自学生手册知识库）
const GRADUATION_REQUIREMENTS = {
    credits: 160,       // 总学分要求
    sutuo: 20,          // 素拓分要求
    qingzhi: 30,        // 青志时长要求（小时）
    tice: '合格'        // 体测要求
};

// 毕业进度可视化（从学生画像自动读取数据）
function analyzeGraduation() {
    // 从 localStorage 读取学生画像
    const profile = getStoredProfile();

    const major = profile.major || document.getElementById('asstMajor')?.value.trim();
    const grade = profile.grade || document.getElementById('asstGrade')?.value;
    const gpa = profile.gpa || '';

    // 毕业特定数据（从表单读取，画像中没有）
    const credits = parseFloat(document.getElementById('asstCredits')?.value) || 0;
    const sutuo = parseFloat(document.getElementById('asstSutuo')?.value) || 0;
    const qingzhi = parseFloat(document.getElementById('asstQingzhi')?.value) || 0;
    const tice = document.getElementById('asstTice')?.value;

    if (!major) { alert('请先在个人中心填写专业信息'); return; }

    // 计算进度
    const data = {
        student: {
            '姓名': profile.name || '未填写',
            '专业': major,
            '年级': grade || '未填写',
            'GPA': gpa || '未填写',
            '学校': profile.school || '未填写',
            '已修学分': credits,
            '素拓分': sutuo,
            '青志时长': qingzhi + '小时',
            '体测成绩': tice
        },
        items: [
            {
                label: '学分',
                current: credits,
                required: GRADUATION_REQUIREMENTS.credits,
                unit: '学分'
            },
            {
                label: '素拓分',
                current: sutuo,
                required: GRADUATION_REQUIREMENTS.sutuo,
                unit: '分'
            },
            {
                label: '青志时长',
                current: qingzhi,
                required: GRADUATION_REQUIREMENTS.qingzhi,
                unit: '小时'
            }
        ],
        tice: tice,
        ticeRequired: GRADUATION_REQUIREMENTS.tice,
        suggestions: generateGraduationSuggestions(credits, sutuo, qingzhi, tice, grade)
    };

    renderGraduationResult(data);
}

// 自动填充画像数据到表单
function autoFillFromProfile() {
    const profile = getStoredProfile();
    if (!profile) return;

    const majorInput = document.getElementById('asstMajor');
    const gradeSelect = document.getElementById('asstGrade');

    if (majorInput && profile.major && !majorInput.value) {
        majorInput.value = profile.major;
    }
    if (gradeSelect && profile.grade) {
        for (const option of gradeSelect.options) {
            if (option.value === profile.grade) {
                option.selected = true;
                break;
            }
        }
    }
}

// 根据进度生成建议
function generateGraduationSuggestions(credits, sutuo, qingzhi, tice, grade) {
    const suggestions = [];
    const creditGap = GRADUATION_REQUIREMENTS.credits - credits;
    const sutuoGap = GRADUATION_REQUIREMENTS.sutuo - sutuo;
    const qingzhiGap = GRADUATION_REQUIREMENTS.qingzhi - qingzhi;

    if (creditGap > 0) {
        suggestions.push(`还差 ${creditGap} 学分，建议每学期修 ${Math.ceil(creditGap / 2)} 学分`);
    } else {
        suggestions.push('学分已达标！');
    }

    if (sutuoGap > 0) {
        suggestions.push(`还差 ${sutuoGap} 素拓分，可参加竞赛、社团活动、志愿服务等获取`);
    } else {
        suggestions.push('素拓分已达标！');
    }

    if (qingzhiGap > 0) {
        suggestions.push(`还差 ${qingzhiGap} 小时青志时长，建议参加校园志愿活动`);
    } else {
        suggestions.push('青志时长已达标！');
    }

    if (tice !== '合格' && tice !== '优秀' && tice !== '良好') {
        suggestions.push('体测未达标，请尽快参加补测');
    } else {
        suggestions.push('体测已达标！');
    }

    return suggestions;
}

// 解析毕业进度响应（保留兼容）
function parseGraduationResponse(content) {
    const match = content.match(/===GRADUATION_START===([\s\S]*?)===GRADUATION_END===/);
    if (!match) return null;

    const block = match[1];
    const result = {
        student: {},
        requirements: {},
        gaps: {},
        suggestions: []
    };

    // 解析学生信息
    const studentMatch = block.match(/学生信息：([\s\S]*?)(?=毕业要求：)/);
    if (studentMatch) {
        studentMatch[1].trim().split('\n').forEach(line => {
            const m = line.match(/-?\s*(.+?)：(.+)/);
            if (m) result.student[m[1].trim()] = m[2].trim();
        });
    }

    // 解析毕业要求
    const reqMatch = block.match(/毕业要求：([\s\S]*?)(?=差距分析：)/);
    if (reqMatch) {
        reqMatch[1].trim().split('\n').forEach(line => {
            const m = line.match(/-?\s*(.+?)：(.+)/);
            if (m) result.requirements[m[1].trim()] = m[2].trim();
        });
    }

    // 解析差距分析
    const gapMatch = block.match(/差距分析：([\s\S]*?)(?=建议：)/);
    if (gapMatch) {
        gapMatch[1].trim().split('\n').forEach(line => {
            const m = line.match(/-?\s*(.+?)：(.+)/);
            if (m) result.gaps[m[1].trim()] = m[2].trim();
        });
    }

    // 解析建议
    const sugMatch = block.match(/建议：([\s\S]*?)$/);
    if (sugMatch) {
        result.suggestions = sugMatch[1].trim().split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.replace(/^-?\s*/, '').trim());
    }

    return result;
}

// 渲染毕业进度结果
function renderGraduationResult(data) {
    // 学生信息
    const profileCard = document.getElementById('graduationProfile');
    if (profileCard && data.student) {
        const tags = Object.entries(data.student).map(([k, v]) =>
            `<span class="profile-tag"><strong>${k}：</strong>${v}</span>`
        ).join('');
        profileCard.innerHTML = tags;
    }

    // 进度条
    const barsContainer = document.getElementById('graduationBars');
    if (barsContainer && data.items) {
        barsContainer.innerHTML = '';

        data.items.forEach(item => {
            const percent = Math.min((item.current / item.required) * 100, 100);
            const colorClass = percent >= 80 ? 'green' : percent >= 60 ? 'yellow' : 'red';

            const barItem = document.createElement('div');
            barItem.className = 'grad-bar-item';
            barItem.innerHTML = `
                <div class="grad-bar-header">
                    <span class="grad-bar-label">${item.label}</span>
                    <span class="grad-bar-value">${item.current}/${item.required} ${item.unit} (${percent.toFixed(0)}%)</span>
                </div>
                <div class="grad-bar-track">
                    <div class="grad-bar-fill ${colorClass}" style="width: ${percent}%"></div>
                </div>
            `;
            barsContainer.appendChild(barItem);
        });

        // 体测
        const ticePass = data.tice === '合格' || data.tice === '良好' || data.tice === '优秀';
        const ticeColor = ticePass ? 'green' : 'red';
        const ticePercent = ticePass ? 100 : 0;

        const ticeItem = document.createElement('div');
        ticeItem.className = 'grad-bar-item';
        ticeItem.innerHTML = `
            <div class="grad-bar-header">
                <span class="grad-bar-label">体测</span>
                <span class="grad-bar-value">${data.tice} / ${data.ticeRequired} (${ticePercent}%)</span>
            </div>
            <div class="grad-bar-track">
                <div class="grad-bar-fill ${ticeColor}" style="width: ${ticePercent}%"></div>
            </div>
        `;
        barsContainer.appendChild(ticeItem);
    }

    // 建议
    const suggestionsContainer = document.getElementById('graduationSuggestions');
    if (suggestionsContainer && data.suggestions && data.suggestions.length > 0) {
        suggestionsContainer.innerHTML = `
            <h3> 建议</h3>
            <ul>
                ${data.suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
        `;
    }

    // 显示结果
    document.getElementById('graduationForm').style.display = 'none';
    document.getElementById('graduationResult').style.display = 'block';
}

// 重置毕业进度分析
function resetGraduation() {
    document.getElementById('graduationForm').style.display = 'block';
    document.getElementById('graduationResult').style.display = 'none';
}

// 备忘录数据
let memos = JSON.parse(localStorage.getItem('zhixuetong_memos') || '[]');
let currentMemoFilter = 'all';

// 添加备忘
function addMemo() {
    const content = document.getElementById('memoContent')?.value.trim();
    const deadline = document.getElementById('memoDeadline')?.value;
    const priority = document.getElementById('memoPriority')?.value;
    const category = document.getElementById('memoCategory')?.value;
    const reminder = document.getElementById('memoReminder')?.value;
    const note = document.getElementById('memoNote')?.value.trim();

    if (!content) { alert('请输入事项内容'); return; }
    if (!deadline) { alert('请选择截止时间'); return; }

    const memo = {
        id: 'M' + String(memos.length + 1).padStart(3, '0'),
        content,
        deadline,
        priority,
        category,
        reminder,
        note: note || '无',
        completed: false,
        createdAt: new Date().toISOString()
    };

    memos.push(memo);
    saveMemos();
    renderMemos();

    // 清空表单
    document.getElementById('memoContent').value = '';
    document.getElementById('memoDeadline').value = '';
    document.getElementById('memoNote').value = '';

    // 设置提醒
    setMemoReminder(memo);
}

// 保存备忘录
function saveMemos() {
    localStorage.setItem('zhixuetong_memos', JSON.stringify(memos));
}

// 筛选备忘录
function filterMemos(filter) {
    currentMemoFilter = filter;
    document.querySelectorAll('.memo-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderMemos();
}

// 格式化倒计时
function formatCountdown(deadline) {
    const now = new Date();
    const end = new Date(deadline);
    const diff = end - now;

    if (diff < 0) {
        const absDiff = Math.abs(diff);
        const days = Math.floor(absDiff / (24 * 60 * 60 * 1000));
        const hours = Math.floor((absDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        if (days > 0) return `已过期 ${days}天${hours}小时`;
        return `已过期 ${hours}小时`;
    }

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) return `还剩 ${days}天${hours}小时`;
    if (hours > 0) return `还剩 ${hours}小时${minutes}分钟`;
    return `还剩 ${minutes}分钟`;
}

// 渲染备忘录列表
function renderMemos() {
    const listContainer = document.getElementById('memoList');
    if (!listContainer) return;

    // 更新统计
    updateMemoStats();

    // 筛选
    let filteredMemos = [...memos];
    const now = new Date();

    if (currentMemoFilter === 'pending') {
        filteredMemos = memos.filter(m => !m.completed);
    } else if (currentMemoFilter === 'completed') {
        filteredMemos = memos.filter(m => m.completed);
    } else if (currentMemoFilter === 'urgent') {
        filteredMemos = memos.filter(m => {
            if (m.completed) return false;
            const diff = new Date(m.deadline) - now;
            return diff > 0 && diff < 24 * 60 * 60 * 1000;
        });
    }

    // 按截止时间排序
    filteredMemos.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (filteredMemos.length === 0) {
        listContainer.innerHTML = '<div class="memo-empty">暂无备忘事项，点击上方添加</div>';
        return;
    }

    listContainer.innerHTML = filteredMemos.map(memo => {
        const deadline = new Date(memo.deadline);
        const diff = deadline - now;
        const isUrgent = diff < 24 * 60 * 60 * 1000 && diff > 0;
        const isExpired = diff < 0;

        const priorityClass = memo.priority === '高' ? 'priority-high' : memo.priority === '中' ? 'priority-medium' : 'priority-low';
        const completedClass = memo.completed ? 'completed' : '';
        const countdown = formatCountdown(memo.deadline);

        return `
            <div class="memo-item ${priorityClass} ${completedClass}">
                <div class="memo-header">
                    <span class="memo-category">${memo.category}</span>
                    <span class="memo-title">${memo.content}</span>
                </div>
                <div class="memo-deadline ${isUrgent ? 'urgent' : ''} ${isExpired ? 'expired' : ''}">
                     ${deadline.toLocaleString('zh-CN')} ${isExpired ? '(已过期)' : isUrgent ? '(即将到期)' : ''}
                </div>
                <div class="memo-countdown ${isExpired ? 'expired' : isUrgent ? 'urgent' : ''}">
                    ${countdown}
                </div>
                ${memo.note !== '无' ? `<div class="memo-note"> ${memo.note}</div>` : ''}
                <div class="memo-actions">
                    <button onclick="toggleMemoComplete('${memo.id}')">${memo.completed ? '↩️ 取消完成' : '✅ 标记完成'}</button>
                    <button class="delete-btn" onclick="deleteMemo('${memo.id}')">🗑️ 删除</button>
                </div>
            </div>
        `;
    }).join('');
}

// 更新统计
function updateMemoStats() {
    const now = new Date();
    const total = memos.length;
    const done = memos.filter(m => m.completed).length;
    const pending = total - done;
    const urgent = memos.filter(m => {
        if (m.completed) return false;
        const diff = new Date(m.deadline) - now;
        return diff > 0 && diff < 24 * 60 * 60 * 1000;
    }).length;

    const totalEl = document.getElementById('memoStatTotal');
    const pendingEl = document.getElementById('memoStatPending');
    const doneEl = document.getElementById('memoStatDone');
    const urgentEl = document.getElementById('memoStatUrgent');

    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (doneEl) doneEl.textContent = done;
    if (urgentEl) urgentEl.textContent = urgent;
}

// 切换完成状态
function toggleMemoComplete(memoId) {
    const memo = memos.find(m => m.id === memoId);
    if (memo) {
        memo.completed = !memo.completed;
        saveMemos();
        renderMemos();
    }
}

// 删除备忘
function deleteMemo(memoId) {
    if (confirm('确定删除这个备忘事项吗？')) {
        memos = memos.filter(m => m.id !== memoId);
        saveMemos();
        renderMemos();
    }
}

// 设置备忘提醒
function setMemoReminder(memo) {
    const deadline = new Date(memo.deadline);
    const reminderMap = {
        '1h': 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '3d': 3 * 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
    };

    const reminderTime = reminderMap[memo.reminder] || reminderMap['1d'];
    const remindAt = deadline.getTime() - reminderTime;

    if (remindAt > Date.now()) {
        setTimeout(() => {
            showMemoReminder(memo);
        }, remindAt - Date.now());
    }
}

// 显示备忘提醒
function showMemoReminder(memo) {
    const notification = document.createElement('div');
    notification.className = 'memo-reminder-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-title">⏰ 备忘提醒</div>
            <div class="notification-text">${memo.content}</div>
            <div class="notification-time">截止：${new Date(memo.deadline).toLocaleString('zh-CN')}</div>
            <button onclick="this.parentElement.parentElement.remove()">知道了</button>
        </div>
    `;

    document.body.appendChild(notification);

    // 5秒后自动消失
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// ========== 智能排序功能 ==========

// 智能排序备忘录
async function smartSortMemos() {
    const pendingMemos = memos.filter(m => !m.completed);

    if (pendingMemos.length === 0) {
        alert('没有待完成的备忘事项');
        return;
    }

    // 显示结果区域和加载状态
    const resultEl = document.getElementById('memoSmartResult');
    const loadingEl = document.getElementById('memoSmartLoading');
    const contentEl = document.getElementById('memoSmartContent');

    resultEl.style.display = 'block';
    loadingEl.style.display = 'block';
    contentEl.innerHTML = '';

    // 构建发送给 AI 的备忘列表
    const memoList = pendingMemos.map(m => {
        const deadline = new Date(m.deadline);
        const now = new Date();
        const diff = deadline - now;
        let timeStatus = '';

        if (diff < 0) {
            timeStatus = '已过期';
        } else if (diff < 24 * 60 * 60 * 1000) {
            timeStatus = '即将到期（24小时内）';
        } else if (diff < 3 * 24 * 60 * 60 * 1000) {
            timeStatus = '3天内到期';
        } else if (diff < 7 * 24 * 60 * 60 * 1000) {
            timeStatus = '一周内到期';
        } else {
            timeStatus = '较远到期';
        }

        return `[${m.id}] ${m.content} | 截止：${m.deadline} | 优先级：${m.priority} | 分类：${m.category} | 状态：${timeStatus}`;
    }).join('\n');

    // 构建提示词
    const prompt = `请根据以下备忘事项，按照最优执行顺序进行排序，并给出执行建议。

考虑因素：
1. 截止时间紧迫程度（越紧急越优先）
2. 优先级（高>中>低）
3. 任务类型（学习/考试优先于生活/活动）
4. 任务之间的依赖关系（如果有）

当前备忘事项：
${memoList}

请严格按照以下格式返回：

===SMART_SORT_START===
执行顺序：
1. [事项ID] - [事项内容] - [建议执行时间] - [原因]
2. [事项ID] - [事项内容] - [建议执行时间] - [原因]
...

总体建议：
[针对所有事项的总体执行策略和建议]

注意事项：
[需要特别注意的事项或风险提醒]
===SMART_SORT_END===`;

    try {
        // 调用 Coze API
        const botId = COZE_CONFIG.botIds.risk;
        const userId = getOrCreateUserId();

        const result = await cozeChat(botId, userId, prompt, null, []);

        // 解析返回内容
        const smartSortMatch = result.content.match(/===SMART_SORT_START===([\s\S]*?)===SMART_SORT_END===/);

        if (smartSortMatch) {
            const smartSortContent = smartSortMatch[1].trim();
            contentEl.innerHTML = formatSmartSortResult(smartSortContent);
        } else {
            // 如果没有固定格式，直接显示原始内容
            contentEl.innerHTML = formatMessage(result.content);
        }
    } catch (error) {
        contentEl.innerHTML = `<div class="memo-smart-error">❌ AI 分析失败：${error.message}<br>请检查网络连接或稍后重试</div>`;
    } finally {
        loadingEl.style.display = 'none';
    }
}

// 格式化智能排序结果
function formatSmartSortResult(content) {
    const lines = content.split('\n');
    let html = '<div class="smart-sort-result">';

    let currentSection = '';

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.startsWith('执行顺序：')) {
            currentSection = 'order';
            html += '<div class="smart-sort-section"><h4>📋 执行顺序</h4><ol class="smart-sort-list">';
        } else if (line.startsWith('总体建议：')) {
            if (currentSection === 'order') html += '</ol></div>';
            currentSection = 'advice';
            html += '<div class="smart-sort-section"><h4>💡 总体建议</h4><div class="smart-sort-text">';
        } else if (line.startsWith('注意事项：')) {
            if (currentSection === 'advice') html += '</div></div>';
            currentSection = 'warning';
            html += '<div class="smart-sort-section"><h4>⚠️ 注意事项</h4><div class="smart-sort-text">';
        } else if (line.match(/^\d+\./)) {
            // 执行顺序列表项
            const item = line.replace(/^\d+\.\s*/, '');
            html += `<li class="smart-sort-item">${item}</li>`;
        } else if (line.startsWith('- ')) {
            // 列表项
            html += `<p class="smart-sort-bullet">• ${line.substring(2)}</p>`;
        } else if (currentSection === 'advice' || currentSection === 'warning') {
            html += `<p>${line}</p>`;
        }
    });

    // 关闭未关闭的标签
    if (currentSection === 'order') html += '</ol></div>';
    if (currentSection === 'advice' || currentSection === 'warning') html += '</div></div>';

    html += '</div>';
    return html;
}

// 关闭智能排序结果
function closeSmartResult() {
    document.getElementById('memoSmartResult').style.display = 'none';
}

// 初始化备忘录
function initMemos() {
    renderMemos();

    // 检查即将到期的备忘
    memos.forEach(memo => {
        if (!memo.completed) {
            setMemoReminder(memo);
        }
    });
}
