import { render, screen, fireEvent } from '@testing-library/react';
import ColorwayMediaManager, { validateColorways } from './ColorwayMediaManager';

describe('validateColorways', () => {
  test('rejects empty colorways array', () => {
    const result = validateColorways([]);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('At least one colorway is required');
  });

  test('rejects colorway with blank colorName', () => {
    const colorways = [
      { colorName: '   ', isDefault: true },
    ];
    const result = validateColorways(colorways);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('valid color name');
  });

  test('rejects duplicate normalized color names', () => {
    const colorways = [
      { colorName: 'Navy Blue', isDefault: true },
      { colorName: '  navy blue  ', isDefault: false },
    ];
    const result = validateColorways(colorways);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Duplicate color name');
  });

  test('rejects multiple default colorways', () => {
    const colorways = [
      { colorName: 'Red', isDefault: true },
      { colorName: 'Blue', isDefault: true },
    ];
    const result = validateColorways(colorways);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Only one colorway can be designated as the default');
  });

  test('accepts valid colorways configuration', () => {
    const colorways = [
      { colorName: 'Emerald Green', isDefault: true },
      { colorName: 'Ruby Red', isDefault: false },
    ];
    const result = validateColorways(colorways);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe('ColorwayMediaManager Component', () => {
  const mockColorways = [
    {
      id: 'cw-1',
      colorName: 'Navy',
      displayName: 'Midnight Navy',
      hexColor: '#000080',
      isDefault: true,
      sortOrder: 0,
      primaryImageUrl: 'https://example.com/navy1.jpg',
      images: [{ id: 'img-1', imageUrl: 'https://example.com/navy1.jpg', sortOrder: 0 }],
      pendingFiles: [],
    },
    {
      id: 'cw-2',
      colorName: 'Crimson',
      displayName: 'Ruby Crimson',
      hexColor: '#dc143c',
      isDefault: false,
      sortOrder: 1,
      primaryImageUrl: 'https://example.com/crimson1.jpg',
      images: [{ id: 'img-2', imageUrl: 'https://example.com/crimson1.jpg', sortOrder: 0 }],
      pendingFiles: [],
    },
  ];

  test('renders colorway tabs and displays active colorway details', () => {
    const handleChange = jest.fn();
    render(
      <ColorwayMediaManager
        colorways={mockColorways}
        onChange={handleChange}
        colorList={[{ name: 'Navy', hex: '#000080' }, { name: 'Crimson', hex: '#dc143c' }]}
      />
    );

    expect(screen.getByText('Midnight Navy')).toBeInTheDocument();
    expect(screen.getByText('Ruby Crimson')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Midnight Navy')).toBeInTheDocument();
  });

  test('calls onChange when switching default colorway', () => {
    const handleChange = jest.fn();
    render(
      <ColorwayMediaManager
        colorways={mockColorways}
        onChange={handleChange}
      />
    );

    // Click on Crimson tab
    fireEvent.click(screen.getByText('Ruby Crimson'));

    // Click "Set as Default"
    const setDefaultBtn = screen.getByText('Set as Default');
    fireEvent.click(setDefaultBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ colorName: 'Navy', isDefault: false }),
        expect.objectContaining({ colorName: 'Crimson', isDefault: true }),
      ])
    );
  });

  test('adds a new colorway when Add Colorway is clicked', () => {
    const handleChange = jest.fn();
    render(
      <ColorwayMediaManager
        colorways={mockColorways}
        onChange={handleChange}
        colorList={['Black', 'White']}
      />
    );

    const addBtn = screen.getByText('Add Colorway');
    fireEvent.click(addBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        ...mockColorways,
        expect.objectContaining({ colorName: 'Black', isDefault: false }),
      ])
    );
  });
});
