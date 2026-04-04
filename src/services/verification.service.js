/**
 * Verification Code Service
 * 用于存储和验证临时验证码（如忘记密码、邮箱验证等）
 * 
 * 生产环境建议：使用 Redis 替代内存存储
 */

// 验证码存储（生产环境应使用 Redis，这里用内存 Map 作为演示）
// TODO: 生产环境替换为 Redis
const verificationCodes = new Map();

// 验证码有效期（毫秒）
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10分钟

// 发送频率限制（同一用户60秒内只能发送一次）
const RATE_LIMIT_MS = 60 * 1000; // 60秒

// 记录发送时间（防止刷接口）
const lastSendTime = new Map();

/**
 * 生成随机数字验证码
 * @returns {string} 6位数字验证码
 */
export function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 检查发送频率限制
 * @param {string} userId - 用户ID
 * @returns {object} { allowed: boolean, remainingSeconds: number }
 */
export function canSendCode(userId) {
    const key = `${userId}:send`;
    const lastTime = lastSendTime.get(key);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
        const remainingSeconds = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000);
        return { allowed: false, remainingSeconds };
    }
    return { allowed: true };
}

/**
 * 记录发送时间
 * @param {string} userId - 用户ID
 */
export function recordSendTime(userId) {
    const key = `${userId}:send`;
    lastSendTime.set(key, Date.now());
    // 1分钟后自动清除记录
    setTimeout(() => {
        if (lastSendTime.get(key) === Date.now()) {
            lastSendTime.delete(key);
        }
    }, RATE_LIMIT_MS);
}

/**
 * 存储验证码
 * @param {string} userId - 用户ID
 * @param {string} type - 验证码类型（如 'reset_paypassword'）
 * @returns {string} 生成的验证码
 */
export function storeVerificationCode(userId, type = 'reset_paypassword') {
    const code = generateCode();
    const key = `${userId}:${type}`;
    
    verificationCodes.set(key, {
        code,
        expiresAt: Date.now() + CODE_EXPIRY_MS,
        attempts: 0,
        type,
        createdAt: Date.now()
    });
    
    // 清理过期验证码
    setTimeout(() => {
        const stored = verificationCodes.get(key);
        if (stored && Date.now() > stored.expiresAt) {
            verificationCodes.delete(key);
        }
    }, CODE_EXPIRY_MS);
    
    return code;
}

/**
 * 验证验证码
 * @param {string} userId - 用户ID
 * @param {string} code - 用户输入的验证码
 * @param {string} type - 验证码类型
 * @returns {boolean} 是否有效
 */
export function verifyCode(userId, code, type = 'reset_paypassword') {
    const key = `${userId}:${type}`;
    const stored = verificationCodes.get(key);
    
    if (!stored) {
        return false;
    }
    
    // 检查是否过期
    if (Date.now() > stored.expiresAt) {
        verificationCodes.delete(key);
        return false;
    }
    
    // 检查尝试次数（最多5次，防止暴力破解）
    if (stored.attempts >= 5) {
        verificationCodes.delete(key);
        return false;
    }
    
    // 验证码匹配
    if (stored.code !== code) {
        stored.attempts++;
        verificationCodes.set(key, stored);
        return false;
    }
    
    // 验证成功，删除验证码（一次性使用）
    verificationCodes.delete(key);
    return true;
}

/**
 * 获取验证码信息（调试用，生产环境应禁用）
 */
export function getCodeInfo(userId, type = 'reset_paypassword') {
    // 生产环境返回 null
    if (process.env.NODE_ENV === 'production') {
        return null;
    }
    
    const key = `${userId}:${type}`;
    const stored = verificationCodes.get(key);
    
    if (!stored) return null;
    
    return {
        code: stored.code,
        expiresIn: Math.max(0, stored.expiresAt - Date.now()),
        attempts: stored.attempts
    };
}

/**
 * 清理所有过期的验证码和发送记录
 */
export function cleanupExpiredCodes() {
    const now = Date.now();
    
    // 清理验证码
    for (const [key, value] of verificationCodes.entries()) {
        if (now > value.expiresAt) {
            verificationCodes.delete(key);
        }
    }
    
    // 清理发送记录
    for (const [key, time] of lastSendTime.entries()) {
        if (now - time > RATE_LIMIT_MS) {
            lastSendTime.delete(key);
        }
    }
}

// 每5分钟清理一次过期数据
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);

// 导出限流函数供路由使用
export const rateLimit = {
    canSendCode,
    recordSendTime
};