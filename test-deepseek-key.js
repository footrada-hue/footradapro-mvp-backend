import fetch from 'node-fetch';

const API_KEY = 'sk-47d079e9db0d4ac0be35f8935e2dc6ad';
const API_URL = 'https://api.deepseek.com/chat/completions';

async function testKey() {
    console.log('🔍 测试 DeepSeek API Key...\n');
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            })
        });
        
        console.log('响应状态:', response.status);
        const data = await response.json();
        console.log('响应内容:', JSON.stringify(data, null, 2));
        
        if (response.status === 200) {
            console.log('\n✅ API Key 有效！');
        } else {
            console.log('\n❌ API Key 无效或有问题');
        }
    } catch (err) {
        console.error('❌ 请求失败:', err.message);
    }
}

testKey();