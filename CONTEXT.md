# Holdsight

Holdsight helps investors understand their activity and decision-making through portfolio data and reflective records.

## Language

**Closed Instance**:
A Holdsight deployment whose operator explicitly approves every user. It may serve multiple people, but it has no public enrollment.
_Avoid_: Personal-only instance, single-user instance, public instance

**Investment Journal Entry**:
A user's canonical planning and reflection record for one calendar day, Monday–Sunday week, or month in the user's home timezone. It is independent of any individual investment transaction, and only one exists for each user and period.
_Avoid_: Transaction journal entry, trade journal entry, note

**Trade**:
An event where a user exchanged one asset for another — a buy, sell, or swap. A Trade is one kind of Investment Transaction; transfers, deposits, withdrawals, fees, dividends, and interest are not Trades. Trades are the decisions the app helps users reflect on.
_Avoid_: Transaction (for the swap event itself), order, position

**Trade Journal Entry**:
A user's record of the reasoning, emotions, market bias, notes, and images associated with one specific Trade.
_Avoid_: Investment journal entry, transaction journal entry, note

**Transaction History Sync**:
An asynchronous refresh of a user's provider transaction history that may continue after the user action returns a current snapshot.
_Avoid_: Transaction fetch, transaction import, refresh transactions

**Investment Provider**:
The external source — an EVM wallet indexer, HyperCore, Lighter, Kraken, or a brokerage connection — that an Investment Account's balances and transactions are synced from.
_Avoid_: Source, integration, data source

**Provider Group**:
A user-facing aggregation of one or more Investment Providers: wallet, exchange, or brokerage. A Provider Group is the scope presented by portfolio views and may contain multiple Investment Providers.
_Avoid_: Investment Provider (for the group), source group

**Journal Period**:
The calendar day, Monday–Sunday week, or calendar month covered by an Investment Journal Entry, interpreted in the user's home timezone.
_Avoid_: Entry type, date range

**Plan**:
The part of an Investment Journal Entry that captures expectations, intended actions, risks, and rules for its period.

**Reflection**:
The part of an Investment Journal Entry that captures what happened, what was learned, and what should change after or during its period.

**Sensitive Value**:
A rendered figure that reveals the size of a user's holdings — a USD value or an asset quantity. Asset prices and allocation percentages are not Sensitive Values, since they reveal nothing absolute about the user.
_Avoid_: Private value, secret value, PII

**Hidden Amounts**:
A per-device display preference that visually obscures a user's Sensitive Values, so the app can be screenshotted or screenshared without revealing holdings. It obscures those values on screen only — it does not remove them from the page — and does not apply to asset prices, allocation percentages, or journal prose.
_Avoid_: Private mode, privacy mode, incognito, redaction, masked balances
