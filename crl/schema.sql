-- CRL | Modelo inicial de dados. PREPARADO, NAO EXECUTADO.
-- Execute exclusivamente em um projeto Supabase NOVO e independente.
-- Usuarios, perfis e instituicoes criados somente por backend administrativo seguro.
create extension if not exists pgcrypto;
create schema if not exists crl;
create type crl.role_kind as enum ('admin','monitor');
create type crl.admission_status as enum ('active','completed','requested_exit','administrative_exit','abandoned','escaped','other');
create table crl.organizations (
 id uuid primary key default gen_random_uuid(), name text not null,
 created_at timestamptz not null default now()
);
create table crl.memberships (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references crl.organizations(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null, username text not null,
 role crl.role_kind not null default 'monitor',
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,username),unique(organization_id,user_id)
);
create unique index crl_username_global on crl.memberships(lower(username));
create table crl.people (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 full_name text not null, cpf text, rg text, birth_date date, address jsonb not null default '{}',
 family_contacts jsonb not null default '[]', created_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);
create index people_org_name on crl.people(organization_id,full_name);
create unique index people_cpf_org on crl.people(organization_id,cpf) where cpf is not null;
create table crl.admissions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 person_id uuid not null references crl.people(id),
 admitted_on date not null, ended_on date,
 status crl.admission_status not null default 'active',
 exit_reason text, program_months integer not null default 9 check(program_months between 1 and 36),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 check(ended_on is null or ended_on>=admitted_on)
);
create unique index one_active_admission_per_person on crl.admissions(person_id) where status='active';
create table crl.entries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid references crl.admissions(id),
 kind text not null, details jsonb not null default '{}',
 authored_by uuid not null references auth.users(id),
 authored_at timestamptz not null default now(),
 corrects_entry_id uuid references crl.entries(id), reason_for_correction text,
 check ((corrects_entry_id is null and reason_for_correction is null) or
 (corrects_entry_id is not null and nullif(trim(reason_for_correction),'') is not null))
);
create table crl.attachments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid references crl.admissions(id), entry_id uuid references crl.entries(id),
 storage_path text not null unique, category text not null, mime_type text not null,
 uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table crl.document_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 code text not null, revision integer not null, title text not null, body text not null,
 active boolean not null default false, created_at timestamptz not null default now(),
 unique(organization_id,code,revision)
);
create table crl.issued_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid not null references crl.admissions(id), template_id uuid not null references crl.document_templates(id),
 state text not null default 'draft' check(state in ('draft','approved','issued','cancelled')),
 document_data jsonb not null default '{}', output_path text,
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now()
);
create table crl.events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 kind text not null, title text not null, leader text,
 starts_at timestamptz not null, ends_at timestamptz,
 notes text, created_by uuid references auth.users(id),
 check(ends_at is null or ends_at>=starts_at)
);
create table crl.attendance (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 event_id uuid not null references crl.events(id), admission_id uuid not null references crl.admissions(id),
 state text not null check(state in ('present','absent','late','excused')),
 justification text, registered_by uuid references auth.users(id), unique(event_id,admission_id)
);
create table crl.tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 name text not null, recurrence text not null check(recurrence in ('once','weekly','biweekly','monthly')),
 starts_on date not null, assigned_admission_id uuid references crl.admissions(id), state text not null default 'pending',
 created_by uuid references auth.users(id)
);
create table crl.medication_orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid not null references crl.admissions(id),
 medicine text not null, instructions text not null, prescription_attachment_id uuid references crl.attachments(id),
 checked_by uuid references auth.users(id), checked_at timestamptz, created_at timestamptz not null default now()
);
create table crl.medication_administrations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 order_id uuid not null references crl.medication_orders(id), scheduled_at timestamptz,
 administered_at timestamptz, status text not null, notes text,
 recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table crl.vehicles (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 label text not null, ownership text not null default 'emprestado'
);
create table crl.trips (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 vehicle_id uuid not null references crl.vehicles(id), driver text not null, purpose text not null,
 destination text, passengers jsonb not null default '[]', departure_at timestamptz not null,
 arrival_at timestamptz, odometer_start integer not null check(odometer_start>=0),
 odometer_end integer check(odometer_end is null or odometer_end>=odometer_start),
 distance_km integer generated always as (odometer_end-odometer_start) stored,
 returned_clean boolean, damages boolean, notes text,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table crl.contributions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid not null references crl.admissions(id), amount numeric(12,2) not null check(amount>=0),
 effective_from date not null, due_day smallint check(due_day between 1 and 31),
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table crl.payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 admission_id uuid not null references crl.admissions(id), amount numeric(12,2) not null check(amount>0),
 paid_on date not null, period_month date not null, recorded_by uuid references auth.users(id)
);
create table crl.inventory_movements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 product text not null, unit text not null,
 kind text not null check(kind in ('donation','purchase','consumption','adjustment')),
 quantity numeric(12,3) not null check(quantity>0), occurred_on date not null,
 donor_or_destination text, recorded_by uuid references auth.users(id)
);
create table crl.finance_movements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references crl.organizations(id),
 kind text not null check(kind in ('income','expense')), description text not null,
 amount numeric(12,2) not null check(amount>0), occurred_on date not null,
 created_by uuid references auth.users(id)
);
create table crl.audit_events (
 id bigint generated always as identity primary key, organization_id uuid not null references crl.organizations(id),
 user_id uuid references auth.users(id), action text not null,
 entity_type text not null, entity_id uuid, metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
-- All queries default-deny until server-controlled auth and RLS are finalized.
alter table crl.organizations enable row level security;
alter table crl.memberships enable row level security;
alter table crl.people enable row level security;
alter table crl.admissions enable row level security;
alter table crl.entries enable row level security;
alter table crl.attachments enable row level security;
alter table crl.document_templates enable row level security;
alter table crl.issued_documents enable row level security;
alter table crl.events enable row level security;
alter table crl.attendance enable row level security;
alter table crl.tasks enable row level security;
alter table crl.medication_orders enable row level security;
alter table crl.medication_administrations enable row level security;
alter table crl.vehicles enable row level security;
alter table crl.trips enable row level security;
alter table crl.contributions enable row level security;
alter table crl.payments enable row level security;
alter table crl.inventory_movements enable row level security;
alter table crl.finance_movements enable row level security;
alter table crl.audit_events enable row level security;
revoke all on schema crl from anon,authenticated;
-- No grants, credentials, storage policies or open APIs until security review.
