import { z } from 'zod';

// Search bounds include Kimberley's residential areas; the focus is real New Park OSM data.
export const kimberleyBounds = { west: 24.65, south: -28.84, east: 24.89, north: -28.60 };
export type ResidentialAddressResult = {
  id: string; address: string; latitude: number; longitude: number; source: 'photon';
};

const featureSchema = z.object({
  geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number().finite(), z.number().finite()]) }),
  properties: z.object({
    osm_type: z.string(), osm_id: z.number().or(z.string()), countrycode: z.string(),
    name: z.string().optional(), street: z.string().optional(), housenumber: z.string().optional(),
    locality: z.string().optional(), district: z.string().optional(), city: z.string().optional(),
    state: z.string().optional(), country: z.string().optional(),
  }),
});

export function photonAddresses(payload: unknown): ResidentialAddressResult[] {
  const parsed = z.object({ features: z.array(z.unknown()) }).safeParse(payload);
  if (!parsed.success) throw new Error('Invalid geocoder response.');
  const addresses = new Map<string, ResidentialAddressResult>();
  for (const feature of parsed.data.features) {
    const result = featureSchema.safeParse(feature);
    if (!result.success) continue;
    const { properties: p, geometry } = result.data;
    const [longitude, latitude] = geometry.coordinates;
    if (p.countrycode.toUpperCase() !== 'ZA' || longitude < kimberleyBounds.west || longitude > kimberleyBounds.east
      || latitude < kimberleyBounds.south || latitude > kimberleyBounds.north) continue;
    if (p.city && !/^(Kimberley|Sol Plaatje(?: Local Municipality)?)$/i.test(p.city)) continue;
    if (p.state && !/^Northern Cape$/i.test(p.state)) continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const parts = [p.name, street, p.locality, p.city, p.state, p.country].filter((part): part is string => Boolean(part?.trim()));
    const address = [...new Set(parts.map(part => part.trim()))].join(', ');
    if (!address || address.length > 200) continue;
    if (!addresses.has(address.toLowerCase())) addresses.set(address.toLowerCase(), {
      id: `${p.osm_type}${p.osm_id}`, address, latitude, longitude, source: 'photon',
    });
  }
  // Prefer New Park while retaining the provider's relevance ordering for other Kimberley areas.
  return [...addresses.values()].sort((a, b) => Number(/\bNew Park\b/i.test(b.address)) - Number(/\bNew Park\b/i.test(a.address))).slice(0, 8);
}

export class AddressSearchUnavailable extends Error {}

export class AddressSearch {
  private cache = new Map<string, { expires: number; data: ResidentialAddressResult[] }>();
  private pending = new Map<string, Promise<ResidentialAddressResult[]>>();
  private nextRequest = 0;
  private day = '';
  private requests = 0;

  constructor(private options: { endpoint: string; intervalMs: number; dailyLimit: number; reserveSlot?: () => Promise<number> }, private fetchProvider: typeof fetch = fetch) {}

  async search(query: string): Promise<ResidentialAddressResult[]> {
    const key = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const day = new Date().toISOString().slice(0, 10);
    if (this.day !== day) { this.day = day; this.requests = 0; }
    const delay = Math.max(0, this.nextRequest - Date.now());
    if (this.requests >= this.options.dailyLimit || delay > 2200 || this.pending.size >= 4) {
      throw new AddressSearchUnavailable('Address search is busy. Enter your residential address manually or try again shortly.');
    }
    this.requests += 1;
    this.nextRequest = Date.now() + delay + this.options.intervalMs;
    const task = this.lookup(query.trim(), delay).then(data => {
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: Date.now() + 15 * 60 * 1000, data });
      return data;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async lookup(query: string, delay: number) {
    if (this.options.reserveSlot) delay = await this.options.reserveSlot();
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const url = new URL(this.options.endpoint);
    const b = kimberleyBounds;
    const params = { q: query, lang: 'en', limit: '12', lat: '-28.7484301', lon: '24.7604452',
      zoom: '13', location_bias_scale: '0.1', countrycode: 'ZA', bbox: `${b.west},${b.south},${b.east},${b.north}` };
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    try {
      const response = await this.fetchProvider(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'SCCPMS-registration-address-search/1.0' }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Geocoder unavailable.');
      return photonAddresses(await response.json());
    } catch {
      throw new AddressSearchUnavailable('Address search is temporarily unavailable. You can enter your residential address manually.');
    }
  }
}
