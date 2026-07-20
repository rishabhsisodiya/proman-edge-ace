-- Baseline: ServiceType.UNDETERMINED already exists in the DB from a prior
-- manual change (added then reverted from schema.prisma). Documenting it here
-- so migration history matches actual DB state. Not present in schema.prisma
-- going forward (Ticket.serviceType is nullable instead), left as an unused
-- enum value since Postgres cannot drop enum values without recreating the type.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'UNDETERMINED';
