# OSP RFC-010: Customs Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines the standardized Customs framework used when external identity, Objects, media, or Events enter a Country. The framework is common; each Country defines its own policy.

## Standard Pipeline
1. Passport and identity validation
2. Content parsing
3. Language detection and translation where needed
4. Text analysis
5. Image analysis
6. Audio analysis
7. Video/multimedia analysis
8. Country policy evaluation
9. Admission decision

## Decision Types
- ALLOW
- RESTRICT
- DENY
- QUARANTINE

## Policy Independence
OSP standardizes the Customs process and exchange format, not whether a Country allows or denies a category such as NSFW.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
