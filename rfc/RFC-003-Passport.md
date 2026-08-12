# OSP RFC-003: Passport Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines the universal digital Passport format used by all OSP Countries. Visual design may vary by Country, but the protocol data model is standardized.

## Passport Fields
A Passport SHOULD contain:
- passport_id
- country_id
- actor_id
- public_key or key reference
- issued_at
- status
- signature
- optional expiry and migration history

## Citizen Birth
When an Actor becomes a citizen of a Country, the Country MAY automatically issue a Passport. The Passport becomes the citizen's national identity credential.

## Portability
Passport history MUST be portable across Countries. Loss or destruction of a Country MUST NOT automatically destroy the Actor's identity or data ownership.

## Presentation
Countries MAY create custom passport visual layouts, logos, colors, and branding, provided the underlying schema remains OSP-compatible.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
