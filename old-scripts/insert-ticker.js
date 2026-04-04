// insert-ticker.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 連接到數據庫
const db = new Database(path.join(__dirname, 'src', 'database', 'data', 'footradapro.sqlite'));

console.log('✅ Connected to database');

// 清除現有中文數據（可選）
const clear = db.prepare('DELETE FROM ticker_messages');
const deleted = clear.run();
console.log(`✅ Cleared ${deleted.changes} existing messages`);

// 插入英文測試數據
const insert = db.prepare(`
    INSERT INTO ticker_messages (type, message, weight, created_at) 
    VALUES (?, ?, ?, datetime('now'))
`);

const messages = [
    ['auth', '⚡ U278591754W3 authorized 500 USDT on Man City vs Liverpool', 100],
    ['profit', '💰 U123456789X1 earned +120 USDT on Real Madrid vs Bayern', 100],
    ['system', '📢 Total platform volume exceeds 1,234,567 USDT', 80],
    ['auth', '⚡ U987654321Z9 authorized 1,000 USDT on Barcelona vs Atletico', 100],
    ['profit', '💰 U456789123Y5 earned +350 USDT on PSG vs Dortmund', 100],
    ['auth', '⚡ U135792468X3 authorized 200 USDT on Chelsea vs Arsenal', 100],
    ['profit', '💰 U246813579Y7 earned +75 USDT on Tottenham vs Man United', 100],
    ['system', '👥 Active users exceed 10,000', 70],
    ['auth', '⚡ U159753486Z2 authorized 750 USDT on Inter vs AC Milan', 100],
    ['profit', '💰 U951753852Y4 earned +220 USDT on Napoli vs Juventus', 100],
    ['system', '🏆 March Trading Competition Prize Pool 50,000 USDT', 90],
    ['auth', '⚡ U357159486W8 authorized 1,500 USDT on Leverkusen vs Dortmund', 100]
];

// 開始事務
db.exec('BEGIN TRANSACTION');

try {
    for (const msg of messages) {
        insert.run(msg[0], msg[1], msg[2]);
        console.log(`✅ Inserted: ${msg[1]}`);
    }
    
    db.exec('COMMIT');
    console.log('🎉 All data inserted successfully!');
    
    // 查詢驗證
    const rows = db.prepare('SELECT * FROM ticker_messages ORDER BY created_at DESC LIMIT 15').all();
    console.log('\n📊 Latest 15 messages:');
    rows.forEach(row => {
        console.log(`  ${row.message}`);
    });
    
} catch (err) {
    db.exec('ROLLBACK');
    console.error('❌ Insert failed:', err);
}

db.close();