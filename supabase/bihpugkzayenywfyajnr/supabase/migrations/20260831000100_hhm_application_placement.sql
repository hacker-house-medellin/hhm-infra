-- Generated from the hhm-lib-core declarative schema with
-- declarative-postgres-migrate (dpm). This additive provider overlay stores
-- sensitive placement answers behind the existing service-role-only policy.

BEGIN;

ALTER TABLE public.hhm_applications
  ADD COLUMN IF NOT EXISTS allergy_notes varchar(2000),
  ADD COLUMN IF NOT EXISTS noise_sensitivity varchar(32) NOT NULL,
  ADD COLUMN IF NOT EXISTS light_sensitivity varchar(32) NOT NULL,
  ADD COLUMN IF NOT EXISTS room_preference_notes varchar(2000),
  ADD COLUMN IF NOT EXISTS roommate_preference varchar(32) NOT NULL,
  ADD COLUMN IF NOT EXISTS preferred_room_occupancy smallint NOT NULL,
  ADD COLUMN IF NOT EXISTS roommate_for_lower_cost boolean NOT NULL,
  ADD COLUMN IF NOT EXISTS roommate_for_social_connection boolean NOT NULL,
  ADD COLUMN IF NOT EXISTS accommodation_data_consent boolean NOT NULL;

ALTER TABLE public.hhm_applications
  ADD CONSTRAINT hhm_applications_accommodation_consent
    CHECK (accommodation_data_consent) NOT VALID,
  ADD CONSTRAINT hhm_applications_light_sensitivity
    CHECK (light_sensitivity IN ('none', 'low', 'moderate', 'high', 'prefer_not_to_say')) NOT VALID,
  ADD CONSTRAINT hhm_applications_noise_sensitivity
    CHECK (noise_sensitivity IN ('none', 'low', 'moderate', 'high', 'prefer_not_to_say')) NOT VALID,
  ADD CONSTRAINT hhm_applications_room_occupancy
    CHECK (preferred_room_occupancy BETWEEN 1 AND 3) NOT VALID,
  ADD CONSTRAINT hhm_applications_roommate_preference
    CHECK (roommate_preference IN ('private_room', 'open_to_roommates', 'prefer_roommates', 'flexible')) NOT VALID;

ALTER TABLE public.hhm_applications VALIDATE CONSTRAINT hhm_applications_accommodation_consent;
ALTER TABLE public.hhm_applications VALIDATE CONSTRAINT hhm_applications_light_sensitivity;
ALTER TABLE public.hhm_applications VALIDATE CONSTRAINT hhm_applications_noise_sensitivity;
ALTER TABLE public.hhm_applications VALIDATE CONSTRAINT hhm_applications_room_occupancy;
ALTER TABLE public.hhm_applications VALIDATE CONSTRAINT hhm_applications_roommate_preference;

COMMIT;
