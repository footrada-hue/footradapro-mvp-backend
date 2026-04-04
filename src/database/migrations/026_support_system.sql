-- ============================================
-- Support System Database Schema
-- FootRadaPro Customer Support System
-- ============================================

-- 1. Support Conversations Table
CREATE TABLE IF NOT EXISTS support_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    visitor_name VARCHAR(100) DEFAULT 'User',
    visitor_email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'normal',
    rating INTEGER DEFAULT NULL,
    first_response_at DATETIME,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Support Messages Table
CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id INTEGER NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    sender_id INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text',
    attachments TEXT,
    is_read BOOLEAN DEFAULT 0,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conv_id) REFERENCES support_conversations(id) ON DELETE CASCADE
);

-- 3. Support Admins Table
CREATE TABLE IF NOT EXISTS support_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL UNIQUE,
    max_concurrent INTEGER DEFAULT 5,
    current_concurrent INTEGER DEFAULT 0,
    is_online BOOLEAN DEFAULT 0,
    last_active_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Support Ratings Table
CREATE TABLE IF NOT EXISTS support_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conv_id) REFERENCES support_conversations(id) ON DELETE CASCADE
);

-- 5. Support Quick Reply Templates Table
CREATE TABLE IF NOT EXISTS support_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Support Operation Logs Table
CREATE TABLE IF NOT EXISTS support_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    action VARCHAR(50) NOT NULL,
    conv_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON support_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON support_messages(conv_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON support_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON support_messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_ratings_conv_id ON support_ratings(conv_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON support_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_admin_id ON support_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_logs_conv_id ON support_logs(conv_id);

-- Insert Default Quick Reply Templates (English)
INSERT OR IGNORE INTO support_templates (title, content, category) VALUES
('Welcome', '✨ Welcome! How can we help you today?', 'greeting'),
('Waiting', 'Thank you for your patience. We are working on your request.', 'waiting'),
('Resolved', 'Your issue has been resolved. Feel free to contact us if you need further assistance.', 'closing'),
('Transfer', 'Your request has been transferred to the relevant department. Please wait a moment.', 'transfer'),
('FAQ - Deposit', 'For deposit-related questions, please check our deposit guide.', 'faq'),
('FAQ - Withdrawal', 'Withdrawals are typically processed within 24 hours.', 'faq');