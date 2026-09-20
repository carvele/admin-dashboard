/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, X, Shirt, Tag as TagIcon, ChevronLeft, ChevronRight, Ruler, DollarSign, Eye, Layers, Palette, BookOpen, Package, Star, Sparkles, Edit2, Grid3X3, CheckSquare, Square } from 'lucide-react';
import {
  createProduct,
  updateProduct,
  upsertProductWithColorways,
  getProductById,
  createInventoryItem,
  archiveInventoryItem,
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
import CompleteTheLookPanel from '../../components/catalog/CompleteTheLookPanel';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { validateForm, productRules, sanitizeText } from '../../utils/validation';
import { AVAILABLE_SIZES } from '../../utils/constants';
import { normalizeSizes } from '../../utils/sizeOrder';
import {
  resolveSizingProfile,
  formatFootwearDisplay,
  STANDARD_SIZES,
} from '../../utils/sizingProfiles';
import { getColorList, getPatternList } from '../../services/inventoryService';
import ReservationStatusBadge from '../../components/ReservationStatusBadge';
import { toDisplayStatus } from '../../utils/reservationStatus';
import {
  buildVariantMatrix,
  createVariant,
  variantColumnsAvailable,
  variantKey,
  syncProductAttributesFromVariants,
} from '../../services/variantService';
import { Logger } from '../../utils/Logger';
import { supabase } from '../../lib/supabaseClient';
import { formatPHDate } from '../../utils/dateFormatter';
import { ensureStyleCode, buildVariantSku } from '../../utils/skuHelper';
import { PageHeader } from '../../components/PageHeader';
import { toast } from 'sonner';
import './ProductForm.css';

const ProductForm = ({ readOnly = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdminUnlocked } = useAuth();
  const isEditing = Boolean(id);
  const catalogPath = `/catalog${location.search}`;
  const withCatalogContext = (path) => `${path}${location.search}`;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [oldData, setOldData] = useState(null); // To track changes for sync
  const [orderHistory, setOrderHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [productHistory, setProductHistory] = useState([]);
  const [loadingProductHistory, setLoadingProductHistory] = useState(false);
  const [showArConfirm, setShowArConfirm] = useState(false);
  const [footwearSystem, setFootwearSystem] = useState('EU'); // 'EU' | 'US_W' | 'US_M' | 'UK'
  const [beltSystem, setBeltSystem] = useState('CM'); // 'CM' | 'ALPHA' | 'ONE_SIZE'
  const [hatSystem, setHatSystem] = useState('ONE_SIZE'); // 'ONE_SIZE' | 'ALPHA' | 'CM'
  const [ringSystem, setRingSystem] = useState('US_RING'); // 'US_RING' | 'ONE_SIZE'
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);
  const [pendingCategoryChange, setPendingCategoryChange] = useState(null);

  // Uniqlo-like details
  const [formData, setFormData] = useState({
    name: '',
    category: 'Tops',
    subCategory: '',
    price: '',
    description: '',
    material: '',
    fabric_stretch: 'Moderate',
    color: '', // Derived on save from `colors` (comma-joined; mobile app splits on ',')
    colors: [], // Multi-select available colours the customer can choose from
    baseColor: '', // Primary colour (colors[0]) — used for admin catalog filtering
    pattern: '', // Populated dynamically from Taxonomy pattern_list
    careInstructions: '',
    fitAndSizing: '',
    styleCode: '',
    season: 'All-Season',
    occasion: '',
    visibility: 'draft',
    isFeatured: false,
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
  const [patternList, setPatternList] = useState([]);
  const [loadingPatterns, setLoadingPatterns] = useState(true);
  // Variant matrix
  const [variantColumnsReady, setVariantColumnsReady] = useState(false);
  const [variantMatrix, setVariantMatrix] = useState([]);
  const [existingVariants, setExistingVariants] = useState([]);
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
        // Only assign default category on brand-new product creation if blank
        if (!id) {
          setFormData((prev) => {
            if (!prev.category && cats[0]?.name) {
              return { ...prev, category: cats[0].name };
            }
            return prev;
          });
        }
      }
    });

    return () => unsubscribeCategories();
  }, [id]);

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

    getPatternList()
      .then((list) => {
        setPatternList(list || []);
        setLoadingPatterns(false);
      })
      .catch((err) => {
        console.error('Failed to load pattern list:', err);
        setLoadingPatterns(false);
      });

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
             let existing = [];
             try {
               const { getProductVariants } = await import('../../services/variantService');
               existing = await getProductVariants(id);
               setExistingVariants(existing);
             } catch (e) {
               console.warn('[ProductForm] Could not fetch variants:', e);
             }
              const parsedColors = docParams.color
                ? String(docParams.color).split(',').map((c) => c.trim()).filter(Boolean)
                : (docParams.baseColor ? [docParams.baseColor] : []);
              // Product color field represents authoring intent; fall back to
              // existing active variant colors only if product has no color definition at all.
              const initialColors = parsedColors.length > 0
                ? parsedColors
                : [...new Set(existing.map((v) => v.color).filter(Boolean))];
              setFormData(prev => ({
                 ...prev,
                 ...docParams,
                name: docParams.name || '',
                category: docParams.category || prev.category || 'Tops',
                subCategory: docParams.subCategory || '',
                price: docParams.price ?? '',
                description: docParams.description || '',
                material: docParams.material || '',
                fabric_stretch: docParams.garment_metadata?.fabric_stretch || 'Moderate',
                color: docParams.color || '',
                baseColor: docParams.baseColor || '',
                pattern: docParams.pattern ?? '',
                careInstructions: docParams.careInstructions || '',
                fitAndSizing: docParams.fitAndSizing || '',
                styleCode: docParams.styleCode || '',
                season: docParams.season || 'All-Season',
                occasion: docParams.occasion || '',
                visibility: docParams.visibility || 'draft',
                discountPercentage: docParams.discountPercentage ?? 0,
                salePrice: docParams.salePrice ?? '',
                isNewArrival: docParams.isNewArrival ?? (docParams.tags || []).includes('New Arrival'),
                sizes: normalizeSizes(docParams.sizes || []),
                colors: initialColors,
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
             navigate(catalogPath);
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
    if (!isEditing && formData.name.trim() && !formData.styleCode) {
      const generated = ensureStyleCode({
        productName: formData.name,
      });
      setFormData((prev) => ({ ...prev, styleCode: generated }));
    }
  }, [formData.name, formData.styleCode, isEditing]);

  // Rebuild variant matrix: Size × Color only (no pattern dimension)
  const rebuildMatrix = useCallback( 
    (sizes, colors, existingVariantsList = []) => { 
      const existingColors = [...new Set(existingVariantsList.map((v) => v.color).filter(Boolean))];
      const effectiveColors = colors && colors.length > 0 ? colors : existingColors;
      // Always pass patterns=[''] so every cell has pattern='' 
      const matrix = buildVariantMatrix({ sizes, colors: effectiveColors, patterns: [''] }, existingVariantsList); 
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
 
  // Re-run whenever sizes, colors, or existing variants change 
  useEffect(() => { 
    if (!variantColumnsReady) return; 
    rebuildMatrix(formData.sizes, formData.colors || [], existingVariants); 
  }, [formData.sizes, formData.colors, existingVariants, variantColumnsReady, rebuildMatrix]); 
 
 
 
  // Determine active category sizing profile
  const activeProfile = resolveSizingProfile(formData.category, formData.subCategory, formData.name);

  // Auto-lock sizes to ['One Size'] when profile is one_size and product has no active stock
  useEffect(() => {
    if (activeProfile === 'one_size') {
      const isOneSize = formData.sizes.length === 1 && formData.sizes[0] === 'One Size';
      if (!isOneSize) {
        const hasStock = existingVariants.some((v) => Number(v.total) > 0 || Number(v.reserved) > 0);
        if (!isEditing || !hasStock) {
          setFormData((prev) => ({ ...prev, sizes: ['One Size'] }));
        }
      }
    }
  }, [activeProfile, isEditing, existingVariants]);

  // Handle subcategory logic when category explicitly changes
  useEffect(() => {
    if (loading || !categories || categories.length === 0) return;
    const selectedCat = categories.find((c) => c.name === formData.category);
    if (selectedCat && selectedCat.subcategories && selectedCat.subcategories.length > 0) {
      const isValidSubCategory = selectedCat.subcategories.some(
        s => (typeof s === 'string' ? s : s.name) === formData.subCategory
      );

      // Only auto-default subcategory if the category actually changed and current subcategory is not valid
      if (!isValidSubCategory && (!oldData || oldData.category !== formData.category)) {
        const firstSubCat = selectedCat.subcategories[0];
        const subCatName = typeof firstSubCat === 'string' ? firstSubCat : firstSubCat.name;
        setFormData((prev) => ({ ...prev, subCategory: subCatName }));
      }
    }
  }, [formData.category, categories, loading, oldData]);

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
    // Lock One Size if strictly in one_size profile
    if (activeProfile === 'one_size' && size === 'One Size' && formData.sizes.includes('One Size')) {
      toast.info('One Size is required for this product category.');
      return;
    }

    const currentSizes = formData.sizes;
    const isRemoving = currentSizes.includes(size);

    if (isRemoving) {
      // Safeguard: Check if this specific size has active stock or reservations
      const variantsForSize = existingVariants.filter(
        (v) => String(v.size).trim().toLowerCase() === String(size).trim().toLowerCase()
      );
      const stockOnSize = variantsForSize.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
      const reservedOnSize = variantsForSize.reduce((sum, v) => sum + (Number(v.reserved) || 0), 0);

      if (stockOnSize > 0 || reservedOnSize > 0) {
        toast.error(
          `Cannot remove size "${size}": ${stockOnSize} unit(s) in stock and ${reservedOnSize} reservation(s) exist. Adjust stock to 0 first.`
        );
        return;
      }
    }

    const rawSizes = isRemoving
      ? currentSizes.filter((s) => s !== size)
      : [...currentSizes, size];
    const newSizes = normalizeSizes(rawSizes, {
      onWarning: (msg) => toast.warning(msg),
    });
    setFormData({ ...formData, sizes: newSizes });
  };

  const handleQuickSelectRange = (system) => {
    let sizesToAdd = [];
    if (system === 'EU') {
      sizesToAdd = ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41'];
    } else if (system === 'US_W') {
      sizesToAdd = ['US W 6', 'US W 6.5', 'US W 7', 'US W 7.5', 'US W 8', 'US W 8.5'];
    } else if (system === 'US_M') {
      sizesToAdd = ['US M 8', 'US M 8.5', 'US M 9', 'US M 9.5', 'US M 10', 'US M 10.5'];
    } else if (system === 'UK') {
      sizesToAdd = ['UK 4', 'UK 4.5', 'UK 5', 'UK 5.5', 'UK 6', 'UK 6.5', 'UK 7'];
    }

    const currentSizes = new Set(formData.sizes);
    sizesToAdd.forEach((s) => currentSizes.add(s));
    const nextSizes = normalizeSizes(Array.from(currentSizes));
    setFormData((prev) => ({ ...prev, sizes: nextSizes }));
    toast.success(`Selected common run for ${system.replace('_', ' ')}`);
  };

  const handleAddCustomSize = () => {
    const trimmed = customSizeInput.trim();
    if (!trimmed) return;
    if (formData.sizes.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      toast.info(`Size "${trimmed}" is already added.`);
      return;
    }
    const newSizes = normalizeSizes([...formData.sizes, trimmed], {
      onWarning: (msg) => toast.warning(msg),
    });
    setFormData((prev) => ({ ...prev, sizes: newSizes }));
    setCustomSizeInput('');
    toast.success(`Added size "${trimmed}"`);
  };

  const requestCategoryChange = (newCategory) => {
    if (newCategory === formData.category) return;

    const totalActiveStock = existingVariants.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
    const totalReservedStock = existingVariants.reduce((sum, v) => sum + (Number(v.reserved) || 0), 0);
    const hasActiveStock = totalActiveStock > 0 || totalReservedStock > 0;

    const currentProfile = resolveSizingProfile(formData.category, formData.subCategory, formData.name);
    const newProfile = resolveSizingProfile(newCategory, '', formData.name);

    if (isEditing && hasActiveStock && currentProfile !== newProfile) {
      setPendingCategoryChange({
        category: newCategory,
        subCategory: '',
        activeStock: totalActiveStock,
        reservedStock: totalReservedStock,
        profileChanged: true,
      });
      setCategoryConfirmOpen(true);
      return;
    }

    applyCategoryChange(newCategory, '', currentProfile !== newProfile);
  };

  const requestSubCategoryChange = (newSubCategory) => {
    if (newSubCategory === formData.subCategory) return;

    const totalActiveStock = existingVariants.reduce((sum, v) => sum + (Number(v.total) || 0), 0);
    const totalReservedStock = existingVariants.reduce((sum, v) => sum + (Number(v.reserved) || 0), 0);
    const hasActiveStock = totalActiveStock > 0 || totalReservedStock > 0;

    const currentProfile = resolveSizingProfile(formData.category, formData.subCategory, formData.name);
    const newProfile = resolveSizingProfile(formData.category, newSubCategory, formData.name);

    if (isEditing && hasActiveStock && currentProfile !== newProfile) {
      setPendingCategoryChange({
        category: formData.category,
        subCategory: newSubCategory,
        activeStock: totalActiveStock,
        reservedStock: totalReservedStock,
        profileChanged: true,
      });
      setCategoryConfirmOpen(true);
      return;
    }

    applyCategoryChange(formData.category, newSubCategory, currentProfile !== newProfile);
  };

  const applyCategoryChange = (newCategory, newSubCat = '', profileChanged = false) => {
    const newProfile = resolveSizingProfile(newCategory, newSubCat, formData.name);

    setFormData((prev) => {
      let nextSizes = prev.sizes;

      // When switching to one_size profile for new or stock-free products, lock to 'One Size'
      if (newProfile === 'one_size') {
        nextSizes = ['One Size'];
      } else if (profileChanged) {
        // If switching from one_size or incompatible to footwear
        if (newProfile === 'footwear' && (nextSizes.includes('One Size') || nextSizes.length === 0 || (nextSizes.length === 1 && nextSizes[0] === 'M'))) {
          nextSizes = ['EU 38'];
        } else if (newProfile === 'apparel' && (nextSizes.includes('One Size') || nextSizes.some((s) => s.startsWith('EU ')))) {
          nextSizes = ['M'];
        } else if (newProfile === 'accessories_belts' && (nextSizes.includes('One Size') || nextSizes.includes('M'))) {
          nextSizes = ['85 cm'];
        } else if (newProfile === 'accessories_rings' && (nextSizes.includes('One Size') || nextSizes.includes('M'))) {
          nextSizes = ['US 7'];
        }
      }

      return {
        ...prev,
        category: newCategory,
        subCategory: newSubCat,
        sizes: nextSizes,
      };
    });
  };

  const handleConfirmCategoryChange = () => {
    if (pendingCategoryChange) {
      setFormData((prev) => ({
        ...prev,
        category: pendingCategoryChange.category,
        subCategory: pendingCategoryChange.subCategory || '',
      }));
      setPendingCategoryChange(null);
      setCategoryConfirmOpen(false);
      toast.info('Category updated. Existing variant stock has been preserved.');
    }
  };

  const handleCancelCategoryChange = () => {
    setPendingCategoryChange(null);
    setCategoryConfirmOpen(false);
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

    if (name === 'category') {
      requestCategoryChange(val);
      return;
    }
    if (name === 'subCategory') {
      requestSubCategoryChange(val);
      return;
    }

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
      }
      const finalImages = [...formData.images, ...uploadedImages];

      // Safe Category & Category ID preservation logic
      const isNewProduct = !id;
      const categoryChanged = oldData && (
        oldData.category !== formData.category ||
        oldData.subCategory !== formData.subCategory
      );

      let finalCategoryId = null;
      if (!isNewProduct && !categoryChanged && oldData?.category_id) {
        // Strictly preserve existing category_id when category/subcategory were not explicitly changed
        finalCategoryId = oldData.category_id;
      } else {
        const norm = (s) => (s || '').trim().toLowerCase();
        const parentCat = categories.find((c) => norm(c.name) === norm(formData.category));
        const subCat = parentCat?.subcategories?.find(
          (s) => norm(typeof s === 'string' ? s : s.name) === norm(formData.subCategory)
        );
        finalCategoryId = subCat?.id || (!formData.subCategory && parentCat ? parentCat.id : null) || oldData?.category_id || null;
      }

      const normalizedSizes = normalizeSizes(formData.sizes || [], {
        onWarning: (msg) => toast.warning(msg),
      });

      const payload = {
        name: sanitizeText(formData.name),
        category: formData.category,
        subCategory: formData.subCategory,
        category_id: finalCategoryId,
        price: parseFloat(formData.price),
        sizes: normalizedSizes,
        description: sanitizeText(formData.description),
        material: sanitizeText(formData.material),
        garment_metadata: { fabric_stretch: formData.fabric_stretch },
        // Persist the selected colours comma-joined; the mobile product page
        // splits `color` on ',' to render its colour picker.
        color: (formData.colors || []).join(', '),
        colors: formData.colors || [],
        careInstructions: sanitizeText(formData.careInstructions),
        fitAndSizing: formData.fitAndSizing,
        styleCode: ensureStyleCode({
          existingStyleCode: formData.styleCode,
          productName: formData.name,
          productId: id || '',
        }),
        season: formData.season,
        occasion: formData.occasion,
        visibility: formData.visibility,
        isFeatured: formData.isFeatured,
        isNewArrival: formData.isNewArrival,
        updated_by: user?.id || null,
        images: finalImages,
        // Falls back to the product's existing imageUrl (not a placeholder
        // string) when finalImages is empty -- a legacy product whose real
        // image predates the `images` array field has an empty array here
        // even though products.image_url is a real URL. The previous
        // '👗' fallback silently overwrote that real URL with a literal
        // emoji on ANY unrelated edit (price, stock, description) to such
        // a product. null only applies to genuinely new products.
        imageUrl: finalImages.length > 0 ? finalImages[0] : (oldData?.imageUrl || null),
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

      // Atomic upsert via RPC
      if (isEditing) {
        payload.id = id;
      } else {
        payload.created_by = user?.id || null;
        payload.stock = 0;
        payload.status = 'Out of Stock';
        payload.visibility = formData.visibility === 'public' ? 'public' : 'draft';
        payload.tags = ['New Arrival'];
      }

      const rpcResult = await upsertProductWithColorways(payload, null);
      
      const newDocId = isEditing ? id : rpcResult.product_id;

      await logAction(user, isEditing ? 'Updated product details' : 'Created new product', {
        targetType: 'product',
        targetId: newDocId,
        productName: payload.name,
      });

      toast.success(`Product ${isEditing ? 'updated' : 'created'} successfully!`);

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
      if (success) navigate(catalogPath);
    }
  };

  // Merge colors from settings color_list with any colors currently saved on this product
  const allAvailableColors = React.useMemo(() => {
    const listNames = colorList.map((c) => (typeof c === 'string' ? c : c.name));
    const merged = [...new Set([...listNames, ...(formData.colors || [])])].filter(Boolean);
    return merged;
  }, [colorList, formData.colors]);

  // Merge patterns from settings pattern_list with any legacy pattern currently saved on this product
  const allAvailablePatterns = React.useMemo(() => {
    const listNames = patternList.map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean);
    if (formData.pattern && !listNames.includes(formData.pattern)) {
      return [...listNames, formData.pattern];
    }
    return listNames;
  }, [patternList, formData.pattern]);

  if (loading) return <div className="p-8">Loading product data...</div>;

  return (
    <div className="p-6">
      {/* ── Page Header ── */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(catalogPath)} className="btn-secondary p-2">
          <ArrowLeft size={20} />
        </button>
        
          <div className="flex-1">
            <nav className="flex items-center gap-2 mb-1 text-sm font-medium text-gray-500">
              <span role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(catalogPath); } }} onClick={() => navigate(catalogPath)} className="cursor-pointer breadcrumb-link transition-colors">Catalog</span>
              <ChevronRight size={14} className="opacity-50" />
              <span className="text-gray-900">{readOnly ? 'View Product' : isEditing ? 'Edit Product' : 'New Product'}</span>
            </nav>

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
            onClick={() => navigate(withCatalogContext('/catalog/edit/' + id))}
            className="btn-primary flex items-center gap-2"
          >
            <Edit2 size={16} /> Edit Product
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 product-form-container">
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
                    <input autoComplete="off"
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
                    <select autoComplete="off" id="product-category" name="category" className="input-field" value={formData.category || ''} onChange={handleChange}>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="product-subcategory">Sub-Category</label>
                    <select autoComplete="off"
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
                      <select autoComplete="off" id="product-visibility-mobile" name="visibility" className="input-field py-1 text-sm w-32" value={formData.visibility} onChange={handleChange}>
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
                      <select autoComplete="off" id="product-visibility-desktop" name="visibility" className="input-field py-1 text-sm" value={formData.visibility} onChange={handleChange}>
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
                 <label className="label" htmlFor="product-price">Price (₱) *</label>
                 <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">₱</span>
                    <input autoComplete="off" id="product-price" type="number" name="price" className="input-field pl-8" placeholder="0.00" value={formData.price} onChange={handleChange} required step="0.01" min="0" />
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
                      <input autoComplete="off" id="product-saleprice" type="number" name="salePrice" className="input-field pl-8 border-red-400 text-red-700 font-bold bg-white" value={formData.salePrice} onChange={handleChange} placeholder="0.00" min="0" step="0.01" />
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
                  <img src={url} alt={`${formData.name || 'Product'} ${idx + 1}`} className="w-full h-full object-contain" />
                  {idx === 0 && <div className="primary-badge">PRIMARY COVER</div>}
                  
                  {!readOnly && (
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
                  )}
                </div>
              ))}

              {/* Previews */}
              {previews.map((url, idx) => (
                <div key={`prev-${idx}`} className="gallery-item relative border-2 border-dashed border-primary/50 rounded-lg overflow-hidden group bg-gray-50/50">
                  <img src={url} alt={`New upload preview ${idx + 1}`} className="w-full h-full object-contain opacity-70" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => removeSelectedFile(idx)} className="p-1.5 bg-red-500 rounded-full text-white shadow-lg"><X size={16} /></button>
                  </div>
                </div>
              ))}

              {!readOnly && (
                <label className="gallery-item border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer upload-dropzone transition-all">
                  <Upload size={24} className="text-gray-400 mb-2" />
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Add Image</span>
                  <input autoComplete="off" id="product-images" name="product-images" type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
                </label>
              )}
              {readOnly && formData.images.length === 0 && (
                <p className="text-secondary text-sm py-4 italic">No gallery images uploaded for this item.</p>
              )}
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

                  {/* Dynamic Taxonomy Pattern Selection */}
                  <div className="mt-5 pt-4 border-t border-dashed">
                     <span className="label">Product Pattern</span>
                     {loadingPatterns ? (
                        <p className="text-sm text-secondary mt-2">Loading patterns from Taxonomy...</p>
                     ) : allAvailablePatterns.length === 0 ? (
                        <p className="text-sm text-secondary mt-2">
                           No patterns configured in Taxonomy. Configure patterns in Inventory &rarr; Taxonomy &rarr; Patterns.
                        </p>
                     ) : (
                        <div className="flex flex-wrap gap-2 mt-2">
                           {allAvailablePatterns.map((patName) => {
                              const isSelected = formData.pattern === patName;
                              const isLegacy = !patternList.some((p) => (typeof p === 'string' ? p : p.name) === patName);
                              return (
                                 <button
                                    key={patName}
                                    type="button"
                                    onClick={() => !readOnly && setFormData((prev) => ({
                                       ...prev,
                                       pattern: prev.pattern === patName ? '' : patName,
                                    }))}
                                    className={`color-chip ${isSelected ? 'active' : ''}`}
                                    disabled={readOnly}
                                    title={isLegacy ? `${patName} (Legacy / Retired pattern preserved)` : patName}
                                 >
                                    {patName}
                                    {isLegacy && <span style={{ fontSize: '9px', opacity: 0.75, marginLeft: 4 }}>(Legacy)</span>}
                                 </button>
                              );
                           })}
                        </div>
                     )}
                     {formData.pattern ? (
                        <p className="text-xs text-secondary mt-2">
                           Selected pattern: <strong>{formData.pattern}</strong>
                        </p>
                     ) : (
                        <p className="text-xs text-secondary mt-2 italic">
                           Optional: No pattern selected
                        </p>
                     )}
                  </div>
              </div>

                              <div className="flex flex-col gap-4">
                  <div>
                     <label className="label" htmlFor="product-material">Material / Fabric</label>
                     <input autoComplete="off" id="product-material" type="text" name="material" className="input-field" placeholder="e.g. 100% Organic Silk" value={formData.material || ''} onChange={handleChange} />
                  </div>
                  <div>
                     <label className="label" htmlFor="product-stretch">Fabric Stretch (Sizing AI)</label>
                     <select autoComplete="off" id="product-stretch" name="fabric_stretch" className="input-field" value={formData.fabric_stretch || ''} onChange={handleChange}>
                        <option value="Rigid">Rigid (Denim, Canvas) - Needs more ease</option>
                        <option value="Moderate">Moderate (Standard Cotton/Polyester)</option>
                        <option value="High">High (Spandex, Activewear) - Can stretch to fit</option>
                     </select>
                     <p className="text-[10px] text-gray-500 mt-1">Used by the mobile AR Try-On to calculate correct fit recommendations.</p>
                  </div>
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
              <div className="flex items-center gap-2">
                {activeProfile === 'footwear' && (
                  <span className="sizing-profile-badge footwear">
                    Footwear Sizing
                  </span>
                )}
                {activeProfile === 'one_size' && (
                  <span className="sizing-profile-badge one-size">
                    One Size
                  </span>
                )}
                {activeProfile.startsWith('accessories_') && (
                  <span className="sizing-profile-badge accessories">
                    Accessory Sizing
                  </span>
                )}
                {activeProfile === 'apparel' && (
                  <span className="sizing-profile-badge apparel">
                    Apparel Sizing
                  </span>
                )}
                <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded hidden sm:inline-block">
                  SIZE GUIDE ENABLED
                </div>
              </div>
           </div>

           {/* Profile: ONE SIZE */}
           {activeProfile === 'one_size' && (
              <div className="mb-6 one-size-card">
                 <Package className="text-amber-700 shrink-0 mt-0.5" size={20} />
                 <div>
                    <div className="one-size-title">One Size Product</div>
                    <p className="one-size-desc">
                       Items in this category ({formData.category}{formData.subCategory ? ` · ${formData.subCategory}` : ''}) are configured as One Size. Variants are stocked and managed under a single canonical <strong>One Size</strong> label.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                       <span className="size-btn active font-bold shadow-sm" style={{ cursor: 'default' }}>
                          One Size
                       </span>
                       <span className="text-[11px] text-secondary font-medium">Auto-configured</span>
                    </div>
                 </div>
              </div>
           )}

           {/* Profile: FOOTWEAR */}
           {activeProfile === 'footwear' && (
              <div className="mb-6">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                       <span className="label mb-0">Canonical Footwear Sizes *</span>
                       <p className="text-[11px] text-secondary mt-0.5">
                          Select the exact sizes stocked. Conversions below chips are approximate reference aids only.
                       </p>
                    </div>
                    <button
                       type="button"
                       onClick={() => handleQuickSelectRange(footwearSystem)}
                       className="text-xs font-bold text-indigo-700 hover:text-indigo-900 self-start sm:self-auto bg-indigo-100 px-2.5 py-1 rounded border border-indigo-200"
                    >
                       + Quick Select Common Run ({footwearSystem.replace('_', ' ')})
                    </button>
                 </div>

                 {/* Sizing System Tabs */}
                 <div className="flex flex-wrap gap-2 mb-4">
                    <button
                       type="button"
                       className={`sizing-tab ${footwearSystem === 'EU' ? 'active' : ''}`}
                       onClick={() => setFootwearSystem('EU')}
                    >
                       EU (Standard)
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${footwearSystem === 'US_W' ? 'active' : ''}`}
                       onClick={() => setFootwearSystem('US_W')}
                    >
                       US Women (US W)
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${footwearSystem === 'US_M' ? 'active' : ''}`}
                       onClick={() => setFootwearSystem('US_M')}
                    >
                       US Men (US M)
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${footwearSystem === 'UK' ? 'active' : ''}`}
                       onClick={() => setFootwearSystem('UK')}
                    >
                       UK
                    </button>
                 </div>

                 {/* Footwear Chips Grid */}
                 <div className="footwear-grid">
                    {(STANDARD_SIZES.footwear[footwearSystem] || []).map((size) => {
                       const isSelected = formData.sizes.includes(size);
                       const display = formatFootwearDisplay(size, 'Footwear');
                       return (
                          <button
                             key={size}
                             type="button"
                             onClick={() => toggleSize(size)}
                             className={`footwear-chip ${isSelected ? 'active shadow-md' : ''}`}
                          >
                             <span className="chip-label">{size}</span>
                             {display.approxHelper && (
                                <span className="chip-sub">
                                   {display.approxHelper.replace('Approx. ', '')}
                                </span>
                             )}
                          </button>
                       );
                    })}
                 </div>
              </div>
           )}

           {/* Profile: ACCESSORIES_BELTS */}
           {activeProfile === 'accessories_belts' && (
              <div className="mb-6">
                 <div className="mb-3">
                    <span className="label mb-0">Belt Sizes *</span>
                    <p className="text-[11px] text-secondary mt-0.5">
                       Choose waist length in cm, alpha standard (S–XL), or One Size.
                    </p>
                 </div>

                 {/* Belt System Tabs */}
                 <div className="flex gap-2 mb-4">
                    <button
                       type="button"
                       className={`sizing-tab ${beltSystem === 'CM' ? 'active' : ''}`}
                       onClick={() => setBeltSystem('CM')}
                    >
                       cm Lengths
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${beltSystem === 'ALPHA' ? 'active' : ''}`}
                       onClick={() => setBeltSystem('ALPHA')}
                    >
                       Alpha Sizes
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${beltSystem === 'ONE_SIZE' ? 'active' : ''}`}
                       onClick={() => setBeltSystem('ONE_SIZE')}
                    >
                       One Size
                    </button>
                 </div>

                 {/* Chips Grid */}
                 <div className="flex flex-wrap gap-2.5">
                    {(STANDARD_SIZES.accessories_belts[beltSystem] || []).map((size) => (
                       <button
                          key={size}
                          type="button"
                          onClick={() => toggleSize(size)}
                          className={`size-btn font-bold border-2 ${
                             formData.sizes.includes(size) ? 'active shadow-lg' : ''
                          }`}
                       >
                          {size}
                       </button>
                    ))}
                 </div>
              </div>
           )}

           {/* Profile: ACCESSORIES_HATS */}
           {activeProfile === 'accessories_hats' && (
              <div className="mb-6">
                 <div className="mb-3">
                    <span className="label mb-0">Hat & Cap Sizes *</span>
                    <p className="text-[11px] text-secondary mt-0.5">
                       One Size fits most adjustable caps. Select alpha combos (S/M, M/L) or cm circumference for fitted hats.
                    </p>
                 </div>

                 {/* Hat System Tabs */}
                 <div className="flex gap-2 mb-4">
                    <button
                       type="button"
                       className={`sizing-tab ${hatSystem === 'ONE_SIZE' ? 'active' : ''}`}
                       onClick={() => setHatSystem('ONE_SIZE')}
                    >
                       One Size
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${hatSystem === 'ALPHA' ? 'active' : ''}`}
                       onClick={() => setHatSystem('ALPHA')}
                    >
                       Alpha Combos
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${hatSystem === 'CM' ? 'active' : ''}`}
                       onClick={() => setHatSystem('CM')}
                    >
                       cm Circumference
                    </button>
                 </div>

                 {/* Chips Grid */}
                 <div className="flex flex-wrap gap-2.5">
                    {(STANDARD_SIZES.accessories_hats[hatSystem] || []).map((size) => (
                       <button
                          key={size}
                          type="button"
                          onClick={() => toggleSize(size)}
                          className={`size-btn font-bold border-2 ${
                             formData.sizes.includes(size) ? 'active shadow-lg' : ''
                          }`}
                       >
                          {size}
                       </button>
                    ))}
                 </div>
              </div>
           )}

           {/* Profile: ACCESSORIES_RINGS */}
           {activeProfile === 'accessories_rings' && (
              <div className="mb-6">
                 <div className="mb-3">
                    <span className="label mb-0">Ring Sizes *</span>
                    <p className="text-[11px] text-secondary mt-0.5">
                       Select standard US ring sizes (US 5–11) or One Size for adjustable bands.
                    </p>
                 </div>

                 {/* Ring System Tabs */}
                 <div className="flex gap-2 mb-4">
                    <button
                       type="button"
                       className={`sizing-tab ${ringSystem === 'US_RING' ? 'active' : ''}`}
                       onClick={() => setRingSystem('US_RING')}
                    >
                       US Ring Sizes
                    </button>
                    <button
                       type="button"
                       className={`sizing-tab ${ringSystem === 'ONE_SIZE' ? 'active' : ''}`}
                       onClick={() => setRingSystem('ONE_SIZE')}
                    >
                       One Size (Adjustable)
                    </button>
                 </div>

                 {/* Chips Grid */}
                 <div className="flex flex-wrap gap-2.5">
                    {(STANDARD_SIZES.accessories_rings[ringSystem] || []).map((size) => (
                       <button
                          key={size}
                          type="button"
                          onClick={() => toggleSize(size)}
                          className={`size-btn font-bold border-2 ${
                             formData.sizes.includes(size) ? 'active shadow-lg' : ''
                          }`}
                       >
                          {size}
                       </button>
                    ))}
                 </div>
              </div>
           )}

           {/* Profile: APPAREL */}
           {activeProfile === 'apparel' && (
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
           )}

           {/* Selected Sizes Summary & Custom Size Adder (Shown for all non-one_size profiles) */}
           {activeProfile !== 'one_size' && (
              <div className="mt-4 pt-4 border-t">
                 <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="text-xs font-bold text-secondary uppercase tracking-wider">
                       Active Selected Sizes ({formData.sizes.length}):
                    </div>
                    {formData.sizes.length === 0 && (
                       <span className="text-xs text-red-500 font-semibold">
                          At least one size is required.
                       </span>
                    )}
                 </div>

                 {formData.sizes.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                       {formData.sizes.map((s) => (
                          <span
                             key={s}
                             className="selected-sizes-tag"
                          >
                             {s}
                             <button
                                type="button"
                                onClick={() => toggleSize(s)}
                                className="selected-sizes-remove"
                                title={`Remove size ${s}`}
                             >
                                <X size={12} />
                             </button>
                          </span>
                       ))}
                    </div>
                 ) : (
                    <p className="text-xs text-secondary mb-3 italic">
                       No sizes selected. Click any size chip above or add a custom size below.
                    </p>
                 )}

                 {/* Custom Size Input */}
                 <div className="flex flex-wrap items-center gap-2 pt-2">
                    <span className="text-xs text-secondary font-medium">Add non-standard size:</span>
                    <input
                       type="text"
                       placeholder="e.g. 115 cm or EU 34"
                       value={customSizeInput}
                       onChange={(e) => setCustomSizeInput(e.target.value)}
                       onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                             e.preventDefault();
                             handleAddCustomSize();
                          }
                       }}
                       className="input-field py-1 px-3 text-xs"
                       style={{ width: '10rem' }}
                    />
                    <button
                       type="button"
                       onClick={handleAddCustomSize}
                       className="btn-secondary py-1 px-3 text-xs font-bold"
                    >
                       + Add Size
                    </button>
                 </div>
              </div>
           )}

           <div className="border-t pt-6">
              <div className="mb-4" style={{ maxWidth: '20rem' }}>
                 <label className="label" htmlFor="product-fit-type">Fit Type</label>
                 <select autoComplete="off" id="product-fit-type" name="fitAndSizing" className="input-field" value={formData.fitAndSizing || ''} onChange={handleChange}>
                    <option value="">Standard Fit</option>
                    <option value="True to Size">True to Size</option>
                    <option value="Runs Small">Runs Small (Size Up)</option>
                    <option value="Runs Large">Runs Large (Size Down)</option>
                    <option value="Slim Fit">Slim Fit</option>
                    <option value="Regular Fit">Regular Fit</option>
                    <option value="Oversized">Oversized</option>
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
                     gap: 'var(--spacing-md)',
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
                             fontSize: 'var(--font-caption)',
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
                                 background: 'var(--color-success)',
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

           <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 10 }}>
             <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>●</span> Already stocked — deselecting a stocked variant with existing units will NOT delete it.
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
                 <textarea autoComplete="off" id="product-description" name="description" className="input-field" rows="4" placeholder="Tell the item's story..." value={formData.description || ''} onChange={handleChange} />
              </div>
              <div>
                 <label className="label" htmlFor="product-care-instructions">Care Instructions</label>
                 <input autoComplete="off" id="product-care-instructions" type="text" name="careInstructions" className="input-field" placeholder="e.g. Professional Dry Clean Only" value={formData.careInstructions || ''} onChange={handleChange} />
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
                                   ? 'bg-[var(--accent)] text-[var(--on-accent,var(--charcoal))] border-[var(--accent)] shadow-sm'
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

        {/* ══════════════════════════════════════════════
            ZONE F.5 — Complete the Look
            (Curated cross-sell links + styled-look suggestions)
        ══════════════════════════════════════════════ */}
        {isEditing && <CompleteTheLookPanel productId={id} readOnly={readOnly} />}

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
                              <td className="px-4 py-3 text-secondary">{formatPHDate(orderDate)}</td>
                              <td className="px-4 py-3">
                                <ReservationStatusBadge status={toDisplayStatus(order.status)} />
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
        <div className="product-actions-bar sticky bottom-0 z-20">
          <div className="flex justify-between items-center w-full max-w-7xl mx-auto gap-4">
            <div className="flex items-center gap-3">
              {formData.styleCode && (
                <span className="product-sku-pill">
                  SKU: {formData.styleCode}
                </span>
              )}
              <span className="text-xs font-medium text-secondary hidden sm:inline-block">
                {readOnly ? 'Viewing Product Details' : isEditing ? 'Editing Product' : 'Creating New Product'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate(catalogPath)} className="btn-secondary">
                {readOnly ? 'Back to Catalog' : 'Cancel'}
              </button>
              {readOnly ? (
                isAdminUnlocked && (
                  <button
                    type="button"
                    onClick={() => navigate(withCatalogContext('/catalog/edit/' + id))}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Edit2 size={16} /> Edit Product
                  </button>
                )
              ) : (
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Processing...' : (isEditing ? 'Update Product' : 'Create Product')}
                </button>
              )}
            </div>
          </div>
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

      <ConfirmDialog
        isOpen={categoryConfirmOpen}
        title="Category Change with Active Stock"
        message={
          pendingCategoryChange
            ? `This product currently has ${pendingCategoryChange.activeStock} unit(s) in stock and ${pendingCategoryChange.reservedStock} reserved unit(s). Changing the category to "${pendingCategoryChange.category}" alters the sizing model. Existing variant stock will be preserved in inventory. Are you sure you want to proceed?`
            : ''
        }
        confirmText="Change Category"
        cancelText="Keep Current"
        isDestructive={false}
        onConfirm={handleConfirmCategoryChange}
        onCancel={handleCancelCategoryChange}
      />
    </div>
  );
};

export default ProductForm;



