-- The workflow belongs to org 36faedec-a7ee-4c69-820c-81826b7d5d65
-- Keep that org and its members, delete the duplicates

-- Delete duplicate org_members pointing to the wrong Org A copies
DELETE FROM org_members WHERE org_id IN (
  '7f635ca7-0994-4dd5-a527-d20b25bb5e23',
  'b919ffbf-b4e6-4cfa-bb53-6c75d5732aba'
);

-- Delete duplicate Org A copies
DELETE FROM organizations WHERE id IN (
  '7f635ca7-0994-4dd5-a527-d20b25bb5e23',
  'b919ffbf-b4e6-4cfa-bb53-6c75d5732aba'
);

-- Delete duplicate Org B copies (keep only one)
DELETE FROM org_members WHERE org_id IN (
  '870d951a-9386-4f73-bba8-51de25feb8c5',
  'a325a3c3-d732-43b2-a9da-4998659d4d63'
);

DELETE FROM organizations WHERE id IN (
  '870d951a-9386-4f73-bba8-51de25feb8c5',
  'a325a3c3-d732-43b2-a9da-4998659d4d63'
);
