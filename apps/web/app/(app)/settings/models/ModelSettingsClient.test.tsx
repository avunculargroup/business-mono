import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/app/actions/modelConfigs', () => ({ upsertModelConfig: vi.fn(), resetModelConfig: vi.fn() }));

import { ModelSettingsClient, type ScopeRow } from './ModelSettingsClient';

function row(overrides: Partial<ScopeRow>): ScopeRow {
  return {
    key: 'k',
    type: 'agent',
    label: 'L',
    description: 'd',
    workflow: null,
    fallbackAgent: null,
    modelId: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('ModelSettingsClient', () => {
  it('lists image_step scopes in their own section with the image default', () => {
    render(
      <ModelSettingsClient
        rows={[
          row({ key: 'charlie', label: 'Charlie' }),
          row({ key: 'social_post.image_render', type: 'image_step', label: 'Image render', workflow: 'social_post' }),
        ]}
        defaultModel="anthropic/claude-sonnet-4-5"
        popularModels={[]}
        catalogModels={[]}
        imageCatalogModels={[{ id: 'google/gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', contextLength: null }]}
        popularImageModels={[]}
        defaultImageModel="google/gemini-2.5-flash-image"
        workflowLabels={{ social_post: 'Social Posts from News' }}
        loadError={null}
        catalogError={null}
      />,
    );

    const section = screen.getByRole('heading', { name: 'Image models' }).closest('section')!;
    expect(within(section).getByText('Image render')).toBeInTheDocument();
    expect(within(section).getByLabelText('Model for Image render')).toHaveTextContent(
      'Default (google/gemini-2.5-flash-image)',
    );
    // Not listed as a workflow step that would fall back to an agent.
    expect(screen.queryByRole('heading', { name: 'Social Posts from News workflow' })).not.toBeInTheDocument();
  });
});
