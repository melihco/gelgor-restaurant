-- Disable product showcase extra slots for Yula Bodrum (manifest no longer adds +2).
UPDATE brand_contexts
SET brand_theme = jsonb_set(
  COALESCE(brand_theme, '{}'::jsonb),
  '{product_showcase,enabled}',
  'false'::jsonb,
  true
)
WHERE workspace_id = '4278d8e0-10b1-409d-a658-4101dcc22632'::uuid;
