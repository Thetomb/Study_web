// 浏览器直连扣子(Coze) API：创建对话 → 轮询状态 → 取回复。与原后端逻辑等价。

function cozeHeaders() {
    return {
        Authorization: `Bearer ${COZE_CONFIG.token}`,
        'Content-Type': 'application/json'
    };
}

async function cozeRequest(url, options) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (data.code !== 0) {
        throw new Error(data.msg || `Coze API 错误 (code: ${data.code})`);
    }
    return data;
}

function cozeSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 上传文件到 Coze，返回 { file_id, file_name, file_type }
async function cozeUploadFile(file) {
    const base = COZE_CONFIG.baseUrl;
    const formData = new FormData();
    formData.append('file', file);

    console.log('[Coze Upload] 上传文件:', file.name, '大小:', file.size, '类型:', file.type);

    const res = await fetch(`${base}/v1/files/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${COZE_CONFIG.token}`
        },
        body: formData
    });

    const data = await res.json();
    console.log('[Coze Upload] 响应:', JSON.stringify(data));

    if (data.code !== 0) {
        throw new Error(data.msg || `文件上传失败 (code: ${data.code})`);
    }

    // 判断文件类型：图片用 'image'，其他用 'file'
    const isImage = file.type.startsWith('image/');
    const fileType = isImage ? 'image' : 'file';

    console.log('[Coze Upload] 上传成功, file_id:', data.data.id, 'file_type:', fileType);
    return {
        file_id: data.data.id,
        file_name: data.data.file_name || file.name,
        file_type: fileType
    };
}

// 与某个 bot 对话，返回 { content, conversationId }
// fileInfos: 可选的文件信息数组 [{file_id, file_type}]，用于发送带附件的消息
async function cozeChat(botId, userId, message, conversationId, fileInfos = []) {
    const base = COZE_CONFIG.baseUrl;
    const chatUrl = conversationId
        ? `${base}/v3/chat?conversation_id=${conversationId}`
        : `${base}/v3/chat`;

    console.log('[Coze Chat] botId:', botId, 'message:', message?.substring(0, 50), 'fileInfos:', fileInfos);

    // 构建消息内容：如果有文件，根据类型选择格式
    let messageContent;
    let contentType = 'text';

    if (fileInfos.length > 0) {
        // 检查是否只有单个图片文件（无文字）
        const hasOnlyOneImage = fileInfos.length === 1 && fileInfos[0].file_type === 'image' && !message;
        
        if (hasOnlyOneImage) {
            // 单张图片：直接使用 image 类型
            messageContent = fileInfos[0].file_id;
            contentType = 'image';
            console.log('[Coze Chat] 使用 image 格式, file_id:', messageContent);
        } else {
            // 多文件或图文混合：使用 object_string 格式
            const contentParts = [];
            
            // 添加文件引用
            fileInfos.forEach(fileInfo => {
                contentParts.push({
                    type: fileInfo.file_type || 'file',
                    file_id: fileInfo.file_id
                });
            });
            
            // 添加文本内容
            if (message) {
                contentParts.push({
                    type: 'text',
                    text: message
                });
            }
            
            messageContent = JSON.stringify(contentParts);
            contentType = 'object_string';
            console.log('[Coze Chat] 使用 object_string 格式, content:', messageContent);
        }
    } else {
        messageContent = message;
    }

    const requestBody = {
        bot_id: botId,
        user_id: userId || 'zhixuetong_user',
        stream: false,
        auto_save_history: true,
        additional_messages: [
            { role: 'user', content: messageContent, content_type: contentType }
        ]
    };

    console.log('[Coze Chat] 请求体:', JSON.stringify(requestBody));

    const createData = await cozeRequest(chatUrl, {
        method: 'POST',
        headers: cozeHeaders(),
        body: JSON.stringify(requestBody)
    });

    const chatId = createData.data.id;
    const convId = createData.data.conversation_id;
    let status = createData.data.status || 'in_progress';
    let attempts = 0;

    while (status === 'in_progress' && attempts < 90) {
        await cozeSleep(1000);
        const retrieveData = await cozeRequest(
            `${base}/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${convId}`,
            { headers: cozeHeaders() }
        );
        status = retrieveData.data.status;
        attempts++;
    }

    if (status === 'failed') throw new Error('智能体处理失败，请稍后重试');
    if (status === 'requires_action') throw new Error('智能体需要工具回调，当前版本暂不支持');

    const msgData = await cozeRequest(
        `${base}/v3/chat/message/list?chat_id=${chatId}&conversation_id=${convId}`,
        { headers: cozeHeaders() }
    );

    const messages = msgData.data || [];
    const answers = messages.filter(m => m.role === 'assistant' && m.type === 'answer');
    const content = answers.length ? answers[answers.length - 1].content : '抱歉，未能获取有效回复';

    return { content, conversationId: convId };
}

function cozeConfiguredCount() {
    return Object.values(COZE_CONFIG.botIds).filter(Boolean).length;
}
