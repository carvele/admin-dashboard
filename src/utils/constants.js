/**
 * Product-related constants for the JezSy Admin Dashboard
 */

export const COLOR_CATEGORIES = [
  'White',
  'Gray',
  'Black',
  'Pink',
  'Red',
  'Beige',
  'Brown',
  'Yellow',
  'Green',
  'Blue',
  'Purple'
];

export const AVAILABLE_SIZES = ['One Size', 'XS', 'S', 'M', 'L', 'XL', '2XL'];

export const SEASONS = [
  'All-Season',
  'Dry Season (Summer)',
  'Wet Season (Rainy)',
  'Cool Season (-Ber Months)',
];

// Matched fuzzily (substring, singular/plural-insensitive) against a
// product's category/sub-category in MeasurementTable.jsx — so e.g. "Dress"
// already matches new sub-categories like "Casual dresses" without needing
// an entry per exact name. "Gowns" was dropped: the category it matched
// ("Ball Gowns") no longer exists in the taxonomy and nothing else contains
// that substring.
export const DEFAULT_MEASUREMENT_METRICS = {
  'Tops': ['Shoulder', 'Chest', 'Sleeve Length', 'Body Length'],
  'Bottoms': ['Waist', 'Hip', 'Thigh', 'Inseam', 'Outseam', 'Total Length'],
  'Dress': ['Bust', 'Waist', 'Hip', 'Shoulder', 'Total Length'],
  'Footwear': ['Foot Length', 'Foot Width'],
  'Outerwear': ['Shoulder', 'Chest', 'Sleeve Length', 'Total Length', 'Cuff'],
  'Bags': ['Width', 'Height', 'Depth', 'Strap Length'],
};
