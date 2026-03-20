import React, { useState } from 'react';
import { Search, Package, Box, RotateCcw, ZoomIn, ZoomOut, Maximize, Save, Trash2, Eye } from 'lucide-react';
import './ARAssets.css';

const MOCK_ASSETS = [
  { id: '1', name: 'Premium Linen Shirt', category: 'Tops', modelUrl: 'shirt_v1.glb', status: 'Active', tris: '12.4k', texture: '2K' },
  { id: '2', name: 'Slim Fit Trousers', category: 'Bottoms', modelUrl: 'pants_v2.glb', status: 'Processing', tris: '8.1k', texture: '1K' },
  { id: '3', name: 'Evening Silk Dress', category: 'Dresses', modelUrl: 'dress_gold.glb', status: 'Active', tris: '24.2k', texture: '4K' },
  { id: '4', name: 'Summer Floral Skirt', category: 'Bottoms', modelUrl: 'skirt_flow.glb', status: 'Error', tris: '0', texture: '-' },
  { id: '5', name: 'Classic Blazer', category: 'Outwear', modelUrl: 'blazer_navy.glb', status: 'Active', tris: '15.7k', texture: '2K' },
];

const ARAssets = () => {
  const [selectedAsset, setSelectedAsset] = useState(MOCK_ASSETS[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAssets = MOCK_ASSETS.filter(asset => 
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="ar-view-container">
      <div className="page-header">
        <h1 className="page-title">AR Asset Manager</h1>
        <p className="page-subtitle">Manage 3D models and AR configurations for the virtual try-on feature</p>
      </div>

      <div className="card ar-layout">
        <div className="ar-sidebar">
          <div className="ar-sidebar-header">
            <h3>3D Models</h3>
            <div className="ar-search">
              <Search size={18} className="ar-search-icon" />
              <input 
                type="text" 
                className="input-field pl-10" 
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="ar-asset-list">
            {filteredAssets.map(asset => (
              <div 
                key={asset.id} 
                className={`ar-asset-item ${selectedAsset?.id === asset.id ? 'active' : ''}`}
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="ar-asset-thumb">
                  <Box size={24} className="text-secondary" />
                </div>
                <div className="ar-asset-info">
                  <h4>{asset.name}</h4>
                  <p>{asset.category} • {asset.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ar-main">
          <div className="ar-canvas-container">
            {selectedAsset ? (
              <div className="ar-canvas-placeholder">
                <div className="ar-empty-state">
                  <div className="ar-empty-icon">🏗️</div>
                  <h3>3D Viewer Placeholder</h3>
                  <p>Viewing: <strong>{selectedAsset.modelUrl}</strong></p>
                  <p className="mt-2 text-sm">Three.js canvas would be initialized here</p>
                </div>
                <div className="flex gap-4">
                  <button className="icon-btn"><RotateCcw size={20}/></button>
                  <button className="icon-btn"><ZoomIn size={20}/></button>
                  <button className="icon-btn"><ZoomOut size={20}/></button>
                  <button className="icon-btn"><Maximize size={20}/></button>
                </div>
              </div>
            ) : (
              <div className="ar-canvas-placeholder">
                <Box size={48} className="opacity-20 mb-4" />
                <p>Select an asset to preview</p>
              </div>
            )}
          </div>

          <div className="ar-toolbar">
            <div className="flex gap-4 items-center">
              <span className="badge-outline">{selectedAsset?.status || 'No selection'}</span>
              <span className="text-secondary text-sm">{selectedAsset?.modelUrl}</span>
            </div>
            <div className="ar-actions">
              <button className="btn-outline flex items-center gap-2"><Eye size={18}/> View Logs</button>
              <button className="btn-primary flex items-center gap-2"><Save size={18}/> Save Changes</button>
            </div>
          </div>
        </div>

        <div className="ar-inspector">
          <div className="ar-inspector-header">
            <h3>Properties</h3>
          </div>
          {selectedAsset ? (
            <div className="ar-inspector-content">
              <div className="inspector-group">
                <h4>Mesh Data</h4>
                <div className="inspector-field">
                  <span className="inspector-label">Triangles</span>
                  <span className="inspector-value">{selectedAsset.tris}</span>
                </div>
                <div className="inspector-field">
                  <span className="inspector-label">Textures</span>
                  <span className="inspector-value">{selectedAsset.texture}</span>
                </div>
                <div className="inspector-field">
                  <span className="inspector-label">Format</span>
                  <span className="inspector-value">GLB / glTF</span>
                </div>
              </div>

              <div className="inspector-group">
                <h4>AR Configuration</h4>
                <div className="inspector-field">
                  <span className="inspector-label">Initial Scale</span>
                  <span className="inspector-value">1.0</span>
                </div>
                <div className="inspector-field">
                  <span className="inspector-label">Auto-Rotate</span>
                  <span className="inspector-value">Enabled</span>
                </div>
              </div>

              <div className="inspector-group">
                <h4>Materials</h4>
                <div className="color-swatch-list">
                  <div className="color-swatch active" style={{ backgroundColor: '#8B6F5C' }}></div>
                  <div className="color-swatch" style={{ backgroundColor: '#C9BEB4' }}></div>
                  <div className="color-swatch" style={{ backgroundColor: '#2C2C2C' }}></div>
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-gray-100">
                <button className="btn-danger w-full flex items-center justify-center gap-2">
                  <Trash2 size={18}/> Delete Asset
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-secondary text-sm">
              No asset selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ARAssets;
