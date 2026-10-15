# Shopping lists on Instacart

## Implemented flow

Each list has a **Shop with Instacart** action. The review dialog selects remaining items by default,
with an option to include every item. Users can refine the product search name and optionally enter
a validated 12- or 14-digit UPC. Names retain qualifiers such as “2%”, “lactose-free”, or a brand;
we do not invent product IDs or turn a generic item into a specific brand without the user's input.

The server calls `POST /idp/v1/products/products_link` with `line_items`. Instacart performs catalog
matching after store selection. Users review products and quantities and add them to their cart
there. This does not silently add items to an existing cart or place an order. The local shopping
list is not checked off when a link is created.

Known units are mapped into `line_item_measurements`. Unknown units and unspecified quantities
are flagged for review, and the original amount is preserved in display text. UPC matching is
optional: exact products can be unavailable, and names offer more flexibility between stores.
No retailer SKU is treated as an Instacart product ID. Store availability depends on the location
and the Instacart catalog; this does not promise access to Walmart, ALDI or another named store
in every location. A separate direct retailer integration would be needed for unsupported stores.

The public shopping-list endpoint already supplies the generic-name-to-product matching needed
here. The reviewed API reference does not expose a general catalog search endpoint for this flow.
A custom in-app product picker would require additional approved API access rather than scraping
store sites or guessing identifiers. Brand and health filters are also supported by Instacart,
but the current UI uses explicit product names and optional UPCs.

Links expire after seven days. The server caches each list's latest link for six days and regenerates
it when the outgoing payload changes. Tokens stay on the server, and the endpoint applies existing
shopping-list authorization and trusted-origin checks. Selected names, amounts, supplied UPCs and
the list title are sent only after the user presses **Create Instacart list**.

## Configuration

Set these server environment variables, then restart:

```
INSTACART_API_KEY=<your Instacart Developer Platform key>
INSTACART_ENVIRONMENT=production
```

Use `development` with a development key to use `connect.dev.instacart.tools`. No credential has
been created or inserted by this change, and no live Instacart request has been made.

## Sources reviewed

- [Shopping-list endpoint](https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page/)
- [Shopping-list workflow](https://docs.instacart.com/developer_platform_api/guide/concepts/shopping_list)
- [Units](https://docs.instacart.com/developer_platform_api/api/units_of_measurement)
- [API access and authentication](https://docs.instacart.com/developer_platform_api/api/overview/)

## VeSync follow-up

The ESF24 cloud implementation in [pyvesync PR 108](https://github.com/webdjoe/pyvesync/pull/108/files)
only establishes weight and timestamp parsing. A read-only inspection of the connected ESF24
account returned weight, timestamp, impedance, height, age, and a numeric `bfr` field. It did not
return explicit muscle mass, bone mass, body water, visceral fat, subcutaneous fat or BMR fields.
Only field names and types were printed; credentials and measurement values were not logged.

`bfr` may represent body-fat percentage, but neither its unit nor its scaling has been confirmed.
The user has been asked to compare the latest body-fat reading and date in VeSync before that
field is enabled for import. The integration still imports weight and date only. Other metrics
may be calculated inside the vendor app, but this has not been verified; we do not reproduce
undocumented formulas and present those estimates as imported measurements.

The onboarding connection copy now reflects the integration's limitation instead of claiming
VeSync only collected weight. Manual advanced measurements remain available.

Update: the later [V3 investigation](vesync-live-investigation-2026-10-15.md#follow-up-v3-resolves-missing-recent-history) found recent readings for both profiles and confirmed body-fat percentages. The integration now imports those values; the other composition metrics remain unavailable from the readers checked.
