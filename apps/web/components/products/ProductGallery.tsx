'use client';

import { useRef, useState } from 'react';
import { Crosshair, ImagePlus, Star, Trash2 } from 'lucide-react';
import { Button } from '@platform/ui/Button';
import { ConfirmDialog } from '@platform/ui/ConfirmDialog';
import { useToast } from '@platform/ui/ToastProvider';
import { createClient } from '@/lib/supabase/browser';
import {
  createProductImageUploadUrl,
  deleteProductImage,
  registerProductImage,
  setFeaturedProductImage,
  updateProductImagePosition,
} from '@/app/actions/productImages';
import { ACCEPTED_IMAGE_TYPES, pickFeatured, sortImages, uploadErrorMessage, type ProductImage } from '@/lib/products/images';
import { PRODUCT_IMAGES_BUCKET } from '@/lib/products/signImages';
import { ProductImageFrame } from './ProductImageFrame';
import { ProductImagePositioner } from './ProductImagePositioner';
import detailStyles from '@/app/(app)/products/[id]/product-detail.module.css';
import styles from './productImages.module.css';

interface ProductGalleryProps {
  productId: string;
  productName: string;
  images: ProductImage[];
  featuredImageId: string | null;
}

function measure(url: string): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = url;
  });
}

export function ProductGallery({ productId, productName, images: initialImages, featuredImageId }: ProductGalleryProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState(() => sortImages(initialImages));
  const [featuredId, setFeaturedId] = useState(featuredImageId);
  const [uploading, setUploading] = useState(0);
  const [positioning, setPositioning] = useState<ProductImage | null>(null);
  const [savingPosition, setSavingPosition] = useState(false);
  const [deleting, setDeleting] = useState<ProductImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const featured = pickFeatured(images, featuredId);

  async function uploadOne(file: File): Promise<ProductImage | null> {
    const urlRes = await createProductImageUploadUrl(productId, file.name, file.type, file.size);
    if ('error' in urlRes) { toast.error(urlRes.error); return null; }

    const supabase = createClient();
    const { error: uploadErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .uploadToSignedUrl(urlRes.path, urlRes.token, file);
    if (uploadErr) { toast.error(uploadErrorMessage(file.name, uploadErr)); return null; }

    // A local preview until the next page load signs the stored file.
    const localUrl = URL.createObjectURL(file);
    const size = await measure(localUrl);

    const regRes = await registerProductImage({
      productId,
      path: urlRes.path,
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
      ...size,
    });
    if ('error' in regRes) { toast.error(regRes.error); return null; }

    return { ...regRes.image, url: localUrl };
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setUploading(files.length);
    let added = 0;
    // Sequential, so each row takes the next sort order.
    for (const file of files) {
      const image = await uploadOne(file);
      if (image) {
        setImages((prev) => [...prev, image]);
        added += 1;
      }
      setUploading((n) => n - 1);
    }
    if (added > 0) toast.success(added === 1 ? 'Image added' : `${added} images added`);
  }

  async function handleFeature(image: ProductImage) {
    const previous = featuredId;
    setFeaturedId(image.id);
    const res = await setFeaturedProductImage(productId, image.id);
    if ('error' in res) { setFeaturedId(previous); toast.error(res.error); return; }
    toast.success('Featured image set');
  }

  async function handleSavePosition(point: { x: number; y: number }) {
    if (!positioning) return;
    setSavingPosition(true);
    const res = await updateProductImagePosition(productId, positioning.id, point.x, point.y);
    setSavingPosition(false);
    if ('error' in res) { toast.error(res.error); return; }
    const id = positioning.id;
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, focal_x: point.x, focal_y: point.y } : img)));
    setPositioning(null);
    toast.success('Position saved');
  }

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    const res = await deleteProductImage(productId, deleting.id);
    setIsDeleting(false);
    if ('error' in res) { toast.error(res.error); return; }
    const id = deleting.id;
    setImages((prev) => prev.filter((img) => img.id !== id));
    if (featuredId === id) setFeaturedId(null);
    setDeleting(null);
    toast.success('Image removed');
  }

  return (
    <div className={detailStyles.card}>
      <div className={detailStyles.cardHeader}>
        <span className={detailStyles.cardTitle}>Images</span>
        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} loading={uploading > 0}>
          <ImagePlus size={14} strokeWidth={1.5} />
          {uploading > 0 ? `Uploading ${uploading}` : 'Upload images'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          onChange={handleFiles}
          hidden
          aria-label="Upload images"
        />
      </div>

      {images.length > 0 && featured ? (
        <div className={detailStyles.cardBody}>
          <ProductImageFrame image={featured} shape="wide" label={productName} className={styles.hero} />

          <ul className={styles.grid} aria-label="Gallery">
            {images.map((image) => {
              const isFeatured = image.id === featured.id;
              const name = image.filename ?? 'Image';
              return (
                <li key={image.id} className={styles.tile} data-featured={isFeatured || undefined}>
                  <ProductImageFrame image={image} shape="square" label={productName} />
                  {isFeatured && (
                    <span className={styles.badge}>
                      <Star size={12} strokeWidth={1.5} fill="currentColor" aria-hidden />
                      Featured
                    </span>
                  )}
                  <div className={styles.tileActions}>
                    {!isFeatured && (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => handleFeature(image)}
                        aria-label={`Feature ${name}`}
                        title="Make featured"
                      >
                        <Star size={14} strokeWidth={1.5} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => setPositioning(image)}
                      aria-label={`Position ${name}`}
                      title="Position"
                    >
                      <Crosshair size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => setDeleting(image)}
                      aria-label={`Remove ${name}`}
                      title="Remove"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className={detailStyles.emptyCard}>
          No images yet. Upload several, then pick one to feature.
        </div>
      )}

      <ProductImagePositioner
        image={positioning}
        productName={productName}
        saving={savingPosition}
        onClose={() => setPositioning(null)}
        onSave={handleSavePosition}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Remove image"
        confirmLabel="Remove"
        description={
          deleting && deleting.id === featured?.id && images.length > 1
            ? 'Remove the featured image? The next image in the gallery will be featured instead.'
            : 'Remove this image from the product?'
        }
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
