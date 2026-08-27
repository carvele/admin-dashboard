import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Shirt, Tag as TagIcon, ChevronLeft, ChevronRight, Ruler, DollarSign, Eye, Layers, Palette, BookOpen, Package, Star, Sparkles, Edit2, Grid3X3, CheckSquare, Square } from 'lucide-react';
import {
  createProduct,
  updateProduct,
  getProductById,
  createInventoryItem,
  getInventory,
  getStockMovements,
} from '../../services/productService';
import { logAction } from '../../services/staffService';
import { getLogsForTarget } from '../../lib/supabaseService';
import HistoryTimeline from '../../components/HistoryTimeline';
import { routeAndUploadFile } from '../../lib/storage';
import { getReservationsByProduct } from '../../services/reservationService';
import { subscribeToCategories } from '../../services/productService';
import MeasurementTable from '../../components/catalog/MeasurementTable';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { validateForm, productRules, sanitizeText } from '../../utils/validation';
import { AVAILABLE_SIZES } from '../../utils/constants';
import { getColorList } from '../../services/inventoryService';
import {
  buildVariantMatrix,
  createVariant,
  variantColumnsAvailable,
  variantKey,
  syncProductAttributesFromVariants,
} from '../../services/variantService';
import { Logger } from '../../utils/Logger';
import { supabase } from '../../lib/supabaseClient';
import { toast } from 'sonner';
import './ProductForm.css';

const ProductForm = ({ readOnly = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [, setOldData] = useState(null); // To track changes for sync
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [productHistory, setProductHistory] = useState([]);
  const [loadingProductHistory, setLoadingProductHistory] = useState(false);
  const [showArConfirm, setShowArConfirm] = useState(false);

  // Uniqlo-like details
  const [formData, setFormData] = useState({
    name: '',
    category: 'Tops',
    subCategory: '',
    price: '',
    description: '',
    material: '',
    color: '', // Derived on save from `colors` (comma-joined; mobile app splits on ',')
    colors: [], // Multi-select available colours the customer can choose from
    baseColor: '', // Primary colour (colors[0]) — used for admin catalog filtering
    pattern: 'Solid', // Populated from pattern_list on mount
    careInstructions: '',
    fitAndSizing: '',
    styleCode: '',
    season: 'All-Season',
    occasion: '',
    visibility: 'draft',
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
  const [colorList, setColorList] = useState([]);
  // Variant matrix
  const [variantColumnsReady, setVariantColumnsReady] = useState(false);
  const [variantMatrix, setVariantMatrix] = useState([]);
  // Set<variantKey> of combinations the staff has ticked
  const [selectedVariants, setSelectedVariants] = useState(new Set());
  // File uploads
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [, setUploadProgress] = useState({ current: 0, total: 0 });
  const previewUrlsRef = React.useRef([]);

  // Cleanup local image preview object URLs on component unmount to prevent memory leaks.
  // Intentionally reads previewUrlsRef.current at cleanup time (not a mount-time
  // snapshot) so it revokes every URL accumulated over the form's lifetime, not
  // just what existed when this effect first ran.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      previewUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // URL may already be revoked; safe to ignore
        }
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

  // Load admin-managed color and pattern lists from Supabase + probe variant columns
  useEffect(() => {
    getColorList()
      .then((list) => {
        setColorList(list);
        setFormData((prev) => ({
          ...prev,
          baseColor: prev.baseColor || (list[0]?.name ?? ''),
        }));
      })
      .catch((err) => console.error('Failed to load color list:', err));

    variantColumnsAvailable()
      .then((ok) => setVariantColumnsReady(ok))
      .catch(() => setVariantColumnsReady(false));
  }, []);

  useEffect(() => {
      const loadProduct = async () => {
        try {
          const docParams = await getProductById(id);
          if (docParams) {
             setOldData(docParams);
             // Colours are stored comma-joined in `color`; fall back to the
             // legacy single `baseColor` so older products still populate.
             const parsedColors = docParams.color
               ? String(docParams.color).split(',').map((c) => c.trim()).filter(Boolean)
               : (docParams.baseColor ? [docParams.baseColor] : []);
             setFormData(prev => ({
                ...prev,
                ...docParams,
                name: docParams.name || '',
                category: docParams.category || prev.category || 'Tops',
                subCategory: docParams.subCategory || '',
                price: docParams.price ?? '',
                description: docParams.description || '',
                material: docParams.material || '',
                color: docParams.color || '',
                baseColor: docParams.baseColor || '',
                pattern: docParams.pattern || 'Solid',
                careInstructions: docParams.careInstructions || '',
                fitAndSizing: docParams.fitAndSizing || '',
                styleCode: docParams.styleCode || '',
                season: docParams.season || 'All-Season',
                occasion: docParams.occasion || '',
                visibility: docParams.visibility || 'draft',
                discountPercentage: docParams.discountPercentage ?? 0,
                salePrice: docParams.salePrice ?? '',
                isNewArrival: docParams.isNewArrival ?? (docParams.tags || []).includes('New Arrival'),
                sizes: docParams.sizes || [],
                colors: parsedColors,
                images: docParams.images || [],
                measurements: docParams.measurements || {},
                tags: docParams.tags || []
             }));
             
             // Fetch order history for this product
             setLoadingHistory(true);
             try {
                const history = await getReservationsByProduct(id, docParams.name);
                setOrderHistory(history);
             } catch (err) {
                console.error("Failed fetching order history", err);
             } finally {
                setLoadingHistory(false);
             }

             // Fetch product history: stock ledger + audit log, merged newest-first
             setLoadingProductHistory(true);
             try {
                const [movements, logs] = await Promise.all([
                   getStockMovements(id),
                   getLogsForTarget('product', id),
                ]);
                const MOVEMENT_LABELS = {
                   restock: '📦 Restock',
                   sale: '🛒 In-Store Sale',
                   reservation: '📅 Reservation',
                   manual_adjustment: '✏️ Stock Adjustment',
                   correction: '🔧 Stock Correction',
                };
                const entries = [
                   ...movements.map((m) => ({
                      id: `sm-${m.id}`,
                      typeLabel: MOVEMENT_LABELS[m.changeType] || m.changeType,
                      previousValue: `${m.previousStock} units`,
                      newValue: `${m.newStock} units`,
                      note: m.note,
                      timestamp: m.createdAt,
                   })),
                   ...logs.map((l) => ({
                      id: `log-${l.id}`,
                      typeLabel: `📝 ${l.action}`,
                      note: null,
                      actorName: l.userName,
                      timestamp: l.timestamp,
                   })),
                ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                setProductHistory(entries);
             } catch (err) {
                console.error("Failed fetching product history", err);
             } finally {
                setLoadingProductHistory(false);
             }
          } else {
             toast.error('Product not found.');
             navigate('/catalog');
          }
        } catch {
          toast.error('Failed to load product details.');
        } finally {
          setLoading(false);
        }
      };
      if (isEditing) loadProduct();
  }, [id, isEditing, navigate]);


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

  // Rebuild variant matrix: Size × Color only (no pattern dimension)
  const rebuildMatrix = useCallback(
    (sizes, colors, existingVariants = []) => {
      // Always pass patterns=[''] so every cell has pattern=''
      const matrix = buildVariantMatrix({ sizes, colors, patterns: [''] }, existingVariants);
      setVariantMatrix(matrix);
      // Auto-select all size x color combinations by default
      setSelectedVariants(() => {
        const next = new Set();
        matrix.forEach((cell) => {
          next.add(cell.key);
        });
        return next;
      });
    },
    [],
  );

  // Re-run whenever sizes or colors change
  useEffect(() => {
    if (!variantColumnsReady) return;
    rebuildMatrix(formData.sizes, formData.colors || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.sizes, formData.colors, variantColumnsReady]);

  // When editing: fetch live variants to pre-tick existing combos
  useEffect(() => {
    if (!isEditing || !id || !variantColumnsReady) return;
    import('../../services/variantService').then(({ getProductVariants }) => {
      getProductVariants(id).then((existing) => {
        rebuildMatrix(formData.sizes, formData.colors || [], existing);
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, id, variantColumnsReady]);



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
  }, [formData.category, formData.subCategory, categories]);

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
      } catch {
        // URL may already be revoked; safe to ignore
      }
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

  const toggleSize = (size) => {
    const currentSizes = formData.sizes;
    const newSizes = currentSizes.includes(size)
      ? currentSizes.filter((s) => s !== size)
      : [...currentSizes, size];
    setFormData({ ...formData, sizes: newSizes });
  };

  const toggleColor = (colorName) => {
    const current = formData.colors || [];
    const next = current.includes(colorName)
      ? current.filter((c) => c !== colorName)
      : [...current, colorName];
    setFormData({ ...formData, colors: next });
  };

  const toggleVariant = (key) => {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVariantsForSize = (size) => {
    const sizeKeys = variantMatrix.filter((c) => c.size === size).map((c) => c.key);
    const allSelected = sizeKeys.every((k) => selectedVariants.has(k));
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      sizeKeys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const selectAllVariants = () => {
    setSelectedVariants(new Set(variantMatrix.map((c) => c.key)));
  };

  const clearAllVariants = () => {
    // Keep existing variants selected (can't de-select stocked combos)
    setSelectedVariants(new Set(variantMatrix.filter((c) => c.exists).map((c) => c.key)));
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
    if (readOnly) return;

    // 1. Validate Form
    const { isValid, errors } = validateForm(formData, productRules);
    if (!isValid || formData.sizes.length === 0 || (formData.colors || []).length === 0) {
      const errorMsg =
        formData.sizes.length === 0 ? 'At least one size is required'
        : (formData.colors || []).length === 0 ? 'At least one color is required'
        : Object.values(errors)[0];
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
      }      const finalImages = [...formData.images, ...uploadedImages];

      const payload = {
        name: sanitizeText(formData.name),
        category: formData.category,
        subCategory: formData.subCategory,
        price: parseFloat(formData.price),
        sizes: formData.sizes,
        description: sanitizeText(formData.description),
        material: sanitizeText(formData.material),
        // Persist the selected colours comma-joined; the mobile product page
        // splits `color` on ',' to render its colour picker.
        color: (formData.colors || []).join(', '),
        careInstructions: sanitizeText(formData.careInstructions),
        fitAndSizing: formData.fitAndSizing,
        styleCode: formData.styleCode,
        season: formData.season,
        occasion: formData.occasion,
        visibility: formData.visibility,
        isFeatured: formData.isFeatured,
        isNewArrival: formData.isNewArrival,
        isAlterable: formData.isAlterable,
        updated_by: user?.id || null,
        images: finalImages,
        imageUrl: finalImages.length > 0 ? finalImages[0] : '👗',
        // Sale Fields
        onSale: formData.onSale,
        discountPercentage: parseInt(formData.discountPercentage) || 0,
        salePrice: formData.onSale ? parseFloat(formData.salePrice) : null,
        // New Categorization — primary colour drives admin catalog filtering
        baseColor: (formData.colors || [])[0] || '',
        pattern: formData.pattern,
        measurements: formData.measurements,

        tags: formData.tags || [],
      };

      if (isEditing) {
        await updateProduct(id, payload);

        // Sync inventory: create new variant combos, soft-delete removed ones
        try {
          const allInv = await getInventory();
          const productInv = allInv.filter(
            (inv) =>
              (inv.productDocId || inv.product_doc_id) === id ||
              inv.sku === id ||
              (formData.styleCode && inv.sku === formData.styleCode),
          );

          if (variantColumnsReady && selectedVariants.size > 0) {
            // Variant-aware path: add newly selected combos
            const existingKeys = new Set(
              productInv.filter((inv) => !inv.deleted).map((inv) =>
                variantKey({ size: inv.size ?? '', color: inv.color ?? '', pattern: inv.pattern ?? '' }),
              ),
            );
            const toCreate = variantMatrix.filter(
              (cell) => selectedVariants.has(cell.key) && !existingKeys.has(cell.key),
            );
            for (const cell of toCreate) {
              await createVariant(id, {
                size: cell.size,
                color: cell.color,
                pattern: '',
                item: payload.name,
                category: payload.category,
                sku: payload.styleCode,
                // price: payload.price, // PGRST204 fix: price column does not exist on inventory
              });
            }
            Logger.info(`Created ${toCreate.length} new variant rows for product ${id}`);

            // Soft-delete deselected variants that have zero stock
            const toSoftDelete = productInv.filter((inv) => {
              if (inv.deleted) return false;
              const k = variantKey({ size: inv.size ?? '', color: inv.color ?? '', pattern: inv.pattern ?? '' });
              return !selectedVariants.has(k) && Number(inv.total ?? 0) === 0;
            });
            if (toSoftDelete.length > 0) {
              const now = new Date().toISOString();
              await supabase
                .from('inventory')
                .update({ deleted: true, deleted_at: now, updated_at: now })
                .in('id', toSoftDelete.map((inv) => inv.id));
              Logger.info(`Soft-deleted ${toSoftDelete.length} empty variant rows`);
            }
            await syncProductAttributesFromVariants(id);
          } else {
            // Legacy path: diff by size only
            const existingSizes = productInv.filter((inv) => !inv.deleted).map((inv) => inv.size);
            const newSizes = payload.sizes.filter((sz) => !existingSizes.includes(sz));
            if (newSizes.length > 0) {
              Logger.info(`Initializing missing inventory for updated sizes ${id}...`);
              await Promise.all(
                newSizes.map((size) =>
                  createInventoryItem({
                    productDocId: id,
                    sku: payload.id || payload.styleCode,
                    item: payload.name,
                    category: payload.category,
                    size,
                    total: 0,
                    reserved: 0,
                    available: 0,
                  }),
                ),
              );
            }
            // Soft-delete removed sizes with zero stock
            const removedInventory = productInv.filter(
              (inv) =>
                !inv.deleted &&
                !payload.sizes.includes(inv.size) &&
                Number(inv.total ?? 0) === 0,
            );
            if (removedInventory.length > 0) {
              const now = new Date().toISOString();
              await supabase
                .from('inventory')
                .update({ deleted: true, deleted_at: now, updated_at: now })
                .in('id', removedInventory.map((inv) => inv.id));
              Logger.info(`Soft-deleted ${removedInventory.length} inventory rows for removed sizes`);
            }
          }
        } catch (invErr) {
          console.error('Checking/Adding missing variant combinations failed:', invErr);
        }

        await logAction(user, 'Updated product details', {
          targetType: 'product',
          targetId: id,
          productName: payload.name,
        });

        toast.success('Product updated successfully!');
      } else {
        payload.created_by = user?.id || null;
        payload.stock = 0;
        payload.status = 'Out of Stock';
        payload.visibility = 'draft';
        payload.tags = ['New Arrival'];

        const newDocId = await createProduct(payload);

        Logger.info(`Initializing inventory variants for new product ${newDocId}...`);
        if (variantColumnsReady && selectedVariants.size > 0) {
          // Variant-aware path: create one row per selected (size, color) combo
          const toCreate = variantMatrix.filter((cell) => selectedVariants.has(cell.key));
          for (const cell of toCreate) {
            await createVariant(newDocId, {
              size: cell.size,
              color: cell.color,
              pattern: '',
              item: payload.name,
              category: payload.category,
              sku: payload.styleCode,
              // price: payload.price, // PGRST204 fix: price column does not exist on inventory
            });
          }
          await syncProductAttributesFromVariants(newDocId);
        } else {
          // Legacy fallback: one row per size, no colour/pattern
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
        }

        await logAction(user, 'Created new product', {
          targetType: 'product',
          targetId: newDocId,
          productName: payload.name,
        });
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

  // Merge colors from settings color_list with any colors currently saved on this product
  const allAvailableColors = React.useMemo(() => {
    const listNames = colorList.map((c) => (typeof c === 'string' ? c : c.name));
    const merged = [...new Set([...listNames, ...(formData.colors || [])])].filter(Boolean);
    return merged;
  }, [colorList, formData.colors]);

  if (loading) return <div className="p-8">Loading product data...</div>;

  return (
    <div className="p-6">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/catalog')} className="btn-secondary p-2">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <h1 className="text-2xl font-bold">
                {readOnly ? 'Product Details' : isEditing ? 'Edit Product' : 'Add New Product'}
             </h1>
             {formData.styleCode && (
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-gray-200">
                  SKU: {formData.styleCode}
                </span>
             )}
          </div>
          <p className="text-sm text-secondary mt-0.5">
            {readOnly
              ? 'Viewing in read-only mode — switch to Edit to make changes.'
              : 'Fill in the details below — required fields are marked with *'}
          </p>
        </div>
        {readOnly && (
          <button
            type="button"
            onClick={() => navigate('/catalog/edit/' + id)}
            className="btn-primary flex items-center gap-2"
          >
            <Edit2 size={16} /> Edit Product
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset disabled={readOnly} style={readOnly ? { border: 0, padding: 0, margin: 0 } : undefined}>

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
                    <label className="label" htmlFor="product-name">Product Name *</label>
                    <input
                      id="product-name"
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
                    <label className="label" htmlFor="product-category">Category *</label>
                    <select id="product-category" name="category" className="input-field" value={formData.category || ''} onChange={handleChange}>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="product-subcategory">Sub-Category</label>
                    <select
                      id="product-subcategory"
                      name="subCategory"
                      className="input-field"
                      value={formData.subCategory || ''}
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
                      <label className="label mb-0" htmlFor="product-visibility-mobile">Visibility</label>
                      <select id="product-visibility-mobile" name="visibility" className="input-field py-1 text-sm w-32" value={formData.visibility} onChange={handleChange}>
                        <option value="draft">Draft</option>
                        <option value="public">Published</option>
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

                   </div>
                </div>
             </div>

             <div className="md:w-72 space-y-4 border-l pl-6 hidden md:block" style={{ minWidth: '18rem' }}>
                <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                   <Eye size={14} /> Publication Status
                </h2>
                <div className="space-y-3">
                   <div>
                      <label className="label" htmlFor="product-visibility-desktop">Visibility</label>
                      <select id="product-visibility-desktop" name="visibility" className="input-field py-1 text-sm" value={formData.visibility} onChange={handleChange}>
                        <option value="draft">Draft</option>
                        <option value="public">Published</option>
                      </select>
                   </div>
                   <div className="flex flex-col gap-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" name="isFeatured" checked={formData.isFeatured} onChange={handleChange} className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">Featured Item</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer group pt-2 border-t border-dashed mt-1" aria-label="Force New Arrival">
                         <input type="checkbox" name="isNewArrival" checked={formData.isNewArrival} onChange={handleChange} className="w-4 h-4 accent-primary" style={{ flexShrink: 0 }} />
                         <div style={{ minWidth: 0, overflow: 'hidden' }}>
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
              <label className="flex items-center gap-2 cursor-pointer" htmlFor="onSale-toggle">
                 <span className={`text-sm font-bold ${formData.onSale ? 'text-red-600' : 'text-secondary'}`}>ON SALE</span>
                 <div
                    id="onSale-toggle"
                    role="checkbox"
                    aria-checked={formData.onSale}
                    tabIndex="0"
                    onClick={() => handleChange({ target: { name: 'onSale', type: 'checkbox', checked: !formData.onSale } })}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleChange({ target: { name: 'onSale', type: 'checkbox', checked: !formData.onSale } }); } }}
                    className={`w-10 h-5 rounded-full relative transition-colors ${formData.onSale ? 'bg-red-500' : 'bg-gray-300'}`}
                 >
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${formData.onSale ? 'translate-x-5' : ''}`} />
                 </div>
              </label>
           </div>

           <div className={`grid grid-cols-1 ${formData.onSale ? 'md:grid-cols-3' : ''} gap-6`}>
              <div>
                 <label className="label" htmlFor="product-price">Regular Rental Price (₱) *</label>
                 <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">₱</span>
                    <input id="product-price" type="number" name="price" className="input-field pl-8" placeholder="0.00" value={formData.price} onChange={handleChange} required step="0.01" min="0" />
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
                      <input id="product-saleprice" type="number" name="salePrice" className="input-field pl-8 border-red-400 text-red-700 font-bold bg-white" value={formData.salePrice} onChange={handleChange} placeholder="0.00" min="0" step="0.01" />
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
                  <img src={url} alt="" className="w-full h-full object-contain" />
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
                  <img src={url} alt="" className="w-full h-full object-contain opacity-70" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => removeSelectedFile(idx)} className="p-1.5 bg-red-500 rounded-full text-white shadow-lg"><X size={16} /></button>
                  </div>
                </div>
              ))}

              <label className="gallery-item border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all">
                <Upload size={24} className="text-gray-400 mb-2" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Add Image</span>
                <input id="product-images" name="product-images" type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
           </div>

           <div className="mt-6 pt-4 border-t border-dashed flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Shirt size={20} />
                 </div>
                 <div>
                    <h3 className="text-sm font-bold text-indigo-900">Virtual Try-On (AR)</h3>
                    <p className="text-xs text-indigo-700">Add &quot;AR Try-On&quot; tag below to enable for this item.</p>
                 </div>
              </div>
              <button type="button" onClick={() => readOnly ? navigate('/ar-assets') : setShowArConfirm(true)} className="btn-outline small border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                Configure AR Assets
              </button>
           </div>
        </section>

        {/* ══════════════════════════════════════════════
            ZONE D — Material & Color
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Palette size={14} /> Material & Color
           </h2>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <span className="label">Product Color *</span>
                 {allAvailableColors.length === 0 ? (
                    <p className="text-sm text-secondary mt-2">
                       No colors defined yet. Add colors in Settings to enable selection.
                    </p>
                 ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                       {allAvailableColors.map((colorName) => {
                          const isSelected = (formData.colors || []).includes(colorName);
                          return (
                             <button
                                key={colorName}
                                type="button"
                                onClick={() => !readOnly && toggleColor(colorName)}
                                className={`color-chip ${isSelected ? 'active' : ''}`}
                                disabled={readOnly}
                             >
                                {colorName}
                             </button>
                          );
                       })}
                    </div>
                 )}
                  {(formData.colors || []).length > 0 && (
                     <p className="text-xs text-secondary mt-2">
                        Selected color(s): <strong>{(formData.colors || []).join(', ')}</strong>
                     </p>
                  )}
              </div>

              <div>
                 <label className="label" htmlFor="product-material">Material / Fabric</label>
                 <input id="product-material" type="text" name="material" className="input-field" placeholder="e.g. 100% Organic Silk" value={formData.material || ''} onChange={handleChange} />
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
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" name="isAlterable" checked={formData.isAlterable} onChange={handleChange} className="w-4 h-4 accent-primary" />
                  <span className="text-sm font-bold text-primary transition-colors">ALTERABLE</span>
                </label>
                <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">SIZE GUIDE ENABLED</div>
              </div>
           </div>

           <div className="mb-6">
              <span className="label">Available Sizes *</span>
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
              <div className="mb-4" style={{ maxWidth: '20rem' }}>
                 <label className="label" htmlFor="product-fit-type">Fit Type</label>
                 <select id="product-fit-type" name="fitAndSizing" className="input-field" value={formData.fitAndSizing || ''} onChange={handleChange}>
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
            ZONE E.5 — Stock Variant Selector
            (which color variants to stock per size)
        ══════════════════════════════════════════════ */}
        {variantColumnsReady && formData.sizes.length > 0 && (formData.colors || []).length > 0 && (
        <section className="card p-6" style={{ border: '2px solid var(--category-indigo-bg)' }}>
           <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--category-indigo-text)' }}>
                 <Grid3X3 size={14} /> Stock Variant Selector
              </h2>
              <div className="flex items-center gap-2">
                 <span className="text-xs text-secondary">
                    {selectedVariants.size} / {variantMatrix.length} combinations selected
                 </span>
                 <button
                   type="button"
                   style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--category-indigo-bg)', color: 'var(--category-indigo-text)', border: 'none', cursor: 'pointer' }}
                   onClick={selectAllVariants}
                 >
                   Select All
                 </button>
                 <button
                   type="button"
                   style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'var(--stock-none-bg)', color: 'var(--stock-none)', border: 'none', cursor: 'pointer' }}
                   onClick={clearAllVariants}
                 >
                   Reset
                 </button>
              </div>
           </div>
           <p className="text-xs text-secondary mb-5">
             Choose which color variants to stock for each size. Each selected combination gets its own inventory row — restocking or selling always targets the exact size + color.
           </p>

           <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             {formData.sizes.map((size) => {
               const sizeVariants = variantMatrix.filter((c) => c.size === size);
               const allSelected = sizeVariants.length > 0 && sizeVariants.every((c) => selectedVariants.has(c.key));
               const someSelected = sizeVariants.some((c) => selectedVariants.has(c.key));
               return (
                 <div
                   key={size}
                   style={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: 12,
                     padding: '10px 14px',
                     borderRadius: 10,
                     background: someSelected ? 'var(--category-indigo-bg)' : 'var(--surface)',
                     border: `1.5px solid ${someSelected ? 'var(--category-indigo-text)' : 'var(--border-color)'}`,
                     transition: 'all 0.15s',
                   }}
                 >
                   {/* Size label + row toggle */}
                   <div style={{ minWidth: 80, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                     <span className="size-badge" style={{ fontSize: 13, fontWeight: 800 }}>{size}</span>
                     <button
                       type="button"
                       onClick={() => toggleAllVariantsForSize(size)}
                       style={{ fontSize: '9px', fontWeight: 700, color: 'var(--category-indigo-text)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                     >
                       {allSelected ? 'Deselect all' : 'Select all'}
                     </button>
                   </div>

                   {/* Color chips */}
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                     {sizeVariants.map((cell) => {
                       const checked = selectedVariants.has(cell.key);
                       return (
                         <button
                           key={cell.key}
                           type="button"
                           onClick={() => toggleVariant(cell.key)}
                           style={{
                             display: 'inline-flex',
                             alignItems: 'center',
                             gap: 5,
                             padding: '5px 12px',
                             borderRadius: 20,
                             fontSize: 12,
                             fontWeight: 600,
                             cursor: 'pointer',
                             border: `2px solid ${checked ? 'var(--category-indigo-text)' : 'var(--border-color)'}`,
                             background: checked ? 'var(--category-indigo-text)' : 'var(--surface)',
                             color: checked ? 'var(--on-accent)' : 'var(--text-secondary)',
                             transition: 'all 0.15s',
                             position: 'relative',
                           }}
                         >
                           {checked ? <CheckSquare size={12} /> : <Square size={12} />}
                           {cell.color || 'Default'}
                           {cell.exists && (
                             <span
                               title="Already stocked"
                               style={{
                                 width: 6, height: 6,
                                 borderRadius: '50%',
                                 background: '#10b981',
                                 display: 'inline-block',
                                 marginLeft: 2,
                               }}
                             />
                           )}
                         </button>
                       );
                     })}
                   </div>
                 </div>
               );
             })}
           </div>

           <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 10 }}>
             <span style={{ color: '#10b981', fontWeight: 700 }}>●</span> Already stocked — deselecting a stocked variant with existing units will NOT delete it.
           </p>
        </section>
        )}

        {/* ══════════════════════════════════════════════
            ZONE F — Product Story & Metadata
        ══════════════════════════════════════════════ */}
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <BookOpen size={14} /> Product Story & Logistics
           </h2>
           <div className="space-y-4">
              <div>
                 <label className="label" htmlFor="product-description">Full Description</label>
                 <textarea id="product-description" name="description" className="input-field" rows="4" placeholder="Tell the item's story..." value={formData.description || ''} onChange={handleChange} />
              </div>
              <div>
                 <label className="label" htmlFor="product-care-instructions">Care Instructions</label>
                 <input id="product-care-instructions" type="text" name="careInstructions" className="input-field" placeholder="e.g. Professional Dry Clean Only" value={formData.careInstructions || ''} onChange={handleChange} />
              </div>
              <div>
                 <span className="label flex items-center gap-2 mb-2"><TagIcon size={14} /> Product Tags & Attributes</span>
                 <div className="flex flex-wrap gap-3">
                    {[
                       { label: 'New Arrival', stateKey: 'isNewArrival' },
                       { label: 'AR Try-On', tagValue: 'AR Try-On' },
                       { label: 'Limited Edition', tagValue: 'Limited Edition' },
                       { label: 'Sale', stateKey: 'onSale' }
                    ].map((item) => {
                       const isChecked = item.stateKey 
                          ? formData[item.stateKey] 
                          : (formData.tags || []).includes(item.tagValue);
                       
                       return (
                          <button
                             key={item.label}
                             type="button"
                             onClick={() => {
                                if (item.stateKey) {
                                   const newChecked = !formData[item.stateKey];
                                   setFormData(prev => {
                                      const tags = new Set(prev.tags || []);
                                      if (newChecked) tags.add(item.label);
                                      else tags.delete(item.label);
                                      return { ...prev, [item.stateKey]: newChecked, tags: Array.from(tags) };
                                   });
                                } else {
                                   setFormData(prev => {
                                      const current = prev.tags || [];
                                      const updated = current.includes(item.tagValue)
                                         ? current.filter(t => t !== item.tagValue)
                                         : [...current, item.tagValue];
                                      return { ...prev, tags: updated };
                                   });
                                }
                             }}
                             className={`px-4 py-2 rounded-lg border-2 text-xs font-bold transition-all flex items-center gap-2 ${
                                isChecked
                                   ? 'bg-[var(--accent)] text-[var(--on-accent,#1f1c18)] border-[var(--accent)] shadow-sm'
                                   : 'bg-[var(--surface)] text-secondary border-[var(--border-color)] hover:border-[var(--accent)]'
                             }`}
                          >
                             <span>{isChecked ? '✓' : '+'}</span>
                             <span>{item.label}</span>
                          </button>
                       );
                    })}
                 </div>
              </div>
           </div>
        </section>

        {isEditing && (
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><Package size={14} /> Order History</span>
              <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{orderHistory.length} Total Orders</span>
           </h2>
           {loadingHistory ? (
              <div className="text-center py-4 text-sm text-gray-500">Loading order history...</div>
           ) : orderHistory.length === 0 ? (
              <div className="text-center py-4 text-sm text-gray-500">No orders found for this product yet.</div>
           ) : (
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm text-gray-700">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                       <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Order ID</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {orderHistory.map(order => {
                         const orderDate = new Date(order.timestamp || order.createdAt || order.reservationDate?.seconds * 1000 || Date.now());
                         return (
                           <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs">{order.id}</td>
                              <td className="px-4 py-3 font-medium">{order.customerName || order.customer || 'Guest'}</td>
                              <td className="px-4 py-3 text-secondary">{orderDate.toLocaleDateString()}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  order.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                  order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {order.status || 'Pending'}
                                </span>
                              </td>
                           </tr>
                         );
                       })}
                    </tbody>
                 </table>
              </div>
           )}
        </section>
        )}

        {isEditing && (
        <section className="card p-6">
           <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers size={14} /> Product History
           </h2>
           <HistoryTimeline
              entries={productHistory}
              loading={loadingProductHistory}
              emptyText="No stock movements or changes recorded for this product yet."
           />
        </section>
        )}
        </fieldset>

        {/* Actions */}
        <div
          className="flex justify-end items-center gap-4 pt-4 sticky bottom-0 p-4 border-t z-20"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border-color)',
            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
           <button type="button" onClick={() => navigate('/catalog')} className="btn-secondary">
              {readOnly ? 'Back to Catalog' : 'Cancel'}
           </button>
           {!readOnly && (
             <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Processing...' : (isEditing ? 'Update Product' : 'Create Product')}
             </button>
           )}
        </div>
      </form>

      <ConfirmDialog
        isOpen={showArConfirm}
        title="Unsaved Changes"
        message="You may have unsaved changes on this product. Are you sure you want to leave and configure AR Assets? Any unsaved data will be lost."
        confirmText="Leave Page"
        onConfirm={() => navigate('/ar-assets')}
        onCancel={() => setShowArConfirm(false)}
      />
    </div>
  );
};

export default ProductForm;
