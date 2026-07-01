-- Добавить поле website в таблицу profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT;
