-- Fix Supabase linter warning 0011_function_search_path_mutable.
-- Trigger functions do not need schema lookup, so an empty search_path is safest.

alter function public.set_rent_adjustments_updated_at()
set search_path = '';

alter function public.set_property_mileage_trips_updated_at()
set search_path = '';
