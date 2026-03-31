import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';
import {
  createProduct,
  updateProduct,
  getProductById,
  getCategories,
  createInventoryItem,
} from '../../services/productService';
import { uploadToCloudinary, deleteFile } from '../../firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { validateForm, productRules, sanitizeText } from '../../utils/validation';
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
    price: '',
    description: '',
    material: '',
    color: '',
    careInstructions: '',
    fitAndSizing: '',
    styleCode: '',
    season: 'All-Season',
    occasion: '',
    visibility: 'Published',
    isFeatured: false,
    isAlterable: false,
    sizes: ['OS'],
    images: [], // Array of image URLs/Maps
  });

  const [categories, setCategories] = useState([
    { name: 'Tops', subcategories: ['T-Shirts', 'Polos', 'Sweaters', 'Cardigans', 'Blouses'] },
    { name: 'Bottoms', subcategories: ['Jeans', 'Trousers', 'Shorts', 'Leggings', 'Joggers'] },
    { name: 'Outerwear', subcategories: ['Jackets', 'Coats', 'Parkas', 'Vests', 'Blazers'] },
    {
      name: 'Dresses & Skirts',
      subcategories: [
        'Mini Dresses',
        'Midi Dresses',
        'Maxi Dresses',
        'A-Line Skirts',
        'Pencil Skirts',
      ],
    },
    { name: 'Innerwear', subcategories: ['Underwear', 'Socks', 'Thermals', 'Camisoles'] },
    { name: 'Accessories', subcategories: ['Bags', 'Belts', 'Hats', 'Scarves', 'Jewelry'] },
    {
      name: 'Special Collections',
      subcategories: ['Collaborations', 'Limited Edition', 'Seasonal Exclusives'],
    },
  ]);
  const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'OS'];
  const SEASONS = [
    'All-Season',
    'Dry Season (Summer)',
    'Wet Season (Rainy)',
    'Cool Season (-Ber Months)',
  ];

  // File uploads
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

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
              price: doc.price || '',
              description: doc.description || '',
              material: doc.material || '',
              color: doc.color || '',
              careInstructions: doc.careInstructions || '',
              fitAndSizing: doc.fitAndSizing || '',
              styleCode: doc.styleCode || '',
              season: doc.season || 'All-Season',
              occasion: doc.occasion || '',
              visibility: doc.visibility || 'Published',
              isFeatured: doc.isFeatured ?? doc.featured ?? false,
              isAlterable: doc.isAlterable || false,
              sizes: doc.sizes || ['OS'],
              images: doc.images || (doc.imageUrl ? [doc.imageUrl] : []),
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
      if (!selectedCat.subcategories.includes(formData.subCategory)) {
        setFormData((prev) => ({ ...prev, subCategory: selectedCat.subcategories[0] }));
      }
    } else {
      setFormData((prev) => ({ ...prev, subCategory: '' }));
    }
  }, [formData.category, categories]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);

    // Create preview URLs
    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
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
          console.log(`[DEBUG] Uploading image ${i + 1} of ${selectedFiles.length} to Cloudinary...`);
          try {
            const imgMap = await uploadToCloudinary(selectedFiles[i]);
            console.log(`[DEBUG] Cloudinary upload success:`, imgMap);
            uploadedImages.push(imgMap.secure_url);
          } catch (uploadErr) {
            console.error(`[DEBUG] Cloudinary upload FAILED for image ${i + 1}:`, uploadErr);
            throw uploadErr;
          }
        }
      }

      console.log('[DEBUG] All images uploaded. Preparing payload...');
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
        visibility: formData.visibility,
        isFeatured: formData.isFeatured,
        isAlterable: formData.isAlterable,
        updated_by: user?.email || 'admin',
        images: finalImages,
        imageUrl: finalImages.length > 0 ? finalImages[0] : '👗',
        timestamp: Date.now(),
      };

      if (isEditing) {
        console.log('[DEBUG] Updating product in Firestore...', { id, payload });
        await updateProduct(id, payload);
        console.log('[DEBUG] Firestore update SUCCESS');
        toast.success('Product updated successfully!');
      } else {
        payload.created_by = user?.email || 'admin';
        payload.stock = 0;
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
      toast.error(`Error saving product: ${err.message}`);
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
                  ?.subcategories?.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
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
          <div className="flex gap-4 items-center mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isFeatured"
                checked={formData.isFeatured}
                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
              />
              <span>Feature this product</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer px-4">
              <input
                type="checkbox"
                name="isAlterable"
                checked={formData.isAlterable}
                onChange={(e) => setFormData({ ...formData, isAlterable: e.target.checked })}
              />
              <span>Allow Alterations & Fitting</span>
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Image Gallery</h2>
          <div className="flex flex-wrap gap-4 mb-4">
            {/* Existing Images */}
            {formData.images.map((url, idx) => (
              <div key={idx} className="relative w-24 h-24 border rounded overflow-hidden">
                <img src={url} alt={`img-${idx}`} className="w-full h-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={() => removeExistingImage(idx)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {/* New Previews */}
            {previews.map((preview, idx) => (
              <div
                key={`prev-${idx}`}
                className="relative w-24 h-24 border border-dashed border-primary rounded overflow-hidden opacity-70"
              >
                <img src={preview} alt="preview" className="w-full h-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={() => removeSelectedFile(idx)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md"
                >
                  <X size={12} />
                </button>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isFeatured: e.target.checked }))}
                />
                <span className="toggle-slider"></span>
              </label>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Featured Product</span>
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
