# The Book — Navigation Architecture

This document is the source of truth for navigation. If any code, doc, or prior audit contradicts it, this wins.

## Core principle

There are no modes. There is one account, one app shell, and one set of tabs. A user may own a provider business. That is a capability, not a mode.

Role is never a setting. Role is determined by the object being viewed. If a booking's client is you, you are the client in that context. If its provider is your business, you are the provider. The app never asks the user to declare which they are.

## The shell

Five tabs, identical for every user:

Discover / Reels / Bookings / Messages / Me

Everyone lands on Discover at login, including providers.

Rationale: earnings must never be the default view, because providers open the app with clients physically present. Discover is socially safe and keeps providers participating in the marketplace.

## Business tools

Users who own a provider business get a Business entry point, reachable from the shared shell.

It is labeled "Business", never "Provider Dashboard" or "Provider Mode" in user-facing copy.

Contents:

OVERVIEW
- Overview

RUN MY BUSINESS
- Bookings
- Services
- Availability
- Clients
- Contracts

GROW
- Portfolio
- Posts & Reels
- Community
- Analytics

MONEY
- Payouts

ACCOUNT
- Business Profile
- Business Settings

Business is a set of tools, not a second navigation system. The five tabs remain the primary navigation at all times.

Community sits under GROW but must also be reachable within one tap of Discover. It is the primary reason a provider with no clients opens the app.

## Bookings

Bookings is one tab for everyone.

A user with no provider business sees a single list: their own appointments. No segmented control.

A user who owns a provider business sees a segmented control:

[ My Appointments ] [ My Business (n) ]

My Appointments: bookings where the user is the client.
My Business: bookings where the user's business is the provider. Badge shows pending requests needing action.

Never two stacked sections on one scroll.

## Client-only users

A user with no provider business:
- has no Business entry point rendered anywhere
- is redirected out of provider routes, including by direct link or deep link
- is blocked at the database by RLS regardless of what the UI does

Navigation is not security. Route guards are for clarity. RLS is the enforcement.

The only provider-related thing a client-only user sees is an invitation in Me: "Become a provider." That is a signup funnel, not a mode switch.

## Prohibited

- Any "Switch to Client" or "Switch to Provider" control
- Any persisted currentMode state
- Any viewAsClient or preview state
- Duplicate copies of Discover, Reels, or Messages per role
- Separate client and provider inboxes
- Any route that mounts the tab shell from inside Business tools, or vice versa, in a way that strands the user
- Any screen with no visible exit

## Messages

One inbox. Conversations are not split by role. Context comes from the booking a conversation is attached to.

Optional filters may be added later if beta shows volume problems. Not before.

## Back and exit

Every pushed screen has a visible back or close control. The hamburger or Business icon is not a back control.

Terminal screens (booking confirmed, review submitted) have forward actions instead of back, and must never allow returning into a completed irreversible step.

## Deferred, not part of this work

- Merging ClientMe and ProviderMe into one screen
- Navigation state preservation
- A configurable default start screen
- Message filters
- Push notification routing
