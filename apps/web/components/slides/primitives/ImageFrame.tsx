interface ImageFrameProps {
  src: string | null;
  alt?: string;
  focalX?: number;  // 0–100, horizontal focal point percent
  focalY?: number;  // 0–100, vertical focal point percent
  style?: React.CSSProperties;
  className?: string;
}

/** Renders an image with object-position controlled by focal point. */
export function ImageFrame({
  src,
  alt = '',
  focalX = 50,
  focalY = 50,
  style,
  className,
}: ImageFrameProps) {
  if (!src) {
    return (
      <div
        className={className}
        style={{
          ...style,
          background: '#E5E5E5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: 18,
          fontFamily: 'sans-serif',
        }}
      >
        No image
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        ...style,
        objectFit: 'cover',
        objectPosition: `${focalX}% ${focalY}%`,
      }}
    />
  );
}
