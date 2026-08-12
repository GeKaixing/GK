# OSP RFC-009: Federation Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines Country-to-Country and node-to-node communication across the OSP global network.

## Federation
Countries exchange signed Objects and Events through authenticated endpoints.

## Delivery
A sender SHOULD discover the target Country, evaluate recognition and admission requirements, and submit content through the target's Customs interface where required.

## Reliability
Implementations SHOULD support idempotency, retries, cursors, replay protection, and delivery status.

## Interoperability
Bridges to ActivityPub, AT Protocol, or other protocols MAY be implemented as extensions.

## Implementation Status

**Draft — deferred (no code landed in v3.0.0).**
