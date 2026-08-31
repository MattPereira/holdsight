# Holdsight

Holdsight helps investors understand their activity and decision-making through portfolio data and reflective records.

## Language

**Closed Instance**:
A Holdsight deployment whose operator explicitly approves every user. It may serve multiple people, but it has no public enrollment.
_Avoid_: Personal-only instance, single-user instance, public instance

**Trade**:
An event where a user exchanged one asset for another — a buy, sell, or swap. A Trade is one kind of Investment Transaction; transfers, deposits, withdrawals, fees, dividends, and interest are not Trades. Trades are the decisions the app helps users reflect on.
_Avoid_: Transaction (for the swap event itself), order, position

**Trade Journal Entry**:
A user's record of the reasoning, emotions, market bias, notes, and images associated with one specific Trade.
_Avoid_: Transaction journal entry, note

**Plan**:
A user's strategy for assets connected by one shared reason, which may exist before any asset is acquired. It groups assigned assets for portfolio allocation and records the Thesis, Invalidation, Entry, Exit, target allocation, and Timeframe.
_Avoid_: Thesis (for the whole record), asset group

**Thesis**:
The reasoning for owning the assets in a Plan.
_Avoid_: Plan, investment case

**Invalidation**:
The evidence or conditions that would prove a Plan's Thesis wrong.
_Avoid_: Bear case, risk

**Entry**:
The conditions for starting or increasing exposure under a Plan.
_Avoid_: Trade, purchase

**Exit**:
The conditions for reducing or closing exposure under a Plan.
_Avoid_: Trade, sale

**Timeframe**:
The expected holding or review horizon for a Plan.
_Avoid_: Expiration, deadline

**Target Allocation**:
The intended percentage of the user's total portfolio assigned to a Plan. Targets across Plans are independent and may total more than 100 percent.
_Avoid_: Size, current allocation

**Transaction History Sync**:
An asynchronous refresh of a user's provider transaction history that may continue after the user action returns a current snapshot.
_Avoid_: Transaction fetch, transaction import, refresh transactions

**Investment Provider**:
The external source — an EVM wallet indexer, HyperCore, Lighter, Kraken, or a brokerage connection — that an Investment Account's balances and transactions are synced from.
_Avoid_: Source, integration, data source

**Provider Group**:
A user-facing aggregation of one or more Investment Providers: wallet, exchange, or brokerage. A Provider Group is the scope presented by portfolio views and may contain multiple Investment Providers.
_Avoid_: Investment Provider (for the group), source group

**Sensitive Value**:
A rendered figure that reveals the size of a user's holdings — a USD value or an asset quantity. Asset prices and allocation percentages are not Sensitive Values, since they reveal nothing absolute about the user.
_Avoid_: Private value, secret value, PII

**Hidden Amounts**:
A per-device display preference that visually obscures a user's Sensitive Values, so the app can be screenshotted or screenshared without revealing holdings. It obscures those values on screen only — it does not remove them from the page — and does not apply to asset prices, allocation percentages, or journal prose.
_Avoid_: Private mode, privacy mode, incognito, redaction, masked balances
