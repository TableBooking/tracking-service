-- Runtime may inspect migration state but cannot change it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tracking_app') THEN
    REVOKE INSERT, UPDATE, DELETE ON tracking.schema_migrations FROM tracking_app;
    GRANT SELECT ON tracking.schema_migrations TO tracking_app;
  END IF;
END $$;
