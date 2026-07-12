/**
 * Pure functions for inventory domain logic
 * Independent of React components, Firestore, and UI
 * All functions are deterministic and unit-testable
 */

import { StockStatus, StockMovement } from '../types/inventory';

/**
 * Calculate stock status as a percentage of baseline
 * 
 * Pure function: Always returns the same result for the same inputs
 * No side effects, no external dependencies
 * 
 * Status boundaries (per inventory-domain.instructions.md):
 * - 0% → "No Stock"
 * - 1–25% → "Critical"
 * - 26–50% → "Very Low"
 * - 51–75% → "Low"
 * - 76–199% → "Healthy"
 * - ≥200% → "Overstock"
 * 
 * @param currentStock The current stock level
 * @param stockBaseline The baseline (target) stock level
 * @returns The computed StockStatus
 */
export function calculateStockStatus(
  currentStock: number,
  stockBaseline: number
): StockStatus {
  // Prevent division by zero; treat as no stock
  if (stockBaseline <= 0) {
    return StockStatus.NO_STOCK;
  }

  const percentage = (currentStock / stockBaseline) * 100;

  if (percentage === 0) {
    return StockStatus.NO_STOCK;
  }
  if (percentage <= 25) {
    return StockStatus.CRITICAL;
  }
  if (percentage <= 50) {
    return StockStatus.VERY_LOW;
  }
  if (percentage <= 75) {
    return StockStatus.LOW;
  }
  if (percentage <= 199) {
    return StockStatus.HEALTHY;
  }
  // percentage >= 200
  return StockStatus.OVERSTOCK;
}

/**
 * Calculate current stock as the sum of all stock movements
 * 
 * Pure function: Always returns the same result for the same inputs
 * No side effects, no Firestore queries
 * 
 * The currentStock is derived from movements, never stored directly.
 * Each movement contributes its `delta` (newStock - previousStock) to the total.
 * Movements are sorted newest-first in the movements array.
 * 
 * @param movements Array of StockMovement records
 * @returns The total current stock (sum of all deltas)
 */
export function calculateCurrentStock(movements: StockMovement[]): number {
  // Start from 0 (no initial stock)
  return movements.reduce((sum, movement) => sum + movement.delta, 0);
}

/**
 * Calculate stock status percentage
 * 
 * Pure function: Always returns the same result for the same inputs
 * 
 * @param currentStock The current stock level
 * @param stockBaseline The baseline (target) stock level
 * @returns The percentage (0–∞), rounded to nearest integer
 */
export function calculateStockPercentage(
  currentStock: number,
  stockBaseline: number
): number {
  if (stockBaseline <= 0) {
    return 0;
  }
  return Math.round((currentStock / stockBaseline) * 100);
}
