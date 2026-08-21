import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Annotation } from '@/lib/annotations';
import { AnnotationProvider } from '@/providers/AnnotationProvider';
import { AnnotationOverlay } from './AnnotationOverlay';
import { ViewToggle } from './ViewToggle';

const ANNOTATIONS: Annotation[] = [
  {
    id: 'first',
    targetSelector: 'target-one',
    route: '/',
    title: 'The first thing',
    body: 'What the first thing demonstrates.',
    principle: 'quiet-day-path',
    order: 1,
  },
  {
    id: 'second',
    targetSelector: 'target-two',
    route: '/',
    title: 'The second thing',
    body: 'What the second thing demonstrates.',
    principle: 'publish-gate',
    order: 2,
  },
];

/** A page with two annotatable elements and one that is not annotated. */
function Harness() {
  return (
    <AnnotationProvider>
      <ViewToggle />
      <main>
        <span data-annotation-id="target-one">A delta</span>
        <span data-annotation-id="target-two">A status</span>
        <span>Not annotated</span>
      </main>
      <AnnotationOverlay annotations={ANNOTATIONS} />
    </AnnotationProvider>
  );
}

async function showArchitecture() {
  await userEvent.click(screen.getByRole('button', { name: 'Show architecture' }));
}

// Rendered per test rather than in a `beforeEach`: one case renders a different
// tree, and a shared harness still mounted alongside it would satisfy the very
// query that case exists to prove returns nothing.

describe('product view is the default', () => {
  it('renders no markers until asked', () => {
    render(<Harness />);
    // Show the real thing first. An app that opens covered in callouts is a
    // diagram, and the point of building this on the real platform is that it
    // is not one.
    expect(screen.queryByRole('button', { name: /Annotation 1/ })).not.toBeInTheDocument();
  });

  it('renders nothing at all, rather than a hidden layer', () => {
    // Not merely invisible: the overlay returns null in product view, so there
    // is no element that could affect the page it is not being shown over.
    // This is the "must not reflow the underlying layout" requirement, held by
    // the layer not existing rather than by careful measurement.
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });
});

describe('architecture view', () => {
  it('shows one marker per annotation whose target is on the page', async () => {
    render(<Harness />);
    await showArchitecture();

    expect(screen.getByRole('button', { name: 'Annotation 1: The first thing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annotation 2: The second thing' })).toBeInTheDocument();
  });

  it('skips an annotation whose target is not rendered', async () => {
    // The overlay finds targets by attribute, so an annotation for a target
    // that is not on this page produces no marker rather than a broken one.
    render(
      <AnnotationProvider>
        <ViewToggle />
        <span data-annotation-id="target-one">Only one</span>
        <AnnotationOverlay annotations={ANNOTATIONS} />
      </AnnotationProvider>,
    );

    await showArchitecture();

    expect(screen.getByRole('button', { name: /Annotation 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annotation 2/ })).not.toBeInTheDocument();
  });

  it('names the annotation in the marker, not just its number', async () => {
    render(<Harness />);
    // The visible label is a digit, which says nothing on its own. Screen
    // reader users get the title.
    await showArchitecture();

    const marker = screen.getByRole('button', { name: 'Annotation 1: The first thing' });
    expect(marker).toHaveTextContent('1');
  });
});

describe('the panel', () => {
  it('opens on click and shows the body', async () => {
    render(<Harness />);
    await showArchitecture();
    await userEvent.click(screen.getByRole('button', { name: /Annotation 1/ }));

    expect(screen.getByText('What the first thing demonstrates.')).toBeInTheDocument();
  });

  it('links to the principle it explains', async () => {
    render(<Harness />);
    await showArchitecture();
    await userEvent.click(screen.getByRole('button', { name: /Annotation 1/ }));

    expect(screen.getByRole('link', { name: /Read the reasoning/ })).toHaveAttribute(
      'href',
      '/architecture#quiet-day-path',
    );
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    await showArchitecture();
    await userEvent.click(screen.getByRole('button', { name: /Annotation 1/ }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByText('What the first thing demonstrates.')).not.toBeInTheDocument();
  });

  it('switches rather than stacking when another marker is clicked', async () => {
    render(<Harness />);
    await showArchitecture();
    await userEvent.click(screen.getByRole('button', { name: /Annotation 1/ }));
    await userEvent.click(screen.getByRole('button', { name: /Annotation 2/ }));

    expect(screen.queryByText('What the first thing demonstrates.')).not.toBeInTheDocument();
    expect(screen.getByText('What the second thing demonstrates.')).toBeInTheDocument();
  });

  it('closes when the same marker is clicked again', async () => {
    render(<Harness />);
    await showArchitecture();
    const marker = screen.getByRole('button', { name: /Annotation 1/ });

    await userEvent.click(marker);
    await userEvent.click(marker);

    expect(screen.queryByText('What the first thing demonstrates.')).not.toBeInTheDocument();
  });
});

describe('keyboard access', () => {
  it('reaches every marker by tabbing, in annotation order', async () => {
    // The spec requires markers be keyboard navigable. They are real buttons in
    // DOM order rather than positioned divs with click handlers, so this needs
    // no key handling of our own — but it does need asserting, because
    // absolute positioning makes it easy to reorder them visually and forget
    // that tab order follows the DOM.
    render(<Harness />);
    await showArchitecture();
    // Clicking the toggle leaves focus on it, so the next tab is marker one.
    expect(screen.getByRole('button', { name: 'Architecture view' })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Annotation 1/ })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Annotation 2/ })).toHaveFocus();
  });

  it('opens a marker with the keyboard', async () => {
    render(<Harness />);
    await showArchitecture();
    screen.getByRole('button', { name: /Annotation 1/ }).focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('What the first thing demonstrates.')).toBeInTheDocument();
  });

  it('reports its open state to assistive technology', async () => {
    render(<Harness />);
    await showArchitecture();
    const marker = screen.getByRole('button', { name: /Annotation 1/ });

    expect(marker).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(marker);
    expect(marker).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('the toggle', () => {
  it('reports which view it is in', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Show architecture' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Architecture view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('closes an open panel when leaving architecture view', async () => {
    // The panel only renders in architecture view, so leaving it with one open
    // would strand the panel's own close button.
    render(<Harness />);
    await showArchitecture();
    await userEvent.click(screen.getByRole('button', { name: /Annotation 1/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Architecture view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show architecture' }));

    expect(screen.queryByText('What the first thing demonstrates.')).not.toBeInTheDocument();
  });
});
