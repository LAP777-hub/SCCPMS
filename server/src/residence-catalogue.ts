// Names verified against SPU's published housing sources on 16 October 2026.
// No street address or coordinate is inferred from a residence/cluster name.
export const residenceSources = {
  university: 'https://www.spu.ac.za/index.php/residences/',
  offCampus: 'https://www.spu.ac.za/wp-content/uploads/2025/07/Student-Coordinators.docx',
};
export const residences = [
  'Tauana Hall of Residences', 'Umnandi Hall of Residences',
  'Hannetjie Hall of Residences', 'Moroka Hall of Residences',
  'Mhudi Hall of Residences', 'Ra-Thaga Hall of Residences', 'Massouw Hall of Residences',
  'Chantum Residence', 'Dambuza Cluster', 'Dingiswayo Cluster',
  'Long Street Loft Residence', 'Madeira Residence', 'My StudentSA Residence',
  'Scanlan Residence', 'Qanda Cluster', 'Rise Residence', 'Sanchoscope Residence',
  'Sitonga Cluster', 'Tabata Cluster', 'Templar Residence',
  'Sea Of Mountains Residence', 'Khanyimbali Residence', 'Dunofusion Residence',
] as const;
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
  'Massouw Hall of Residences': ['Massouh Residence'],
  'Hannetjie Hall of Residences': ['Hanetjie Hall of Residence'],
  'Ra-Thaga Hall of Residences': ['Rathaga'],
  'Long Street Loft Residence': ['Long Street Lofts'],
  'My StudentSA Residence': ['My Studend SA Accommodation', 'My Student SA Accommodation'],
  'Rise Residence': ['Rise Student Living Accommodation'],
  'Sea Of Mountains Residence': ['Sea of Mountains Accommodation'],
};
// Supplied by the clinic administrator on 16 October 2026; names only, not
// claimed as a university accreditation list or geocoded street addresses.
const clinicNames = ['Ntabiseng Courts', 'Lawson'];
export function residenceSuggestions(query: string) {
  const terms = query.toLowerCase().replace(/umnadi/g, 'umnandi').split(/\s+/)
    .filter(Boolean).map(normalized).filter(term => !['spu','student','students','residence','residences','accommodation','kimberley'].includes(term));
  return [...residences, ...clinicNames].filter(name => terms.every(term => [name, ...(aliases[name] ?? [])].some(alias => normalized(alias).includes(term))))
    .map((name, index) => ({ id: `spu-residence-${index}-${normalized(name)}`,
      address: `${name}, Kimberley, Northern Cape, South Africa`,
      latitude: null, longitude: null, source: clinicNames.includes(name) ? 'clinic' as const : 'spu' as const }));
}
