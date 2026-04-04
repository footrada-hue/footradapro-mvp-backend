import express from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = express.Router();

// 初始化缓存（30分钟过期）
const cache = new NodeCache({ stdTTL: 1800 });

// ==================== 1. 英超积分榜 ====================
router.get('/standings', async (req, res) => {
    const cacheKey = 'standings:premier-league';
    
    // 检查缓存
    const cached = cache.get(cacheKey);
    if (cached) {
        return res.json({
            success: true,
            source: 'cache',
            data: cached,
            timestamp: Date.now()
        });
    }
    
    try {
        const response = await axios.get('https://api.football-data.org/v4/competitions/PL/standings', {
            headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY }
        });
        
        // 提取前6名，减少数据量
        const standings = response.data.standings[0].table.slice(0, 6).map(item => ({
            position: item.position,
            team: item.team.name,
            points: item.points,
            played: item.playedGames,
            won: item.won,
            drawn: item.drawn,
            lost: item.lost,
            goalsFor: item.goalsFor,
            goalsAgainst: item.goalsAgainst,
            goalDifference: item.goalDifference
        }));
        
        // 存入缓存
        cache.set(cacheKey, standings);
        
        res.json({
            success: true,
            source: 'api',
            data: standings,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('积分榜API错误:', error.response?.data || error.message);
        
        // 返回空数据，让前端使用备用显示
        res.json({
            success: false,
            error: '获取积分榜失败',
            data: []
        });
    }
});

// ==================== 2. 混合新闻 ====================
router.get('/news', async (req, res) => {
    const { category = 'all', page = 1, limit = 6 } = req.query;
    const cacheKey = `news:${category}:${page}`;
    
    // 检查缓存
    const cached = cache.get(cacheKey);
    if (cached) {
        return res.json({
            success: true,
            source: 'cache',
            data: cached,
            timestamp: Date.now()
        });
    }
    
    try {
        // 构建查询词
        let query = 'football';
        if (category === 'transfers') {
            query = 'football transfer OR football signing OR transfer news';
        } else if (category === 'matches') {
            query = 'football match result OR football highlights OR match report';
        } else if (category === 'finance') {
            query = 'football finance OR football revenue OR club sponsorship';
        } else {
            query = 'football transfer OR football match';
        }
        
        // 并行调用两个新闻API
        const [newsApiRes, gnewsRes] = await Promise.allSettled([
            axios.get('https://newsapi.org/v2/everything', {
                params: {
                    q: query,
                    language: 'en',
                    pageSize: parseInt(limit),
                    sortBy: 'publishedAt',
                    apiKey: process.env.NEWSAPI_KEY
                },
                timeout: 5000
            }),
            axios.get('https://gnews.io/api/v4/search', {
                params: {
                    q: query,
                    lang: 'en',
                    max: parseInt(limit),
                    token: process.env.GNEWS_KEY
                },
                timeout: 5000
            })
        ]);

        // 合并文章
        let allArticles = [];
        
        // 处理NewsAPI结果
        if (newsApiRes.status === 'fulfilled' && newsApiRes.value.data.articles) {
            allArticles = allArticles.concat(
                newsApiRes.value.data.articles.map(a => ({
                    title: a.title,
                    description: a.description || a.content || '',
                    source: a.source?.name || 'NewsAPI',
                    publishedAt: a.publishedAt,
                    url: a.url,
                    imageUrl: a.urlToImage,
                    category: category
                }))
            );
        }
        
        // 处理GNews结果
        if (gnewsRes.status === 'fulfilled' && gnewsRes.value.data.articles) {
            allArticles = allArticles.concat(
                gnewsRes.value.data.articles.map(a => ({
                    title: a.title,
                    description: a.description || '',
                    source: a.source?.name || 'GNews',
                    publishedAt: a.publishedAt,
                    url: a.url,
                    imageUrl: a.image,
                    category: category
                }))
            );
        }

        // 去重（根据标题前30个字符）
        const seen = new Set();
        const uniqueArticles = allArticles
            .filter(article => {
                const key = article.title?.substring(0, 30);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
            .slice(0, parseInt(limit));

        // 存入缓存
        cache.set(cacheKey, uniqueArticles);
        
        res.json({
            success: true,
            source: 'api',
            data: uniqueArticles,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('新闻API错误:', error.message);
        res.json({
            success: false,
            error: '获取新闻失败',
            data: []
        });
    }
});

// ==================== 3. 获取球队队徽 ====================
router.get('/team-logo/:teamName', (req, res) => {
    const teamName = req.params.teamName.toLowerCase();
    
    // 队名映射到文件名
    const teamMap = {
        'arsenal': 'arsenal.png',
        'aston villa': 'aston-villa.png',
        'bournemouth': 'bournemouth.png',
        'brentford': 'brentford.png',
        'brighton': 'brighton.png',
        'burnley': 'burnley.png',
        'chelsea': 'chelsea.png',
        'crystal palace': 'crystal-palace.png',
        'everton': 'everton.png',
        'fulham': 'fulham.png',
        'liverpool': 'liverpool.png',
        'luton town': 'luton-town.png',
        'manchester city': 'manchester-city.png',
        'manchester united': 'manchester-united.png',
        'newcastle united': 'newcastle.png',
        'nottingham forest': 'nottingham-forest.png',
        'sheffield united': 'sheffield-united.png',
        'tottenham hotspur': 'tottenham.png',
        'west ham united': 'west-ham.png',
        'wolverhampton wanderers': 'wolves.png'
    };
    
    const filename = teamMap[teamName] || 'default.png';
    res.json({ logo: `/uploads/teams/${filename}` });
});

export default router;