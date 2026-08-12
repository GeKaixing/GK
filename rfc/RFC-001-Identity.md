# OSP RFC-001: Identity Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines the global identity layer of OSP. Identity is independent from a server, country, application, or device. An identity is cryptographically verifiable and portable.

## Core Rules
- Every Actor has one or more cryptographic identifiers.
- Identity ownership is controlled by cryptographic keys.
- Identity must survive country migration.
- Identity resolution must not depend on one global service.

## Identifier
OSP recommends a canonical Actor identifier derived from the Actor's passport and country context. The exact wire representation is defined by RFC-003.

## Key Management
Implementations SHOULD support signing keys, recovery keys, rotation, revocation, and multi-device keys.

## Security
Identity operations MUST be signature-verifiable and MUST protect against replay and key substitution.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
