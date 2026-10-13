-- Preserve existing profiles while allowing verified address-search coordinates.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS address_latitude double precision,
  ADD COLUMN IF NOT EXISTS address_longitude double precision,
  ADD COLUMN IF NOT EXISTS address_source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_address_latitude_bounds') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_address_latitude_bounds
      CHECK (address_latitude IS NULL OR address_latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_address_longitude_bounds') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_address_longitude_bounds
      CHECK (address_longitude IS NULL OR address_longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_address_coordinate_pair') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_address_coordinate_pair
      CHECK ((address_latitude IS NULL) = (address_longitude IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND conname = 'profiles_address_source_matches_coordinates') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_address_source_matches_coordinates
      CHECK (
        (address_latitude IS NULL AND (address_source IS NULL OR address_source = 'manual'))
        OR (address_latitude IS NOT NULL AND address_source IS NOT NULL AND address_source = 'photon')
      );
  END IF;
END;
$$;
