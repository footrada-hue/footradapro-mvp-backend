-- Add IP and geolocation fields to support_conversations
ALTER TABLE support_conversations ADD COLUMN ip_address VARCHAR(45);
ALTER TABLE support_conversations ADD COLUMN country_code VARCHAR(2);
ALTER TABLE support_conversations ADD COLUMN country_name VARCHAR(100);
ALTER TABLE support_conversations ADD COLUMN city VARCHAR(100);
ALTER TABLE support_conversations ADD COLUMN region VARCHAR(100);
ALTER TABLE support_conversations ADD COLUMN timezone VARCHAR(50);