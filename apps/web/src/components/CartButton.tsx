'use client';

import { Button } from '@/components/ui/button';
import { cartApi, CART_QUERY_KEY } from '@/lib/inventoryCart';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';
import CartDrawer from './CartDrawer';

/** Icon+badge trigger for the persistent inventory cart (see CartDrawer) -
 * same open/ref/outside-click skeleton as AppShell's OnlineColleagues/
 * UserMenu, but opens a right-anchored drawer instead of an anchored
 * popover since the cart's contents need real space (image thumbnails,
 * qty steppers, per-line remove). */
export default function CartButton() {
  const [open, setOpen] = useState(false);

  const { data: lines } = useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: cartApi.list,
    // The badge has to stay right no matter which page adds/removes items
    // (catalog grid, another tab) - a short poll is simpler than wiring a
    // websocket event for this and cheap enough at this interval.
    refetchInterval: 15_000,
  });

  const itemCount = (lines ?? []).reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="relative rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Listado de artículos"
      >
        <ShoppingBasket className="h-5 w-5" />
        {itemCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </Button>

      <CartDrawer open={open} onClose={() => setOpen(false)} lines={lines ?? []} />
    </>
  );
}
