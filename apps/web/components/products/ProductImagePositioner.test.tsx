import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductImage } from '@/lib/products/images';
import { ProductImagePositioner } from './ProductImagePositioner';

// jsdom doesn't implement the <dialog> methods the Modal effect calls. Same
// stub as SignalsView.test.tsx.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

const image: ProductImage = {
  id: 'img-1',
  storage_path: 'p1/img-1.png',
  filename: 'front.png',
  alt_text: null,
  width: 1600,
  height: 900,
  focal_x: 30,
  focal_y: 40,
  sort_order: 0,
  created_at: '2026-09-01T00:00:00Z',
  url: 'https://signed.example/img-1.png',
};

function setup() {
  const onSave = vi.fn();
  render(
    <ProductImagePositioner image={image} productName="Coldcard" saving={false} onClose={() => {}} onSave={onSave} />,
  );
  return { onSave, marker: screen.getByRole('button', { name: /Focal point/ }) };
}

describe('ProductImagePositioner', () => {
  it('starts from the stored focal point and shows both crops', () => {
    const { marker } = setup();

    expect(marker).toHaveAccessibleName(/30% across, 40% down/);
    expect(screen.getByText('Square')).toBeInTheDocument();
    expect(screen.getByText('Wide, 16:9')).toBeInTheDocument();
    // Every cropped preview follows the same point.
    const previews = screen.getAllByAltText('Coldcard').filter((el) => el.style.objectPosition);
    expect(previews.map((el) => el.style.objectPosition)).toEqual(['30% 40%', '30% 40%']);
  });

  it('moves the point with the arrow keys and saves it', async () => {
    const user = userEvent.setup();
    const { onSave, marker } = setup();

    marker.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowDown}{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Save position' }));

    expect(onSave).toHaveBeenCalledWith({ x: 31, y: 50 });
  });

  it('resets to centre', async () => {
    const user = userEvent.setup();
    const { onSave } = setup();

    await user.click(screen.getByRole('button', { name: 'Reset to centre' }));
    await user.click(screen.getByRole('button', { name: 'Save position' }));

    expect(onSave).toHaveBeenCalledWith({ x: 50, y: 50 });
  });
});
