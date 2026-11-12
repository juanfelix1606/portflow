-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('ADMIN', 'GATE_OPERATOR', 'YARD_OPERATOR');

-- CreateEnum
CREATE TYPE "container_size" AS ENUM ('TWENTY_FT', 'FORTY_FT', 'FORTY_FIVE_FT');

-- CreateEnum
CREATE TYPE "container_type" AS ENUM ('DRY', 'REEFER', 'OPEN_TOP', 'FLAT_RACK', 'TANK');

-- CreateEnum
CREATE TYPE "trade_type" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "container_status" AS ENUM ('REGISTERED', 'IN_YARD', 'STORED', 'GATE_OUT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "gate_direction" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(30) NOT NULL,
    "name" "role_name" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role_id" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" VARCHAR(30) NOT NULL,
    "container_number" VARCHAR(11) NOT NULL,
    "size" "container_size" NOT NULL,
    "type" "container_type" NOT NULL,
    "trade_type" "trade_type" NOT NULL,
    "status" "container_status" NOT NULL DEFAULT 'REGISTERED',
    "current_yard_id" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yards" (
    "id" VARCHAR(30) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "zone" VARCHAR(40) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "yards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_transactions" (
    "id" VARCHAR(30) NOT NULL,
    "container_id" VARCHAR(30) NOT NULL,
    "operator_id" VARCHAR(30) NOT NULL,
    "direction" "gate_direction" NOT NULL,
    "vehicle_plate" VARCHAR(20) NOT NULL,
    "driver_name" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_movements" (
    "id" VARCHAR(30) NOT NULL,
    "container_id" VARCHAR(30) NOT NULL,
    "actor_id" VARCHAR(30) NOT NULL,
    "previous_status" "container_status",
    "next_status" "container_status" NOT NULL,
    "from_yard_id" VARCHAR(30),
    "from_yard_code" VARCHAR(40),
    "to_yard_id" VARCHAR(30),
    "to_yard_code" VARCHAR(40),
    "description" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(30) NOT NULL,
    "actor_id" VARCHAR(30),
    "actor_email" VARCHAR(254) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "containers_container_number_key" ON "containers"("container_number");

-- CreateIndex
CREATE INDEX "containers_status_idx" ON "containers"("status");

-- CreateIndex
CREATE INDEX "containers_current_yard_id_idx" ON "containers"("current_yard_id");

-- CreateIndex
CREATE INDEX "containers_created_at_idx" ON "containers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "yards_code_key" ON "yards"("code");

-- CreateIndex
CREATE INDEX "yards_zone_idx" ON "yards"("zone");

-- CreateIndex
CREATE INDEX "yards_is_active_idx" ON "yards"("is_active");

-- CreateIndex
CREATE INDEX "gate_transactions_occurred_at_idx" ON "gate_transactions"("occurred_at");

-- CreateIndex
CREATE INDEX "gate_transactions_operator_id_occurred_at_idx" ON "gate_transactions"("operator_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "gate_transactions_container_id_direction_key" ON "gate_transactions"("container_id", "direction");

-- CreateIndex
CREATE INDEX "container_movements_container_id_occurred_at_idx" ON "container_movements"("container_id", "occurred_at");

-- CreateIndex
CREATE INDEX "container_movements_actor_id_occurred_at_idx" ON "container_movements"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_current_yard_id_fkey" FOREIGN KEY ("current_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_transactions" ADD CONSTRAINT "gate_transactions_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_transactions" ADD CONSTRAINT "gate_transactions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_from_yard_id_fkey" FOREIGN KEY ("from_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_to_yard_id_fkey" FOREIGN KEY ("to_yard_id") REFERENCES "yards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not expressible in the Prisma schema.
ALTER TABLE "yards"
    ADD CONSTRAINT "yards_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "containers"
    ADD CONSTRAINT "containers_number_format" CHECK ("container_number" ~ '^[A-Z]{3}[UJZ][0-9]{7}$');

CREATE FUNCTION iso6346_check_digit_valid(number_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    letter_values integer[] := ARRAY[
        10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24,
        25, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38
    ];
    character_value text;
    numeric_value integer;
    weighted_sum bigint := 0;
    expected_digit integer;
    position_index integer;
BEGIN
    IF number_value !~ '^[A-Z]{3}[UJZ][0-9]{7}$' THEN
        RETURN false;
    END IF;

    FOR position_index IN 1..10 LOOP
        character_value := substr(number_value, position_index, 1);
        IF character_value ~ '^[0-9]$' THEN
            numeric_value := character_value::integer;
        ELSE
            numeric_value := letter_values[ascii(character_value) - ascii('A') + 1];
        END IF;

        weighted_sum := weighted_sum
            + numeric_value * power(2::numeric, position_index - 1)::bigint;
    END LOOP;

    expected_digit := mod(weighted_sum, 11)::integer;
    IF expected_digit = 10 THEN
        expected_digit := 0;
    END IF;

    RETURN substr(number_value, 11, 1)::integer = expected_digit;
END;
$$;

ALTER TABLE "containers"
    ADD CONSTRAINT "containers_iso6346_check_digit"
    CHECK (iso6346_check_digit_valid("container_number"));

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

-- Keep operational history append-only through normal application writes.
CREATE FUNCTION prevent_history_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Rows in % are append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "container_movements_append_only"
    BEFORE UPDATE OR DELETE ON "container_movements"
    FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

CREATE TRIGGER "audit_logs_append_only"
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
