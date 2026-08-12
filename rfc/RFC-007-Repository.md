# OSP RFC-007: Repository Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines the personal or organizational repository that stores an Actor's OSP records.

## Ownership
Repository hosting does not transfer data ownership to the host.

## Functions
- append and retrieve Objects and Events
- maintain versions
- export data
- support migration
- synchronize with authorized nodes

## Implementation
A reference implementation may use PostgreSQL/Supabase, but OSP does not require a particular database.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
