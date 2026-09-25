import { SHAPE_RATIO, objectPosition, type ImageShape, type ProductImage } from '@/lib/products/images';
import styles from './productImages.module.css';

interface ProductImageFrameProps {
  image: Pick<ProductImage, 'url' | 'alt_text' | 'filename' | 'focal_x' | 'focal_y'>;
  shape: ImageShape;
  /** Alt text fallback, usually the product name. */
  label: string;
  className?: string;
}

/**
 * One uploaded image cropped to a shape. The crop follows the image's focal
 * point, so the same file works as a square tile and a wide banner.
 */
export function ProductImageFrame({ image, shape, label, className }: ProductImageFrameProps) {
  return (
    <div
      className={`${styles.frame}${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: SHAPE_RATIO[shape] }}
    >
      {image.url && (
        <img
          src={image.url}
          alt={image.alt_text ?? label}
          className={styles.frameImg}
          style={{ objectPosition: objectPosition(image) }}
          draggable={false}
        />
      )}
    </div>
  );
}
