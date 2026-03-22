import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Save } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument, getDocument } from '../firebase/firestore';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadToCloudinary, deleteFile } from '../firebase/storage';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const ProductForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = Boolean(id);
  
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  
  // Uniqlo-like details
  const [formData, setFormData] = useState({
    name: '',
    category: 'Outerwear',
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
    featured: false,
    sizes: ['OS'],
    images: [] // Array of image URLs/Maps
  });

  const [categories, setCategories] = useState(['Outerwear', 'Tops', 'Bottoms', 'Dresses', 'Accessories']);
  const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'OS'];
  const SEASONS = ['All-Season', 'Summer', 'Winter', 'Spring', 'Autumn'];
  const OCCASIONS = ['Casual', 'Formal', 'Party', 'Wedding', 'Business', 'Resort'];
  
  // File uploads
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    // We could fetch dynamic categories here from DB
    const fetchCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'categories'));
        if (!snap.empty) {
          const cats = snap.docs.map(d => d.data().name);
          setCategories(cats);
        }
      } catch (err) {
        console.error("No custom categories found, using defaults.", err);
      }
    };
    fetchCategories();

    // If editing, load product data
    if (isEditing) {
      const loadProduct = async () => {
        try {
          const doc = await getDocument('products', id);
          if (doc) {
            setFormData({
              name: doc.name || '',
              category: doc.category || categories[0],
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
              featured: doc.featured || false,
              sizes: doc.sizes || ['OS'],
              images: doc.images || (doc.imageUrl ? [doc.imageUrl] : [])
            });
          }
        } catch (e) {
          toast.error("Failed to load product");
          navigate('/catalog');
        } finally {
          setLoading(false);
        }
      };
      loadProduct();
    }
  }, [id, isEditing]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };
  
  const removeExistingImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const toggleSize = (size) => {
    const currentSizes = formData.sizes;
    const newSizes = currentSizes.includes(size)
      ? currentSizes.filter(s => s !== size)
      : [...currentSizes, size];
    setFormData({ ...formData, sizes: newSizes });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.price || formData.sizes.length === 0) {
      toast.error('Name, Price, and at least one Size are required.');
      return;
    }

    setSaving(true);
    try {
      // 1. Upload new images if any
      const uploadedImages = [];
      if (selectedFiles.length > 0) {
        setUploadProgress({ current: 0, total: selectedFiles.length });
      }
      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: selectedFiles.length });
        const imageMap = await uploadToCloudinary(selectedFiles[i]);
        uploadedImages.push(imageMap.secure_url);
      }
      setUploadProgress({ current: 0, total: 0 });

      const finalImages = [...formData.images, ...uploadedImages];
      
      const payload = {
        name: formData.name,
        category: formData.category,
        price: parseFloat(formData.price),
        sizes: formData.sizes,
        description: formData.description,
        material: formData.material,
        color: formData.color,
        careInstructions: formData.careInstructions,
        fitAndSizing: formData.fitAndSizing,
        styleCode: formData.styleCode,
        season: formData.season,
        occasion: formData.occasion,
        visibility: formData.visibility,
        featured: formData.featured,
        created_by: user?.email || 'unknown',
        images: finalImages,
        // Legacy fallback
        imageUrl: finalImages.length > 0 ? finalImages[0] : '👗',
        timestamp: Date.now()
      };

      if (isEditing) {
        await updateDocument('products', id, payload);
        toast.success('Product updated successfully!');
      } else {
        // Generate pseudo-SKU based on product name
        const getNameAcronym = (name) => {
           const words = name.split(' ').filter(w => w.trim().length > 0);
           if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
           if (words.length === 1) return name.substring(0, 3).toUpperCase();
           return 'ITM';
        };
        const acronym = getNameAcronym(formData.name);
        
        const snap = await getDocs(collection(db, 'products'));
        payload.id = `${acronym}-${String(snap.size + 1).padStart(3, '0')}`;
        payload.stock = 0;
        payload.tags = ['New Arrival'];
        
        const newDocId = await addDocument('products', payload);
        
        // Init inventory
        for (const size of payload.sizes) {
          await addDocument('inventory', {
            productDocId: newDocId,
            sku: payload.id,
            item: payload.name,
            category: payload.category,
            size: size,
            total: 0,
            reserved: 0,
            available: 0
          });
        }
        toast.success('Product created successfully!');
      }
      
      navigate('/catalog');
    } catch (err) {
      toast.error(`Error saving product: ${err.message}`);
    } finally {
      setSaving(false);
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
              <input type="text" name="name" className="input-field" value={formData.name} onChange={handleChange} required />
            </div>
            <div>
              <label className="label">Price ($) *</label>
              <input type="number" name="price" className="input-field" value={formData.price} onChange={handleChange} required min="0" step="0.01"/>
            </div>
            <div>
              <label className="label">Category</label>
              <select name="category" className="input-field" value={formData.category} onChange={handleChange}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Style Code / SKU</label>
              <input type="text" name="styleCode" className="input-field" value={formData.styleCode} onChange={handleChange} placeholder="e.g. JZ-4001" />
            </div>
          </div>
        </section>

        <section>
            <h2 className="text-xl font-semibold mb-4 border-b pb-2">Image Gallery</h2>
            <div className="flex flex-wrap gap-4 mb-4">
                {/* Existing Images */}
                {formData.images.map((url, idx) => (
                    <div key={idx} className="relative w-24 h-24 border rounded overflow-hidden">
                        <img src={url} alt={`img-${idx}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeExistingImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md">
                            <X size={12} />
                        </button>
                    </div>
                ))}
                {/* New Previews */}
                {previews.map((preview, idx) => (
                    <div key={`prev-${idx}`} className="relative w-24 h-24 border border-dashed border-primary rounded overflow-hidden opacity-70">
                         <img src={preview} alt="preview" className="w-full h-full object-cover" />
                         <button type="button" onClick={() => removeSelectedFile(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md">
                            <X size={12} />
                        </button>
                    </div>
                ))}
                
                {/* Upload Button */}
                <label className="w-24 h-24 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition">
                    <Upload size={24} className="text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500 text-center">Add Image</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
            </div>
        </section>

        {/* Variations */}
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Variations & Specifications</h2>
          <div className="mb-4">
            <label className="label">Available Sizes *</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {AVAILABLE_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    formData.sizes.includes(size)
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Color (Name)</label>
              <input type="text" name="color" className="input-field" value={formData.color} onChange={handleChange} placeholder="e.g. Ruby Red" />
            </div>
            <div>
              <label className="label">Fit & Sizing</label>
              <select name="fitAndSizing" className="input-field" value={formData.fitAndSizing} onChange={handleChange}>
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
              <select name="season" className="input-field" value={formData.season} onChange={handleChange}>
                  {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Occasion</label>
              <select name="occasion" className="input-field" value={formData.occasion} onChange={handleChange}>
                <option value="">Select Occasion</option>
                {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          {/* Visibility & Featured */}
          <div style={{display: 'flex', gap: '2rem', marginTop: '1rem', alignItems: 'center'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <label className="label" style={{marginBottom: 0}}>Visibility</label>
              <select name="visibility" className="input-field" style={{width: 'auto', minWidth: 120}} value={formData.visibility} onChange={handleChange}>
                <option value="Published">Published</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <label className="toggle-switch">
                <input type="checkbox" checked={formData.featured} onChange={e => setFormData(prev => ({...prev, featured: e.target.checked}))} />
                <span className="toggle-slider"></span>
              </label>
              <span style={{fontSize: '0.875rem', fontWeight: 500}}>Featured Product</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Product Description</label>
              <textarea name="description" className="input-field" rows="3" value={formData.description} onChange={handleChange}></textarea>
            </div>
            <div>
              <label className="label">Material/Fabric</label>
              <input type="text" name="material" className="input-field" value={formData.material} onChange={handleChange} />
            </div>
            <div>
              <label className="label">Care Instructions</label>
              <input type="text" name="careInstructions" className="input-field" value={formData.careInstructions} onChange={handleChange} />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4 border-t">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (uploadProgress.total > 0 ? `Uploading image ${uploadProgress.current} of ${uploadProgress.total}...` : 'Saving...') : (isEditing ? 'Save Changes' : 'Create Product')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;
