export type ColorTheme = 'default' | 'solar-dusk' | 'elegant-luxury' | 'midnight-bloom' | 'cyberpunk' | 'retro-arcade';

export interface UserPreferences {
  colorTheme?: ColorTheme;
}

const API_PATH = '/api/user/preferences';

export async function getUserPreferences(_userId: string): Promise<UserPreferences> {
  const response = await fetch(API_PATH, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Impossibile caricare le preferenze utente.');
  }

  return (await response.json()) as UserPreferences;
}

export async function setUserPreferences(
  _userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const response = await fetch(API_PATH, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(prefs),
  });

  if (!response.ok) {
    throw new Error('Impossibile salvare le preferenze utente.');
  }
}
