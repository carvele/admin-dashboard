/**
 * src/pages/InventoryDashboard.jsx
 * Main inventory dashboard view
 *
 * Displays:
 *  - List of products with: name, color, pattern, dateAdded, currentStock, status badge
 *  - Pagination/infinite scroll
 *  - Per-product actions: view history, edit, add movement
 *  - Admin panel (toggle): manage color/pattern lists, edit stockBaseline
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getProductsWithStock } from '../services/inventoryService';
import StatusBadge from '../components/inventory/StatusBadge';
import StockHistoryModal from '../components/inventory/StockHistoryModal';
import AdminInventoryPanel from '../components/inventory/AdminInventoryPanel';
import InventoryStockForm from '../components/inventory/InventoryStockForm';

const InventoryDashboard = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [historyModal, setHistoryModal] = useState(false);
  const [stockFormModal, setStockFormModal] = useState(false);

  // Check if user is admin
  const isAdmin = user?.role && ['Admin', 'Owner'].includes(user.role);

  // Fetch products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        const data = await getProductsWithStock(false);
        setProducts(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load products:', err);
        setError('Failed to load inventory');
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  const handleViewHistory = (product) => {
    setSelectedProduct(product);
    setHistoryModal(true);
  };

  const handleAddMovement = (product) => {
    setSelectedProduct(product);
    setStockFormModal(true);
  };

  const handleCloseHistory = () => {
    setHistoryModal(false);
    setSelectedProduct(null);
  };

  const handleCloseStockForm = () => {
    setStockFormModal(false);
    setSelectedProduct(null);
  };

  const handleMovementAdded = async () => {
    // Refresh products list
    try {
      const data = await getProductsWithStock(false);
      setProducts(data);
    } catch (err) {
      console.error('Failed to refresh products:', err);
    }
    handleCloseStockForm();
  };

  if (loading) return <div className="inventory-dashboard loading">Loading inventory...</div>;
  if (error) return <div className="inventory-dashboard error">{error}</div>;

  return (
    <div className="inventory-dashboard">
      <div className="inventory-header">
        <h1>Inventory Dashboard</h1>
        {isAdmin && (
          <button
            className="btn btn-admin"
            onClick={() => setShowAdmin(!showAdmin)}
            aria-label={showAdmin ? 'Hide admin controls' : 'Show admin controls'}
          >
            {showAdmin ? 'Hide Admin' : 'Show Admin'}
          </button>
        )}
      </div>

      {showAdmin && isAdmin && (
        <AdminInventoryPanel products={products} onClose={() => setShowAdmin(false)} onProductUpdated={async () => setProducts(await getProductsWithStock(false))} />
      )}

      <div className="inventory-list">
        <table role="table" aria-label="Product inventory">
          <thead>
            <tr>
              <th scope="col">Product Name</th>
              <th scope="col">Color</th>
              <th scope="col">Pattern</th>
              <th scope="col">Date Added</th>
              <th scope="col">Current Stock</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty">
                  No products in inventory
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.color || '—'}</td>
                  <td>{product.pattern || 'Solid'}</td>
                  <td>
                    {product.dateAdded
                      ? new Date(product.dateAdded).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="numeric">{product.currentStock ?? 0}</td>
                  <td>
                    <StatusBadge status={product.stockStatus} />
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleViewHistory(product)}
                      aria-label={`View stock history for ${product.name}`}
                    >
                      History
                    </button>
                    {isAdmin && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleAddMovement(product)}
                        aria-label={`Add stock movement for ${product.name}`}
                      >
                        Add Movement
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedProduct && historyModal && (
        <StockHistoryModal
          product={selectedProduct}
          onClose={handleCloseHistory}
        />
      )}

      {selectedProduct && stockFormModal && (
        <InventoryStockForm
          product={selectedProduct}
          onClose={handleCloseStockForm}
          onSuccess={handleMovementAdded}
        />
      )}
    </div>
  );
};

export default InventoryDashboard;
