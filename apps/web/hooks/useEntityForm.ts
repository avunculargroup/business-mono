'use client';

import { useActionState, useEffect } from 'react';
import { useToast } from '@/providers/ToastProvider';

/**
 * The submit engine shared by every entity form (~26 of them). Each form used to
 * hand-roll the same scaffold: a `handleSubmit` with a create/edit branch,
 * toast-on-error/success, `useActionState`, and a
 * `useEffect(() => onPendingChange?.(isPending))` relay. This hook owns all of
 * that; a form supplies its bound `create`/`update` actions and renders the
 * fields.
 *
 *   const { formAction, isPending, state } = useEntityForm({
 *     mode, entityLabel: 'Contact',
 *     create: createContact,
 *     update: (fd) => updateContact(defaultValues!.id, fd),
 *     onSuccess: (r) => onSuccess(r.contact as ContactRow),
 *     onPendingChange,
 *   });
 */

// Actions return `{ error }` on failure and, on success, an entity-shaped object
// that varies per form (create returns the new row, update usually just
// `{ success: true }`). The index signature lets a form read its own field off
// the result (`result.contact`) with a cast, without the hook knowing the shape.
export type ActionResult = { error?: string } & Record<string, unknown>;

interface UseEntityFormOptions {
  mode: 'create' | 'edit';
  /** Human label for the toast, e.g. "Contact" → "Contact created" / "Contact updated". */
  entityLabel: string;
  create: (formData: FormData) => Promise<ActionResult>;
  /** Pre-bind the row id: `(fd) => updateX(id, fd)`. Required in edit mode. */
  update?: (formData: FormData) => Promise<ActionResult>;
  onSuccess: (result: ActionResult) => void;
  onPendingChange?: (pending: boolean) => void;
}

type FormState = { error: string } | null;

export function useEntityForm({
  mode,
  entityLabel,
  create,
  update,
  onSuccess,
  onPendingChange,
}: UseEntityFormOptions) {
  const { success, error } = useToast();

  const handleSubmit = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const result = mode === 'edit' && update ? await update(formData) : await create(formData);
    if (result.error) {
      error(result.error);
      return { error: result.error };
    }
    success(`${entityLabel} ${mode === 'edit' ? 'updated' : 'created'}`);
    onSuccess(result);
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  return { state, formAction, isPending };
}
