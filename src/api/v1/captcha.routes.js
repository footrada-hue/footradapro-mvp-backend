import express from 'express';
import svgCaptcha from 'svg-captcha';
import crypto from 'crypto';

const router = express.Router();

// 内存存储（生产环境建议用Redis）
export const captchaStore = new Map();
const CAPTCHA_EXPIRY = 5 * 60 * 1000; // 5分钟

// 清理过期验证码（每分钟执行）
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, data] of captchaStore.entries()) {
        if (data.expires < now) {
            captchaStore.delete(id);
        }
    }
}, 60 * 1000);

// 确保进程退出时清理定时器
process.on('exit', () => {
    if (cleanupInterval) clearInterval(cleanupInterval);
});

/**
 * 将 SVG 字符串转换为 base64 Data URL
 * @param {string} svgString - SVG 字符串
 * @returns {string} base64 格式的 data URL
 */
function svgToBase64(svgString) {
    // 移除 XML 声明（如果有）
    const cleanSvg = svgString.replace(/<\?xml.*?\?>/, '');
    const base64 = Buffer.from(cleanSvg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
}

/**
 * 生成图形验证码
 * GET /api/v1/captcha/generate
 * 返回 base64 格式的图片，可直接用于 <img src="...">
 */
router.get('/generate', (req, res) => {
    try {
        const captcha = svgCaptcha.create({
            size: 4,
            ignoreChars: '0o1iIlL',
            noise: 2,
            color: true,
            background: '#f0f0f0',
            width: 150,
            height: 50,
            fontSize: 60
        });

        const captchaId = crypto.randomBytes(16).toString('hex');
        const now = Date.now();

        // 存储验证码文本（小写，便于比较）
        captchaStore.set(captchaId, {
            text: captcha.text.toLowerCase(),
            expires: now + CAPTCHA_EXPIRY,
            createdAt: now
        });

        // 将 SVG 转换为 base64 格式，便于前端 <img> 标签直接使用
        const base64Image = svgToBase64(captcha.data);

        // 可选：添加 CORS 头（如果需要跨域）
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        
        res.json({
            success: true,
            data: {
                captchaId: captchaId,
                image: base64Image,
                expiresIn: CAPTCHA_EXPIRY,
                // 添加时间戳便于前端调试
                timestamp: now
            }
        });
    } catch (error) {
        console.error('[CAPTCHA] Generate error:', error);
        res.status(500).json({
            success: false,
            error: 'CAPTCHA_GENERATION_FAILED',
            message: 'Failed to generate captcha'
        });
    }
});

/**
 * 验证图形验证码
 * POST /api/v1/captcha/verify
 * Body: { captchaId, userInput }
 * 返回临时令牌，用于后续接口（如发送邮箱验证码）
 */
router.post('/verify', (req, res) => {
    const { captchaId, userInput } = req.body;

    // 参数校验
    if (!captchaId || typeof captchaId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'MISSING_CAPTCHA_ID',
            message: 'Captcha ID is required'
        });
    }

    if (!userInput || typeof userInput !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'MISSING_USER_INPUT',
            message: 'User input is required'
        });
    }

    // 查找验证码记录
    const record = captchaStore.get(captchaId);
    if (!record) {
        return res.status(400).json({
            success: false,
            error: 'CAPTCHA_NOT_FOUND',
            message: 'Captcha not found or already used'
        });
    }

    // 检查是否过期
    if (record.expires < Date.now()) {
        captchaStore.delete(captchaId);
        return res.status(400).json({
            success: false,
            error: 'CAPTCHA_EXPIRED',
            message: 'Captcha has expired, please request a new one'
        });
    }

    // 验证用户输入（不区分大小写，已统一转为小写）
    const normalizedInput = userInput.toLowerCase().trim();
    if (record.text !== normalizedInput) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_CAPTCHA',
            message: 'Incorrect captcha code'
        });
    }

    // 验证成功，删除已用的验证码（一次性使用）
    captchaStore.delete(captchaId);

    // 生成临时令牌（用于后续接口，如发送邮箱验证码）
    const tempToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + 10 * 60 * 1000; // 10分钟有效期
    
    captchaStore.set(`token:${tempToken}`, {
        verified: true,
        expires: tokenExpiry,
        verifiedAt: Date.now()
    });

    res.json({
        success: true,
        data: {
            token: tempToken,
            expiresIn: 10 * 60 * 1000,
            message: 'CAPTCHA verified successfully'
        }
    });
});

/**
 * 验证临时令牌（供其他路由使用的中间件或工具函数）
 * @param {string} token - 临时令牌
 * @returns {boolean} 是否有效
 */
export function verifyCaptchaToken(token) {
    if (!token || typeof token !== 'string') return false;
    const record = captchaStore.get(`token:${token}`);
    if (!record) return false;
    if (record.expires < Date.now()) {
        captchaStore.delete(`token:${token}`);
        return false;
    }
    return record.verified === true;
}

/**
 * 获取存储统计信息（仅用于调试/监控）
 */
export function getCaptchaStoreStats() {
    let total = 0;
    let expired = 0;
    const now = Date.now();
    
    for (const [key, data] of captchaStore.entries()) {
        total++;
        if (data.expires < now) expired++;
    }
    
    return {
        totalEntries: total,
        expiredEntries: expired,
        activeEntries: total - expired
    };
}

export default router;