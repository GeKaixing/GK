# OSP RFC-006: Event Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines an append-oriented Event model for recording changes and actions in OSP.

## Event Fields
- event_id
- actor
- event_type
- object/reference
- timestamp
- sequence or cursor
- signature
- optional federation metadata

## Event Types
Examples include Create, Update, Delete, Follow, Like, Message, GrantPermission, RevokePermission, CountryFork, CountryIntegration, and PassportMigration.

## Properties
Events SHOULD be deterministic, verifiable, replayable, and suitable for federation synchronization.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
