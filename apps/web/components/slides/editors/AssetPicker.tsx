'use client';

import { useState, useEffect } from 'react';
import { createUploadSignedUrl, registerUploadedAsset, getAssets } from '@/app/actions/assets';
import { useToast } from '@/providers/ToastProvider';
import { createClient } from '@/lib/supabase/browser';
import type { AssetRow } from '@/lib/decks/schema';

interface AssetPickerProps {
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
}

export function AssetPicker({ selectedAssetId, onSelect }: AssetPickerProps) {
  const toast = useToast();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getAssets().then(setAssets).catch(() => {});
    }
  }, [isOpen]);

  const selected = assets.find((a) => a.id === selectedAssetId);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await createUploadSignedUrl(file.name, file.type);
      if ('error' in urlRes) { toast.error(urlRes.error); return; }

      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage
        .from('slide-assets')
        .uploadToSignedUrl(urlRes.path, urlRes.signedUrl, file);
      if (uploadErr) { toast.error(uploadErr.message); return; }

      // Measure dimensions if image
      let width: number | undefined;
      let height: number | undefined;
      if (file.type.startsWith('image/')) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { width = img.naturalWidth; height = img.naturalHeight; resolve(); };
          img.src = URL.createObjectURL(file);
        });
      }

      const regRes = await registerUploadedAsset({
        assetId: urlRes.assetId,
        path: urlRes.path,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        width,
        height,
      });
      if ('error' in regRes) { toast.error(regRes.error); return; }

      toast.success('Image uploaded');
      const refreshed = await getAssets();
      setAssets(refreshed);
      onSelect(regRes.id);
      setIsOpen(false);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-body)',
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          background: 'var(--color-surface-subtle)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {selected ? selected.filename : 'Select or upload image...'}
      </button>

      {isOpen && (
        <div style={{ marginTop: 8, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', maxHeight: 240, overflowY: 'auto' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
            <label style={{ cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-accent)', fontWeight: 600 }}>
              {uploading ? 'Uploading...' : '+ Upload new image'}
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} disabled={uploading} />
            </label>
          </div>
          {assets.length === 0 && (
            <div style={{ padding: '12px 10px', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>No images yet</div>
          )}
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => { onSelect(asset.id); setIsOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                background: asset.id === selectedAssetId ? 'var(--color-surface-hover)' : 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {asset.filename}
              {asset.width && asset.height && (
                <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {asset.width}×{asset.height}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
