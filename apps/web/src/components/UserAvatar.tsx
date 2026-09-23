import { parsePresetAvatar } from '@/lib/avatarPresets';
import { resolveUploadUrl } from '@/lib/inventory';
import { initials } from '@/lib/profile';

interface Props {
  avatarUrl: string | null | undefined;
  name: string | null | undefined;
  email: string;
  size?: number;
  className?: string;
}

/** Renders a User's avatar in any of its three possible shapes - a real
 * uploaded/pasted image URL, one of the picker's `preset:<key>` identifiers
 * (an icon-on-color-circle, resolved client-side only, see
 * lib/avatarPresets.ts), or the initials fallback when unset. Shared so
 * AppShell's header and the profile page never drift on how they render the
 * same three cases. */
export function UserAvatar({ avatarUrl, name, email, size = 36, className = '' }: Props) {
  const preset = parsePresetAvatar(avatarUrl);
  const style = { width: size, height: size };

  if (preset) {
    const Icon = preset.icon;
    return (
      <div
        className={`flex items-center justify-center rounded-full ${preset.bg} ${className}`}
        style={style}
      >
        <Icon className="text-white" style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2} />
      </div>
    );
  }

  if (avatarUrl) {
    return (
      <img
        src={resolveUploadUrl(avatarUrl) ?? avatarUrl}
        alt=""
        className={`rounded-full object-cover ${className}`}
        style={style}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground ${className}`}
      style={{ ...style, fontSize: size * 0.38 }}
    >
      {initials(name ?? null, email)}
    </div>
  );
}
