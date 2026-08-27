import re

with open('src/pages/wardrobe/ARAssets.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Fix openConfig to launch GarmentIngestionModal instead of ConfigModal
old_openConfig = """  const openConfig = (product) => {
    setConfigProduct(product);
    setIsConfigModalOpen(true);
  };"""

new_openConfig = """  const openConfig = (product) => {
    setIngestionData({
       productId: product.docId,
       category: product.category || 'shirt',
       glbUrl: product.model_3dUrl,
       productName: product.name
    });
  };"""

code = code.replace(old_openConfig, new_openConfig)

# 2. Make sure model-viewer is imported in ARAssets.jsx for the preview modal
if "import '@google/model-viewer';" not in code:
    code = code.replace("import React,", "import '@google/model-viewer';\nimport React,")

with open('src/pages/wardrobe/ARAssets.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
print("patched")
