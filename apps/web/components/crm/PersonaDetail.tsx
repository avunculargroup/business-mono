'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { SlideOver } from '@/components/ui/SlideOver';
import { PersonaForm } from './PersonaForm';
import {
  PERSONA_MARKET_SEGMENT_LABELS,
  PERSONA_SOPHISTICATION_LABELS,
  PERSONA_DECISION_STYLE_LABELS,
  type Persona,
  type PersonaMarketSegment,
  type PersonaSophisticationLevel,
  type PersonaDecisionStyle,
} from '@platform/shared';
import { Pencil } from 'lucide-react';
import styles from './PersonaDetail.module.css';

interface PersonaDetailProps {
  persona: Persona;
}

export function PersonaDetail({ persona }: PersonaDetailProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const pp = persona.psychographic_profile;
  const sc = persona.strategic_constraints;
  const ss = persona.success_signals;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarCard}>
          <div className={styles.sidebarField}>
            <span className={styles.sidebarLabel}>Segment</span>
            <StatusChip
              label={PERSONA_MARKET_SEGMENT_LABELS[persona.market_segment as PersonaMarketSegment] ?? persona.market_segment}
              color="neutral"
            />
          </div>
          <div className={styles.sidebarField}>
            <span className={styles.sidebarLabel}>Sophistication</span>
            <StatusChip
              label={PERSONA_SOPHISTICATION_LABELS[persona.sophistication_level as PersonaSophisticationLevel] ?? persona.sophistication_level}
              color="neutral"
            />
          </div>
          {persona.estimated_aum && (
            <div className={styles.sidebarField}>
              <span className={styles.sidebarLabel}>Est. AUM</span>
              <span className={styles.sidebarValue}>{persona.estimated_aum}</span>
            </div>
          )}
          <div className={styles.sidebarField}>
            <span className={styles.sidebarLabel}>Objections</span>
            <span className={styles.sidebarValue}>{persona.objection_bank?.length ?? 0} on record</span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className={styles.editBtn}
          onClick={() => setShowEdit(true)}
        >
          <Pencil size={14} strokeWidth={1.5} />
          Edit persona
        </Button>
      </aside>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Psychographic profile</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>North star</span>
              {pp?.north_star
                ? <p className={styles.fieldValue}>{pp.north_star}</p>
                : <span className={styles.fieldEmpty}>Not set</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Anti-goal</span>
              {pp?.anti_goal
                ? <p className={styles.fieldValue}>{pp.anti_goal}</p>
                : <span className={styles.fieldEmpty}>Not set</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Decision-making style</span>
              {pp?.decision_making_style
                ? <StatusChip label={PERSONA_DECISION_STYLE_LABELS[pp.decision_making_style as PersonaDecisionStyle] ?? pp.decision_making_style} color="neutral" />
                : <span className={styles.fieldEmpty}>Not set</span>}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Strategic constraints</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Regulatory hurdles</span>
              {sc?.regulatory_hurdles?.length
                ? <div className={styles.tagList}>{sc.regulatory_hurdles.map((h, i) => <span key={i} className={styles.tag}>{h}</span>)}</div>
                : <span className={styles.fieldEmpty}>None noted</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Gatekeepers</span>
              {sc?.gatekeepers?.length
                ? <div className={styles.tagList}>{sc.gatekeepers.map((g, i) => <span key={i} className={styles.tag}>{g}</span>)}</div>
                : <span className={styles.fieldEmpty}>None noted</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Preferred mediums</span>
              {sc?.preferred_mediums?.length
                ? <div className={styles.tagList}>{sc.preferred_mediums.map((m, i) => <span key={i} className={styles.tag}>{m}</span>)}</div>
                : <span className={styles.fieldEmpty}>Not specified</span>}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Success signals</h2>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Resonant phrases</span>
              {ss?.resonant_phrases?.length
                ? <div className={styles.tagList}>{ss.resonant_phrases.map((p, i) => <span key={i} className={styles.tag}>{p}</span>)}</div>
                : <span className={styles.fieldEmpty}>None recorded</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Pain point keywords</span>
              {ss?.pain_point_keywords?.length
                ? <div className={styles.tagList}>{ss.pain_point_keywords.map((k, i) => <span key={i} className={styles.tag}>{k}</span>)}</div>
                : <span className={styles.fieldEmpty}>Not set</span>}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Success indicators</span>
              {ss?.success_indicators?.length
                ? <div className={styles.tagList}>{ss.success_indicators.map((s, i) => <span key={i} className={styles.tag}>{s}</span>)}</div>
                : <span className={styles.fieldEmpty}>None noted</span>}
            </div>
          </div>
        </section>

        {(persona.objection_bank?.length > 0) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Objection bank</h2>
            <ul className={styles.objectionList}>
              {persona.objection_bank.map((obj, i) => (
                <li key={i} className={styles.objectionItem}>{obj}</li>
              ))}
            </ul>
          </section>
        )}

        {persona.notes && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Notes</h2>
            <p className={styles.fieldValue}>{persona.notes}</p>
          </section>
        )}
      </main>

      <SlideOver
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit persona"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="persona-edit-form" loading={isSubmitting}>Save changes</Button>
          </>
        }
      >
        <PersonaForm
          key={persona.id}
          mode="edit"
          defaultValues={persona}
          onSuccess={() => {
            setShowEdit(false);
            router.refresh();
          }}
          onPendingChange={setIsSubmitting}
        />
      </SlideOver>
    </div>
  );
}
