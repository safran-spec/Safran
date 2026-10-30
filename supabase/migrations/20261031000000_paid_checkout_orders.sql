create table if not exists public.checkout_payment_drafts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  confirmation_token uuid not null unique,
  order_data jsonb not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  payment_reference text unique,
  order_id uuid unique references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.checkout_payment_drafts enable row level security;
revoke all on public.checkout_payment_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.checkout_payment_drafts to service_role;

create or replace function public.complete_stripe_checkout_draft(
  p_draft_id uuid,
  p_confirmation_token uuid,
  p_payment_reference text,
  p_amount_received bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.checkout_payment_drafts;
  order_result jsonb;
  created_order public.orders;
  created_now boolean := false;
begin
  select * into draft
  from public.checkout_payment_drafts
  where id = p_draft_id
  for update;

  if not found or draft.confirmation_token <> p_confirmation_token then
    return jsonb_build_object('error', 'checkout_draft_not_found');
  end if;

  if p_payment_reference is null
    or p_payment_reference = ''
    or coalesce(lower(p_currency), '') <> 'chf'
    or draft.order_data ->> 'total' is null
    or p_amount_received <> round((draft.order_data ->> 'total')::numeric * 100)::bigint
  then
    return jsonb_build_object('error', 'payment_amount_mismatch');
  end if;

  if draft.payment_reference is not null
    and draft.payment_reference <> p_payment_reference
  then
    return jsonb_build_object('error', 'payment_reference_mismatch');
  end if;

  if draft.order_id is not null then
    select * into created_order
    from public.orders
    where id = draft.order_id;
  else
    order_result := public.create_cash_order(
      draft.order_data || jsonb_build_object(
        'payment_status', 'paid',
        'payment_method', 'card',
        'payment_provider', 'stripe',
        'payment_reference', p_payment_reference
      ),
      draft.items
    );

    update public.orders
    set payment_status = 'paid',
        payment_method = 'card',
        payment_provider = 'stripe',
        payment_reference = p_payment_reference,
        updated_at = now()
    where id = (order_result ->> 'id')::uuid
    returning * into created_order;

    update public.checkout_payment_drafts
    set order_id = created_order.id,
        payment_reference = p_payment_reference,
        order_data = '{}'::jsonb,
        items = '[]'::jsonb
    where id = draft.id;

    created_now := true;
  end if;

  return jsonb_build_object(
    'created', created_now,
    'order', jsonb_build_object(
      'id', created_order.id,
      'order_number', created_order.order_number,
      'confirmation_token', created_order.confirmation_token,
      'total', created_order.total,
      'status', created_order.status
    )
  );
end;
$$;

revoke all on function public.complete_stripe_checkout_draft(uuid, uuid, text, bigint, text) from public;
grant execute on function public.complete_stripe_checkout_draft(uuid, uuid, text, bigint, text) to service_role;
