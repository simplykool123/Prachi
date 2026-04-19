import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface CompanySettings {
  id: number;
  name: string;
  tagline: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  alt_phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder: string;
  upi_id: string;
  logo_url?: string;
  footer_note: string;
  updated_at: string;
}

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
