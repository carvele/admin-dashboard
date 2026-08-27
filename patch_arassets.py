with open('src/pages/wardrobe/ARAssets.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "const [poseForm, setPoseForm] = useState(initialPoseForm);",
    "const [poseForm, setPoseForm] = useState(initialPoseForm);\n\n  const handleIngestionComplete = () => {\n    setIngestionData(null);\n    toast.success('Garment metadata generated and saved successfully!');\n  };\n"
)

with open('src/pages/wardrobe/ARAssets.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
