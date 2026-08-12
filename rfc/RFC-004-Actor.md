# OSP RFC-004: Actor Protocol

**Status:** Draft
**Version:** OSP Core v1.0

## Abstract

Defines Actor as the universal participant primitive of OSP. OSP does not require protocol-level DID classes for human, AI, organization, bot, or virtual entity.

## Actor Model
An Actor has:
- identity
- optional Passport
- state
- capabilities
- permissions
- content and activity history

## Stateless Actors
An Actor MAY exist without a Country affiliation. Such an Actor is a Stateless Actor (free actor) and remains globally addressable and able to own data.

## Actor Actions
Actors may create Objects, emit Events, maintain social relationships, communicate, and exercise capabilities according to permissions.

## Implementation Status

**Draft — reference implementation landed in Gekaixing v3.0.0 (Country: gkx).**
