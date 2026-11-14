-- SCHEMA §4.1: the single heartbeat row (id = 1) written by the deep health check and the cron.
INSERT INTO "refund"."system_heartbeat" ("id", "origin") VALUES (1, 'migration') ON CONFLICT DO NOTHING;
