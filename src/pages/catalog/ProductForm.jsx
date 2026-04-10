import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Save, Shirt, Tag as TagIcon, ChevronLeft, ChevronRight, Ruler } from 'lucide-react';
import {
  createProduct,
  updateProduct,
  getProductById,
  getCategories,
  createInventoryItem,
  getInventory,
} from '../../services/productService';
import { routeAndUploadFile, deleteFile } from '../../firebase/storage';
import {
  subscribeToSuggestedOutfits,
} from '../../services/wardrobeService';
import MeasurementTable from '../../components/catalog/MeasurementTable';
import { useAuth } from '../../context/AuthContext';
import { validateForm, productRules, sanitizeText } from '../../utils/validation';
import { COLOR_CATEGORIES, AVAILABLE_SIZES, SEASONS } from '../../utils/constants';
import { Logger } from '../../utils/Logger';
import { toast } from 'sonner';

const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [oldData, setOldData] = useState(null); // To track changes for sync

  // Uniqlo-like details
  const [formData, setFormData] = useState({
    name: '',
    category: 'Tops',
    subCategory: '',
    subSubCategory: '',
    price: '',
    description: '',
    material: '',
    color: '',
    baseColor: 'White', // Default category for filtering
    careInstructions: '',
    fitAndSizing: '',
    styleCode: '',
    season: 'All-Season',
    occasion: '',
    visibility: 'Draft',
    isFeatured: false,
    isAlterable: false,
    sizes: ['M'],
    images: [], // Array of image URLs/Maps
    model3DURL: '',
    maskURL: '',
    measurements: {}, // size-based grid
  });

  const [categories, setCategories] = useState([
    {
      name: 'Tops',
      subcategories: [
        { name: 'Innerwear', subSubcategories: ['Sports Bra', 'Bra'] },
        { name: 'Outerwear', subSubcategories: ['Sporty Top', 'Knitted Tops', 'Blazers', 'T-Shirt'] },
      ],
    },
    { name: 'Dress', subcategories: [] },
    { name: 'Bags', subcategories: [] },
    {
      name: 'Bottoms',
      subcategories: [
        { name: 'Skirts', subSubcategories: [] },
        { name: 'Jeans', subSubcategories: [] },
        { name: 'Pants', subSubcategories: [] },
        { name: 'Shorts', subSubcategories: [] },
      ],
    },
    {
      name: 'Footwear',
      subcategories: [
        { name: 'Shoes', subSubcategories: [] },
        { name: 'Heels', subSubcategories: [] },
        { name: 'Sandals', subSubcategories: [] },
      ],
    },
  ]);
  // File uploads
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const previewUrlsRef = React.useRef([]);

  // Cleanup local image preview object URLs on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
      });
    };
  }, []);

  useEffect(() => {
    // We could fetch dynamic categories here from DB
    const fetchCategories = async () => {
      try {
        const cats = await getCategories();
        if (cats && cats.length > 0) {
          setCategories(cats);
        }
      } catch (err) {
        console.error('No custom categories found, using defaults.', err);
      }
    };
    fetchCategories();

    // If editing, load product data
    if (isEditing) {
      const loadProduct = async () => {
        try {
          const doc = await getProductById(id);
          if (doc) {
            const data = {
              name: doc.name || '',
              category: doc.category || categories[0]?.name || 'Tops',
              subCategory: doc.subCategory || '',
              subSubCategory: doc.subSubCategory || '',
              price: doc.price || '',
              description: doc.description || '',
              material: doc.material || '',
              color: doc.color || '',
              careInstructions: doc.careInstructions || '',
              fitAndSizing: doc.fitAndSizing || '',
              styleCode: doc.styleCode || '',
              season: doc.season || 'All-Season',
              occasion: doc.occasion || '',
              visibility: doc.visibility || 'Draft',
              isFeatured: doc.isFeatured ?? doc.featured ?? false,
              isAlterable: doc.isAlterable || false,
              sizes: doc.sizes || ['M'],
              images: doc.images || (doc.imageUrl ? [doc.imageUrl] : []),
              model3DURL: doc.model3DURL || '',
              maskURL: doc.maskURL || '',
              measurements: doc.measurements || {},
            };
            setFormData(data);
            setOldData(data);
          }
        } catch (e) {
          Logger.error('Failed to load product', e);
          toast.error('Failed to load product');
          navigate('/catalog');
        } finally {
          setLoading(false);
        }
      };
      loadProduct();
    }
  }, [id, isEditing]);

  // Auto-generate SKU from product name
  useEffect(() => {
    if (!isEditing && formData.name.trim()) {
      const words = formData.name
        .trim()
        .split(' ')
        .filter((w) => w.length > 0);
      let acronym = 'ITM';
      if (words.length >= 2) acronym = (words[0][0] + words[1][0]).toUpperCase();
      else if (words.length === 1) acronym = formData.name.substring(0, 3).toUpperCase();
      const generated = `JZ-${acronym}-${String(Date.now()).slice(-4)}`;
      setFormData((prev) => ({ ...prev, styleCode: generated }));
    }
  }, [formData.name, isEditing]);

  // Handle subcategory logic when category changes
  useEffect(() => {
    const selectedCat = categories.find((c) => c.name === formData.category);
    if (selectedCat && selectedCat.subcategories && selectedCat.subcategories.length > 0) {
      const firstSubCat = selectedCat.subcategories[0];
      const subCatName = typeof firstSubCat === 'string' ? firstSubCat : firstSubCat.name;
      const isValidSubCategory = selectedCat.subcategories.some(
        s => (typeof s === 'string' ? s : s.name) === formData.subCategory
      );

      if (!isValidSubCategory) {
         setFormData((prev) => ({ ...prev, subCategory: subCatName, subSubCategory: '' }));
      }
    } else {
      setFormData((prev) => ({ ...prev, subCategory: '', subSubCategory: '' }));
    }
  }, [formData.category, categories]);

  // Handle subSubCategory logic when subCategory changes
  useEffect(() => {
    const selectedCat = categories.find((c) => c.name === formData.category);
    if (!selectedCat) return;

    const selectedSubCat = selectedCat.subcategories?.find(
      (s) => (typeof s === 'string' ? s : s.name) === formData.subCategory
    );

    if (selectedSubCat && selectedSubCat.subSubcategories && selectedSubCat.subSubcategories.length > 0) {
      if (!selectedSubCat.subSubcategories.includes(formData.subSubCategory)) {
        setFormData((prev) => ({ ...prev, subSubCategory: selectedSubCat.subSubcategories[0] }));
      }
    } else {
      setFormData((prev) => ({ ...prev, subSubCategory: '' }));
    }
  }, [formData.subCategory, formData.category, categories]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);

    // Create preview URLs
    const newPreviews = files.map((file) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return url;
    });
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeSelectedFile = (index) => {
    if (previews[index]) {
      try {
        URL.revokeObjectURL(previews[index]);
      } catch (e) {}
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const moveExistingImage = (index, direction) => {
    const newImages = [...formData.images];
    const newPos = index + direction;
    if (newPos < 0 || newPos >= newImages.length) return;
    
    [newImages[index], newImages[newPos]] = [newImages[newPos], newImages[index]];
    setFormData(prev => ({ ...prev, images: newImages }));
  };

  const moveSelectedFile = (index, direction) => {
    const newFiles = [...selectedFiles];
    const newPrev = [...previews];
    const newPos = index + direction;
    if (newPos < 0 || newPos >= newFiles.length) return;

    [newFiles[index], newFiles[newPos]] = [newFiles[newPos], newFiles[index]];
    [newPrev[index], newPrev[newPos]] = [newPrev[newPos], newPrev[index]];

    setSelectedFiles(newFiles);
    setPreviews(newPrev);
  };

  const toggleSize = (size) => {
    const currentSizes = formData.sizes;
    const newSizes = currentSizes.includes(size)
      ? currentSizes.filter((s) => s !== size)
      : [...currentSizes, size];
    setFormData({ ...formData, sizes: newSizes });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Validate Form
    const { isValid, errors } = validateForm(formData, productRules);
    if (!isValid || formData.sizes.length === 0) {
      const errorMsg =
        formData.sizes.length === 0 ? 'At least one size is required' : Object.values(errors)[0];
      toast.error(errorMsg);
      return;
    }

    setSaving(true);

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      setSaving(false);
      toast.error('Save timed out. Please try again.');
    }, 45000); // 45s for image uploads

    let success = false;
    try {
      // 2. Upload new images if any
      setUploadProgress({ current: 0, total: selectedFiles.length });
      let uploadedImages = [];

      if (selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          setUploadProgress({ current: i + 1, total: selectedFiles.length });
          console.log(`[Storage] Uploading gallery image ${i + 1}...`);
          const url = await routeAndUploadFile(selectedFiles[i]);
          if (url) uploadedImages.push(url);
        }
      }

      console.log('[DEBUG] All images handled. Preparing payload...');
      const finalImages = [...formData.images, ...uploadedImages];

      const payload = {
        name: sanitizeText(formData.name),
        category: formData.category,
        subCategory: formData.subCategory,
        subSubCategory: formData.subSubCategory,
        price: parseFloat(formData.price),
        sizes: formData.sizes,
        description: sanitizeText(formData.description),
        material: sanitizeText(formData.material),
        color: sanitizeText(formData.color),
        careInstructions: sanitizeText(formData.careInstructions),
        fitAndSizing: formData.fitAndSizing,
        styleCode: formData.styleCode,
        season: formData.season,
        occasion: formData.occasion,
        visibility: formData.visibility,
        isFeatured: formData.isFeatured,
        isAlterable: formData.isAlterable,
        updated_by: user?.email || 'admin',
        images: finalImages,
        imageUrl: finalImages.length > 0 ? finalImages[0] : '👗',
        // Note: model3DURL and maskURL are preserved from existing data if editing,
        // but can no longer be updated here.
        model3DURL: formData.model3DURL || '',
        maskURL: formData.maskURL || '',
        timestamp: Date.now(),
      };

      if (isEditing) {
        console.log('[DEBUG] Updating product in Firestore...', { id, payload });
        await updateProduct(id, payload);

        // Fetch current inventory and check if any new sizes were added
        try {
          const allInv = await getInventory();
          const existingSizesForProduct = allInv
            .filter((inv) => (inv.productDocId || inv.sku) === id || inv.sku === formData.styleCode)
            .map((inv) => inv.size);
          
          const newSizes = payload.sizes.filter((size) => !existingSizesForProduct.includes(size));
          
          if (newSizes.length > 0) {
            Logger.info(`Initializing missing inventory for updated sizes ${id}...`);
            const inventoryPromises = newSizes.map((size) =>
              createInventoryItem({
                productDocId: id,
                sku: payload.id || payload.styleCode,
                item: payload.name,
                category: payload.category,
                size: size,
                total: 0,
                reserved: 0,
                available: 0,
              }),
            );
            await Promise.all(inventoryPromises);
            console.log('[DEBUG] Missing inventory items created successfully');
          }
        } catch(invErr) {
          console.error('[DEBUG] Checking/Adding missing sizes failed:', invErr);
        }

        console.log('[DEBUG] Firestore update SUCCESS');
        toast.success('Product updated successfully!');
      } else {
        payload.created_by = user?.email || 'admin';
        payload.stock = 0;
        payload.visibility = 'Draft';
        payload.tags = ['New Arrival'];

        console.log('[DEBUG] Creating product in Firestore...', payload);
        const newDocId = await createProduct(payload);
        console.log('[DEBUG] Firestore create SUCCESS. Doc ID:', newDocId);

        // Init inventory per size in parallel
        Logger.info(`Initializing inventory for new product ${newDocId}...`);
        const inventoryPromises = payload.sizes.map((size) =>
          createInventoryItem({
            productDocId: newDocId,
            sku: payload.id || payload.styleCode,
            item: payload.name,
            category: payload.category,
            size: size,
            total: 0,
            reserved: 0,
            available: 0,
          }),
        );
        await Promise.all(inventoryPromises);
        console.log('[DEBUG] Inventory items created successfully');
        toast.success('Product created successfully!');
      }

      success = true;
    } catch (err) {
      Logger.error('Error saving product:', err);
      toast.error(`Error saving product: ${err.message}`, {
        duration: 5000,
        description: err.message.includes('Network Error') 
          ? 'Check your connection or disable ad-blockers like uBlock Origin' 
          : 'Please check your inputs and try again'
      });
    } finally {
      clearTimeout(safetyTimeout);
      setSaving(false);
      if (success) navigate('/catalog');
    }
  };

  if (loading) return <div className="p-8">Loading product data...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/catalog')} className="btn-secondary p-2">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        {/* Core Info */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Basic Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Product Name *</label>
              <input
                type="text"
                name="name"
                className="input-field"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="label">Price (₱) *</label>
              <input
                type="number"
                name="price"
                className="input-field"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                name="category"
                className="input-field"
                value={formData.category}
                onChange={handleChange}
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sub-Category</label>
              <select
                name="subCategory"
                className="input-field"
                value={formData.subCategory}
                onChange={handleChange}
                disabled={
                  !categories.find((c) => c.name === formData.category)?.subcategories?.length
                }
              >
                <option value="">None</option>
                {categories
                  .find((c) => c.name === formData.category)
                  ?.subcategories?.map((s) => {
                    const sName = typeof s === 'string' ? s : s.name;
                    return (
                      <option key={sName} value={sName}>
                        {sName}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <label className="label">Sub-Sub-Category</label>
              <select
                name="subSubCategory"
                className="input-field"
                value={formData.subSubCategory}
                onChange={handleChange}
                disabled={(() => {
                  const cat = categories.find((c) => c.name === formData.category);
                  if (!cat) return true;
                  const subCat = cat.subcategories?.find(
                    (s) => (typeof s === 'string' ? s : s.name) === formData.subCategory
                  );
                  return !subCat?.subSubcategories?.length;
                })()}
              >
                <option value="">None</option>
                {(() => {
                  const cat = categories.find((c) => c.name === formData.category);
                  if (!cat) return null;
                  const subCat = cat.subcategories?.find(
                    (s) => (typeof s === 'string' ? s : s.name) === formData.subCategory
                  );
                  return subCat?.subSubcategories?.map((ss) => (
                    <option key={ss} value={ss}>
                      {ss}
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className="label">Style Code / SKU (Auto-Generated)</label>
              <input
                type="text"
                name="styleCode"
                className="input-field"
                value={formData.styleCode}
                readOnly
                style={{ backgroundColor: 'var(--beige)', cursor: 'default' }}
                placeholder="Auto-generated from product name"
              />
            </div>
          </div>
          <div className="flex gap-4 items-center mt-4 p-4 border rounded" style={{ backgroundColor: 'var(--beige)', borderColor: 'var(--charcoal)' }}>
            <label className="flex items-center gap-3 cursor-pointer w-full">
              <input
                type="checkbox"
                name="isAlterable"
                checked={formData.isAlterable}
                onChange={(e) => setFormData({ ...formData, isAlterable: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: 'var(--charcoal)' }}
              />
              <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--charcoal)' }}>Allow Alterations & Fitting for this Product</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Image Gallery</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            {/* Existing Images */}
            {formData.images.map((url, idx) => (
              <div key={`exist-${idx}`} className="relative w-28 h-28 border rounded overflow-hidden group">
                <img src={url} alt={`img-${idx}`} className="w-full h-full object-cover" loading="lazy" />
                
                {/* Visual indicator for primary image */}
                {idx === 0 && (
                  <div className="absolute top-0 left-0 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-br font-bold z-10">
                    PRIMARY
                  </div>
                )}

                {/* Sorting Controls */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                  <button
                    type="button"
                    onClick={() => moveExistingImage(idx, -1)}
                    disabled={idx === 0}
                    title="Move Left"
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                     type="button"
                     onClick={() => removeExistingImage(idx)}
                     title="Remove"
                     className="p-1 bg-red-500/80 hover:bg-red-500 rounded text-white"
                   >
                     <X size={16} />
                   </button>
                  <button
                    type="button"
                    onClick={() => moveExistingImage(idx, 1)}
                    disabled={idx === formData.images.length - 1}
                    title="Move Right"
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ))}
            {/* New Previews */}
            {previews.map((preview, idx) => (
              <div
                key={`prev-${idx}`}
                className="relative w-28 h-28 border border-dashed border-primary rounded overflow-hidden group"
              >
                <img src={preview} alt="preview" className="w-full h-full object-cover opacity-70" loading="lazy" />
                
                {/* Sorting Controls for new files */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                  <button
                    type="button"
                    onClick={() => moveSelectedFile(idx, -1)}
                    disabled={idx === 0}
                    title="Move Left"
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSelectedFile(idx)}
                    title="Remove"
                    className="p-1 bg-red-500/80 hover:bg-red-500 rounded text-white"
                  >
                    <X size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedFile(idx, 1)}
                    disabled={idx === previews.length - 1}
                    title="Move Right"
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ))}

            {/* Upload Button */}
            <label className="w-24 h-24 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition">
              <Upload size={24} className="text-gray-400 mb-1" />
              <span className="text-xs text-gray-500 text-center">Add Image</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginTop: '0.5rem',
              fontStyle: 'italic',
            }}
          >
            💡 Tip: For best results, upload product images with a white or transparent background.
          </p>
        </section>

        {/* Images section ends */}
        
        {/* AR Notice */}
        <section className="p-4 border border-dashed rounded-lg bg-indigo-50/30">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                <Shirt size={18} /> Virtual Try-On Configuration
              </h3>
              <p className="text-sm text-indigo-700 mt-1">
                3D models and AI masks are now managed centrally. To activate AR for this product, tag it as "AR Try-On" below and visit the AR Hub.
              </p>
            </div>
            <button 
              type="button" 
              className="btn-outline small text-indigo-700 border-indigo-300"
              onClick={() => window.open('/ar-assets', '_blank')}
            >
              Open AR Hub
            </button>
          </div>
        </section>

        {/* Variations */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Variations & Specifications</h2>
          <div className="mb-4">
            <label className="label">Available Sizes *</label>
            <div className="flex flex-wrap mt-2" style={{ gap: '0.75rem' }}>
              {AVAILABLE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className="text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: formData.sizes.includes(size)
                      ? 'var(--charcoal)'
                      : 'var(--beige)',
                    color: formData.sizes.includes(size) ? 'white' : 'var(--charcoal)',
                    border: formData.sizes.includes(size)
                      ? '2px solid var(--charcoal)'
                      : '2px solid var(--border-color)',
                    borderRadius: '999px',
                    padding: '0.5rem 1.25rem',
                    minWidth: '48px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Color (Name)</label>
              <input
                type="text"
                name="color"
                className="input-field"
                value={formData.color}
                onChange={handleChange}
                placeholder="e.g. Ruby Red"
              />
            </div>
            <div>
              <label className="label">Color Category (Filter) *</label>
              <select
                name="baseColor"
                className="input-field"
                value={formData.baseColor}
                onChange={handleChange}
                required
              >
                {COLOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fit & Sizing</label>
              <select
                name="fitAndSizing"
                className="input-field"
                value={formData.fitAndSizing}
                onChange={handleChange}
              >
                <option value="">Select Fit</option>
                <option value="Slim Fit">Slim Fit</option>
                <option value="Regular Fit">Regular Fit</option>
                <option value="Oversized">Oversized</option>
                <option value="True to Size">True to Size</option>
                <option value="Runs Small">Runs Small</option>
              </select>
            </div>
            <div>
              <label className="label">Season</label>
              <select
                name="season"
                className="input-field"
                value={formData.season}
                onChange={handleChange}
              >
                {SEASONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 border-t pt-4">
            <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
              <Ruler size={18} /> Garment Measurements (Size Chart)
            </h3>
            <p className="text-sm text-secondary mb-4">
              Upload specific dimensions for each size to help customers find their perfect fit.
              Metrics added here will override generic size recommendations.
            </p>
            <MeasurementTable 
              sizes={formData.sizes} 
              measurements={formData.measurements} 
              onChange={(m) => setFormData({ ...formData, measurements: m })} 
            />
          </div>

          {/* Visibility & Featured */}
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label className="label" style={{ marginBottom: 0 }}>
                Visibility
              </label>
              <select
                name="visibility"
                className="input-field"
                style={{ width: 'auto', minWidth: 120 }}
                value={formData.visibility}
                onChange={handleChange}
              >
                <option value="Published">Published</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Product Description</label>
              <textarea
                name="description"
                className="input-field"
                rows="3"
                value={formData.description}
                onChange={handleChange}
              ></textarea>
            </div>
            <div>
              <label className="label">Material/Fabric</label>
              <input
                type="text"
                name="material"
                className="input-field"
                value={formData.material}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="label">Care Instructions</label>
              <input
                type="text"
                name="careInstructions"
                className="input-field"
                value={formData.careInstructions}
                onChange={handleChange}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4 border-t">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving
              ? uploadProgress.total > 0
                ? `Uploading image ${uploadProgress.current} of ${uploadProgress.total}...`
                : 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
