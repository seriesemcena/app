export const REGION_SELECTED_KEY = 'sec_region_selected_v1';

export const REGION_OPTIONS = [
  { code: 'BR', label: 'Brasil', flag: '🇧🇷' },
  { code: 'PT', label: 'Portugal', flag: '🇵🇹' },
  { code: 'US', label: 'United States', flag: '🇺🇸' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'GB', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺' },
  { code: 'MX', label: 'México', flag: '🇲🇽' },
  { code: 'ES', label: 'España', flag: '🇪🇸' },
  { code: 'AR', label: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', label: 'Colombia', flag: '🇨🇴' },
  { code: 'CL', label: 'Chile', flag: '🇨🇱' },
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'DE', label: 'Deutschland', flag: '🇩🇪' },
  { code: 'IT', label: 'Italia', flag: '🇮🇹' },
  { code: 'JP', label: '日本', flag: '🇯🇵' },
  { code: 'KR', label: '대한민국', flag: '🇰🇷' },
] as const;

export function getRegion(code: string) {
  return REGION_OPTIONS.find((region) => region.code === code) ?? REGION_OPTIONS[0];
}
