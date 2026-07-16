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

  if (loading) {
    return (
      <div className="flex-center-vh" style={{ minHeight: '300px' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container page-animate">
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: 'var(--status-cancelled-bg)',
            color: 'var(--status-cancelled-text)',
            borderRadius: '8px',
            margin: '2rem auto',
            maxWidth: '500px',
            textAlign: 'center',
            fontWeight: 500,
            border: '1px solid rgba(153, 27, 27, 0.1)',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container page-animate">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Inventory Dashboard</h1>
          <p className="page-subtitle">Track product stock levels and administrative settings</p>
        </div>
        {isAdmin && (
          <button
            className={`btn-outline small flex-center gap-2 ${showAdmin ? 'active' : ''}`}
            onClick={() => setShowAdmin(!showAdmin)}
            style={{
              borderColor: showAdmin ? 'var(--charcoal)' : 'var(--border-color)',
              backgroundColor: showAdmin ? 'var(--beige)' : 'var(--white)',
              color: 'var(--charcoal)',
              fontWeight: 600,
            }}
            aria-label={showAdmin ? 'Hide admin controls' : 'Show admin controls'}
          >
            {showAdmin ? 'Hide Admin' : 'Show Admin'}
          </button>
        )}
      </div>

      {showAdmin && isAdmin && (
        <AdminInventoryPanel
          products={products}
          onClose={() => setShowAdmin(false)}
          onProductUpdated={async () => setProducts(await getProductsWithStock(false))}
        />
      )}

      <div className="card mt-2">
        <div className="table-container">
          <table className="table" aria-label="Product inventory">
            <thead>
              <tr>
                <th scope="col">Product Name</th>
                <th scope="col">Color</th>
                <th scope="col">Pattern</th>
                <th scope="col">Date Added</th>
                <th scope="col" className="text-right">Current Stock</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-secondary">
                    No products in inventory
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td className="font-medium">{product.name}</td>
                    <td>{product.color || '—'}</td>
                    <td>{product.pattern || 'Solid'}</td>
                    <td className="text-secondary">
                      {product.dateAdded
                        ? new Date(product.dateAdded).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="text-right font-medium" style={{ paddingRight: '1.5rem' }}>
                      {product.currentStock ?? 0}
                    </td>
                    <td>
                      <StatusBadge status={product.stockStatus} />
                    </td>
                    <td className="text-right">
                      <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn-outline small"
                          onClick={() => handleViewHistory(product)}
                          aria-label={`View stock history for ${product.name}`}
                        >
                          History
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-primary small"
                            onClick={() => handleAddMovement(product)}
                            aria-label={`Add stock movement for ${product.name}`}
                          >
                            Add Movement
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
