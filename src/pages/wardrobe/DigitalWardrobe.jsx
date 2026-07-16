import React, { useState, useCallback } from 'react';
import debounce from 'lodash.debounce';
import { Search, Filter, Grid, List as ListIcon, Shirt } from 'lucide-react';
import { subscribeToWardrobeItems } from '../../services/wardrobeService';
import { subscribeToCustomers } from '../../services/customerService';
import { subscribeToProducts } from '../../services/productService';
import { getAvatarColor, getUserDisplayName } from '../../utils/helpers';
import './DigitalWardrobe.css';

const DigitalWardrobe = () => {
  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  
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
    if (!imgAsset) return <Shirt size={32} className="text-secondary opacity-50" />;
    if (imgAsset.startsWith('http')) {
      return (
        <img
          src={imgAsset}
          alt="wardrobe-item"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      );
    }
    return <span className="dw-emoji view-xl">{imgAsset}</span>;
  };

  return (
    <div className="dw-container">
      <div className="page-header">
        <h1 className="page-title">Digital Wardrobe Management</h1>
        <p className="page-subtitle">View items saved by customers from the app</p>
      </div>

      <div className="card dw-layout">
        {/* Customer List Sidebar */}
        <div className="dw-sidebar">
          <div className="dw-sidebar-header">
            <h3>Customers</h3>
          </div>
          <div className="dw-customer-list">
            {users.map((user) => {
              const displayName = getUserDisplayName(user);
              return (
                <div
                  key={user.id}
                  className={`dw-customer-item ${activeUserId === user.id ? 'active' : ''}`}
                  onClick={() => setActiveUserId(user.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveUserId(user.id)}
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
                    <h4>{displayName}</h4>
                    <p>{itemCountByUser[user.id] || 0} saved items</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Wardrobe Display */}
        <div className="dw-main">
          <div className="dw-toolbar">
            {activeUser ? (
              <div className="flex-center gap-3">
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(getUserDisplayName(activeUser)) }}
                >
                  {getUserDisplayName(activeUser)
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <h3 className="font-medium text-lg">
                    {getUserDisplayName(activeUser)}&apos;s Wardrobe
                  </h3>
                </div>
              </div>
            ) : (
              <div>Loading...</div>
            )}

            <div className="flex-center gap-3">
              <div className="search-box">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  className="input-field pl-10"
                />
              </div>
              <div className="view-toggle">
                <button
                  className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid size={16} />
                </button>
                <button
                  className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  <ListIcon size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className={`dw-items ${viewMode === 'grid' ? 'dw-grid' : 'dw-list'}`}>
            {userItems.map((item) => {
              const matchedProduct = products.find(p => p.id === item.productId);
              const displayName = matchedProduct ? matchedProduct.name : (item.productId || 'Uploaded Item');
              // Use matched product image if available and item doesn't have its own image URL
              const displayImage = item.imageUrl || (matchedProduct?.images?.[0]) || null;
              
              return (
                <div key={item.id || Math.random()} className="dw-item-card card" style={{ minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                  <div
                    className="dw-img-placeholder"
                    style={{
                      overflow: 'hidden',
                      padding: displayImage?.startsWith && displayImage.startsWith('http') ? '0' : '2rem',
                      minHeight: '200px',
                      backgroundColor: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%'
                    }}
                  >
                    {renderItemImage(displayImage)}
                  </div>
                  <div className="dw-item-details" style={{ flex: 1, padding: '1rem', color: '#0f172a' }}>
                    <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                      <span className="dw-category" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold' }}>
                        {item.category || (matchedProduct?.category) || 'Clothing'}
                      </span>
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                      {displayName}
                    </h4>
                    {/* Safe fallback display just in case data structure differs from expected */}
                    <div style={{ fontSize: '0.7rem', color: '#ef4444', wordBreak: 'break-all' }}>
                      {!item.productId && !item.imageUrl && JSON.stringify(item)}
                    </div>
                  </div>
                </div>
              );
            })}
            {userItems.length === 0 && (
              <div className="empty-state full-width mt-4">No items found in wardrobe.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalWardrobe;
