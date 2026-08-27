const fs = require('fs');
let code = fs.readFileSync('src/pages/wardrobe/ARAssets.jsx', 'utf8');

if (!code.includes('GarmentIngestionModal')) {
    code = code.replace(
        /import '@google\/model-viewer';/,
        `import GarmentIngestionModal from '../../components/AR/GarmentIngestionModal';\nimport { supabase } from '../../lib/supabaseClient';\nimport '@google/model-viewer';`
    );
}

if (!code.includes('ingestionData')) {
    code = code.replace(
        /const \[isUploadModalOpen, setIsUploadModalOpen\] = useState\(false\);/,
        `const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);\n  const [ingestionData, setIngestionData] = useState(null);`
    );
}

if (!code.includes('setIngestionData({')) {
    code = code.replace(
        /if \(window\._targetProduct\) \{[\s\S]*?toast\.success\(`Successfully uploaded and linked \$\{assetType\} to \$\{window\._targetProduct\.name\}`\);/,
        `if (window._targetProduct) {
        if (assetType === '3D Model') {
          setIngestionData({
            productId: window._targetProduct.docId,
            category: window._targetProduct.category || 'shirt',
            glbUrl: downloadURL,
            productName: window._targetProduct.name
          });
          setIsUploadModalOpen(false);
          setSelectedFile(null);
          setIsUploading(false);
          return;
        }

        const updateData = { maskUrl: downloadURL };
        await updateProduct(window._targetProduct.docId, updateData);
        toast.success(\`Successfully uploaded and linked \${assetType} to \${window._targetProduct.name}\`);`
    );
}

if (!code.includes('handleIngestionComplete')) {
    code = code.replace(
        /const handleSaveAlignment = async \(\) => \{/,
        `const handleIngestionComplete = async (metadata) => {
    try {
      await updateProduct(ingestionData.productId, { model_3dUrl: ingestionData.glbUrl });
      const { error } = await supabase.from('products').update({ garment_metadata: metadata }).eq('id', ingestionData.productId);
      if (error) throw error;
      toast.success(\`Successfully calibrated \${ingestionData.productName}\`);
      setIngestionData(null);
      window._targetProduct = null;
    } catch (e) {
      toast.error('Failed to save metadata');
      console.error(e);
    }
  };

  const handleSaveAlignment = async () => {`
    );
}

if (!code.includes('<GarmentIngestionModal')) {
    code = code.replace(
        /\}\s*<\/div>\s*\);\s*\};\s*export default ARAssets;/,
        `  )}

      {ingestionData && (
        <GarmentIngestionModal
          productId={ingestionData.productId}
          category={ingestionData.category}
          glbUrl={ingestionData.glbUrl}
          onComplete={handleIngestionComplete}
          onCancel={() => setIngestionData(null)}
        />
      )}
    </div>
  );
};
export default ARAssets;`
    );
}

fs.writeFileSync('src/pages/wardrobe/ARAssets.jsx', code);
console.log('done');
