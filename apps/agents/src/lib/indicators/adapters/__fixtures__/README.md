# Adapter fixtures

`fred-*.json` and `rba-*.csv` are **recorded** from live provider responses.

`sdmx-*.json` are **synthesised** from the SDMX-JSON specification, not recorded
— there is no network egress from the environment the SDMX adapters were written
in, and `data.api.abs.gov.au` is refused at the proxy. They are faithful to the
standard's encoding (index-keyed observations cross-referenced against a
structure block, both the 1.0 `structure` and 2.0 `structures` forms), which is
what the parser navigates, but they are not evidence that ABS or OECD return
exactly this.

So a green `sdmx.test.ts` says the parser reads SDMX-JSON. It does not say the
AU CPI or AU Business Confidence rows will ingest, and that is why both stay
`is_active = false`. Replace these with recorded payloads on the first live run
and the tests become the regression net they are for the other providers.
