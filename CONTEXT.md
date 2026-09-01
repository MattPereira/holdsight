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
A user's strategy for assets connected by one shared reason, which may exist before any asset is acquired. It groups assigned assets for portfolio allocation and records six commitments — Thesis, Invalidation, Risk, Profit, Entry, Adding — plus a target allocation. The commitments are made before taking exposure; Risk and Profit are presented above Entry and Adding, because what the user will lose is decided before how they get in.
_Avoid_: Thesis (for the whole record), asset group

**Thesis**:
The reasoning for owning the assets in a Plan.
_Avoid_: Plan, investment case

**Invalidation**:
The evidence or conditions that would prove a Plan's Thesis wrong. Invalidation is about the idea being wrong; Risk is about the position being closed. The two are distinct and both are recorded.
_Avoid_: Bear case, Risk, stop loss

**Risk**:
How much the user is willing to lose before giving up on a Plan and closing the position entirely. Recorded as prose, not a number — a Plan spans several assets, so it states the rule that produces a stop rather than a price.
_Avoid_: Invalidation, stop loss, Exit

**Profit**:
The conditions under which the user takes profit on a Plan.
_Avoid_: Exit, target, sale

**Entry**:
The conditions that must be true before the user makes the first buy under a Plan. Subsequent buys are Adding.
_Avoid_: Trade, purchase, Adding

**Adding**:
The conditions that must be true before the user buys more of an existing position under a Plan, and how much is bought each time. Distinct from Entry, which governs only the first buy.
_Avoid_: Entry, scaling, pyramiding, averaging in

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
