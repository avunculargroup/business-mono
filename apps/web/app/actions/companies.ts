'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { CompanyEdit } from '@platform/data';
import { getAuthedRepositories } from '@/lib/action';
import { parseForm, buildUpdate } from '@/lib/forms';
import { humanizeError } from '@/lib/errors';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
});

export async function createCompany(formData: FormData) {
  const parsed = parseForm(companySchema, formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };
  const data = parsed.data;

  try {
    const company = await auth.repositories.companies.createCompany({
      name: data.name,
      industry: data.industry || null,
      size: data.size || null,
      website: data.website || null,
      linkedinUrl: data.linkedin_url || null,
      notes: data.notes || null,
    });

    revalidatePath('/crm/companies');
    return { success: true, company };
  } catch (err) {
    // Returned as a fresh literal rather than via a helper: TypeScript only
    // adds the absent sibling key (`success?: undefined`) when the return is an
    // object literal here, and callers narrow on it.
    return { error: humanizeError(err) };
  }
}

export async function updateCompany(id: string, formData: FormData) {
  const parsed = parseForm(companySchema.partial(), formData);
  if (!parsed.ok) return { error: parsed.error };

  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  // buildUpdate drops omitted and blank fields, so a form that did not render a
  // field leaves it alone rather than clearing it. Mapping the survivors by
  // hand keeps that behaviour exact.
  const d = buildUpdate(parsed.data);
  const edit: CompanyEdit = {
    ...(d.name !== undefined && { name: d.name }),
    ...(d.industry !== undefined && { industry: d.industry }),
    ...(d.size !== undefined && { size: d.size }),
    ...(d.website !== undefined && { website: d.website }),
    ...(d.linkedin_url !== undefined && { linkedinUrl: d.linkedin_url }),
    ...(d.notes !== undefined && { notes: d.notes }),
  };

  try {
    await auth.repositories.companies.updateCompany(id, edit);
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath('/crm/companies');
  revalidatePath(`/crm/companies/${id}`);
  return { success: true };
}

export async function deleteCompany(id: string) {
  const auth = await getAuthedRepositories();
  if (!auth.ok) return { error: auth.error };

  try {
    await auth.repositories.companies.deleteCompany(id);
  } catch (err) {
    return { error: humanizeError(err) };
  }

  revalidatePath('/crm/companies');
  return { success: true };
}
