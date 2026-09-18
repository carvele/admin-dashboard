import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MeasurementTable from './MeasurementTable';

describe('MeasurementTable Component', () => {
  const sampleMeasurements = {
    S: { bust: 88, waist: 70, shoulderWidth: 38 },
    M: { bust: 94, waist: 76, shoulderWidth: 40 },
    L: { bust: 100, waist: 82, shoulderWidth: 42 },
  };

  const defaultProps = {
    sizes: ['S', 'M', 'L'],
    measurements: sampleMeasurements,
    category: 'Tops',
    subCategory: 'Blouses',
    onChange: jest.fn(),
  };

  it('renders table headers with formatted metric names and size rows', () => {
    render(<MeasurementTable {...defaultProps} />);

    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Bust')).toBeInTheDocument();
    expect(screen.getByText('Waist')).toBeInTheDocument();
    expect(screen.getByText('Shoulder Width')).toBeInTheDocument();

    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();

    expect(screen.getByDisplayValue('88')).toBeInTheDocument();
    expect(screen.getByDisplayValue('70')).toBeInTheDocument();
    expect(screen.getByDisplayValue('38')).toBeInTheDocument();
  });

  it('toggles unit between CM and IN and converts values', () => {
    const TestComponent = () => {
      const [m, setM] = React.useState(sampleMeasurements);
      return <MeasurementTable {...defaultProps} measurements={m} onChange={setM} />;
    };
    render(<TestComponent />);

    const inBtn = screen.getByRole('button', { name: /^IN$/i });
    fireEvent.click(inBtn);

    // 88 cm / 2.54 = 34.6
    expect(screen.getByDisplayValue('34.6')).toBeInTheDocument();
    // 70 cm / 2.54 = 27.6
    expect(screen.getByDisplayValue('27.6')).toBeInTheDocument();

    const cmBtn = screen.getByRole('button', { name: /^CM$/i });
    fireEvent.click(cmBtn);

    expect(screen.getByDisplayValue('87.9')).toBeInTheDocument();
  });
});
