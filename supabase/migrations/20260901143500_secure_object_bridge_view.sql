-- Fix Supabase Database Advisor finding 0010_security_definer_view.
--
-- The object bridge is read by authenticated app clients. It must therefore
-- execute with the caller's grants and RLS policies, never with the view
-- owner's privileges. Anonymous and write access stay explicitly revoked.

DO $$
DECLARE
  view_name text;
BEGIN
  -- A later-created legacy view can otherwise silently reintroduce the same
  -- owner-rights bypass. Harden every ordinary view in the exposed schema and
  -- remove anonymous access. Existing authenticated SELECT grants are kept so
  -- the signed-in application remains compatible and underlying RLS applies.
  FOR view_name IN
    SELECT format('%I.%I', namespace.nspname, relation.relname)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', view_name);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon', view_name);
  END LOOP;
END
$$;

REVOKE ALL ON public.v_koenen_object_bridge FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_koenen_object_bridge TO authenticated;

DO $$
DECLARE
  insecure_tables text;
  insecure_views text;
BEGIN
  SELECT string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ' ORDER BY relation.relname)
  INTO insecure_tables
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relrowsecurity = false;

  IF insecure_tables IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is still disabled for: %', insecure_tables;
  END IF;

  SELECT string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ' ORDER BY relation.relname)
  INTO insecure_views
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'v'
    AND (
      has_table_privilege('anon', relation.oid, 'SELECT')
      OR has_table_privilege('authenticated', relation.oid, 'SELECT')
    )
    AND NOT COALESCE('security_invoker=true' = ANY (relation.reloptions), false);

  IF insecure_views IS NOT NULL THEN
    RAISE EXCEPTION 'Browser-readable SECURITY DEFINER views remain: %', insecure_views;
  END IF;
END
$$;
