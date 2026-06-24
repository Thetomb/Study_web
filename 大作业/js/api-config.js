const API_CONFIG = {
    // 本地开发时始终把接口请求指向后端的 3000 端口，
    // 兼容直接打开文件(file://)、Live Server(127.0.0.1:5500/localhost:5500) 等情况
    baseUrl: (function () {
        const { protocol, hostname, port, origin } = window.location;
        if (protocol === 'file:') return 'http://localhost:3000';
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        if (isLocal && port !== '3000') return `${protocol}//${hostname}:3000`;
        return origin;
    })(),

    defaultAgent: 'academic',

    agents: {
        academic: {
            id: 'academic',
            name: '学业问答',
            icon: '📚',
            description: '课程知识答疑、作业难题解析',
            welcome: '你好！我是学业问答助手，可以帮你解答课程知识、作业难题和考试重点。请问有什么学业问题？'
        },
        planning: {
            id: 'planning',
            name: '规划生成',
            icon: '📋',
            description: '个性化学习计划与时间轴',
            welcome: '你好！我是规划助手，可以帮你制定学习规划、追踪进度。告诉我你的目标和现状吧！'
        },
        resources: {
            id: 'resources',
            name: '资源推荐',
            icon: '🎯',
            description: '优质课程、书籍、讲座推荐',
            welcome: '你好！我是资源推荐助手，可以为你匹配优质学习资源。你想学习什么方向？'
        },
        mental: {
            id: 'mental',
            name: '心理支持',
            icon: '❤️',
            description: '压力疏导与情绪支持',
            welcome: '你好，我在这里陪伴你。无论学习压力还是情绪困扰，都可以和我聊聊。今天感觉怎么样？'
        },
        education: {
            id: 'education',
            name: '升学定位',
            icon: '🎓',
            description: '保研/考研/就业路径分析',
            welcome: '你好！我是升学定位助手，可以帮你分析保研、考研或就业路径。说说你的背景和想法吧！'
        },
        risk: {
            id: 'risk',
            name: '学伴小助手',
            icon: '🔔',
            description: '毕业进度追踪 + 备忘录 + 智能提醒',
            welcome: '你好！我是学伴小助手，可以帮你追踪毕业进度、管理备忘事项、发送智能提醒。告诉我你的个人信息，我来帮你分析毕业要求差距吧！'
        }
    },

    scenarioMap: {
        '学业问答': 'academic',
        '规划生成': 'planning',
        '个性化规划': 'planning',
        '资源推荐': 'resources',
        '心理支持': 'mental',
        '升学定位': 'education',
        '风险预警': 'risk',
        '学业诊断': 'risk',
        '学伴小助手': 'risk',
        '备忘录': 'risk'
    },

    scenarioPrompts: {
        '学业问答': '帮我解答学业上的问题',
        '规划生成': '帮我制定学习规划',
        '资源推荐': '推荐一些学习资源',
        '心理支持': '我需要心理支持',
        '升学定位': '帮我评估升学方向',
        '风险预警': '检查我的学习进度',
        '学伴小助手': '查看我的毕业进度',
        '备忘录': '添加备忘事项'
    }
};
