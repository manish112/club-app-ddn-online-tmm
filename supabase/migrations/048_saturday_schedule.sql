-- Move the recurring meeting day to Saturday (from Wednesday).
-- schedule_weekday: 0=Sun … 6=Sat. Start/end times are NOT touched here —
-- day, start time and end time are all admin-configurable in
-- Settings → Meeting Schedule, and every email/schedule reads those values
-- (or a specific meeting's own date/time).
UPDATE agenda_config
  SET schedule_weekday = 6
  WHERE id = 1;
