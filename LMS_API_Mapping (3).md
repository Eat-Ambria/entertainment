# LMS API Mapping Reference

**Base URL:** `https://gyv.inqcrm.in`
**Auth:** `loggeduserid` field in every request body (default: `"1"`)

---

## Venue Map

| Internal Name | LMS Venue ID | LMS Name | Notes |
|---|---|---|---|
| Ambria Pushpanjali | 3 | Ambria Pushpanjali | NH8 |
| Emerald Green | 6 | Manaktala Farm | Manaktala campus |
| The Aura | 19 | Ambria Exotica | Sub-venue of Exotica, Dwarka Exp |
| Valencia | 19 | Ambria Exotica | Sub-venue of Exotica, Dwarka Exp |
| Ambria Exotica | 19 | Ambria Exotica | Dwarka Exp |
| Ambria Restro | 16 | Ambria Restro | Carterpuri Rd |
| TENDER PROGRAM | 18 | TENDER PROGARM | Internal/tender use |
| All Venues | 20 | All Venues | Generic catchall |

**Location IDs** are per-venue. Fetch dynamically:
```
POST /api/v1/createcommon_api/get_location_by_selected_venue
Body: { "venueid": "6" }
Returns: [{ "locname": "EMERALD LAWN MKT", "id": 26 }, ...]
```

---

## Menu Map

| Menu Name | Veg ID | Non-Veg ID |
|---|---|---|
| Magnum | 2 | 3 |
| Double Magnum | 4 | 5 |
| Multi Cuisine | 6 | 7 |
| Luxury | 8 | 9 |
| Custom | 22 | 22 |
| Pearl | 32 | 33 |
| Sapphire | 34 | 35 |
| Bliss | 36 | 37 |

**Fetch endpoint:**
```
POST /api/v1/createcommon_api/get_catering_list
Body: { "filterbyid": "" }
```

---

## Function Type Map (Event Types)

| Function Name | LMS ID |
|---|---|
| Ring Ceremony | 1 |
| Birthday | 2 |
| Wedding | 3 |
| Reception | 4 |
| Kua Poojan | 5 |
| Anniversary | 6 |
| Lagan | 7 |
| Sagan | 8 |
| Cocktail | 9 |
| Religious | 10 |
| Corporate | 11 |
| Proposal Ceremony | 12 |
| Haldi | 14 |
| Mehendi | 15 |
| Roka Ceremony | 16 |
| Residential Wedding | 17 |
| Destination Wedding | 18 |
| Kothi Booking | 19 |
| Sangeet | 20 |
| Baby Shower | 21 |
| Engagement | 22 |
| Tender (North East Flood) | 23 |
| Barat Assembly | 24 |
| House Party | 25 |
| Lunch Function | 26 |
| Breakfast Function | 27 |
| Dinner Function | 28 |
| Breakfast | 29 |
| Lunch | 30 |
| Kitty Party | 31 |
| Restaurant Sale | 32 |
| Lohri | 33 |
| Diwali Party | 34 |
| Get Together | 35 |
| Mata Ki Chowki | 36 |

**Fetch endpoint:**
```
POST /api/v1/createcommon_api/get_function_detail
Body: { "functype": "" }
```

---

## State Map (Common)

| State | LMS ID |
|---|---|
| Delhi | 1483 |

**Fetch full list:**
```
POST /api/v1/createcommon_api/get_state_list
Body: { "stateid": "" }
```

---

## API Endpoints

### Lead Creation
```
POST /api/v1/createcommon_api/create_venue_lead_detail
```
Creates a venue lead with guest info + event details. Returns `{ "message": "...", "status": true }`.
⚠️ **Does NOT return new entry number/ID in response** — pending enhancement request to LMS team.

### Lead Lists (GET)
| Department | Endpoint |
|---|---|
| Venue | `POST /api/v1/processerp_api/get_venue_information_list` |
| Catering | `POST /api/v1/processerp_api/get_catering_information_list` |
| Decor | `POST /api/v1/processerp_api/get_decor_information_list` |
| Entertainment | `POST /api/v1/processerp_api/get_entertain_infromation_list` |

### Contract Lists (GET)
| Department | Endpoint |
|---|---|
| Venue | `POST /api/v1/processerp_api/get_venue_contract_information_list` |
| Catering | `POST /api/v1/processerp_api/get_catering_contract_information_list` |
| Decor | `POST /api/v1/processerp_api/get_decor_contract_information_list` |
| Entertainment | `POST /api/v1/processerp_api/get_entertain_contract_information_list` |

### Master Data
| Data | Endpoint | Body |
|---|---|---|
| Venues | `POST /api/v1/createcommon_api/get_venue_list` | `{ "lead_type": "I" }` |
| Locations | `POST /api/v1/createcommon_api/get_location_by_selected_venue` | `{ "venueid": "6" }` |
| Menus | `POST /api/v1/createcommon_api/get_catering_list` | `{ "filterbyid": "" }` |
| Functions | `POST /api/v1/createcommon_api/get_function_detail` | `{ "functype": "" }` |
| States | `POST /api/v1/createcommon_api/get_state_list` | `{ "stateid": "" }` |

---

## Field Prefix Reference

| Department | Lead Header | Lead Detail | Contract Header | Contract Detail |
|---|---|---|---|---|
| Venue | `fis_` | `fisd_` | `fisc_` | `fiscd_` |
| Catering | `ch_` | `chd_` | `chc_` | `chcd_` |
| Decor | `dh_` | `dhd_` | `dhc_` | `dhcd_` |
| Entertainment | `eh_` | `ehd_` | `ehc_` | `ehcd_` |

---

## Slot → Timing Map

| Slot | `fisd_function_timings` |
|---|---|
| Lunch | 12:00 |
| Sundowner | 16:00 |
| Dinner | 18:00 |

---

## Notes

- All monetary values in LMS are **rupees** (not paise). Convert from paise before pushing.
- `fisd_lead_type`: `"I"` = In-house, `"O"` = Outdoor.
- `fis_state` expects numeric state ID, not state name.
- `get_venue_list` requires `"lead_type": "I"` — empty string returns error.
- Cancelled leads/contracts: check `*_cancel_remarks` field to exclude.
- Dedup: prefer rows with `function_date` present when syncing.

---

*Last updated: May 2026*
