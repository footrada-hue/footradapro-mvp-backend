/**
 * FOOTRADAPRO MVP - Email Service
 * Send verification emails via Brevo - Direct Content Only (No Templates)
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import fs from 'fs';

// ==================== 修正 .env 路径 ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 正确路径：从当前文件向上三级到项目根目录的 .env
const envPath = path.join(__dirname, '../../../.env');

console.log('\n🔧 Email Service Initialization:');
console.log(`   - Current file: ${__filename}`);
console.log(`   - Current dir: ${__dirname}`);
console.log(`   - Looking for .env at: ${envPath}`);

// 检查文件是否存在
if (fs.existsSync(envPath)) {
    console.log(`   - ✅ .env file found at: ${envPath}`);
    // 加载 .env 文件
    dotenv.config({ path: envPath });
} else {
    console.log(`   - ❌ .env file NOT found at: ${envPath}`);
    // 尝试从当前目录加载
    const altPath = path.join(process.cwd(), '.env');
    console.log(`   - Trying alternative path: ${altPath}`);
    if (fs.existsSync(altPath)) {
        console.log(`   - ✅ .env file found at: ${altPath}`);
        dotenv.config({ path: altPath });
    } else {
        console.log(`   - ❌ No .env file found anywhere!`);
    }
}

console.log(`   - BREVO_API_KEY from process.env: ${process.env.BREVO_API_KEY ? '✅ Found' : '❌ Not Found'}`);
console.log(`   - SENDER_EMAIL from process.env: ${process.env.SENDER_EMAIL ? '✅ Found' : '❌ Not Found'}`);
console.log('');

// ==================== Configuration ====================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@footradapro.com';
const SENDER_NAME = 'FOOTDARAPRO';
const CODE_EXPIRE_MINUTES = 10;

// ==================== Direct HTML Content ====================
function getDirectHtmlContent(code, email = '', lang = 'en') {
    const verifyLink = `https://yourdomain.com/verify?code=${code}&email=${encodeURIComponent(email)}`;

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify Your Email</title>
</head>

<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto">

<div style="max-width:520px;margin:40px auto;background:#111827;border-radius:16px;padding:32px;color:#fff">

    <!-- Logo -->
    <h1 style="color:#f97316;margin:0 0 20px 0;">FOOTRADAPRO</h1>

    <!-- Title -->
    <h2 style="margin:0 0 10px 0;">Verify your email</h2>
    <p style="color:#9ca3af;margin-bottom:25px;">
        Enter the verification code below or click the button.
    </p>

    <!-- CODE BLOCK -->
    <div style="
        background:#1f2937;
        padding:20px;
        text-align:center;
        border-radius:12px;
        margin-bottom:25px;
        letter-spacing:8px;
        font-size:32px;
        font-weight:bold;
        color:#f97316;
        font-family:monospace;
    ">
        ${code}
    </div>

    <!-- BUTTON -->
    <a href="${verifyLink}" style="
        display:block;
        background:#f97316;
        color:#fff;
        text-align:center;
        padding:14px;
        border-radius:10px;
        text-decoration:none;
        font-weight:bold;
        margin-bottom:25px;
    ">
        Verify Email Instantly
    </a>

    <!-- Info -->
    <p style="color:#9ca3af;font-size:14px;">
        This code expires in 10 minutes. Do not share it with anyone.
    </p>

    <hr style="border:none;border-top:1px solid #374151;margin:25px 0">

    <p style="font-size:12px;color:#6b7280;">
        If you didn’t request this, you can safely ignore this email.
    </p>

</div>

</body>
</html>
`;
}

// ==================== Direct Plain Text Content ====================
function getDirectTextContent(code) {
    return `
FOOTDARAPRO

Thank you for registering with FootDaraPro. To continue, please enter the verification code on the registration screen.


Your FOOTRADAPRO verification code is:

${code}

This code expires in 10 minutes.

Please note that this code can only be used once.


Thank you,

FootDaraPro Support 


Note: Please do not reply to this email as this group is not monitored.
    `;
}

// ==================== Send via Brevo - Direct Content ====================
async function sendWithBrevo(toEmail, code) {
    // 验证 API Key
    if (!BREVO_API_KEY) {
        logger.error('BREVO_API_KEY is not configured');
        console.error('❌ BREVO_API_KEY is missing! Available env vars:', {
            BREVO_API_KEY: process.env.BREVO_API_KEY ? 'present' : 'missing',
            SENDER_EMAIL: process.env.SENDER_EMAIL ? 'present' : 'missing'
        });
        throw new Error('BREVO_API_KEY is not configured - please check your .env file');
    }

    logger.info('Preparing to send email via Brevo (direct content)', {
        to: toEmail,
        sender: SENDER_EMAIL,
        codeLength: code.length
    });

    // 直接生成内容，不依赖任何外部模板
    const htmlContent = getDirectHtmlContent(code);
    const textContent = getDirectTextContent(code);

    // 构建请求体 - 修复：添加 name 字段
    const requestBody = {
        sender: {
            name: SENDER_NAME,
            email: SENDER_EMAIL
        },
        to: [
            {
                email: toEmail,
                name: 'User'  // 必须提供 name 字段
            }
        ],
        subject: 'Verify Your Email - FOOTDARAPRO',
        htmlContent: htmlContent,
        textContent: textContent,
        tags: ['verification'],
        headers: {
            'X-Entity-Ref-ID': `verification-${Date.now()}`
        }
    };

    logger.debug('Brevo request prepared', {
        to: toEmail,
        subject: requestBody.subject,
        htmlLength: htmlContent.length,
        textLength: textContent.length
    });

    try {
        // 发送请求
        const response = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': BREVO_API_KEY,
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // 获取响应内容
        let responseData;
        const responseText = await response.text();
        
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        // 检查响应状态
        if (!response.ok) {
            // 详细的错误日志
            logger.error('Brevo API error response', {
                status: response.status,
                statusText: response.statusText,
                response: responseData,
                to: toEmail
            });
            
            // 根据状态码返回具体错误
            if (response.status === 401) {
                throw new Error('Brevo API authentication failed - invalid API key');
            } else if (response.status === 400) {
                const errorMsg = responseData?.message || 'Bad request - check email format or content';
                throw new Error(`Brevo API bad request: ${errorMsg}`);
            } else if (response.status === 402) {
                throw new Error('Brevo account payment required - check your subscription');
            } else if (response.status === 429) {
                throw new Error('Brevo rate limit exceeded - too many requests');
            } else {
                throw new Error(`Brevo API error: ${response.status} - ${response.statusText}`);
            }
        }

        // 成功日志
        logger.info('Email sent successfully via Brevo (direct content)', {
            to: toEmail,
            messageId: responseData?.messageId || 'unknown',
            messageIds: responseData?.messageIds || [],
            status: response.status
        });

        return true;

    } catch (error) {
        // 网络错误或其他异常
        logger.error('Failed to send email via Brevo', {
            to: toEmail,
            error: error.message,
            stack: error.stack,
            errorType: error.constructor.name
        });
        throw error;
    }
}

// ==================== Public API ====================
export async function sendVerificationEmail(toEmail, code) {
    // 验证邮箱参数
    if (!toEmail || typeof toEmail !== 'string') {
        logger.error('sendVerificationEmail called with invalid email', { 
            toEmail,
            type: typeof toEmail 
        });
        return false;
    }

    // 验证验证码参数
    if (!code || typeof code !== 'string') {
        logger.error('sendVerificationEmail called with invalid code', { 
            code,
            type: typeof code 
        });
        return false;
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
        logger.error('sendVerificationEmail called with malformed email', { 
            toEmail 
        });
        return false;
    }

    logger.info('Starting sendVerificationEmail process', { 
        to: toEmail,
        codeLength: code.length,
        codePreview: code.substring(0, 3) + '***',
        timestamp: new Date().toISOString()
    });

    try {
        // 发送邮件
        const result = await sendWithBrevo(toEmail, code);
        
        logger.info('sendVerificationEmail completed successfully', {
            to: toEmail,
            result
        });
        
        return result;

    } catch (err) {
        // 记录错误但不抛出，避免影响主流程
        logger.error('sendVerificationEmail failed', {
            to: toEmail,
            error: err.message,
            errorType: err.constructor.name,
            stack: err.stack
        });
        return false;
    }
}

// ==================== Test Function ====================
export async function testEmailService() {
    console.log('\n🔍 === Testing Email Service Configuration ===\n');
    
    console.log('📋 Environment Check:');
    console.log(`   - Current directory: ${process.cwd()}`);
    console.log(`   - .env path attempted: ${envPath}`);
    console.log(`   - File exists: ${fs.existsSync(envPath) ? '✅ Yes' : '❌ No'}`);
    console.log('');
    
    console.log('📋 Configuration:');
    console.log(`   - BREVO_API_KEY: ${BREVO_API_KEY ? '✅ Present' : '❌ Missing'}`);
    console.log(`   - SENDER_EMAIL: ${SENDER_EMAIL || '❌ Missing'}`);
    console.log(`   - SENDER_NAME: ${SENDER_NAME}`);
    console.log(`   - API URL: ${BREVO_API_URL}`);
    console.log('');
    
    if (!BREVO_API_KEY) {
        console.error('❌ ERROR: BREVO_API_KEY is missing!');
        console.log('\n💡 Debug Info:');
        console.log(`   - process.env.BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'present' : 'missing'}`);
        console.log(`   - process.env.SENDER_EMAIL: ${process.env.SENDER_EMAIL ? 'present' : 'missing'}`);
        console.log('\n💡 Fix: Make sure your .env file is at:');
        console.log(`   ${path.join(process.cwd(), '.env')}`);
        console.log('   And contains:');
        console.log('   BREVO_API_KEY=your_brevo_api_key_here');
        console.log('   SENDER_EMAIL=noreply@footradapro.com\n');
        return false;
    }
    
    if (!SENDER_EMAIL) {
        console.error('❌ ERROR: SENDER_EMAIL is missing!');
        return false;
    }
    
    console.log('✅ Email service configuration is valid');
    console.log('\n📧 Ready to send emails');
    console.log('   Template: Direct Content (No external templates)\n');
    
    return true;
}

// ==================== Manual Test Function ====================
export async function sendTestEmail(testEmail) {
    if (!testEmail) {
        console.error('❌ Please provide a test email');
        return false;
    }
    
    console.log(`\n📧 Sending test email to: ${testEmail}\n`);
    
    const testCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
        const result = await sendVerificationEmail(testEmail, testCode);
        
        if (result) {
            console.log('✅ Test email sent successfully!');
            console.log(`   Code: ${testCode}`);
            console.log(`   Check your inbox: ${testEmail}\n`);
        } else {
            console.error('❌ Failed to send test email\n');
        }
        
        return result;
    } catch (err) {
        console.error('❌ Error sending test email:', err.message, '\n');
        return false;
    }
}

// ==================== Export ====================
export default {
    sendVerificationEmail,
    testEmailService,
    sendTestEmail
};