import { normalizeSizes, validateSizingMode, compareSizes } from './sizeOrder';
import {
  resolveSizingProfile,
  formatFootwearDisplay,
  classifySizeState,
} from './sizingProfiles';
import sizingFixtures from './__tests__/fixtures/sizingFixtures.json';

describe('Admin Canonical Apparel Size Normalization & Ordering', () => {
  it('reorders scrambled standard sizes: S, M, L, XL, XS -> XS, S, M, L, XL', () => {
    expect(normalizeSizes(['S', 'M', 'L', 'XL', 'XS'])).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('reorders M, S, XS, L -> XS, S, M, L', () => {
    expect(normalizeSizes(['M', 'S', 'XS', 'L'])).toEqual(['XS', 'S', 'M', 'L']);
  });

  it('reorders S, XS -> XS, S', () => {
    expect(normalizeSizes(['S', 'XS'])).toEqual(['XS', 'S']);
  });

  it('normalizes aliases before deduplication: XXL, XL, 2XL, M -> M, XL, 2XL', () => {
    expect(normalizeSizes(['XXL', 'XL', '2XL', 'M'])).toEqual(['M', 'XL', '2XL']);
  });

  it('sorts numeric shoe/clothing sizes naturally: 40, 36, 38, 37 -> 36, 37, 38, 40', () => {
    expect(normalizeSizes(['40', '36', '38', '37'])).toEqual(['36', '37', '38', '40']);
  });

  it('normalizes Free Size to One Size', () => {
    expect(normalizeSizes(['Free Size'])).toEqual(['One Size']);
    expect(normalizeSizes(['OS'])).toEqual(['One Size']);
  });

  it('flags validation warning for mixed One Size and graded sizes', () => {
    let warningLogged = '';
    normalizeSizes(['One Size', 'M'], {
      onWarning: (msg) => {
        warningLogged = msg;
      },
    });

    expect(warningLogged).toContain('One Size must be used as an exclusive sizing mode');
    const validation = validateSizingMode(['One Size', 'M']);
    expect(validation.isValid).toBe(false);
    expect(validation.hasMixedOneSize).toBe(true);
  });

  it('preserves custom/unknown labels deterministically at the end', () => {
    expect(normalizeSizes(['XS', 'Custom', 'M'])).toEqual(['XS', 'M', 'Custom']);
  });

  it('strips null, undefined, and blank strings cleanly', () => {
    expect(normalizeSizes(['S', '', null, '  ', 'M'])).toEqual(['S', 'M']);
  });

  it('correctly compares sizes via compareSizes comparator', () => {
    expect(compareSizes('XS', 'S')).toBeLessThan(0);
    expect(compareSizes('XL', 'S')).toBeGreaterThan(0);
    expect(compareSizes('M', 'M')).toBe(0);
    expect(compareSizes('One Size', 'L')).toBeLessThan(0);
  });
});

describe('Shared Parity Contract Fixtures (Admin)', () => {
  it('satisfies all taxonomy resolution fixtures', () => {
    sizingFixtures.taxonomyResolution.forEach(({ category, subCategory, productName, expectedProfile }) => {
      const actual = resolveSizingProfile(category, subCategory, productName);
      expect(actual).toBe(expectedProfile);
    });
  });

  it('satisfies all size ordering fixtures (composite, footwear, belts, hats)', () => {
    sizingFixtures.sizeOrdering.forEach(({ input, expected }) => {
      const actual = normalizeSizes(input);
      expect(actual).toEqual(expected);
    });
  });

  it('satisfies all sizing classification fixtures (three-state resolution)', () => {
    sizingFixtures.sizingClassification.forEach(({ sizes, variants, expected }) => {
      const actual = classifySizeState(sizes, variants);
      expect(actual.state).toBe(expected.state);
      expect(actual.canonicalToken).toBe(expected.canonicalToken);
      expect(actual.hideSelector).toBe(expected.hideSelector);
    });
  });

  it('satisfies all footwear formatting fixtures (reference-only helper, bare number handling)', () => {
    sizingFixtures.footwearFormatting.forEach(({ size, category, subCategory, expected }) => {
      const actual = formatFootwearDisplay(size, category);
      expect(actual.displayLabel).toBe(expected.displayLabel);
      expect(actual.approxHelper).toBe(expected.approxHelper);
      expect(actual.canonicalKey).toBe(expected.canonicalKey);
    });
  });

  it('disambiguates US Women vs US Men sizes', () => {
    expect('US W 8').not.toEqual('US M 8');
    const sorted = normalizeSizes(['US M 8', 'US W 8']);
    expect(sorted).toContain('US W 8');
    expect(sorted).toContain('US M 8');
  });

  it('preserves exact raw legacy token for OS in classifySizeState', () => {
    const res = classifySizeState(['OS']);
    expect(res.canonicalToken).toBe('OS');
    expect(res.state).toBe('TRUE_ONE_SIZE');
  });

  it('refuses to manufacture One Size from empty sizes array', () => {
    const res = classifySizeState([]);
    expect(res.state).toBe('UNAVAILABLE');
    expect(res.canonicalToken).toBeNull();
  });
});
