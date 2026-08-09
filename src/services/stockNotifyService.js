import { supabase } from '../lib/supabaseClient';

/**
 * Fetch the waitlist demand aggregated by product and size.
 * Returns an array of objects: { productId, productName, size, count }
 */
export const getWaitlistDemand = async () => {
  // Since PostgREST doesn't support GROUP BY directly, and we might not have an RPC,
  // we fetch all active requests and aggregate in memory.
  // Note: For a very large dataset, an RPC function should be used.
  const { data, error } = await supabase
    .from('stock_notify_requests')
    .select(`
      product_id,
      size,
      products (name)
    `);

  if (error) {
    console.error('Error fetching waitlist demand:', error);
    throw error;
  }

  const demandMap = {};

  (data || []).forEach(req => {
    const key = `${req.product_id}_${req.size}`;
    if (!demandMap[key]) {
      demandMap[key] = {
        productId: req.product_id,
        productName: req.products?.name || 'Unknown Product',
        size: req.size,
        count: 0
      };
    }
    demandMap[key].count += 1;
  });

  // Convert to array and sort by count descending
  return Object.values(demandMap).sort((a, b) => b.count - a.count);
};
