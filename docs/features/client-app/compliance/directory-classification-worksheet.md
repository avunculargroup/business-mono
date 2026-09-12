# `is_financial_product` — classification worksheet

**Status: a draft for a person to check. Nothing here has been written to the database, and
nothing here should be until a founder has read it.**

`products_services.is_financial_product` has no default and no backfill, deliberately: an
unassessed row is invisible to subscribers rather than visible and wrong. Twenty-four rows exist
and none is assessed, so `/directory` currently shows a Minute subscriber nothing at all. This
worksheet is the reading pass that closes that, done once so the founder confirming it is
reviewing a proposal rather than starting from a blank column.

## The test being applied

From [`client-app-mvp-spec.md`](../client-app-mvp-spec.md#the-structural-reason): the Corporations
Amendment (Digital Assets Framework) Act 2026 added digital asset platforms and tokenised custody
platforms to the financial products in s764A(1), with assent on 8 April 2026. **A DAP is a
facility whose operator holds digital tokens on behalf of clients** — exchanges, brokers,
custodial wallet providers. Bitcoin itself is outside the definition.

So the question asked of each row is narrow and factual: **does the operator ever hold the
client's bitcoin?** Not whether it is regulated, not whether it is reputable, not whether BTS
would use it. Custody, or not.

## What turns on the answer

`true` means the directory card emits **no anchor at all** — no outbound link, no contact button,
no call to action of any kind. Not a disabled button, not a link without a label: nothing. That
is the whole mechanism by which the directory stays factual, so a row wrongly marked `false`
ships a call to action on a financial product, and a row wrongly marked `true` costs a provider
a link they were entitled to. The first failure is much worse than the second, which is the
direction to lean when a row is genuinely unclear.

## The proposal

Eleven `true`, thirteen `false`.

### Custody: proposed `true`

| Row | Category | Why |
|---|---|---|
| Bitaroo | exchange | Custodial exchange. Holds client bitcoin |
| CoinJar | exchange | Custodial exchange. Holds client assets, offers offline storage as a service |
| CoinSpot | exchange | Custodial exchange |
| Cointree | exchange | Custodial exchange, AUSTRAC-registered, offers an SMSF facility |
| Independent Reserve | exchange | Custodial exchange |
| Swyftx | exchange | Custodial exchange |
| BitPay | payment_processing | Takes merchant funds and settles in fiat, so holds tokens in transit |
| Living Room of Satoshi | payment_processing | Bill payment service; holds bitcoin in transit. Self-describes as holding an AFSL, which corroborates but does not decide |
| OpenNode | payment_processing | Accepts on the merchant's behalf and settles in bitcoin or fiat |
| Onramp Custody | treasury_management | Custody is the product. "Segregated assets" is a custody claim |
| Wallet of Satoshi | wallet_software | Offers a **custodial mode**. A wallet that can hold the client's bitcoin holds it |

### No custody: proposed `false`

| Row | Category | Why |
|---|---|---|
| BTCPay Server | payment_processing | Self-hosted and open source. Funds settle directly to the merchant's own wallet; nobody else ever holds them |
| BitBox | wallet_hardware | A device. The manufacturer never holds keys or coins |
| Cold Card Q | wallet_hardware | A device |
| Coldcard | wallet_hardware | A device |
| Ledger Hardware Wallet | wallet_hardware | A device |
| NGRAVE ZERO | wallet_hardware | A device, air-gapped |
| Passport Prime | wallet_hardware | A device |
| Trezor Hardware Wallet | wallet_hardware | A device |
| Blockstream Wallet (Green App) | wallet_software | Self-custody. See the flag below about the in-app buy |
| BlueWallet | wallet_software | Self-custody. See the flag below about Lightning |
| Muun | wallet_software | Self-custody. See the flag below — this is the closest call on the list |
| Phoenix Wallet | wallet_software | Self-custody. See the flag below about channel liquidity |
| Sparrow Wallet | wallet_software | Desktop self-custody, no service component |

## Five rows to look at properly

The tables above are a reading of each row's own description. These five are where that reading
could reasonably go the other way, and they are the ones worth a founder's actual attention.

**Muun.** Uses a 2-of-2 multisig in which Muun holds one key. It cannot move funds alone and it
publishes an emergency kit that exports the descriptors, so on the "holds tokens on behalf of
clients" test it reads as `false` — but an operator holding a signing key is the exact fact
pattern the definition circles, and the answer depends on how the amended section treats partial
key custody. **If the answer is not clear on reading, mark it `true`**: the cost is one missing
link.

**BlueWallet.** Historically offered a custodial Lightning mode alongside self-custody wallets.
The row's description mentions Lightning wallets without saying whose node. If the custodial mode
is still offered, this is a `true` on the same reasoning as Wallet of Satoshi.

**Phoenix Wallet.** Self-custodial, but ACINQ provides channel liquidity and there are states in
a Lightning channel where the question of who holds what is not a one-word answer. Probably
`false`; worth one minute rather than none.

**Blockstream Green.** Self-custody, but the in-app buy routes through a third party. The
classification is about Blockstream's facility, not the third party's, so `false` — noted because
"you can buy bitcoin in it" is the kind of fact that later looks like it was missed.

**BitPay.** Global rather than Australian. The test in s764A(1) is about the facility, not the
operator's domicile, so the proposal is `true` — but whether a non-Australian processor belongs
in an Australian directory at all is a separate question this worksheet does not answer.

## Two data problems found while reading

Neither is a classification question, and both want fixing before the directory ships.

1. **`Cold Card Q` and `Coldcard` are two rows for the same Coinkite product line.** One is a
   thin stub ("Cold Card is a well-reputed cold wallet"), the other is a full entry. A subscriber
   seeing both sees the directory duplicating itself. Merge or remove one.
2. **`Sparrow Wallet` has an empty description and a null `business_name`.** It would render as a
   name and nothing else. Absence is a fact on a register entry, but an empty card is not a
   stated absence — it is a gap.

## Applying it

Every write needs a `product_classification_note` and a `classified_by`, because
`classification_has_reasoning` rejects a classification without both. The note below is the
proposed reasoning; replace it wherever you disagree, and put your own `team_members.id` in.

```sql
-- Replace with the id of whoever actually did the assessment.
\set reviewer '00000000-0000-0000-0000-000000000000'

UPDATE products_services SET
  is_financial_product = TRUE,
  product_classification_note = 'DAP under s764A(1) as amended: operator holds client tokens.',
  classified_by = :'reviewer',
  classified_at = NOW()
WHERE name IN (
  'Bitaroo', 'CoinJar', 'CoinSpot', 'Cointree', 'Independent Reserve', 'Swyftx',
  'BitPay', 'Living Room of Satoshi', 'OpenNode', 'Onramp Custody', 'Wallet of Satoshi'
);

UPDATE products_services SET
  is_financial_product = FALSE,
  product_classification_note = 'Not a DAP or TCP: the operator never holds client tokens.',
  classified_by = :'reviewer',
  classified_at = NOW()
WHERE name IN (
  'BTCPay Server',
  'BitBox', 'Cold Card Q', 'Coldcard', 'Ledger Hardware Wallet', 'NGRAVE ZERO',
  'Passport Prime', 'Trezor Hardware Wallet',
  'Blockstream Wallet (Green App)', 'BlueWallet', 'Muun', 'Phoenix Wallet', 'Sparrow Wallet'
);

-- Nothing should come back.
SELECT name, category FROM products_services WHERE is_financial_product IS NULL;
```

Write a specific note on any row you moved, rather than letting it carry the blanket one — the
column exists so that someone re-reading the decision in a year can tell what it rested on, and
five rows above will not be answered by a sentence that fits all eleven.

**The two name lists were checked against the live table** by a `SELECT`, and nothing was
written: eleven and thirteen match exactly, no name in either list is absent from the table, no
row in the table is absent from the lists, and no name is duplicated. `name` is safe to key on
today — but it is not a declared unique column, so re-run the final `SELECT` above rather than
trusting the counts.

## Once every row is assessed

The classification becomes mandatory, in its own migration, as
[`20260911030000_directory_and_signals.sql`](../../../../supabase/migrations/20260911030000_directory_and_signals.sql)
says:

```sql
ALTER TABLE products_services
  ALTER COLUMN is_financial_product SET NOT NULL;
```

Leaving it nullable until then is honest. A default would be a lie, and the lie would be
`false`, which is the one that ships a call to action.

## What this worksheet is not

It is a reading of twenty-four rows against one sentence of a statute, done by an agent that is
not a lawyer and did not read the Act. Every row above is a proposal. The database still requires
a person to name themselves against each one, which is the correct place for that requirement to
sit.
