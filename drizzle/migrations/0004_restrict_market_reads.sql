drop policy if exists "orders view" on public.orders;
create policy "orders view" on public.orders for select to authenticated using (user_id = auth.uid() or public.can_view_ent(enterprise_id));
drop policy if exists "trades view" on public.trades;
create policy "trades view" on public.trades for select to authenticated using (
  public.can_view_ent(enterprise_id)
  or exists (select 1 from public.orders o where o.id in (trades.buy_order, trades.sell_order) and o.user_id = auth.uid()));
drop policy if exists "fx view" on public.fx_quotes;
create policy "fx view" on public.fx_quotes for select to authenticated using (public.is_staff(auth.uid()) or created_by = auth.uid());