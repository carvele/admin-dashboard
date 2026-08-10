/**
 * reportExporter.js
 * Specialized Business Intelligence (BI) CSV Export Utilities
 * Generates formatted CSV files for Garment Performance and Inventory Depreciation.
 */

/**
 * Downloads a string payload as a CSV file in the browser.
 */
export const downloadCSV = (filename, csvContent) => {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export Garment Performance Report
 * Analyzes rental frequency, total revenue generated, average rental earnings,
 * and utilization rate per catalog product.
 */
export const exportGarmentPerformanceReport = (products = [], reservations = []) => {
  const productStats = new Map();

  // Initialize product entries
  products.forEach((p) => {
    productStats.set(p.id || p.docId, {
      id: p.id || p.docId,
      name: p.name || 'Unnamed Garment',
      category: p.category || p.category_name || 'Uncategorized',
      price: Number(p.price || p.rental_price || 0),
      rentalCount: 0,
      totalRevenue: 0,
      lastRentedDate: null,
    });
  });

  // Aggregate reservation line items & single product bookings
  reservations.forEach((res) => {
    const isCompletedOrActive = !['Cancelled', 'Declined', 'Expired'].includes(res.status);
    if (!isCompletedOrActive) return;

    const resDate = res.date ? new Date(res.date) : (res.createdAt ? new Date(res.createdAt) : null);

    // If reservation has items list
    if (Array.isArray(res.items) && res.items.length > 0) {
      res.items.forEach((item) => {
        const pId = item.productId || item.product_id;
        const entry = productStats.get(pId);
        if (entry) {
          entry.rentalCount += (item.quantity || 1);
          entry.totalRevenue += Number(item.price || item.unit_price || entry.price || 0) * (item.quantity || 1);
          if (resDate && (!entry.lastRentedDate || resDate > entry.lastRentedDate)) {
            entry.lastRentedDate = resDate;
          }
        }
      });
    } else if (res.productId || res.product_id) {
      const pId = res.productId || res.product_id;
      const entry = productStats.get(pId);
      if (entry) {
        entry.rentalCount += 1;
        entry.totalRevenue += Number(res.totalPrice || res.rentalPrice || entry.price || 0);
        if (resDate && (!entry.lastRentedDate || resDate > entry.lastRentedDate)) {
          entry.lastRentedDate = resDate;
        }
      }
    }
  });

  const headers = [
    'Garment ID',
    'Garment Name',
    'Category',
    'Rental Rate (PHP)',
    'Total Rental Count',
    'Total Revenue Earned (PHP)',
    'Avg Revenue per Rental (PHP)',
    'Last Rented Date',
  ];

  const rows = Array.from(productStats.values()).map((stat) => {
    const avgRev = stat.rentalCount > 0 ? stat.totalRevenue / stat.rentalCount : 0;
    const lastDateStr = stat.lastRentedDate ? stat.lastRentedDate.toISOString().split('T')[0] : 'Never Rented';
    return [
      `"${stat.id}"`,
      `"${stat.name.replace(/"/g, '""')}"`,
      `"${stat.category.replace(/"/g, '""')}"`,
      stat.price.toFixed(2),
      stat.rentalCount,
      stat.totalRevenue.toFixed(2),
      avgRev.toFixed(2),
      `"${lastDateStr}"`,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const timestamp = new Date().toISOString().split('T')[0];
  downloadCSV(`JezSy_Garment_Performance_${timestamp}.csv`, csv);
};

/**
 * Export Inventory Depreciation & ROI Report
 * Compares estimated purchase/acquisition cost against total accumulated rental revenue
 * to measure ROI % and asset wear.
 */
export const exportInventoryDepreciationReport = (products = [], reservations = []) => {
  const productStats = new Map();

  products.forEach((p) => {
    // Estimated purchase cost fallback: 3.5x single rental price if cost_price not specified
    const purchaseCost = Number(p.cost_price || p.purchaseCost || (Number(p.price || 0) * 3.5));
    productStats.set(p.id || p.docId, {
      id: p.id || p.docId,
      name: p.name || 'Unnamed Garment',
      sku: p.sku || 'N/A',
      purchaseCost,
      rentalPrice: Number(p.price || 0),
      totalWears: 0,
      accumulatedRevenue: 0,
    });
  });

  reservations.forEach((res) => {
    const isCompleted = ['Completed', 'Returned'].includes(res.status);
    if (!isCompleted) return;

    if (Array.isArray(res.items) && res.items.length > 0) {
      res.items.forEach((item) => {
        const pId = item.productId || item.product_id;
        const entry = productStats.get(pId);
        if (entry) {
          entry.totalWears += (item.quantity || 1);
          entry.accumulatedRevenue += Number(item.price || item.unit_price || entry.rentalPrice || 0) * (item.quantity || 1);
        }
      });
    } else if (res.productId || res.product_id) {
      const pId = res.productId || res.product_id;
      const entry = productStats.get(pId);
      if (entry) {
        entry.totalWears += 1;
        entry.accumulatedRevenue += Number(res.totalPrice || res.rentalPrice || entry.rentalPrice || 0);
      }
    }
  });

  const headers = [
    'Garment ID',
    'Garment Name',
    'SKU',
    'Est. Acquisition Cost (PHP)',
    'Rental Rate (PHP)',
    'Total Completed Wears',
    'Accumulated Rental Revenue (PHP)',
    'Net Profit / Loss (PHP)',
    'ROI (%)',
  ];

  const rows = Array.from(productStats.values()).map((stat) => {
    const netProfit = stat.accumulatedRevenue - stat.purchaseCost;
    const roi = stat.purchaseCost > 0 ? ((netProfit / stat.purchaseCost) * 100) : 0;

    return [
      `"${stat.id}"`,
      `"${stat.name.replace(/"/g, '""')}"`,
      `"${stat.sku}"`,
      stat.purchaseCost.toFixed(2),
      stat.rentalPrice.toFixed(2),
      stat.totalWears,
      stat.accumulatedRevenue.toFixed(2),
      netProfit.toFixed(2),
      `${roi.toFixed(1)}%`,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const timestamp = new Date().toISOString().split('T')[0];
  downloadCSV(`JezSy_Inventory_Depreciation_${timestamp}.csv`, csv);
};
