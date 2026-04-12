import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
const ImageWithFallback = ({ src, alt, className = '', fallbackSize = 24, ...props }) => {
    const [error, setError] = useState(false);
    if (error || !src) {
        return (_jsx("div", { className: `flex-center bg-light text-secondary rounded ${className}`, style: { minHeight: '100px' }, ...props, children: _jsxs("div", { className: "flex-col flex-center gap-2", children: [_jsx(ImageOff, { size: fallbackSize, opacity: 0.5 }), _jsx("span", { className: "text-xs", children: "Image unavailable" })] }) }));
    }
    return (_jsx("img", { src: src, alt: alt, className: className, loading: "lazy", onError: () => setError(true), ...props }));
};
export default ImageWithFallback;
