# Residential address autocomplete

The existing registration form uses OpenStreetMap data through Photon. There is
no mapping API key or GPS permission requirement. The address input searches
after three characters and a 700ms pause; selecting a result saves its complete
provider address and coordinates. Users can always type private accommodation,
room details or an address that the map does not contain. Student registration
requires only a nonempty residential address, faculty and programme; City,
Province and Postal code are absent from this form and remain optional in the
API for compatibility with older callers.

`GET /registration/addresses?q=Long%20Street` is public before signup. It restricts
results to the Kimberley bounds and South Africa, biases the search toward the
New Park location returned by OSM, and prioritises matching New Park results.
It returns `{data:[{id,address,latitude,longitude,source:"photon"}],provider,
attribution}`. OSM attribution and a link to the selected coordinates are shown
in the form. A map widget is not added to the existing registration layout.

## Provider configuration and limits

Defaults in `server/.env.example` work without credentials:

```dotenv
ADDRESS_PHOTON_URL=https://photon.komoot.io/api/
ADDRESS_SEARCH_INTERVAL_MS=1100
ADDRESS_SEARCH_DAILY_LIMIT=500
```

The server caches up to 256 searches for 15 minutes, coalesces identical requests,
spaces provider requests by at least one second, bounds the queue, times out
provider calls after six seconds, and limits each client to 30 searches/minute.
The daily budget counts provider requests only, including failed attempts. Limits
and cache are per API process; a deployment with multiple replicas must use a
shared gateway quota/cache or a dedicated provider sized for their combined load.

Photon explicitly supports search-as-you-type. Its public demo permits reasonable
usage, can throttle or ban extensive traffic, and provides no availability
guarantee. **500/day is this application's conservative budget, not a published
Photon allowance.** For sustained university/business deployment, configure
`ADDRESS_PHOTON_URL` with a dedicated hosted or self-hosted Photon-compatible
`/api/` endpoint and keep the budget within that provider's agreement. Docker
Compose exposes these settings. No extra configuration is needed for modest
initial use of the public demo. [Photon provider policy](https://github.com/komoot/photon#demo-server),
[Photon API documentation](https://github.com/komoot/photon/blob/master/docs/api-v1.md).

The public Nominatim endpoint is deliberately not used: its policy forbids
autocomplete. [OpenStreetMap Foundation Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

## Database and validation

Apply `server/sql/017_registration_address_coordinates.sql` with the established
`npm run db:migrate --prefix server` command. It adds nullable `address_latitude`,
`address_longitude` and `address_source` profile fields and coordinate-pair/bounds
constraints, preserving existing records and legacy address columns. University
selections use the existing `department` and `program` fields. The signup handler
also saves details when a Supabase signup trigger created the patient profile
before the API's insert.

Manual input sets `address_source="manual"` without coordinates. A selected result
sets `address_source="photon"` with both coordinates. Editing selected text clears
its old coordinates; subsequent profile address edits also clear stale map data.
A provider error, no results, or an exhausted quota never blocks manual entry.

## Residence names and retry support — 16 October 2026

Search now combines real Photon results with 23 residence/cluster names from
[SPU's housing page](https://www.spu.ac.za/index.php/residences/) and its
[published off-campus coordinator list](https://www.spu.ac.za/wp-content/uploads/2025/07/Student-Coordinators.docx).
The seven university residences and sixteen listed off-campus residences or
clusters are held in `server/src/residence-catalogue.ts`. Ntabiseng Courts and
Lawson were added from the administrator's supplied list; they are labelled as
clinic catalogue entries, not university accreditation claims. Spelling aliases
include Massouh, Rathaga, Hanetjie, Long Street Lofts, Rise Student Living and
My Studend SA. This is a dated catalogue, not a claim to contain every present
or future private property.

Catalogue suggestions have `source="spu"` or `"clinic"` and null coordinates.
Their source is shown in the dropdown. Choosing one saves the accommodation
name and Kimberley locality as the residential address with the existing
non-geocoded `address_source="manual"` representation. No street number, map
marker or latitude/longitude is inferred. Genuine Photon selections retain
their coordinates and `address_source="photon"` as before. The original sources
must be checked when extending or changing the catalogue.

Residence matches remain available if Photon is unavailable; other addresses
remain manually editable. The input validates returned result shapes/bounds,
uses a cancellable ten-second request deadline without requiring
`AbortSignal.any`, and offers Retry address search without losing typed text.
The existing provider budget, Kimberley bounds and manual-entry validation
remain in place. The live Long Street search was rechecked successfully.

## Verification on 13 October 2026

- Live provider and application API queries for **Long Street**, **New Park** and
  **Bultfontein Road** returned Kimberley/Northern Cape OSM features and real
  coordinates. Long Street and Bultfontein Road included New Park results.
- An isolated real database test exercises the actual signup handler while
  mocking external Auth calls: it verifies faculty/programme, selected and manual
  addresses, coordinates, database constraints and existing-row preservation.
  It cleans its temporary schema and creates no production Auth accounts.
- Browser regression tests mock map/Auth responses and verify filtering, search,
  resetting selections, submitted address coordinates and manual fallback.

OpenStreetMap coverage can omit a property, accommodation or house number. A
street/suburb result's coordinates represent that mapped feature; users may edit
the text to supply their full accommodation address, which removes those coarse
coordinates. Registration does not certify occupancy or university enrolment.
