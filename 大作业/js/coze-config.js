// 前端直连扣子(Coze) API 配置。
// ⚠️ 注意：令牌会暴露在前端代码里，任何人打开网页都能看到，仅适合课程演示，切勿用于正式环境。

const COZE_CONFIG = {
    token: 'pat_VmsBGPZ4yBaOzUaDSgdR37Gj2DAnwYkd4hf93iEQ9fcmnFAMDphXaQdSCGHZtkop',
    baseUrl: 'https://api.coze.cn',

    // 六大智能体的 Bot ID（在扣子智能体开发页 URL 末尾获取，留空表示未配置）
    botIds: {
        academic: '7652761851348238346',
        planning: '7652977456777265152',
        resources: '7653132071929446441',
        mental: '7653188429400113152',
        education: '7652977456777265152', // ⚠️ 须填「升学定位」Bot ID，不能与 planning 共用
        risk: '7653192016016736266'
    }
};
