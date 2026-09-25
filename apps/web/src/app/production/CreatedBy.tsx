import { UserAvatar } from '@/components/UserAvatar';
import type { ProductionOrder } from '@/lib/production';

/** Quién generó una orden de producción (avatar + nombre) - varios
 * usuarios trabajan sobre el mismo panel de Producción. Las órdenes de
 * antes de que existiera createdBy muestran "—". */
export default function CreatedBy({
  user,
  size = 22,
}: {
  user: ProductionOrder['createdBy'];
  size?: number;
}) {
  if (!user) {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = user.name ?? user.email;
  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={user.email}>
      <UserAvatar avatarUrl={user.avatarUrl} name={user.name} email={user.email} size={size} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
