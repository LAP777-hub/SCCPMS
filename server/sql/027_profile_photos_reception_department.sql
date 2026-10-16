ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='profiles'::regclass AND conname='profiles_own_avatar_path') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_own_avatar_path CHECK (
      avatar_path IS NULL OR (avatar_path LIKE id::text || '/%' AND avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
    );
  END IF;
END $$;
UPDATE profiles SET department='Reception / Front desk' WHERE role='receptionist' AND department IS DISTINCT FROM 'Reception / Front desk';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='profiles'::regclass AND conname='profiles_reception_department') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_reception_department CHECK (
      role <> 'receptionist' OR department IS NULL OR department='Reception / Front desk'
    );
  END IF;
END $$;
