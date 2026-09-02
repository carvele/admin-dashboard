/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash.debounce';
import {
  Search,
  Grid,
  List as ListIcon,
  Shirt,
  ArrowLeft,
  X,
  ExternalLink,
  ShieldCheck,
  Lock,
  Unlock,
  ShieldAlert,
} from 'lucide-react';
import { subscribeToWardrobeItems } from '../../services/wardrobeService';
import { subscribeToCustomers } from '../../services/customerService';
import { subscribeToProducts } from '../../services/productService';
import { getAvatarColor, getUserDisplayName } from '../../utils/helpers';
import PageHeader from '../../components/PageHeader';
import './DigitalWardrobe.css';

const DigitalWardrobe = () => {
  const navigate = useNavigate();
  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  const [mobileView, setMobileView] = useState('customers');
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const debouncedSearch = useCallback(
    debounce((val) => setSearchTerm(val), 300),
    []
  );

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [viewMode, setViewMode] = useState('grid');
  const [products, setProducts] = useState([]);
  
  // Subscribe to wardrobeItems (normalized top-level collection)
  React.useEffect(() => {
    const unsubItems = subscribeToWardrobeItems((data) => {
      setWardrobeItems(data);
    });
    const unsubUsers = subscribeToCustomers((data) => {
      setUsers(data);
      if (data.length > 0) {
        setActiveUserId(prevId => prevId || data[0].id);
      }
    });
    const unsubProducts = subscribeToProducts((data) => {
      setProducts(data);
    });
    return () => {
      unsubItems();
      unsubUsers();
      unsubProducts();
    };
  }, []);

  // Get the active user's details
  const activeUser = users.find((u) => u.id === activeUserId);
  const isActiveUserShared = Boolean(
    activeUser?.isWardrobeShared ||
    activeUser?.is_wardrobe_shared ||
    activeUser?.shareWardrobeWithStylists
  );

  // Group wardrobe items by userId for sidebar counts
  const itemCountByUser = wardrobeItems.reduce((acc, item) => {
    acc[item.userId] = (acc[item.userId] || 0) + 1;
    return acc;
  }, {});

  // Filter wardrobe items for the selected user
  const userItems = wardrobeItems
    .filter((item) => item.userId === activeUserId)
    .filter(
      (item) =>
        (item.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.productId || '').toLowerCase().includes(searchTerm.toLowerCase()),
    );

  const renderItemImage = (imgAsset) => {
    if (!imgAsset) return <Shirt size={36} className="text-secondary opacity-50" />;
    if (imgAsset.startsWith('http')) {
      return (
        <img
          src={imgAsset}
          alt="wardrobe-item"
          className="dw-item-img"
        />
      );
    }
    return <span className="dw-emoji view-xl">{imgAsset}</span>;
  };

  return (
    <div className="dw-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Digital Wardrobe' }]}
        category="CATALOG"
        title="Digital Wardrobe Management"
        subtitle="View items saved by customers from the app"
      />

      {/* Privacy Shield Banner */}
      <div className="dw-privacy-banner">
        <ShieldCheck size={18} className="dw-privacy-banner-icon" />
        <span>
          <strong>Privacy Shield Active:</strong> Personal digital wardrobes are private by default. Only customer wardrobes explicitly shared with JezSy Stylists are accessible.
        </span>
      </div>

      <div className="card dw-layout" data-mobile-view={mobileView}>
        {/* Customer List Sidebar */}
        <div className="dw-sidebar">
          <div className="dw-sidebar-header">
            <h3>Customers</h3>
          </div>
          <div className="dw-customer-list">
            {users.map((user) => {
              const displayName = getUserDisplayName(user);
              const isShared = Boolean(
                user.isWardrobeShared || user.is_wardrobe_shared || user.shareWardrobeWithStylists
              );
              return (
                <div
                  key={user.id}
                  className={`dw-customer-item ${activeUserId === user.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveUserId(user.id);
                    setMobileView('items');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveUserId(user.id);
                      setMobileView('items');
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeUserId === user.id}
                >
                  <div
                    className="avatar small-av"
                    style={{ backgroundColor: getAvatarColor(displayName) }}
                  >
                    {displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <div className="dw-customer-info">
                    <div className="dw-customer-name-row">
                      <h4>{displayName}</h4>
                      {isShared ? (
                        <span className="dw-consent-tag granted" title="Customer shared wardrobe with JezSy Stylists">
                          <ShieldCheck size={10} /> Shared
                        </span>
                      ) : (
                        <span className="dw-consent-tag private" title="Private Wardrobe (Consent Not Granted)">
                          <Lock size={10} /> Private
                        </span>
                      )}
                    </div>
                    <p>{isShared ? `${itemCountByUser[user.id] || 0} saved items` : 'Wardrobe Locked'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Wardrobe Display */}
        <div className="dw-main">
          <div className="dw-toolbar">
            <button
              type="button"
              className="dw-back-btn"
              onClick={() => setMobileView('customers')}
              aria-label="Back to customer list"
            >
              <ArrowLeft size={18} /> Customers
            </button>
            {activeUser ? (
              <div className="dw-user-badge">
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(getUserDisplayName(activeUser)) }}
                >
                  {getUserDisplayName(activeUser)
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div className="dw-user-title">
                  <h3 className="font-medium text-lg flex-center gap-2 justify-start">
                    {getUserDisplayName(activeUser)}&apos;s Wardrobe
                    {isActiveUserShared ? (
                      <span className="dw-consent-status-badge granted">
                        <ShieldCheck size={13} /> Stylist Access Granted
                      </span>
                    ) : (
                      <span className="dw-consent-status-badge private">
                        <Lock size={13} /> Private Wardrobe
                      </span>
                    )}
                  </h3>
                </div>
              </div>
            ) : (
              <div>Loading...</div>
            )}

            <div className="dw-toolbar-actions">
              <div className="search-box">
                <Search size={18} className="search-icon" />
                <input
                  id="dw-search-input"
                  name="dwSearch"
                  type="text"
                  placeholder="Search items..."
                  aria-label="Search items"
                  autoComplete="off"
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="input-field pl-10"
                  disabled={!isActiveUserShared}
                />
              </div>
              <div className="view-toggle">
                <button
                  className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  disabled={!isActiveUserShared}
                >
                  <Grid size={16} />
                </button>
                <button
                  className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  disabled={!isActiveUserShared}
                >
                  <ListIcon size={16} />
                </button>
              </div>
            </div>
          </div>

          {!isActiveUserShared ? (
            <div className="dw-privacy-locked-container">
              <div className="dw-privacy-card card">
                <div className="dw-privacy-lock-icon">
                  <Lock size={36} />
                </div>
                <h3>Private Digital Wardrobe</h3>
                <p className="dw-privacy-desc">
                  <strong>{getUserDisplayName(activeUser)}</strong> has not enabled <strong>&quot;Share Wardrobe with Stylists&quot;</strong> in their mobile app settings.
                </p>
                <div className="dw-privacy-notice-box">
                  <ShieldCheck size={16} />
                  <span>Personal closet items are private by default under Data Privacy regulations until explicit consent is granted by the customer.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`dw-items ${viewMode === 'grid' ? 'dw-grid' : 'dw-list'}`}>
              {userItems.map((item) => {
                const matchedProduct = products.find(p => p.id === item.productId);
                const displayName = matchedProduct ? matchedProduct.name : (item.productId || 'Uploaded Item');
                const displayImage = item.imageUrl || (matchedProduct?.images?.[0]) || null;
                
                return (
                  <div
                    key={item.id || Math.random()}
                    className="dw-item-card card"
                    onClick={() => setSelectedItem({ item, product: matchedProduct })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedItem({ item, product: matchedProduct });
                      }
                    }}
                    title="Click to view item details"
                  >
                    <div className="dw-img-placeholder">
                      {renderItemImage(displayImage)}
                    </div>
                    <div className="dw-item-details">
                      <span className="dw-category">
                        {item.category || (matchedProduct?.category) || 'Clothing'}
                      </span>
                      <h4 className="dw-item-name" title={displayName}>
                        {displayName}
                      </h4>
                    </div>
                  </div>
                );
              })}
              {userItems.length === 0 && (
                <div className="empty-state full-width mt-4">No items found in wardrobe.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== ITEM DETAILS MODAL ===== */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={() => setSelectedItem(null)}>
          <div role="presentation" className="modal-content dw-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex align-center gap-2">
                <Shirt size={20} className="text-primary" />
                <h3>Wardrobe Item Details</h3>
              </div>
              <button
                className="icon-btn-close"
                onClick={() => setSelectedItem(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body dw-modal-body">
              <div className="dw-modal-preview">
                {selectedItem.item.imageUrl || selectedItem.product?.images?.[0] ? (
                  <img
                    src={selectedItem.item.imageUrl || selectedItem.product?.images?.[0]}
                    alt={selectedItem.product?.name || selectedItem.item.productId || 'Wardrobe Item'}
                    className="dw-modal-img"
                  />
                ) : (
                  <div className="dw-modal-empty-img">
                    <Shirt size={64} className="text-secondary opacity-40" />
                  </div>
                )}
              </div>

              <div className="dw-modal-info">
                <div className="mb-3">
                  <span className="dw-category font-bold">
                    {selectedItem.item.category || selectedItem.product?.category || 'Clothing'}
                  </span>
                  <h2 className="dw-modal-title">
                    {selectedItem.product?.name || selectedItem.item.productId || 'Uploaded Item'}
                  </h2>
                </div>

                <div className="dw-modal-meta-grid">
                  <div className="dw-meta-item">
                    <span className="dw-meta-label">Customer</span>
                    <span className="dw-meta-val">{getUserDisplayName(activeUser)}</span>
                  </div>

                  <div className="dw-meta-item">
                    <span className="dw-meta-label">Item Origin</span>
                    <span className="dw-meta-val">
                      {selectedItem.product ? 'Catalog Product' : 'Uploaded by Customer'}
                    </span>
                  </div>

                  {selectedItem.product?.price && (
                    <div className="dw-meta-item">
                      <span className="dw-meta-label">Catalog Price</span>
                      <span className="dw-meta-val font-bold text-accent">
                        ₱{(selectedItem.product.price || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {selectedItem.item.createdAt && (
                    <div className="dw-meta-item">
                      <span className="dw-meta-label">Saved On</span>
                      <span className="dw-meta-val">
                        {new Date(selectedItem.item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer dw-modal-footer">
              {selectedItem.product && (
                <button
                  className="btn-primary flex align-center gap-2"
                  onClick={() => {
                    navigate('/catalog/view/' + (selectedItem.product.docId || selectedItem.product.id));
                  }}
                >
                  <ExternalLink size={16} /> View in Catalog
                </button>
              )}
              <button
                className="btn-outline"
                onClick={() => setSelectedItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigitalWardrobe;
