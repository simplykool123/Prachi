/**
 * Two-level product taxonomy: Main category → Sub-category.
 *
 * Source of truth maintained in code (not the DB) so the UI dropdowns are
 * deterministic and require no extra round-trip. Existing products with
 * legacy category values that don't appear here continue to work — the form
 * shows the legacy value as an extra option labelled "(existing)".
 */
export type CategoryNode = {
  main: string;
  subs: string[];
};

export const CATEGORY_TREE: ReadonlyArray<CategoryNode> = [
  {
    main: 'Crystals',
    subs: [
      'Crystal Bracelets for Men & Women',
      'Tumbled Stone / Pebbles',
      'Crystal Rings',
      'Raw, Rough & Rocks',
      'Healing Necklace | Jaap Mala',
      'Healing Bags',
      'Pendants',
      'Zibu Symbols / Grabovoi Numbers',
      'Zodiac Crystal Bags',
      'Crystal Angels',
      'Crystal Sphere (Balls)',
      'Crystal Grid',
      'Crystal Pyramids',
      'Wands',
      'Personal Pocket Stone',
    ],
  },
  {
    main: 'Pyramids',
    subs: [
      'Copper Pyramid',
      'Brass Pyramid',
      'Lead Pyramid',
      'Zinc Pyramid',
      'Wooden Pyramid',
      'Jiten Pyramids',
      'Personal Pyramids',
    ],
  },
  {
    main: 'Feng Shui',
    subs: [
      'Feng Shui Products',
      'Feng Shui Crystals',
      'Feng Shui Painting',
      'Wind Chimes',
    ],
  },
  {
    main: 'Vastu & Yantras',
    subs: [
      'Vastu Remedies',
      'Vastu Yantras',
      'Vastu Enhancer',
      'Vastu Paintings',
      'Vastu Pyramid',
    ],
  },
  {
    main: 'Handicraft',
    subs: [
      'Marble & Stone Handicraft',
      'Metal Handicraft',
    ],
  },
  {
    main: 'Dowsing',
    subs: [
      'Dowsing Pendulum',
      'L Dowsing Rod',
    ],
  },
];

export const MAIN_CATEGORIES: ReadonlyArray<string> =
  CATEGORY_TREE.map(c => c.main);

export function getSubCategories(main: string): ReadonlyArray<string> {
  return CATEGORY_TREE.find(c => c.main === main)?.subs ?? [];
}

export function isKnownMainCategory(main: string | null | undefined): boolean {
  if (!main) return false;
  return CATEGORY_TREE.some(c => c.main === main);
}
