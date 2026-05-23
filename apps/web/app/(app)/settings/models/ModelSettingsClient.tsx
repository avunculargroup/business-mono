'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import type { ModelOption, ModelScopeType } from '@platform/shared';
import { upsertModelConfig, resetModelConfig } from '@/app/actions/modelConfigs';
import { ModelCombobox } from './ModelCombobox';
import styles from './modelSettings.module.css';

export interface ScopeRow {
  key: string;
  type: ModelScopeType;
  label: string;
  description: string;
  workflow: string | null;
  fallbackAgent: string | null;
  modelId: string | null;
  updatedAt: string | null;
}

export interface CatalogModel {
  id: string;
  name: string;
  contextLength: number | null;
}

interface Props {
  rows: ScopeRow[];
  defaultModel: string;
  popularModels: ModelOption[];
  catalogModels: CatalogModel[];
  workflowLabels: Record<string, string>;
  loadError: string | null;
  catalogError: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ModelSettingsClient({
  rows,
  defaultModel,
  popularModels,
  catalogModels,
  workflowLabels,
  loadError,
  catalogError,
}: Props) {
  const agentRows = rows.filter((r) => r.type === 'agent');
  const stepRows = rows.filter((r) => r.type === 'workflow_step');

  const workflowGroups = new Map<string, ScopeRow[]>();
  for (const row of stepRows) {
    const wf = row.workflow ?? 'other';
    const list = workflowGroups.get(wf) ?? [];
    list.push(row);
    workflowGroups.set(wf, list);
  }

  const agentLabelsByKey = new Map(agentRows.map((r) => [r.key, r.label]));

  return (
    <div className={styles.container}>
      <section className={styles.intro}>
        <p className={styles.introText}>
          Pick the OpenRouter model used by each agent and workflow step. Changes take effect within ~30 seconds — the agent server caches lookups briefly. Use <span className={styles.code}>Use default</span> on a row to inherit the platform default (<span className={styles.code}>{defaultModel}</span>).
        </p>
        {loadError && (
          <p className={styles.warning}>Couldn't load current settings: {loadError}</p>
        )}
        {catalogError && (
          <p className={styles.warning}>
            {catalogError} — showing curated list only. Reload to retry.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Agents</h2>
          <p className={styles.sectionDesc}>
            Default model for each agent's own reasoning. Workflow steps below can override on a step-by-step basis.
          </p>
        </div>
        <ul className={styles.list}>
          {agentRows.map((row) => (
            <ScopeListItem
              key={row.key}
              row={row}
              defaultModel={defaultModel}
              popularModels={popularModels}
              catalogModels={catalogModels}
              fallbackLabel={null}
            />
          ))}
        </ul>
      </section>

      {[...workflowGroups.entries()].map(([workflow, items]) => (
        <section key={workflow} className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {workflowLabels[workflow] ?? workflow} workflow
            </h2>
            <p className={styles.sectionDesc}>
              One model per step. If a step is left at Default, it inherits from its owning agent.
            </p>
          </div>
          <ul className={styles.list}>
            {items.map((row) => (
              <ScopeListItem
                key={row.key}
                row={row}
                defaultModel={defaultModel}
                popularModels={popularModels}
                catalogModels={catalogModels}
                fallbackLabel={
                  row.fallbackAgent
                    ? agentLabelsByKey.get(row.fallbackAgent) ?? row.fallbackAgent
                    : null
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface ScopeListItemProps {
  row: ScopeRow;
  defaultModel: string;
  popularModels: ModelOption[];
  catalogModels: CatalogModel[];
  fallbackLabel: string | null;
}

function ScopeListItem({
  row,
  defaultModel,
  popularModels,
  catalogModels,
  fallbackLabel,
}: ScopeListItemProps) {
  const [value, setValue] = useState(row.modelId ?? '');
  const [savedAt, setSavedAt] = useState<string | null>(row.updatedAt);
  const [hasOverride, setHasOverride] = useState(row.modelId !== null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = value.trim();
  const isDirty = trimmed !== (row.modelId ?? '');
  const canSave = trimmed.length > 0 && isDirty;

  function handleSave() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const result = await upsertModelConfig(row.key, trimmed);
      const errMsg = 'error' in result ? result.error : null;
      if (errMsg) {
        setError(errMsg);
      } else {
        setHasOverride(true);
        setSavedAt(new Date().toISOString());
      }
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetModelConfig(row.key);
      const errMsg = 'error' in result ? result.error : null;
      if (errMsg) {
        setError(errMsg);
      } else {
        setHasOverride(false);
        setValue('');
        setSavedAt(null);
      }
    });
  }

  const effectivePlaceholder = fallbackLabel
    ? `Default (inherits from ${fallbackLabel})`
    : `Default (${defaultModel})`;

  return (
    <li className={styles.item}>
      <div className={styles.itemMain}>
        <div className={styles.itemHeader}>
          <div className={styles.itemLabel}>
            <span className={styles.itemName}>{row.label}</span>
            <span className={styles.itemKey}>{row.key}</span>
          </div>
          {hasOverride ? (
            <span className={styles.statusOverride}>Override</span>
          ) : (
            <span className={styles.statusDefault}>Default</span>
          )}
        </div>
        <p className={styles.itemDesc}>{row.description}</p>

        <div className={styles.controls}>
          <ModelCombobox
            value={value}
            onChange={setValue}
            placeholder={effectivePlaceholder}
            catalog={catalogModels}
            popular={popularModels}
            ariaLabel={`Model for ${row.label}`}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!canSave}
            loading={isPending && canSave}
          >
            Save
          </Button>
          {hasOverride && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isPending}
            >
              Use default
            </Button>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {savedAt && !error && (
          <p className={styles.meta}>Last saved {fmtDate(savedAt)}</p>
        )}
      </div>
    </li>
  );
}
