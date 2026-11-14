-- SCHEMA §2.10: findings.law_change_id is a logical FK in the TS (avoids the analyses.ts ↔ law.ts
-- import cycle); the constraint lives here.
ALTER TABLE "refund"."findings"
  ADD CONSTRAINT "findings_law_change_fk" FOREIGN KEY ("law_change_id")
  REFERENCES "refund"."law_changes"("id") ON DELETE SET NULL;
