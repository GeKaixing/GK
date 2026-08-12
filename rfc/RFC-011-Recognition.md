# OSP RFC-011: Recognition Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines how Countries recognize or refuse passports and identities issued by other Countries. Recognition is explicitly directional.

## Directionality
If Country A recognizes Country B, B does not automatically recognize A.

## States
A recognition record MAY use states such as:
- UNKNOWN
- RECOGNIZED
- TRUSTED
- RESTRICTED
- BLOCKED
- SUSPENDED

## Recognition Effects
Recognition MAY control federation admission, Passport acceptance, and Customs treatment. It MUST NOT rewrite the underlying identity or ownership record.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.1.0 (federation core: discovery, recognition, signed envelope exchange, delivery worker). Cross-country social graph (RFC-012) and ActivityPub interop remain deferred.**
