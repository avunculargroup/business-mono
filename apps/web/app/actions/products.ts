'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const productSchema = z.object({
  name:                z.string().min(1, 'Name is required'),
  business_name:       z.string().optional(),
  category:            z.string().optional(),
  company_id:          z.string().uuid().optional().or(z.literal('')),
  key_relationship_id: z.string().uuid().optional().or(z.literal('')),
  australian_owned:    z.string().optional(),
  description:         z.string().optional(),
  logo_url:            z.string().optional(),
  product_image_url:   z.string().optional(),
  created_by:          z.string().uuid().optional().or(z.literal('')),
});

const referralAgreementSchema = z.object({
  product_service_id: z.string().uuid(),
  agreement_type:     z.string().optional(),
  counterparty_name:  z.string().optional(),
  fee_structure:      z.string().optional(),
  percentage:         z.string().optional(),
  active:             z.string().optional(),
  notes:              z.string().optional(),
});

export async function createProduct(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { data: product, error } = await supabase
    .from('products_services')
    .insert({
      name:                d.name,
      business_name:       d.business_name || null,
      category:            d.category || null,
      company_id:          d.company_id || null,
      key_relationship_id: d.key_relationship_id || null,
      australian_owned:    d.australian_owned === 'on',
      description:         d.description || null,
      logo_url:            d.logo_url || null,
      product_image_url:   d.product_image_url || null,
      created_by:          d.created_by || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/products');
  return { success: true, product };
}

export async function updateProduct(id: string, formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const { error } = await supabase
    .from('products_services')
    .update({
      name:                d.name,
      business_name:       d.business_name || null,
      category:            d.category || null,
      company_id:          d.company_id || null,
      key_relationship_id: d.key_relationship_id || null,
      australian_owned:    d.australian_owned === 'on',
      description:         d.description || null,
      logo_url:            d.logo_url || null,
      product_image_url:   d.product_image_url || null,
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  return { success: true };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('products_services').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/products');
  return { success: true };
}

export async function createReferralAgreement(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = referralAgreementSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = await createClient();
  const d = parsed.data;

  const pct = d.percentage ? parseFloat(d.percentage) : null;

  const { data: agreement, error } = await supabase
    .from('product_referral_agreements')
    .insert({
      product_service_id: d.product_service_id,
      agreement_type:     d.agreement_type || null,
      counterparty_name:  d.counterparty_name || null,
      fee_structure:      d.fee_structure || null,
      percentage:         pct,
      active:             d.active === 'on',
      notes:              d.notes || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/products/${d.product_service_id}`);
  return { success: true, agreement };
}

export async function deleteReferralAgreement(id: string, productId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('product_referral_agreements').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/products/${productId}`);
  return { success: true };
}

export async function addProductKeyContact(productId: string, contactId: string, role: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_key_contacts')
    .insert({ product_service_id: productId, contact_id: contactId, role: role || null })
    .select('id, role, contacts(id, first_name, last_name, email)')
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/products/${productId}`);
  return { success: true, keyContact: data };
}

export async function removeProductKeyContact(productId: string, contactId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('product_key_contacts')
    .delete()
    .eq('product_service_id', productId)
    .eq('contact_id', contactId);

  if (error) return { error: error.message };

  revalidatePath(`/products/${productId}`);
  return { success: true };
}
