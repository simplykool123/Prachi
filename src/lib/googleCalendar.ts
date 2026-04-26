const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'gc_access_token';
const TOKEN_EXPIRY_KEY = 'gc_token_expiry';

export function isGoogleConnected(): boolean {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return false;
  return Date.now() < parseInt(expiry, 10);
}

export function disconnectGoogle(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

function getStoredToken(): string | null {
  if (!isGoogleConnected()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getGoogleClientId(): string {
  return (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
}

export async function connectGoogle(): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Google Client ID not configured.\n' +
      'Add VITE_GOOGLE_CLIENT_ID=your_client_id to your .env file.\n' +
      'See .env.example for instructions.'
    );
  }

  const gis = (window as any).google;
  if (!gis?.accounts?.oauth2) {
    throw new Error(
      'Google Identity Services not loaded. ' +
      'Please refresh the page and try again.'
    );
  }

  return new Promise((resolve, reject) => {
    const tokenClient = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google auth failed'));
          return;
        }
        const expiresInMs = (parseInt(response.expires_in, 10) || 3600) * 1000;
        localStorage.setItem(TOKEN_KEY, response.access_token);
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInMs));
        resolve();
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function apiCall(method: string, path: string, body?: object): Promise<any> {
  const token = getStoredToken();
  if (!token) throw new Error('Not connected to Google Calendar');

  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  if (!res.ok) {
    if (res.status === 401) {
      disconnectGoogle();
      throw new Error('Google session expired. Please reconnect.');
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Google API error ${res.status}`);
  }

  return res.json();
}

function toGoogleEvent(appt: {
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  notes?: string;
  customer_name?: string;
  appointment_type?: string;
}): object {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const description = [
    appt.customer_name ? `Client: ${appt.customer_name}` : '',
    appt.appointment_type ? `Type: ${appt.appointment_type}` : '',
    appt.notes || '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    summary: appt.title,
    description,
    location: appt.location || '',
    start: { dateTime: appt.start_time, timeZone: tz },
    end: { dateTime: appt.end_time, timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };
}

export async function createGoogleEvent(appt: any): Promise<string> {
  const result = await apiCall('POST', '/calendars/primary/events', toGoogleEvent(appt));
  return result.id as string;
}

export async function updateGoogleEvent(googleEventId: string, appt: any): Promise<void> {
  await apiCall('PUT', `/calendars/primary/events/${googleEventId}`, toGoogleEvent(appt));
}

export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  await apiCall('DELETE', `/calendars/primary/events/${googleEventId}`);
}
