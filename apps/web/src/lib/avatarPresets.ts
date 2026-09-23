import {
  Bird,
  Bug,
  Carrot,
  Cat,
  Cherry,
  CloudSun,
  Clover,
  Compass,
  Crown,
  Diamond,
  Dog,
  Fish,
  Flame,
  Flower,
  Flower2,
  Gem,
  Heart,
  Leaf,
  type LucideIcon,
  Moon,
  Mountain,
  MountainSnow,
  Palmtree,
  PawPrint,
  Rabbit,
  Rainbow,
  Snail,
  Sparkles,
  Sprout,
  Squirrel,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Tent,
  TreePine,
  Trees,
  Turtle,
  Waves,
  Wheat,
  Zap,
} from 'lucide-react';

export type AvatarPresetCategory = 'plantas' | 'paisajes' | 'animales' | 'simbolos';

export interface AvatarPreset {
  key: string;
  label: string;
  icon: LucideIcon;
  category: AvatarPresetCategory;
  bg: string;
}

// Un color de fondo por preset (ciclo fijo sobre una paleta de 10, en vez de
// elegir cada uno a mano) - alcanza para que la grilla se vea variada sin
// tener que mantener una asignación manual por ícono.
const COLOR_CYCLE = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-fuchsia-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-lime-500',
];

const RAW_PRESETS: Omit<AvatarPreset, 'bg'>[] = [
  // Plantas
  { key: 'leaf', label: 'Hoja', icon: Leaf, category: 'plantas' },
  { key: 'flower2', label: 'Flor', icon: Flower2, category: 'plantas' },
  { key: 'sprout', label: 'Brote', icon: Sprout, category: 'plantas' },
  { key: 'tree-pine', label: 'Pino', icon: TreePine, category: 'plantas' },
  { key: 'trees', label: 'Bosque', icon: Trees, category: 'plantas' },
  { key: 'cherry', label: 'Cereza', icon: Cherry, category: 'plantas' },
  { key: 'clover', label: 'Trébol', icon: Clover, category: 'plantas' },
  { key: 'flower', label: 'Flor silvestre', icon: Flower, category: 'plantas' },
  { key: 'wheat', label: 'Trigo', icon: Wheat, category: 'plantas' },
  { key: 'carrot', label: 'Zanahoria', icon: Carrot, category: 'plantas' },
  // Paisajes
  { key: 'mountain', label: 'Montaña', icon: Mountain, category: 'paisajes' },
  { key: 'mountain-snow', label: 'Montaña nevada', icon: MountainSnow, category: 'paisajes' },
  { key: 'waves', label: 'Olas', icon: Waves, category: 'paisajes' },
  { key: 'sunrise', label: 'Amanecer', icon: Sunrise, category: 'paisajes' },
  { key: 'sunset', label: 'Atardecer', icon: Sunset, category: 'paisajes' },
  { key: 'palmtree', label: 'Palmera', icon: Palmtree, category: 'paisajes' },
  { key: 'tent', label: 'Campamento', icon: Tent, category: 'paisajes' },
  { key: 'rainbow', label: 'Arcoíris', icon: Rainbow, category: 'paisajes' },
  { key: 'cloud-sun', label: 'Parcialmente nublado', icon: CloudSun, category: 'paisajes' },
  { key: 'compass', label: 'Brújula', icon: Compass, category: 'paisajes' },
  // Animales
  { key: 'cat', label: 'Gato', icon: Cat, category: 'animales' },
  { key: 'dog', label: 'Perro', icon: Dog, category: 'animales' },
  { key: 'fish', label: 'Pez', icon: Fish, category: 'animales' },
  { key: 'bird', label: 'Ave', icon: Bird, category: 'animales' },
  { key: 'rabbit', label: 'Conejo', icon: Rabbit, category: 'animales' },
  { key: 'squirrel', label: 'Ardilla', icon: Squirrel, category: 'animales' },
  { key: 'turtle', label: 'Tortuga', icon: Turtle, category: 'animales' },
  { key: 'bug', label: 'Insecto', icon: Bug, category: 'animales' },
  { key: 'snail', label: 'Caracol', icon: Snail, category: 'animales' },
  { key: 'paw-print', label: 'Huella', icon: PawPrint, category: 'animales' },
  // Símbolos
  { key: 'star', label: 'Estrella', icon: Star, category: 'simbolos' },
  { key: 'heart', label: 'Corazón', icon: Heart, category: 'simbolos' },
  { key: 'zap', label: 'Rayo', icon: Zap, category: 'simbolos' },
  { key: 'moon', label: 'Luna', icon: Moon, category: 'simbolos' },
  { key: 'sun', label: 'Sol', icon: Sun, category: 'simbolos' },
  { key: 'sparkles', label: 'Destellos', icon: Sparkles, category: 'simbolos' },
  { key: 'gem', label: 'Gema', icon: Gem, category: 'simbolos' },
  { key: 'crown', label: 'Corona', icon: Crown, category: 'simbolos' },
  { key: 'flame', label: 'Llama', icon: Flame, category: 'simbolos' },
  { key: 'diamond', label: 'Diamante', icon: Diamond, category: 'simbolos' },
];

export const AVATAR_PRESETS: AvatarPreset[] = RAW_PRESETS.map((preset, index) => ({
  ...preset,
  bg: COLOR_CYCLE[index % COLOR_CYCLE.length],
}));

export const AVATAR_CATEGORY_LABELS: Record<AvatarPresetCategory, string> = {
  plantas: 'Plantas',
  paisajes: 'Paisajes',
  animales: 'Animales',
  simbolos: 'Símbolos',
};

const PRESET_PREFIX = 'preset:';

export function presetAvatarValue(key: string): string {
  return `${PRESET_PREFIX}${key}`;
}

export function parsePresetAvatar(avatarUrl: string | null | undefined): AvatarPreset | null {
  if (!avatarUrl?.startsWith(PRESET_PREFIX)) {
    return null;
  }
  const key = avatarUrl.slice(PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((p) => p.key === key) ?? null;
}
