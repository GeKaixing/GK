# OSP RFC-005: Object Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines the common data-object model for OSP. Objects represent durable social, informational, media, and system resources.

## Common Fields
- id
- type
- creator
- created_at
- updated_at
- content
- visibility
- signature

## Standard Objects
The core profile includes Post, Comment, Media, Profile, Community, Relationship, Message, and Capability declaration objects.

## Extensibility
Extensions MAY define new Object types without changing the core transport model.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
