const fs = require('fs');
let code = fs.readFileSync('src/components/AR/GarmentIngestionModal.jsx', 'utf8');

if (!code.includes('CalibrationValidator')) {
    code = code.replace(
        /import { GarmentIngestor } from '\.\.\/\.\.\/utils\/garmentIngestor';/,
        `import { GarmentIngestor } from '../../utils/garmentIngestor';\nimport CalibrationValidator from './CalibrationValidator';`
    );
}

if (code.includes('<Check size={16} className="mr-2" /> Save &amp; Enable AR')) {
    code = code.replace(
        /<button\s+onClick=\{handleSave\}\s+className="bg-primary text-white px-6 py-2 rounded flex items-center text-sm font-bold"\s*>\s*<Check size=\{16\} className="mr-2" \/> Save &amp; Enable AR\s*<\/button>/g,
        `<button onClick={() => setStep(4)} className="bg-primary text-white px-6 py-2 rounded flex items-center text-sm font-bold">Next: Validate AR Fit <ArrowRight size={16} className="ml-2" /></button>`
    );
}

if (!code.includes('step === 4')) {
    code = code.replace(
        /\}\s*<\/div>\s*\)\s*:\s*null\s*\}/,
        `}
          ) : step === 4 ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 p-4 border-b bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">3</div>
                <div>
                  <h2 className="font-bold text-gray-800">Validate AR Deformation</h2>
                  <p className="text-sm text-gray-500">Ensure the garment deforms correctly before enabling it.</p>
                </div>
                <button className="ml-auto p-2" onClick={onCancel}><X size={20} /></button>
              </div>
              <div className="p-4 flex-1">
                <CalibrationValidator 
                  glbUrl={glbUrl} 
                  metadata={metadata} 
                  onPass={handleSave} 
                  onFail={() => {
                     alert('Deformation rejected. Please fix the GLB rig or verify your mapping and rest-pose.');
                     setStep(3);
                  }}
                />
              </div>
            </div>
          ) : null}`
    );
}

fs.writeFileSync('src/components/AR/GarmentIngestionModal.jsx', code);
console.log("done modal patch");
