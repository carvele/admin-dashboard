import React, { useState } from 'react';
import { Search, Plus, Download, PackageOpen, Package, AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument, deleteDocument, logAction } from '../firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import './Inventory.css';

const Inventory = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const unsub = subscribeToCollection('inventory', (data) => {
      setInventory(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [restockModal, setRestockModal] = useState(null);  // inv item or null
  const [editModal, setEditModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Form state
  const [restockQty, setRestockQty] = useState('');
  const [editForm, setEditForm] = useState({ total: '', reserved: '', available: '' });

  // Derived stats
  const totalItems = inventory.length;
  const totalStock = inventory.reduce((sum, i) => sum + i.total, 0);
  const totalReserved = inventory.reduce((sum, i) => sum + i.reserved, 0);
  const lowStockCount = inventory.filter(i => i.available === 0 || (i.available / i.total) <= 0.2).length;

  const filteredInv = inventory.filter(item =>
    (item.item || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (item.id || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const getStockStatus = (available, total) => {
    if (total === 0) return { label: 'No Stock', color: 'var(--stock-low)' };
    const ratio = available / total;
    if (available === 0) return { label: 'Out of Stock', color: 'var(--stock-low)' };
    if (ratio <= 0.2) return { label: 'Low Stock', color: 'var(--stock-low)' };
    if (ratio <= 0.5) return { label: 'Medium', color: 'var(--stock-med)' };
    return { label: 'Healthy', color: 'var(--stock-high)' };
  };

  // --- ACTIONS ---
  const syncProductStock = async (productDocId, sku, changedInventoryItemDocId, newAvailableValue) => {
    try {
      const allSizes = inventory.filter(i => (i.productDocId || i.sku) === (productDocId || sku));
      let newTotalStock = 0;
      let actualProdDocId = productDocId;
      
      allSizes.forEach(s => {
        if (s.docId === changedInventoryItemDocId) {
          if (newAvailableValue !== null) {
            newTotalStock += newAvailableValue;
          }
        } else {
          newTotalStock += s.available;
        }
        if(!actualProdDocId && s.productDocId) actualProdDocId = s.productDocId;
      });

      if (!actualProdDocId) {
        const { getCollection } = await import('../firebase/firestore');
        const prods = await getCollection('products');
        const match = prods.find(p => p.id === sku); // item.id is sku
        if (match) actualProdDocId = match.docId;
      }

      if (actualProdDocId) {
        await updateDocument('products', actualProdDocId, { stock: newTotalStock });
      }
    } catch(err) {
      console.error("Failed to sync total stock to product:", err);
    }
  };

  const handleRestock = async (e) => {
    e.preventDefault();
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    
    try {
      await updateDocument('inventory', restockModal.docId, {
        total: restockModal.total + qty,
        available: restockModal.available + qty
      });
      await syncProductStock(restockModal.productDocId, restockModal.sku, restockModal.docId, restockModal.available + qty);
      await logAction(user, 'Restocked inventory item', { itemName: restockModal.item, size: restockModal.size, qtyAdded: qty });
      toast.success(`Restocked ${restockModal.item} (${restockModal.size}) +${qty} units`);
      setRestockModal(null);
      setRestockQty('');
    } catch(e) {
      toast.error('Failed to restock items');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    const t = parseInt(editForm.total), r = parseInt(editForm.reserved);
    if (isNaN(t) || isNaN(r) || t < 0 || r < 0) { toast.error('Enter valid numbers'); return; }
    if (r > t) { toast.error('Reserved cannot exceed total'); return; }
    
    try {
      await updateDocument('inventory', editModal.docId, {
        total: t,
        reserved: r,
        available: t - r
      });
      await syncProductStock(editModal.productDocId, editModal.sku, editModal.docId, t - r);
      await logAction(user, 'Updated inventory item details', { itemName: editModal.item, size: editModal.size });
      toast.success(`Updated ${editModal.item} (${editModal.size})`);
      setEditModal(null);
    } catch(e) {
      toast.error('Failed to update inventory');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDocument('inventory', deleteConfirm.docId);
      await syncProductStock(deleteConfirm.productDocId, deleteConfirm.sku, deleteConfirm.docId, 0); // available becomes 0 for deleted sizes
      await logAction(user, 'Deleted inventory item', { itemName: deleteConfirm.item, size: deleteConfirm.size });
      toast.success(`Removed ${deleteConfirm.item} (${deleteConfirm.size}) from inventory`);
      setDeleteConfirm(null);
    } catch(e) {
      toast.error('Failed to delete item from inventory');
    }
  };


  const openEditModal = (inv) => {
    setEditForm({ total: inv.total, reserved: inv.reserved, available: inv.available });
    setEditModal(inv);
  };

  const handleExportCSV = () => {
    const header = 'SKU,Product,Category,Size,Total,Reserved,Available\n';
    const rows = inventory.map(i => `${i.id},${i.item},${i.category},${i.size},${i.total},${i.reserved},${i.available}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory_export.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Inventory exported as CSV');
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p className="page-subtitle">Track stock levels and quantities per size across all products</p>
        </div>
        <div className="flex-center gap-2">
          <button className="btn-outline flex-center gap-2" onClick={handleExportCSV}>
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      <div className="inv-summary-grid">
        <div className="card inv-stat-card">
          <div className="icon-bg-soft blue"><PackageOpen size={24}/></div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Unique Items</p>
            <h3>{totalItems}</h3>
          </div>
        </div>
        <div className="card inv-stat-card">
          <div className="icon-bg-soft green"><PackageOpen size={24}/></div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Stock Units</p>
            <h3>{totalStock.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card inv-stat-card">
          <div className="icon-bg-soft orange"><PackageOpen size={24}/></div>
          <div className="inv-stat-content">
            <p className="stat-label">Reserved Units</p>
            <h3>{totalReserved.toLocaleString()}</h3>
          </div>
        </div>
        <div className={`card inv-stat-card ${lowStockCount > 0 ? 'border-danger' : ''}`}>
          <div className="icon-bg-soft red"><AlertTriangle size={24}/></div>
          <div className="inv-stat-content">
            <p className="stat-label text-danger font-medium">Low Stock Alerts</p>
            <h3 className="text-danger">{lowStockCount}</h3>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search SKU or Product Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="table-container">
          <table className="table inv-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Size</th>
                <th className="text-right">Total</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Available</th>
                <th>Stock Level</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="text-center py-8 text-secondary">Loading inventory...</td></tr>
              ) : filteredInv.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-8 text-secondary">No inventory items found</td></tr>
              ) : (
                filteredInv.map(inv => {
                  const status = getStockStatus(inv.available, inv.total);
                  const percent = inv.total > 0 ? (inv.available / inv.total) * 100 : 0;

                  return (
                    <tr key={`${inv.id}-${inv.size}`}>
                      <td className="font-mono text-xs text-secondary">{inv.sku || inv.id}</td>
                      <td className="font-medium">{inv.item}</td>
                      <td>{inv.category}</td>
                      <td><span className="size-badge">{inv.size}</span></td>
                      <td className="text-right">{inv.total}</td>
                      <td className="text-right text-secondary">{inv.reserved}</td>
                      <td className="text-right font-medium">{inv.available}</td>
                      <td>
                        <div className="stock-progress-container">
                          <div className="stock-progress-bar">
                            <div className="stock-progress-fill" style={{width: `${percent}%`, backgroundColor: status.color}}></div>
                          </div>
                          <span className="stock-status-label" style={{color: status.color}}>{status.label}</span>
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="action-buttons justify-end">
                          <button className="icon-btn-small restock-btn" title="Restock" onClick={() => { setRestockModal(inv); setRestockQty(''); }}>
                            <Package size={15} />
                          </button>
                          <button className="icon-btn-small" title="Edit" onClick={() => openEditModal(inv)}>
                            <Edit size={15} />
                          </button>
                          <button className="icon-btn-small text-danger" title="Delete" onClick={() => setDeleteConfirm(inv)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== RESTOCK MODAL ===== */}
      {restockModal && (
        <div className="modal-overlay" onClick={() => setRestockModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400}}>
            <div className="modal-header">
              <h2>Restock Item</h2>
              <button className="close-btn" onClick={() => setRestockModal(null)}>&times;</button>
            </div>
            <form className="modal-body" onSubmit={handleRestock}>
              <div className="restock-item-info">
                <strong>{restockModal.item}</strong>
                <span className="size-badge">{restockModal.size}</span>
              </div>
              <p className="text-secondary text-sm">Current Stock: <strong>{restockModal.available}</strong> / {restockModal.total}</p>
              <div className="form-group">
                <label className="label">Quantity to Add</label>
                <input type="number" className="input-field" min="1" placeholder="Enter quantity" value={restockQty} onChange={e => setRestockQty(e.target.value)} autoFocus required />
              </div>
              {restockQty && parseInt(restockQty) > 0 && (
                <div className="restock-preview">
                  New Total: <strong>{restockModal.total + parseInt(restockQty)}</strong> &nbsp;|&nbsp;
                  New Available: <strong>{restockModal.available + parseInt(restockQty)}</strong>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setRestockModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm Restock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT STOCK MODAL ===== */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 420}}>
            <div className="modal-header">
              <h2>Edit Stock — {editModal.item} ({editModal.size})</h2>
              <button className="close-btn" onClick={() => setEditModal(null)}>&times;</button>
            </div>
            <form className="modal-body" onSubmit={handleEdit}>
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="label">Total Units</label>
                  <input type="number" className="input-field" min="0" value={editForm.total} onChange={e => setEditForm({ ...editForm, total: e.target.value, available: Math.max(0, parseInt(e.target.value || 0) - parseInt(editForm.reserved || 0)) })} required />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Reserved</label>
                  <input type="number" className="input-field" min="0" value={editForm.reserved} onChange={e => setEditForm({ ...editForm, reserved: e.target.value, available: Math.max(0, parseInt(editForm.total || 0) - parseInt(e.target.value || 0)) })} required />
                </div>
              </div>
              <div className="restock-preview">
                Calculated Available: <strong>{Math.max(0, parseInt(editForm.total || 0) - parseInt(editForm.reserved || 0))}</strong>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ===== DELETE CONFIRM ===== */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 380, textAlign: 'center', padding: '2rem'}}>
            <div className="delete-icon-wrap"><Trash2 size={32} /></div>
            <h2>Delete Item?</h2>
            <p className="text-secondary mt-2">Remove <strong>{deleteConfirm.item} ({deleteConfirm.size})</strong> from inventory? This cannot be undone.</p>
            <div className="modal-footer justify-center mt-4">
              <button className="btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
