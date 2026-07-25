import fetch from 'node-fetch';

const API_KEY = 'sk-47d079e9db0d4ac0be35f8935e2dc6ad';
const API_URL = 'https://api.deepseek.com/chat/completions';

async function testWorldCup() {
    console.log('🏆 测试获取 2026年6月25日 世界杯赛程...\n');
    
    const prompt = `请搜索 2026年6月25日 的 FIFA World Cup 2026 比赛。
    
请返回 JSON 格式：
{"matches": [{"league": "FIFA World Cup 2026", "home_team": "主队", "away_team": "客队", "match_time_utc": "2026-06-25 16:00:00"}]}

如果搜不到，返回 {"matches": []}。`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '使用联网搜索获取真实比赛数据。只返回JSON。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 8192,
                enable_search: true
            })
        });
        
        console.log('响应状态:', response.status);
        const data = await response.json();
        console.log('DeepSeek 返回:', data.choices[0].message.content);
        console.log('\nToken 使用:', data.usage);
    } catch (err) {
        console.error('❌ 请求失败:', err.message);
    }
}

testWorldCup();