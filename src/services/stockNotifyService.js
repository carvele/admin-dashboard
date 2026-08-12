import { supabase } from '../lib/supabaseClient';

/**
 * Fetch the waitlist demand aggregated by product and size.
 * Returns an array of objects: { productId, productName, size, count }
 */
export const getWaitlistDemand = async () => {
  try {
    // 1. Try querying stock_notify_requests
    const { data: requests, error } = await supabase
      .from('stock_notify_requests')
      .select('id, user_id, product_id, size, created_at');

    if (error) {
      console.error('Error fetching stock_notify_requests:', error);
      return [];
    }

    if (!requests || requests.length === 0) {
      return [];
    }

    // Extract product IDs
    const productIds = [...new Set(requests.map((r) => r.product_id).filter(Boolean))];

    // Fetch product names for these IDs
    let productNamesMap = {};
    if (productIds.length > 0) {
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      (productsData || []).forEach((p) => {
        productNamesMap[p.id] = p.name;
      });
    }

    const demandMap = {};

    requests.forEach((req) => {
      const pId = req.product_id || 'unknown';
      const key = `${pId}_${req.size || 'M'}`;
      if (!demandMap[key]) {
        demandMap[key] = {
          productId: pId,
          productName: productNamesMap[pId] || 'Product ' + (pId ? pId.slice(0, 6) : ''),
          size: req.size || 'M',
          count: 0,
        };
      }
      demandMap[key].count += 1;
    });

    return Object.values(demandMap).sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('Failed to resolve waitlist demand:', err);
    return [];
  }
};
