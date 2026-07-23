import {
  Apple,
  CircleDot,
  Droplets,
  Dumbbell,
  Flame,
  Leaf,
  Milk,
  Sprout,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

import styles from '@/components/nutrition-visual-marker.module.css';
import { resolveNutritionVisual, type NutritionVisualKey } from '@/lib/domain/nutrition-visuals';

const ICONS: Record<NutritionVisualKey, LucideIcon> = {
  energy: Flame,
  carbohydrate: Wheat,
  fat: Droplets,
  protein: Dumbbell,
  fiber: Leaf,
  grain: Sprout,
  sugar: Apple,
  mineral: Milk,
  other: CircleDot,
};

export function NutritionVisualMarker({
  nutrientCode,
  category,
  label,
  compact = false,
}: {
  nutrientCode: string;
  category?: string | null;
  label?: string;
  compact?: boolean;
}) {
  const visual = resolveNutritionVisual(nutrientCode, category);
  const Icon = ICONS[visual.key];
  return (
    <span
      className={`${styles.marker} ${compact ? styles.compact : ''}`}
      style={{ color: visual.color, background: visual.softColor }}
      role="img"
      aria-label={label ?? visual.label}
      title={label ?? visual.label}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}
