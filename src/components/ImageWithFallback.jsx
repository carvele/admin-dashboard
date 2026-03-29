import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

const ImageWithFallback = ({ src, alt, className = '', fallbackSize = 24, ...props }) => {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div
        className={`flex-center bg-light text-secondary rounded ${className}`}
        style={{ minHeight: '100px' }}
        {...props}
      >
        <div className="flex-col flex-center gap-2">
          <ImageOff size={fallbackSize} opacity={0.5} />
          <span className="text-xs">Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setError(true)} {...props} />
  );
};

export default ImageWithFallback;
