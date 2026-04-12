import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Shirt, Tag as TagIcon, ChevronLeft, ChevronRight, Ruler, DollarSign, Eye, Layers, Palette, BookOpen, Package, Star, Sparkles } from 'lucide-react';
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
import { subscribeToCategories } from '../../services/productService';
import MeasurementTable from '../../components/catalog/MeasurementTable';
import { useAuth } from '../../context/AuthContext';
import { validateForm, productRules, sanitizeText } from '../../utils/validation';
import { COLOR_CATEGORIES, AVAILABLE_SIZES, SEASONS } from '../../utils/constants';
import { Logger } from '../../utils/Logger';
import { toast } from 'sonner';
import './ProductForm.css';

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
    isNewArrival: false,
    onSale: false,
    discountPercentage: 0,
    salePrice: '',
    sizes: ['M'],
    images: [], // Array of image URLs/Maps
    measurements: {}, // size-based grid
    tags: [],
  });

  const [categories, setCategories] = useState([]);
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
    const unsubscribeCategories = subscribeToCategories((cats) => {
      if (cats && cats.length > 0) {
        setCategories(cats);
        // If current category is not in the new list, reset it
        setFormData(prev => {
           if (!cats.some(c => c.name === prev.category)) {
             return { ...prev, category: cats[0].name };
           }
           return prev;
        });
      }
    });

    return () => unsubscribeCategories();
  }, []);

  useEffect(() => {
      const loadProduct = async () => {
        try {
          const doc = await getProductById(id);
          if (doc) {
            const data = {
              name: doc.name || '',
              category: doc.category || categories[0]?.name || 'Tops',
              subCategory: doc.subCategory || '',
              price: doc.price || '',
              description: doc.description || '',
              material: doc.material || '',
              color: doc.color || '',
              careInstructions: doc.careInstructions || '',
              fitAndSizing: doc.fitAndSizing || '',
              season: doc.season || 'All-Season',
              occasion: doc.occasion || '',
              visibility: doc.visibility || 'Draft',
              isFeatured: doc.isFeatured ?? doc.featured ?? false,
              isAlterable: doc.isAlterable || false,
              onSale: doc.onSale || false,
              discountPercentage: doc.discountPercentage || 0,
              salePrice: doc.salePrice || '',
              sizes: doc.sizes || ['M'],
              images: doc.images || (doc.imageUrl ? [doc.imageUrl] : []),
              measurements: doc.measurements || {},
              tags: doc.tags || [],
              baseColor: doc.baseColor || 'White',
              styleCode: doc.styleCode || '',
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
      if (isEditing) {
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
         setFormData((prev) => ({ ...prev, subCategory: subCatName }));
      }
    } else {
      setFormData((prev) => ({ ...prev, subCategory: '' }));
    }
  }, [formData.category, categories]);

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

  const setAsPrimary = (index) => {
    const newImages = [...formData.images];
    const item = newImages.splice(index, 1)[0];
    newImages.unshift(item);
    setFormData(prev => ({ ...prev, images: newImages }));
    toast.success('Main image updated');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      let newData = { ...prev, [name]: val };

      // Pricing Sync Logic
      if (['price', 'salePrice', 'onSale'].includes(name)) {
        const basePrice = parseFloat(name === 'price' ? val : prev.price) || 0;
        const manualSalePrice = parseFloat(name === 'salePrice' ? val : prev.salePrice) || 0;
        
        if (basePrice > 0 && manualSalePrice > 0) {
          if (manualSalePrice > basePrice) {
            newData.salePrice = basePrice.toString();
            newData.discountPercentage = 0;
          } else {
            newData.discountPercentage = Math.round(((basePrice - manualSalePrice) / basePrice) * 100);
          }
        } else {
          newData.discountPercentage = 0;
        }

        if (name === 'onSale') {
          if (val) {
            // Turning ON: Default to 10% discount if no sale price set
            if (!prev.salePrice) {
              newData.salePrice = Math.round(basePrice * 0.9).toString();
              newData.discountPercentage = 10;
            }
          } else {
            newData.discountPercentage = 0;
            newData.salePrice = '';
          }
        }
      }

      return newData;
    });
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
        // Sale Fields
        onSale: formData.onSale,
        discountPercentage: parseInt(formData.discountPercentage) || 0,
        salePrice: formData.onSale ? parseFloat(formData.salePrice) : null,
        // New Categorization
        baseColor: formData.baseColor,
        measurements: formData.measurements,
        timestamp: Date.now(),
        tags: formData.tags || [],
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
        payload.status = 'Out of Stock';
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
  };  if (loading) return <div className="p-8">Loading product data...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/catalog')} className="btn-secondary p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <h1 className="text-2xl font-bold">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
             {formData.styleCode && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-gray-200">
                  SKU: {formData.styleCode}
                </span>
             )}
          </div>
          <p className="text-sm text-secondary mt-0.5">Fill in the details below — required fields are marked with *</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ══════════════════════════════════════════════
            ZONE A — Identity & Quick Status
            (Product Name, Style Code, Category, Status Toggles)
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
          <div className="flex flex-col md:flex-row justify-between gap-6">
             <div className="flex-1 space-y-4">
                <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                   <Layers size={14} /> Identity & Classification
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Product Name *</label>
                    <input
                      type="text"
                      name="name"
                      className="input-field"
                      placeholder="e.g. Silk Evening Dress"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Category *</label>
                    <select name="category" className="input-field" value={formData.category} onChange={handleChange}>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
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
                      disabled={!categories.find((c) => c.name === formData.category)?.subcategories?.length}
                    >
                      <option value="">None</option>
                      {categories
                        .find((c) => c.name === formData.category)
                        ?.subcategories?.map((s) => {
                          const sName = typeof s === 'string' ? s : s.name;
                          return <option key={sName} value={sName}>{sName}</option>;
                        })}
                    </select>
                  </div>
                </div>

                {/* Mobile-only Status Toggles */}
                <div className="md:hidden space-y-4 pt-4 border-t border-dashed">
                   <div className="flex items-center justify-between">
                      <label className="label mb-0">Visibility</label>
                      <select name="visibility" className="input-field py-1 text-sm w-32" value={formData.visibility} onChange={handleChange}>
                        <option value="Draft">Draft</option>
                        <option value="Published">Published</option>
                      </select>
                   </div>
                   <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="onSale" checked={formData.onSale} onChange={handleChange} className="w-4 h-4 accent-red-500" />
                        <span className="text-xs font-bold uppercase text-red-600">Sale</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="isFeatured" checked={formData.isFeatured} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <span className="text-xs font-bold uppercase text-secondary">Featured</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="isAlterable" checked={formData.isAlterable} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <span className="text-xs font-bold uppercase text-secondary">Alterable</span>
                      </label>
                   </div>
                </div>
             </div>

             <div className="md:w-64 space-y-4 border-l pl-6 hidden md:block">
                <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                   <Eye size={14} /> Publication Status
                </h2>
                <div className="space-y-3">
                   <div>
                      <label className="label">Visibility</label>
                      <select name="visibility" className="input-field py-1 text-sm" value={formData.visibility} onChange={handleChange}>
                        <option value="Draft">Draft</option>
                        <option value="Published">Published</option>
                      </select>
                   </div>
                   <div className="flex flex-col gap-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" name="isFeatured" checked={formData.isFeatured} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">Featured Item</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" name="isAlterable" checked={formData.isAlterable} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">Alterable</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group pt-2 border-t border-dashed mt-1">
                        <input type="checkbox" name="isNewArrival" checked={formData.isNewArrival} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <div className="flex flex-col">
                           <span className="text-sm font-bold text-primary transition-colors flex items-center gap-1">
                              <Sparkles size={12} /> Force New Arrival
                           </span>
                           <span className="text-[10px] text-secondary leading-tight">Manual badge override</span>
                        </div>
                      </label>
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE B — Pricing & Promotion
            (Regular Price + Intelligently Synced Sale)
        ══════════════════════════════════════════════ */}
        <section className={`card p-6 border-2 transition-all duration-300 ${formData.onSale ? 'border-red-500 bg-red-50/20' : 'border-transparent'}`}>
           <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${formData.onSale ? 'text-red-700' : 'text-secondary'}`}>
                 <DollarSign size={14} /> Pricing & Promotion
              </h2>
              <label className="flex items-center gap-2 cursor-pointer">
                 <span className={`text-sm font-bold ${formData.onSale ? 'text-red-600' : 'text-secondary'}`}>ON SALE</span>
                 <div 
                    role="checkbox"
                    aria-checked={formData.onSale}
                    tabIndex="0"
                    onClick={() => handleChange({ target: { name: 'onSale', type: 'checkbox', checked: !formData.onSale } })}
                    className={`w-10 h-5 rounded-full relative transition-colors ${formData.onSale ? 'bg-red-500' : 'bg-gray-300'}`}
                 >
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${formData.onSale ? 'translate-x-5' : ''}`} />
                 </div>
              </label>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                 <label className="label">Regular Rental Price (₱) *</label>
                 <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">₱</span>
                    <input type="number" name="price" className="input-field pl-8" placeholder="0.00" value={formData.price} onChange={handleChange} required step="0.01" />
                 </div>
              </div>

              {formData.onSale && (
                <div className="md:col-span-2 animate-in fade-in slide-in-from-left-8">
                   <label className="label text-red-700 font-bold flex items-center justify-between">
                      <span>SALE PRICE (₱)</span>
                      {formData.discountPercentage > 0 && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                           {formData.discountPercentage}% OFF
                        </span>
                      )}
                   </label>
                   <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600">₱</span>
                      <input type="number" name="salePrice" className="input-field pl-8 border-red-400 text-red-700 font-bold bg-white" value={formData.salePrice} onChange={handleChange} placeholder="0.00" />
                   </div>
                </div>
              )}
           </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE C — Media & AR
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Upload size={14} /> Product Gallery
           </h2>
           
           <div className="flex flex-wrap gap-4">
              {/* Existing Images */}
              {formData.images.map((url, idx) => (
                <div key={`exist-${idx}`} className="gallery-item relative border rounded-lg overflow-hidden group shadow-sm bg-gray-50">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {idx === 0 && <div className="primary-badge">PRIMARY COVER</div>}
                  
                  <div className="gallery-overlay">
                    <div className="flex items-center justify-center gap-2">
                      <button type="button" onClick={() => moveExistingImage(idx, -1)} disabled={idx === 0} title="Move Left" className="gallery-btn disabled:opacity-30">
                        <ChevronLeft size={16} />
                      </button>
                      <button type="button" onClick={() => setAsPrimary(idx)} disabled={idx === 0} title="Set as Primary" className={`gallery-btn ${idx === 0 ? 'text-yellow-400' : 'text-white'}`}>
                        <Star size={16} fill={idx === 0 ? "currentColor" : "none"} />
                      </button>
                      <button type="button" onClick={() => moveExistingImage(idx, 1)} disabled={idx === formData.images.length - 1} title="Move Right" className="gallery-btn disabled:opacity-30">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <button type="button" onClick={() => removeExistingImage(idx)} className="w-full py-1 bg-red-500/80 hover:bg-red-600 rounded text-white text-[9px] font-bold transition-colors uppercase tracking-wider">
                      Delete Image
                    </button>
                  </div>
                </div>
              ))}

              {/* Previews */}
              {previews.map((url, idx) => (
                <div key={`prev-${idx}`} className="gallery-item relative border-2 border-dashed border-primary/50 rounded-lg overflow-hidden group bg-gray-50/50">
                  <img src={url} alt="" className="w-full h-full object-cover opacity-70" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => removeSelectedFile(idx)} className="p-1.5 bg-red-500 rounded-full text-white shadow-lg"><X size={16} /></button>
                  </div>
                </div>
              ))}

              <label className="gallery-item border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all">
                <Upload size={24} className="text-gray-400 mb-2" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Add Image</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
           </div>

           <div className="mt-6 pt-4 border-t border-dashed flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Shirt size={20} />
                 </div>
                 <div>
                    <h3 className="text-sm font-bold text-indigo-900">Virtual Try-On (AR)</h3>
                    <p className="text-xs text-indigo-700">Add "AR Try-On" tag below to enable for this item.</p>
                 </div>
              </div>
              <button type="button" onClick={() => window.open('/ar-assets', '_blank')} className="btn-outline small border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                Configure AR Assets
              </button>
           </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE D — Composition & Specs
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Palette size={14} /> Material & Aesthetics
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                 <label className="label">Material / Fabric</label>
                 <input type="text" name="material" className="input-field" placeholder="e.g. 100% Organic Silk" value={formData.material} onChange={handleChange} />
              </div>
              <div>
                 <label className="label">Display Color Name</label>
                 <input type="text" name="color" className="input-field" placeholder="e.g. Midnight Azure" value={formData.color} onChange={handleChange} />
              </div>
              <div>
                 <label className="label">Color Filter *</label>
                 <select name="baseColor" className="input-field" value={formData.baseColor} onChange={handleChange} required>
                    {COLOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                 </select>
              </div>
              <div>
                 <label className="label">Collection / Season</label>
                 <select name="season" className="input-field" value={formData.season} onChange={handleChange}>
                    {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
              <div>
                 <label className="label">Occasion</label>
                 <input type="text" name="occasion" className="input-field" placeholder="e.g. Wedding, GALA" value={formData.occasion} onChange={handleChange} />
              </div>
           </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE E — Sizing & Measurements
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-secondary uppercase tracking-widest flex items-center gap-2">
                 <Ruler size={14} /> Sizing & Measurement Grid
              </h2>
              <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">SIZE GUIDE ENABLED</div>
           </div>

           <div className="mb-6">
              <label className="label">Available Sizes *</label>
              <div className="flex flex-wrap gap-3 mt-3">
                 {AVAILABLE_SIZES.map((size) => (
                    <button
                       key={size}
                       type="button"
                       onClick={() => toggleSize(size)}
                       className={`size-btn font-bold border-2 ${
                          formData.sizes.includes(size) 
                          ? 'active shadow-lg' 
                          : ''
                       }`}
                    >
                       {size}
                    </button>
                 ))}
              </div>
           </div>

           <div className="border-t pt-6">
              <div className="flex items-center gap-2 mb-4">
                 <label className="label mb-0">Fit Type</label>
                 <select name="fitAndSizing" className="input-field py-1 text-sm w-auto" value={formData.fitAndSizing} onChange={handleChange}>
                    <option value="">Standard Fit</option>
                    <option value="Slim Fit">Slim Fit</option>
                    <option value="Regular Fit">Regular Fit</option>
                    <option value="Oversized">Oversized</option>
                    <option value="True to Size">True to Size</option>
                 </select>
              </div>
              <MeasurementTable 
                sizes={formData.sizes} 
                measurements={formData.measurements} 
                category={formData.category}
                subCategory={formData.subCategory}
                onChange={(m) => setFormData(prev => ({ ...prev, measurements: m }))} 
              />
           </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE F — Product Story & Metadata
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <BookOpen size={14} /> Product Story & Logistics
           </h2>
           <div className="space-y-4">
              <div>
                 <label className="label">Full Description</label>
                 <textarea name="description" className="input-field" rows="4" placeholder="Tell the item's story..." value={formData.description} onChange={handleChange} />
              </div>
              <div>
                 <label className="label">Care Instructions</label>
                 <input type="text" name="careInstructions" className="input-field" placeholder="e.g. Professional Dry Clean Only" value={formData.careInstructions} onChange={handleChange} />
              </div>
              <div>
                 <label className="label flex items-center gap-2"><TagIcon size={14} /> Tags (Comma separated)</label>
                 <input 
                    type="text" 
                    className="input-field" 
                    placeholder="AR Try-On, New Arrival, High-End" 
                    value={formData.tags?.join(', ') || ''} 
                    onChange={(e) => {
                       const tags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
                       setFormData(prev => ({ ...prev, tags }));
                    }} 
                 />
              </div>
           </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end items-center gap-4 pt-4 sticky bottom-0 bg-white/80 backdrop-blur-sm p-4 border-t z-20">
           <button type="button" onClick={() => navigate('/catalog')} className="btn-secondary">Cancel</button>
           <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Processing...' : (isEditing ? 'Update Product' : 'Create Product')}
           </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
