CREATE VIRTUAL TABLE `session_messages_fts` USING fts5(content, content='session_messages', content_rowid='id', tokenize='trigram');--> statement-breakpoint
CREATE TRIGGER `session_messages_fts_ai` AFTER INSERT ON `session_messages` WHEN new.content IS NOT NULL BEGIN
  INSERT INTO session_messages_fts(rowid, content) VALUES (new.id, new.content);
END;--> statement-breakpoint
CREATE TRIGGER `session_messages_fts_ad` AFTER DELETE ON `session_messages` WHEN old.content IS NOT NULL BEGIN
  INSERT INTO session_messages_fts(session_messages_fts, rowid, content) VALUES('delete', old.id, old.content);
END;--> statement-breakpoint
CREATE TRIGGER `session_messages_fts_au` AFTER UPDATE ON `session_messages` BEGIN
  INSERT INTO session_messages_fts(session_messages_fts, rowid, content) SELECT 'delete', old.id, old.content WHERE old.content IS NOT NULL;
  INSERT INTO session_messages_fts(rowid, content) SELECT new.id, new.content WHERE new.content IS NOT NULL;
END;--> statement-breakpoint
INSERT INTO session_messages_fts(rowid, content) SELECT id, content FROM session_messages WHERE content IS NOT NULL;
