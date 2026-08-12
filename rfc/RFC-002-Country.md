# OSP RFC-002: Country Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines a Country as an independent OSP server/network realm. OSP allows an unbounded number of Countries. Any eligible Actor may create a Country.

## Country Identity
A Country has:
- human-readable name
- globally unique Country ID
- public key
- federation endpoint
- policy set
- customs service
- recognition registry

## Country Sovereignty
A Country controls its infrastructure, local policies, admission rules, and internal governance.

## Country Lifecycle
A Country MAY be created, forked, integrated, inherited, suspended, or destroyed. Lifecycle operations MUST preserve verifiable history.

## Centralization Model
OSP does not require internal decentralization. A Country MAY be highly centralized while the global OSP network remains federated and decentralized.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
