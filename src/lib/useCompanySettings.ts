import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { CompanySettings } from '../types';

export const DEFAULT_COMPANY: CompanySettings = {
  id: 1,
  name: 'Prachi Fulgagar',
  tagline: 'Vastu Expert | Palmist | Astrologer',
  address1: '',
  address2: '',
  city: '',
  state: 'Maharashtra',
  pincode: '',
  phone: '',
  alt_phone: '',
  email: 'contact@prachifulgagar.com',
  website: '',
  gstin: '',
  pan: '',
  bank_name: 'HDFC Bank',
  account_number: '',
  ifsc_code: '',
  account_holder: 'Prachi Fulgagar',
  upi_id: '',
  footer_note: 'Thank you for choosing Prachi Fulgagar — Celestial Curator | Vastu & Astrology',
  updated_at: new Date().toISOString(),
};

export function useCompanySettings() {
  const [company, setCompany] = useState<CompanySettings>(DEFAULT_COMPANY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCompany(data as CompanySettings);
        setLoading(false);
      });
  }, []);

  return { company, loading };
}
