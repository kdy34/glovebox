-- Remote config defaults (contracts/app-config.md). Edit values in the dashboard in production.
insert into public.app_config (key, value) values
  ('monetization_enabled', 'true'),
  ('limits', '{"free":{"vehicles":1,"scans_per_month":5,"share_links":false,"insights":false},"pro":{"vehicles":null,"scans_per_month":100,"share_links":true,"insights":true}}'),
  ('pricing_display', '{"monthly":"$3.99","annual":"$24.99","trial_days":7}'),
  ('ai', '{"enabled":true,"provider":"gemini","model":"gemini-3.6-flash","timeout_ms":30000,"low_confidence":0.7}'),
  ('min_supported_version', '"1.0.0"'),
  ('support_email', '"denizbes46@gmail.com"'),
  ('legal_urls', '{"privacy":"https://glovebox-app.vercel.app/privacy","terms":"https://glovebox-app.vercel.app/terms"}')
on conflict (key) do update set value = excluded.value;
