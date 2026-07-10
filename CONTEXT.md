# Holdsight

Holdsight helps investors understand their activity and decision-making through portfolio data and reflective records.

## Language

**Investment Journal Entry**:
A user's canonical planning and reflection record for one calendar day, Monday–Sunday week, or month in the user's home timezone. It is independent of any individual investment transaction, and only one exists for each user and period.
_Avoid_: Transaction journal entry, trade journal entry, note

**Transaction Journal Entry**:
A user's record of the reasoning, emotions, market bias, notes, and images associated with one specific investment transaction.
_Avoid_: Investment journal entry, trade journal entry

**Transaction History Sync**:
An asynchronous refresh of a user's provider transaction history that may continue after the user action returns a current snapshot.
_Avoid_: Transaction fetch, transaction import, refresh transactions

**Investment Provider**:
The external source — an EVM wallet indexer, HyperCore, Lighter, Kraken, or a brokerage connection — that an Investment Account's balances and transactions are synced from.
_Avoid_: Source, integration, data source

**Journal Period**:
The calendar day, Monday–Sunday week, or calendar month covered by an Investment Journal Entry, interpreted in the user's home timezone.
_Avoid_: Entry type, date range

**Plan**:
The part of an Investment Journal Entry that captures expectations, intended actions, risks, and rules for its period.

**Reflection**:
The part of an Investment Journal Entry that captures what happened, what was learned, and what should change after or during its period.
